import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './Txt';
import { Focusable } from './Focusable';
import { startPairing, pollPairing, type Pairing } from '../services/pairing.service';
import env from '../config/env';
import { colors, radius, spacing, s } from '../config/theme';

const POLL_INTERVAL_MS = 2_500;

type Phase = 'starting' | 'waiting' | 'expired' | 'rejected' | 'error';

export interface PairingPanelProps {
  /** Fired once the session has been stored. */
  onPaired: () => void;
}

/**
 * The no-typing way in: a code on the television, approved from a phone.
 *
 * **There is no QR here, and that is a choice.** Rendering one needs either a
 * native SVG module this app has deliberately avoided or a thousand-odd nested
 * views for the matrix — and Netflix, Disney+ and Spotify all show a code and a
 * short URL instead, because a code works when the camera does not, when the
 * phone is across the room, and when the person is reading it out to somebody
 * else. If a QR is wanted later it is additive, not a rewrite.
 *
 * The code is the largest thing on the screen for the same reason the waiting
 * copy is blunt: this is a number being read across a room and typed into a
 * different device, and every ambiguous glyph is a failed sign-in. The server
 * already excludes I, O, 0, 1, S and 5 from the alphabet; the display carries
 * that the rest of the way with wide tracking and a monospaced rhythm.
 */
export function PairingPanel({ onPaired }: PairingPanelProps) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (countdown.current) clearInterval(countdown.current);
    timer.current = null;
    countdown.current = null;
  }, []);

  const begin = useCallback(async () => {
    stop();
    setPhase('starting');
    let next: Pairing;
    try {
      next = await startPairing();
    } catch {
      setPhase('error');
      return;
    }

    setPairing(next);
    setPhase('waiting');

    const tick = () => {
      const left = Math.max(0, Math.floor((Date.parse(next.expiresAt) - Date.now()) / 1000));
      setSecondsLeft(left);
      // Stop asking the moment the code is dead rather than polling a row the
      // server has already deleted.
      if (left <= 0) {
        stop();
        setPhase('expired');
      }
    };
    tick();
    countdown.current = setInterval(tick, 1_000);

    timer.current = setInterval(async () => {
      try {
        const state = await pollPairing(next.pairingId);
        if (state === 'approved') {
          stop();
          onPaired();
        } else if (state === 'rejected') {
          stop();
          setPhase('rejected');
        } else if (state === 'expired' || state === 'consumed') {
          stop();
          setPhase('expired');
        }
      } catch {
        // One failed poll is a blip. The code is still live on the server and
        // the next tick will pick it up.
      }
    }, POLL_INTERVAL_MS);
  }, [onPaired, stop]);

  useEffect(() => {
    void begin();
    return stop;
  }, [begin, stop]);

  const host = env.APP_ORIGIN.replace(/^https?:\/\//, '');

  return (
    <View style={styles.panel}>
      {phase === 'starting' && (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color={colors.foreground} />
          <Txt variant="body" color={colors.mutedForeground}>
            Getting a code…
          </Txt>
        </View>
      )}

      {phase === 'waiting' && !!pairing && (
        <>
          <Txt variant="rail">Sign in with your phone</Txt>
          <View style={styles.codeBox}>
            <Txt variant="hero" style={styles.code}>
              {pairing.code}
            </Txt>
          </View>
          <Txt variant="body" color={colors.neutrals[300]}>
            Open DeHub on your phone and go to
          </Txt>
          <Txt variant="card" color={colors.foreground}>
            Settings → Privacy → Sign in a TV
          </Txt>
          <Txt variant="meta" color={colors.dimForeground}>
            Or visit {host}/link · code expires in {secondsLeft}s
          </Txt>
        </>
      )}

      {(phase === 'expired' || phase === 'rejected' || phase === 'error') && (
        <View style={styles.centred}>
          <Ionicons
            name={phase === 'rejected' ? 'close-circle-outline' : 'time-outline'}
            size={s(46)}
            color={phase === 'rejected' ? colors.live : colors.neutrals[600]}
          />
          <Txt variant="rail">
            {phase === 'rejected'
              ? 'Declined on your phone'
              : phase === 'error'
                ? 'Could not reach DeHub'
                : 'That code expired'}
          </Txt>
          <Focusable onPress={() => void begin()} scaleOnFocus={false} ring={false} borderRadius={radius.pill}>
            {(focused) => (
              <View style={[styles.action, focused && styles.actionFocused]}>
                <Ionicons
                  name="refresh"
                  size={s(20)}
                  color={focused ? colors.controlFocusedForeground : colors.foreground}
                />
                <Txt
                  variant="card"
                  color={focused ? colors.controlFocusedForeground : colors.foreground}
                >
                  Get a new code
                </Txt>
              </View>
            )}
          </Focusable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
  },
  centred: {
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  codeBox: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginVertical: spacing.sm,
  },
  code: {
    // Read across a room and typed into a different device. Wide tracking is
    // the cheapest thing that stops two characters being read as one.
    letterSpacing: s(6),
    fontFamily: 'Exo_700Bold',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.control,
  },
  actionFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
});
