import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { useKeepAwake } from 'expo-keep-awake';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Txt } from '../components/Txt';
import { Badge } from '../components/Badge';
import { Focusable } from '../components/Focusable';
import { ErrorState } from '../components/States';
import { useTVEventHandler } from '../lib/tv';
import { duration as fmtDuration } from '../lib/format';
import { reportBrokenChannel } from '../services/liveTv.service';
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
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Player'>>();
  const { kind, title, subtitle, sources, poster, channelId } = route.params;

  // ExoPlayer does not by itself stop the panel's screensaver, and a two-hour
  // film interrupted by a dimming TV is a bug report every time.
  useKeepAwake();

  const [sourceIndex, setSourceIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
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
  }, [controlsVisible, navigation, showControls]);

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
              <ControlButton icon="close" label="Back" onPress={() => navigation.goBack()} />
            </View>
          </View>
        </>
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  autoFocus?: boolean;
  primary?: boolean;
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
});
