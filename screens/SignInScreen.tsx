import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from '../components/Txt';
import { Focusable } from '../components/Focusable';
import { useAuth } from '../contexts/AuthContext';
import {
  sendEmailCode,
  verifyEmailCode,
  describeExchangeError,
  SignInError,
} from '../services/auth.service';
import env from '../config/env';
import { colors, radius, spacing, OVERSCAN, STAGE_INSET, s } from '../config/theme';

type Step = 'email' | 'code';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Signing in on a television.
 *
 * Two things shape this screen, and both come from the input device.
 *
 * **Typing is expensive.** An email address on a D-pad keyboard is thirty-odd
 * key presses, so the screen asks for exactly one thing at a time, keeps the
 * address on screen at the code step so nobody has to remember what they typed,
 * and never makes them re-enter it after a wrong code.
 *
 * **A dead end is unrecoverable.** There is no address bar and no second tab,
 * so every failure state here names the specific next action — and for the most
 * common one, a wallet-first account with no email attached yet, that action is
 * on a different device entirely. Saying "not linked" and stopping would strand
 * the user completely, so the screen spells out the exact path through the web
 * app instead.
 */
export function SignInScreen({ onDone }: { onDone?: () => void }) {
  const { adopt } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  const codeRef = useRef<TextInput>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  const requestCode = useCallback(async () => {
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendEmailCode(email);
      setStep('code');
      setCode('');
      // The IME has to be summoned explicitly — moving focus alone does not
      // open the leanback keyboard, and a field the remote cannot type into
      // reads as the app having frozen.
      setTimeout(() => codeRef.current?.focus(), 250);
    } catch (e) {
      setError(describeExchangeError(e));
    } finally {
      setBusy(false);
    }
  }, [busy, email, emailValid]);

  const submitCode = useCallback(async () => {
    if (code.trim().length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await verifyEmailCode(email, code);
      adopt(user);
      onDone?.();
    } catch (e) {
      setError(describeExchangeError(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  }, [adopt, busy, code, email, onDone]);

  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Txt variant="title">Sign in to DeHub</Txt>
        <Txt variant="body" color={colors.mutedForeground}>
          Signing in puts everything you have saved on the home screen, and
          carries your likes across from your phone.
        </Txt>
        <Txt variant="meta" color={colors.dimForeground} style={styles.assurance}>
          A television can watch, and only watch. Tipping, posting and anything
          that moves funds still needs your wallet on your phone — this device
          never holds a key. You can sign this TV out at any time from Settings
          → Active sessions on another device.
        </Txt>
      </View>

      <View style={styles.form}>
        {step === 'email' ? (
          <>
            <Txt variant="rail">What is your email address?</Txt>
            <Field
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError(null);
              }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoFocus
              onSubmitEditing={requestCode}
            />
            <Action
              label={busy ? 'Sending…' : 'Send me a code'}
              icon="mail-outline"
              disabled={!emailValid || busy}
              onPress={requestCode}
            />
          </>
        ) : (
          <>
            <Txt variant="rail">Enter the code we emailed</Txt>
            <Txt variant="meta" color={colors.mutedForeground}>
              Sent to {email.trim().toLowerCase()}
            </Txt>
            <Field
              inputRef={codeRef}
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/\D/g, '').slice(0, 6));
                setError(null);
              }}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              wide={false}
              onSubmitEditing={submitCode}
            />
            <View style={styles.row}>
              <Action
                label={busy ? 'Checking…' : 'Sign in'}
                icon="log-in-outline"
                disabled={code.length < 6 || busy}
                onPress={submitCode}
              />
              <Action
                label="Use a different email"
                icon="arrow-back-outline"
                subdued
                disabled={busy}
                onPress={() => {
                  setStep('email');
                  setError(null);
                }}
              />
            </View>
          </>
        )}

        {!!error && <Problem error={error} appOrigin={env.APP_ORIGIN} />}
      </View>
    </View>
  );
}

