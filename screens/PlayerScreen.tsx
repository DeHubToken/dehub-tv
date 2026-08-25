import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Txt } from '../components/Txt';
import { Badge } from '../components/Badge';
import { Focusable } from '../components/Focusable';
import { ErrorState } from '../components/States';
import { CommentsPanel } from '../components/CommentsPanel';
import { TipSheet } from '../components/TipSheet';
import { useTVEventHandler } from '../lib/tv';
import { duration as fmtDuration } from '../lib/format';
import { reportBrokenChannel } from '../services/liveTv.service';
import { react, toggleSave } from '../services/engagement.service';
import { useAuth } from '../contexts/AuthContext';
import { openCreator } from '../lib/open';
import { resumePosition, saveResumePoint } from '../lib/resume';
import { queryClient } from '../config/queryClient';
import { colors, radius, spacing, OVERSCAN, s } from '../config/theme';
import type { RootStackParamList } from '../navigation/types';

const CONTROLS_TIMEOUT_MS = 4_000;
const SEEK_STEP_SECONDS = 10;

/**
 * Fullscreen playback.
 *
 * Three decisions here are TV-specific and none of them survive being copied
 * from a phone player.
 *
 * **Controls are hidden by default and summoned by any key.** A phone player
 * shows chrome because a tap is ambiguous. A remote is not: the user is either
 * watching or operating, and leaving a control bar over the picture is the
 * single most complained-about thing in a TV app.
 *
 * **Nothing depends on a gesture.** There is no scrubbing, no pinch, no swipe.
 * Seeking is ±10s buttons and the D-pad, which is what every remote can do and
 * what every TV viewer already expects.
 *
 * **A source that fails is retried on the next candidate before it is called an
 * error**, and for IPTV the failure is reported upstream. The channel list rots
 * continuously — hosts vanish, tokens expire — and client reports are the only
 * thing keeping the curated table honest.
 */
