import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Focusable } from './Focusable';
import { Txt } from './Txt';
import { Badge } from './Badge';
import { colors, radius, spacing, STAGE_INSET, s } from '../config/theme';
import { compactNumber } from '../lib/format';

export interface HeroAction {
  label: string;
  onPress: () => void;
  autoFocus?: boolean;
}

export interface HeroProps {
  title: string;
  description?: string;
  imageUrl?: string;
  creator?: string;
  views?: number;
  live?: boolean;
  actions: HeroAction[];
}

/**
 * The masthead.
 *
 * It is a STILL, and that is a finding rather than a shortcut: the CDN has no
 * `previews/<tokenId>.mp4` for current posts (checked against production — the
 * path 404s), so the autoplaying backdrop this layout is usually built around
 * has nothing to play. Wiring one anyway would give every fresh install a
 * silent, permanent video error on the first screen it draws. If preview clips
 * start being generated, this is the one component that needs to change.
 *
 * The scrim is two gradients, not one. A single bottom-up fade leaves title
 * text sitting on whatever the left third of the frame happens to be; the
 * left-to-right pass guarantees the text column has something dark under it
 * regardless of the artwork.
 */
export function Hero({
  title,
  description,
  imageUrl,
  creator,
  views,
  live,
  actions,
}: HeroProps) {
  const { height } = useWindowDimensions();
  // Just over half the panel. Tall enough to feel like a masthead, short enough
  // that the first rail peeks in underneath and signals that the page scrolls.
  const heroHeight = Math.round(height * 0.56);

  return (
    <View style={[styles.wrapper, { height: heroHeight }]}>
      {!!imageUrl && (
        <Image
          source={{ uri: imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={220}
        />
      )}

      <LinearGradient
        colors={['rgba(1,3,5,0.95)', 'rgba(1,3,5,0.55)', 'rgba(1,3,5,0.05)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(1,3,5,0.65)', colors.background]}
        locations={[0.35, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        {live && (
          <View style={styles.badgeRow}>
            <Badge label="Live now" tone="live" />
          </View>
        )}

        <Txt variant="hero" numberOfLines={2}>
          {title}
        </Txt>

        {(!!creator || !!views) && (
          <Txt variant="body" color={colors.neutrals[300]}>
            {[creator, views ? `${compactNumber(views)} views` : null].filter(Boolean).join('  ·  ')}
          </Txt>
        )}

        {!!description && (
          <Txt variant="body" color={colors.neutrals[300]} numberOfLines={2} style={styles.description}>
            {description}
          </Txt>
        )}

        <View style={styles.actions}>
          {actions.map((action) => (
            <Focusable
              key={action.label}
              onPress={action.onPress}
              autoFocus={action.autoFocus}
              scaleOnFocus={false}
              ring={false}
              borderRadius={radius.pill}
            >
              {(focused) => (
                <View style={[styles.button, focused && styles.buttonFocused]}>
                  <Txt
                    variant="card"
                    color={focused ? colors.controlFocusedForeground : colors.foreground}
                  >
                    {action.label}
                  </Txt>
                </View>
              )}
            </Focusable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: colors.neutrals[900],
  },
  content: {
    position: 'absolute',
    left: STAGE_INSET,
    bottom: spacing.xxl,
    // Never the full width. Long titles running under the artwork's subject is
    // the thing that makes a hero look like a stock template.
    maxWidth: '52%',
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  description: {
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.control,
    borderWidth: s(2),
    borderColor: colors.border,
    minWidth: s(150),
    alignItems: 'center',
  },
  buttonFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
});
