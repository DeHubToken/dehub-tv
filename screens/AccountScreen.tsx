import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from '../components/Txt';
import { Focusable } from '../components/Focusable';
import { Loading } from '../components/States';
import { SignInScreen } from './SignInScreen';
import { useAuth } from '../contexts/AuthContext';
import { avatarUrl } from '../lib/media';
import env from '../config/env';
import { colors, radius, spacing, OVERSCAN, STAGE_INSET, s } from '../config/theme';

/** Signed out, this is the sign-in flow. Signed in, it is the account panel. */
export function AccountScreen() {
  const { user, isSignedIn, isRestoring, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (isRestoring) return <Loading label="Checking your session" />;
  if (!isSignedIn) return <SignInScreen />;

  const name = user?.displayName || user?.username || 'Your account';
  const handle = user?.username ? `@${user.username}` : shortAddress(user?.address);
  const host = env.APP_ORIGIN.replace(/^https?:\/\//, '');

  return (
    <View style={styles.root}>
      <View style={styles.identity}>
        {user?.avatarImageUrl ? (
          <Image
            source={{ uri: avatarUrl(user.avatarImageUrl, 96) }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Ionicons name="person" size={s(36)} color={colors.neutrals[600]} />
          </View>
        )}
        <View style={styles.identityText}>
          <Txt variant="title">{name}</Txt>
          {!!handle && (
            <Txt variant="body" color={colors.mutedForeground}>
              {handle}
            </Txt>
          )}
        </View>
      </View>

      <View style={styles.notes}>
        <Note
          icon="eye-outline"
          title="This TV can watch, not spend"
          body="Signing in here brings across your feed ordering, who you follow and what you have saved. It cannot tip, post or move funds — those still need your wallet on your phone."
        />
        <Note
          icon="shield-checkmark-outline"
          title="Signed in somewhere you would rather not be?"
          body={`Open ${host} or the DeHub app, go to Settings → Active sessions, and sign this television out remotely. It shows up there as “DeHub TV”.`}
        />
      </View>

      <Focusable
        onPress={async () => {
          setSigningOut(true);
          await signOut();
          setSigningOut(false);
        }}
        autoFocus
        scaleOnFocus={false}
        ring={false}
        borderRadius={radius.pill}
      >
        {(focused) => (
          <View style={[styles.signOut, focused && styles.signOutFocused]}>
            <Ionicons
              name="log-out-outline"
              size={s(20)}
              color={focused ? colors.controlFocusedForeground : colors.foreground}
            />
            <Txt variant="card" color={focused ? colors.controlFocusedForeground : colors.foreground}>
              {signingOut ? 'Signing out…' : 'Sign out of this TV'}
            </Txt>
          </View>
        )}
      </Focusable>
    </View>
  );
}

function Note({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.note}>
      <View style={styles.noteHead}>
        <Ionicons name={icon} size={s(20)} color={colors.foreground} />
        <Txt variant="card">{title}</Txt>
      </View>
      <Txt variant="meta" color={colors.mutedForeground}>
        {body}
      </Txt>
    </View>
  );
}

/** `0x08c4…3cfb` — enough to recognise, short enough to read across a room. */
function shortAddress(address?: string): string {
  if (!address || address.length < 12) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: OVERSCAN.y,
    paddingBottom: OVERSCAN.y,
    paddingLeft: STAGE_INSET,
    paddingRight: OVERSCAN.x,
    gap: spacing.xl,
    justifyContent: 'center',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  avatar: {
    width: s(72),
    height: s(72),
    borderRadius: s(36),
    backgroundColor: colors.neutrals[800],
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: {
    gap: spacing.xs,
  },
  notes: {
    flexDirection: 'row',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  note: {
    flex: 1,
    minWidth: s(280),
    maxWidth: s(400),
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: spacing.sm,
  },
  noteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  signOut: {
    alignSelf: 'flex-start',
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
  signOutFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
});
