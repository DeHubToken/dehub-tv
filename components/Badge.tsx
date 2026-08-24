import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Txt } from './Txt';
import { colors, radius, spacing, s } from '../config/theme';

export interface BadgeProps {
  label: string;
  /** `live` is the one place hue is allowed — it is state, not decoration. */
  tone?: 'default' | 'live';
}

export function Badge({ label, tone = 'default' }: BadgeProps) {
  const live = tone === 'live';
  return (
    <View style={[styles.badge, live && styles.live]}>
      {live && <View style={styles.dot} />}
      <Txt variant="meta" color={colors.foreground} uppercase={live} style={styles.label}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: s(2),
    borderRadius: radius.sm,
    // Solid, not glass. A translucent badge over a bright frame of video is
    // unreadable, and the frame behind it is not ours to control.
    backgroundColor: 'rgba(1,3,5,0.82)',
  },
  live: {
    backgroundColor: colors.live,
  },
  dot: {
    width: s(7),
    height: s(7),
    borderRadius: s(4),
    backgroundColor: colors.foreground,
  },
  label: {
    fontSize: s(13),
  },
});