/**
 * The failure states, each with the one action that resolves it.
 *
 * `WALLET_NOT_LINKED` is the one that matters most and is the reason this is a
 * component rather than a line of red text: a wallet-first DeHub account has no
 * email attached until someone attaches one, and there is no way to do that
 * from a TV. The instructions have to be precise enough to follow on a phone
 * while looking at the television.
 */
function Problem({ error, appOrigin }: { error: SignInError; appOrigin: string }) {
  const host = appOrigin.replace(/^https?:\/\//, '');

  if (error.reason === 'WALLET_NOT_LINKED' || error.reason === 'NO_ACCOUNT') {
    return (
      <View style={styles.problem}>
        <View style={styles.problemHead}>
          <Ionicons name="link-outline" size={s(20)} color={colors.foreground} />
          <Txt variant="card">Connect this email to your account first</Txt>
        </View>
        <Txt variant="meta" color={colors.mutedForeground}>
          Your DeHub account is a wallet, and it needs an email attached before
          another device can sign in with one. On your phone or computer:
        </Txt>
        <Txt variant="meta" color={colors.neutrals[200]} style={styles.steps}>
          1. Open {host} and sign in with your wallet{'\n'}
          2. Go to Settings → Profile → Sign-in{'\n'}
          3. Add this email address and confirm the code{'\n'}
          4. Come back here and try again
        </Txt>
      </View>
    );
  }

  return (
    <View style={styles.problem}>
      <View style={styles.problemHead}>
        <Ionicons name="alert-circle-outline" size={s(20)} color={colors.live} />
        <Txt variant="card">{error.message}</Txt>
      </View>
    </View>
  );
}

function Field({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoFocus,
  maxLength,
  onSubmitEditing,
  inputRef,
  wide = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType: 'email-address' | 'number-pad';
  autoFocus?: boolean;
  maxLength?: number;
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  wide?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, wide ? styles.fieldWide : styles.fieldNarrow, focused && styles.fieldFocused]}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.dimForeground}
        style={[styles.input, keyboardType === 'number-pad' && styles.inputCode]}
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="done"
        {...{ hasTVPreferredFocus: autoFocus }}
      />
    </View>
  );
}

function Action({
  label,
  icon,
  onPress,
  disabled,
  subdued,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  subdued?: boolean;
}) {
  return (
    <Focusable
      onPress={onPress}
      disabled={disabled}
      scaleOnFocus={false}
      ring={false}
      borderRadius={radius.pill}
    >
      {(focused) => (
        <View
          style={[
            styles.action,
            subdued && styles.actionSubdued,
            focused && !disabled && styles.actionFocused,
            disabled && styles.actionDisabled,
          ]}
        >
          <Ionicons
            name={icon}
            size={s(20)}
            color={focused && !disabled ? colors.controlFocusedForeground : colors.foreground}
          />
          <Txt
            variant="card"
            color={focused && !disabled ? colors.controlFocusedForeground : colors.foreground}
          >
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
    flexDirection: 'row',
    backgroundColor: colors.background,
    paddingTop: OVERSCAN.y,
    paddingBottom: OVERSCAN.y,
    paddingLeft: STAGE_INSET,
    paddingRight: OVERSCAN.x,
    gap: spacing.xxl,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    maxWidth: '42%',
  },
  assurance: {
    marginTop: spacing.sm,
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  field: {
    height: s(56),
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  fieldWide: {
    alignSelf: 'stretch',
    maxWidth: s(440),
  },
  fieldNarrow: {
    width: s(220),
  },
  fieldFocused: {
    borderColor: colors.borderFocused,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  input: {
    color: colors.foreground,
    fontSize: s(19),
    fontFamily: 'Exo_400Regular',
    paddingVertical: 0,
  },
  inputCode: {
    // A six-digit code read from a phone screen and typed on a remote earns
    // wide tracking — it is the one string on this screen people check twice.
    fontSize: s(26),
    letterSpacing: s(6),
    fontFamily: 'Exo_600SemiBold',
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
  actionSubdued: {
    backgroundColor: 'transparent',
  },
  actionFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
  actionDisabled: {
    opacity: 0.4,
  },
  problem: {
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.sm,
    maxWidth: s(460),
  },
  problemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  steps: {
    lineHeight: s(24),
  },
});
