import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './Txt';
import { Focusable } from './Focusable';
import { TVFocusGuideView } from '../lib/tv';
import {
  requestTip,
  pollRequest,
  TvRequestError,
  type TvRequest,
  type TipIntent,
} from '../services/tvRequest.service';
import { compactNumber } from '../lib/format';
import { colors, radius, spacing, s } from '../config/theme';

/** Matches the phone app's quick amounts, trimmed to what fits one TV row. */
const QUICK_AMOUNTS = [500, 1_000, 5_000, 10_000, 25_000, 50_000] as const;

const POLL_INTERVAL_MS = 3_000;

type Phase = 'choosing' | 'waiting' | 'done' | 'error';

export interface TipSheetProps {
  tokenId: number | string;
  recipient: string;
  recipientName?: string;
  postTitle?: string;
  onClose: () => void;
}

/**
 * Tipping from the sofa.
 *
 * The television cannot send this itself — it holds no key — so what this
 * actually does is raise a request and then wait for the owner's phone to
 * approve it. Which makes the waiting state the real screen here, not an
 * afterthought: the user has just pressed a button and nothing visible will
 * happen on the television until they pick up a different device. If that is
 * not said plainly and immediately, the natural reading is that the app is
 * broken, and the second natural move is to press it again.
 *
 * Amounts are presets only. A free-text amount field means typing digits on a
 * D-pad, and the one place that is least acceptable is the screen where the
 * number is how much money leaves your account.
 */
export function TipSheet({
  tokenId,
  recipient,
  recipientName,
  postTitle,
  onClose,
}: TipSheetProps) {
  const [phase, setPhase] = useState<Phase>('choosing');
  const [amount, setAmount] = useState<number | null>(null);
  const [request, setRequest] = useState<TvRequest | null>(null);
  const [message, setMessage] = useState<string>('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Back closes the sheet rather than leaving the player, and keeps doing so
  // while a request is in flight — abandoning the wait is a legitimate choice,
  // and the request expires on its own.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const send = useCallback(
    async (value: number) => {
      setAmount(value);
      setPhase('waiting');
      setMessage('');

      const intent: TipIntent = {
        tokenId,
        amount: value,
        tokenSymbol: 'DHB',
        recipient,
        recipientName,
        postTitle,
      };

      let created: TvRequest;
      try {
        created = await requestTip(intent);
      } catch (error) {
        setPhase('error');
        setMessage(
          error instanceof TvRequestError ? error.message : 'Could not raise that request.',
        );
        return;
      }

      setRequest(created);

      timer.current = setInterval(async () => {
        try {
          const next = await pollRequest(created.requestId);

          // Gone means it expired. Saying "declined" here would tell somebody
          // their tip was refused when in truth nobody looked at it in time.
          if (!next) {
            stopPolling();
            setPhase('error');
            setMessage('Nobody answered in time. You can ask again.');
            return;
          }

          if (next.status === 'pending') return;

          stopPolling();
          setRequest(next);
          if (next.status === 'approved') {
            setPhase('done');
          } else {
            setPhase('error');
            setMessage(
              next.status === 'rejected'
                ? 'Declined on your phone.'
                : next.error || 'The transaction did not go through.',
            );
          }
        } catch {
          // A single failed poll is a blip, not an outcome. The request is
          // still live on the server and the next tick will pick it up.
        }
      }, POLL_INTERVAL_MS);
    },
    [postTitle, recipient, recipientName, stopPolling, tokenId],
  );

  return (
    <View style={styles.scrim}>
      <TVFocusGuideView autoFocus style={styles.panel}>
        {phase === 'choosing' && (
          <>
            <Txt variant="title">Tip {recipientName || 'this creator'}</Txt>
            <Txt variant="meta" color={colors.mutedForeground}>
              You will approve it on your phone — this television cannot move funds.
            </Txt>
            <View style={styles.amounts}>
              {QUICK_AMOUNTS.map((value, index) => (
                <Focusable
                  key={value}
                  onPress={() => void send(value)}
                  autoFocus={index === 0}
                  scaleOnFocus={false}
                  ring={false}
                  borderRadius={radius.pill}
                >
                  {(focused) => (
                    <View style={[styles.amount, focused && styles.amountFocused]}>
                      <Txt
                        variant="card"
                        color={focused ? colors.controlFocusedForeground : colors.foreground}
                      >
                        {compactNumber(value)} DHB
                      </Txt>
                    </View>
                  )}
                </Focusable>
              ))}
            </View>
          </>
        )}

        {phase === 'waiting' && (
          <View style={styles.centred}>
            <ActivityIndicator size="large" color={colors.foreground} />
            <Txt variant="title">Check your phone</Txt>
            <Txt variant="body" color={colors.neutrals[300]} style={styles.centredText}>
              Approve the {compactNumber(amount ?? 0)} DHB tip
              {recipientName ? ` to ${recipientName}` : ''} in the DeHub app.
            </Txt>
            {/* The exact path, not just "on your phone". The request expires in
                five minutes, and a person hunting through settings for a screen
                they have never opened will not make it in time. */}
            <Txt variant="meta" color={colors.neutrals[400]} style={styles.centredText}>
              Settings → Privacy → TV requests
            </Txt>
            <Txt variant="meta" color={colors.dimForeground}>
              This request expires in five minutes.
            </Txt>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.centred}>
            <Ionicons name="checkmark-circle" size={s(52)} color={colors.success} />
            <Txt variant="title">Tip sent</Txt>
            <Txt variant="body" color={colors.neutrals[300]}>
              {compactNumber(amount ?? 0)} DHB
              {recipientName ? ` to ${recipientName}` : ''}
            </Txt>
            {!!request?.txHash && (
              <Txt variant="meta" color={colors.dimForeground}>
                {shortHash(request.txHash)}
              </Txt>
            )}
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.centred}>
            <Ionicons name="alert-circle-outline" size={s(52)} color={colors.live} />
            <Txt variant="title">Not sent</Txt>
            <Txt variant="body" color={colors.neutrals[300]} style={styles.centredText}>
              {message}
            </Txt>
          </View>
        )}

        {phase !== 'choosing' && (
          <View style={styles.actions}>
            {phase === 'error' && (
              <Action
                label="Try again"
                icon="refresh"
                autoFocus
                onPress={() => {
                  setPhase('choosing');
                  setRequest(null);
                  setMessage('');
                }}
              />
            )}
            <Action
              label={phase === 'done' ? 'Back to the video' : 'Close'}
              icon="close"
              autoFocus={phase !== 'error'}
              onPress={onClose}
            />
          </View>
        )}
      </TVFocusGuideView>
    </View>
  );
}

function Action({
  label,
  icon,
  onPress,
  autoFocus,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  autoFocus?: boolean;
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
        <View style={[styles.action, focused && styles.actionFocused]}>
          <Ionicons
            name={icon}
            size={s(20)}
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

function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
  },
  panel: {
    width: s(560),
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.cardSolid,
    gap: spacing.md,
  },
  amounts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  amount: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.control,
    minWidth: s(120),
    alignItems: 'center',
  },
  amountFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
  centred: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  centredText: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
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