export function PlayerScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const { kind, title, subtitle, sources, poster, channelId, tokenId, creatorAddress, creatorName } =
    route.params;
  const { isSignedIn } = useAuth();

  // Optimistic, and deliberately not reconciled against the server afterwards.
  // The endpoints toggle rather than set, so the local flip is always what the
  // server did; re-reading would cost a round-trip mid-playback to learn
  // something already known. A failure reverts.
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [tipping, setTipping] = useState(false);

  const onLike = useCallback(async () => {
    if (tokenId === undefined || likePending) return;
    setLikePending(true);
    setLiked((v) => !v);
    try {
      await react(tokenId, 'like');
    } catch {
      setLiked((v) => !v);
    } finally {
      setLikePending(false);
    }
  }, [likePending, tokenId]);

  const onSave = useCallback(async () => {
    if (tokenId === undefined || savePending) return;
    setSavePending(true);
    setSaved((v) => !v);
    try {
      await toggleSave(tokenId);
      // The Saved rail on Home reads a different query; without this it keeps
      // showing yesterday's shelf until the cache goes stale on its own.
      void queryClient.invalidateQueries({ queryKey: ['feed', 'saved'] });
    } catch {
      setSaved((v) => !v);
    } finally {
      setSavePending(false);
    }
  }, [savePending, tokenId]);

  // ExoPlayer does not by itself stop the panel's screensaver, and a two-hour
  // film interrupted by a dimming TV is a bug report every time.
  useKeepAwake();

  const [sourceIndex, setSourceIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLive = kind === 'live' || kind === 'channel';
  const currentSource = sources[sourceIndex];

  const player = useVideoPlayer(currentSource ?? null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 1;
    p.play();
  });

  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: 0,
  });

  // ── Resume ────────────────────────────────────────────────────────────────
  // Seek once, on the first ready. `readyToPlay` fires again after a buffer
  // stall or a source retry, and seeking on those would drag the viewer back
  // to where they came in every time the network hiccuped.
  const resumeTarget = useRef(isLive ? 0 : resumePosition(tokenId));
  const hasResumed = useRef(false);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);

  useEffect(() => {
    if (hasResumed.current || isLive) return;
    if (status !== 'readyToPlay' || resumeTarget.current <= 0) return;
    hasResumed.current = true;
    player.currentTime = resumeTarget.current;
    setResumedFrom(resumeTarget.current);
    // Long enough to read from a sofa, short enough not to sit over the film.
    const timer = setTimeout(() => setResumedFrom(null), 5_000);
    return () => clearTimeout(timer);
  }, [status, isLive, player]);

  // Written on a timer rather than every tick: `timeUpdate` fires once a
  // second, and a disk write per second for two hours is a lot of writes for a
  // number that only has to survive someone turning the television off.
  const lastSaved = useRef(0);
  useEffect(() => {
    if (isLive || tokenId === undefined) return;
    if (currentTime - lastSaved.current < 5 && currentTime >= lastSaved.current) return;
    lastSaved.current = currentTime;
    saveResumePoint({
      id: tokenId,
      params: route.params,
      position: currentTime,
      duration: player.duration || route.params.durationSeconds || 0,
    });
  }, [currentTime, isLive, tokenId, route.params, player]);

  // Leaving mid-video is the common case — the Back button, not the credits —
  // so the final position is written on the way out as well.
  useEffect(() => {
    return () => {
      if (isLive || tokenId === undefined) return;
      const position = player.currentTime;
      if (!Number.isFinite(position)) return;
      saveResumePoint({
        id: tokenId,
        params: route.params,
        position,
        duration: player.duration || route.params.durationSeconds || 0,
      });
    };
  }, [isLive, tokenId, route.params, player]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showControls]);

  // Advance through the candidate list before declaring failure. `error` fires
  // for a dead host as readily as for a genuinely broken stream, and the two
  // are indistinguishable from here.
  useEffect(() => {
    if (status !== 'error') return;
    if (sourceIndex + 1 < sources.length) {
      setSourceIndex((i) => i + 1);
      return;
    }
    setExhausted(true);
    if (channelId) void reportBrokenChannel(channelId);
  }, [status, sourceIndex, sources.length, channelId]);

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    showControls();
  }, [player, showControls]);

  const seekBy = useCallback(
    (delta: number) => {
      if (isLive) return;
      player.seekBy(delta);
      showControls();
    },
    [isLive, player, showControls],
  );

  /**
   * Remote keys that are not focus movement. Focus movement is deliberately
   * left to the focus engine — a hand-rolled D-pad handler fights it and loses,
   * and the symptom is a focus ring that skips buttons.
   */
  useTVEventHandler(
    useCallback(
      (evt: { eventType: string }) => {
        switch (evt.eventType) {
          case 'playPause':
            togglePlay();
            break;
          case 'left':
          case 'right':
          case 'up':
          case 'down':
          case 'select':
            // Any input wakes the chrome. This is the whole reason the bar can
            // be hidden by default and still feel reachable.
            showControls();
            break;
          default:
            break;
        }
      },
      [showControls, togglePlay],
    ),
  );

  // The remote's Back button arrives as Android hardware back.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // The comments panel takes the first Back, before the chrome does —
      // otherwise reading them and pressing Back exits the video entirely.
      if (commentsOpen) {
        setCommentsOpen(false);
        showControls();
        return true;
      }
      if (controlsVisible) {
        navigation.goBack();
        return true;
      }
      // First Back reveals the chrome, second leaves. Otherwise a stray press
      // during a film dumps the viewer back to the grid with no warning.
      showControls();
      return true;
    });
    return () => sub.remove();
  }, [commentsOpen, controlsVisible, navigation, showControls]);

  const total = player.duration || route.params.durationSeconds || 0;
  const progress = useMemo(() => {
    if (isLive || !total) return 0;
    return Math.min(1, Math.max(0, currentTime / total));
  }, [currentTime, isLive, total]);

  if (exhausted) {
    return (
      <View style={styles.errorWrapper}>
        <ErrorState
          title="This stream would not play"
          detail={
            channelId
              ? `${title} is offline or has moved. It has been reported so the channel list can be updated.`
              : `${title} could not be loaded. ${error?.message ?? ''}`.trim()
          }
          onRetry={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />

      {status === 'loading' && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <Txt variant="body" color={colors.neutrals[300]}>
            Loading {title}…
          </Txt>
        </View>
      )}

      {/* Over the picture, not instead of it: the film keeps playing while the
          comments are read, which is the point of a side channel. */}
      {tokenId !== undefined && (
        <CommentsPanel tokenId={tokenId} visible={commentsOpen} />
      )}

      {controlsVisible && (
        <>
          <LinearGradient
            colors={['rgba(1,3,5,0.85)', 'transparent']}
            style={styles.topScrim}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', 'rgba(1,3,5,0.92)']}
            style={styles.bottomScrim}
            pointerEvents="none"
          />

          <View style={styles.topBar} pointerEvents="none">
            {isLive && (
              <View style={styles.badgeRow}>
                <Badge label={kind === 'channel' ? 'Live TV' : 'Live'} tone="live" />
              </View>
            )}
            <Txt variant="title" numberOfLines={1}>
              {title}
            </Txt>
            {!!subtitle && (
              <Txt variant="body" color={colors.neutrals[300]} numberOfLines={1}>
                {subtitle}
              </Txt>
            )}
            {/* Said out loud, because a video that starts twenty minutes in
                with no explanation reads as the app having lost its place. */}
            {resumedFrom !== null && (
              <Txt variant="meta" color={colors.neutrals[300]}>
                Resumed from {fmtDuration(resumedFrom)}
              </Txt>
            )}
          </View>

          <View style={styles.bottomBar}>
            {!isLive && (
              <View style={styles.progressRow}>
                <Txt variant="meta" color={colors.neutrals[300]}>
                  {fmtDuration(currentTime)}
                </Txt>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                </View>
                <Txt variant="meta" color={colors.neutrals[300]}>
                  {fmtDuration(total)}
                </Txt>
              </View>
            )}

            <View style={styles.buttons}>
              {!isLive && (
                <ControlButton
                  icon="play-back"
                  label={`-${SEEK_STEP_SECONDS}s`}
                  onPress={() => seekBy(-SEEK_STEP_SECONDS)}
                />
              )}
              <ControlButton
                icon={isPlaying ? 'pause' : 'play'}
                label={isPlaying ? 'Pause' : 'Play'}
                onPress={togglePlay}
                autoFocus
                primary
              />
              {!isLive && (
                <ControlButton
                  icon="play-forward"
                  label={`+${SEEK_STEP_SECONDS}s`}
                  onPress={() => seekBy(SEEK_STEP_SECONDS)}
                />
              )}
              {/* Engagement is offered only when there is something to engage
                  with (a tokenId — IPTV has none) and someone to attribute it
                  to. Showing a Like button to a signed-out viewer is an
                  invitation to a sign-in wall, which on a remote is a punishment. */}
              {isSignedIn && tokenId !== undefined && (
                <>
                  <ControlButton
                    icon={liked ? 'heart' : 'heart-outline'}
                    label={liked ? 'Liked' : 'Like'}
                    onPress={onLike}
                    busy={likePending}
                  />
                  <ControlButton
                    icon={saved ? 'bookmark' : 'bookmark-outline'}
                    label={saved ? 'Saved' : 'Save'}
                    onPress={onSave}
                    busy={savePending}
                  />
                  {/* Only when there is somebody to pay. A Tip button that
                      opens a sheet and then discovers it has no recipient is
                      worse than no button. */}
                  {!!creatorAddress && (
                    <ControlButton
                      icon="cash-outline"
                      label="Tip"
                      onPress={() => {
                        // Pin the chrome open — the sheet is what the user is
                        // looking at now, and having it vanish under the
                        // four-second auto-hide would be baffling.
                        if (hideTimer.current) clearTimeout(hideTimer.current);
                        setTipping(true);
                      }}
                    />
                  )}
                </>
              )}

              {/* Reading the room. Offered signed out too — the comments are
                  public, and a television is mostly a signed-out device. */}
              {tokenId !== undefined && (
                <ControlButton
                  icon={commentsOpen ? 'chatbubble' : 'chatbubble-outline'}
                  label="Comments"
                  onPress={() => setCommentsOpen((v) => !v)}
                />
              )}

              {!!creatorAddress && (
                <ControlButton
                  icon="person-outline"
                  label={creatorName ? `More from ${creatorName}` : 'Creator'}
                  onPress={() =>
                    openCreator(navigation, {
                      address: creatorAddress,
                      name: creatorName,
                    })
                  }
                />
              )}

              <ControlButton icon="close" label="Back" onPress={() => navigation.goBack()} />
            </View>
          </View>
        </>
      )}

      {tipping && tokenId !== undefined && !!creatorAddress && (
        <TipSheet
          tokenId={tokenId}
          recipient={creatorAddress}
          recipientName={creatorName}
          postTitle={title}
          onClose={() => {
            setTipping(false);
            showControls();
          }}
        />
      )}
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
  autoFocus,
  primary,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  autoFocus?: boolean;
  primary?: boolean;
  /** In flight. Dimmed but still focusable — a control that loses focus
   *  mid-press throws the ring somewhere else and the user loses their place. */
  busy?: boolean;
}) {
  return (
    <Focusable
      onPress={onPress}
      autoFocus={autoFocus}
      scaleOnFocus={false}
      ring={false}
      borderRadius={radius.pill}
    >
      {(focused) => (
        <View
          style={[
            styles.control,
            primary && styles.controlPrimary,
            focused && styles.controlFocused,
            busy && styles.controlBusy,
          ]}
        >
          <Ionicons
            name={icon}
            size={s(21)}
            color={focused ? colors.controlFocusedForeground : colors.foreground}
          />
          <Txt variant="card" color={focused ? colors.controlFocusedForeground : colors.foreground}>
            {label}
          </Txt>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: s(170),
  },
  bottomScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: s(230),
  },
  topBar: {
    position: 'absolute',
    top: OVERSCAN.y + spacing.md,
    left: OVERSCAN.x,
    right: OVERSCAN.x,
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  bottomBar: {
    position: 'absolute',
    bottom: OVERSCAN.y + spacing.md,
    left: OVERSCAN.x,
    right: OVERSCAN.x,
    gap: spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  track: {
    flex: 1,
    height: s(5),
    borderRadius: s(3),
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.foreground,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.control,
    borderWidth: s(2),
    borderColor: colors.border,
  },
  controlPrimary: {
    minWidth: s(140),
    justifyContent: 'center',
  },
  controlFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
  controlBusy: {
    opacity: 0.55,
  },
});
