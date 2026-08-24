import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './Txt';
import { Focusable } from './Focusable';
import { colors, radius, spacing, s } from '../config/theme';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.centre}>
      <ActivityIndicator size="large" color={colors.foreground} />
      <Txt variant="body" color={colors.mutedForeground}>
        {label}
      </Txt>
    </View>
  );
}

export function EmptyState({
  title,
  detail,
  icon = 'cloud-offline-outline',
}: {
  title: string;
  detail?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.centre}>
      <Ionicons name={icon} size={s(52)} color={colors.neutrals[700]} />
      <Txt variant="title">{title}</Txt>
      {!!detail && (
        <Txt variant="body" color={colors.mutedForeground} style={styles.detail}>
          {detail}
        </Txt>
      )}
    </View>
  );
}

/**
 * An error on a TV must always offer a way forward.
 *
 * There is no pull-to-refresh, no address bar and no back gesture — if the
 * screen renders a dead end, the remote's only remaining move is the Home
 * button, which quits the app. So the retry control is not optional chrome, and
 * it takes focus on mount so a single press of OK recovers.
 */
export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centre}>
      <Ionicons name="warning-outline" size={s(52)} color={colors.neutrals[700]} />
      <Txt variant="title">{title}</Txt>
      {!!detail && (
        <Txt variant="body" color={colors.mutedForeground} style={styles.detail} numberOfLines={3}>
          {detail}
        </Txt>
      )}
      {!!onRetry && (
        <Focusable onPress={onRetry} autoFocus scaleOnFocus={false} ring={false} borderRadius={radius.pill}>
          {(focused) => (
            <View style={[styles.button, focused && styles.buttonFocused]}>
              <Txt variant="card" color={focused ? colors.controlFocusedForeground : colors.foreground}>
                Try again
              </Txt>
            </View>
          )}
        </Focusable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  detail: {
    textAlign: 'center',
    maxWidth: s(560),
  },
  button: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.control,
    borderWidth: s(2),
    borderColor: colors.border,
    minWidth: s(170),
    alignItems: 'center',
  },
  buttonFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
});
