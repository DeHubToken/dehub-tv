import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Focusable } from './Focusable';
import { Badge } from './Badge';
import { Txt } from './Txt';
import { colors, radius, spacing, cardSize, s } from '../config/theme';
import { compactNumber, duration } from '../lib/format';

export interface PosterCardProps {
  title: string;
  imageUrl?: string;
  /** Bottom-left overlay: "4:31". Omitted when zero. */
  durationSeconds?: number;
  /** Top-left overlay. */
  live?: boolean;
  subtitle?: string;
  views?: number;
  width?: number;
  height?: number;
  onPress?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
}

/**
 * The standard 16:9 tile — one video, one stream, one replay.
 *
 * The title sits BELOW the artwork rather than over it. Overlaid titles look
 * better in a mock and fail in the field, because the artwork is a frame from
 * someone else's video and half of them are bright: white text over an
 * unpredictable frame is a contrast lottery, and there is no hover state on a
 * TV to recover from a losing ticket.
 */
export function PosterCard({
  title,
  imageUrl,
  durationSeconds,
  live,
  subtitle,
  views,
  width = cardSize.wide.width,
  height = cardSize.wide.height,
  onPress,
  onFocus,
  autoFocus,
}: PosterCardProps) {
  const durationLabel = duration(durationSeconds);

  return (
    <Focusable onPress={onPress} onFocus={onFocus} autoFocus={autoFocus} borderRadius={radius.md}>
      {(focused) => (
        <View style={{ width }}>
          <View style={[styles.art, { width, height }]}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                // A TV redraws the same rails all evening; caching in memory as
                // well as on disk keeps re-entry to the home screen instant.
                cachePolicy="memory-disk"
                transition={160}
              />
            ) : (
              <View style={styles.placeholder}>
                <Txt variant="meta" color={colors.dimForeground}>
                  DEHUB
                </Txt>
              </View>
            )}

            {live && (
              <View style={styles.topLeft}>
                <Badge label="Live" tone="live" />
              </View>
            )}
            {!live && !!durationLabel && (
              <View style={styles.bottomRight}>
                <Badge label={durationLabel} />
              </View>
            )}
          </View>

          <View style={styles.meta}>
            <Txt
              variant="card"
              numberOfLines={2}
              color={focused ? colors.foreground : colors.neutrals[200]}
            >
              {title}
            </Txt>
            {(!!subtitle || !!views) && (
              <Txt variant="meta" color={colors.mutedForeground} numberOfLines={1}>
                {[subtitle, views ? `${compactNumber(views)} views` : null]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Txt>
            )}
          </View>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  art: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.neutrals[800],
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutrals[800],
  },
  topLeft: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  bottomRight: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
  },
  meta: {
    paddingTop: spacing.sm,
    gap: 2,
    // Two title lines plus one meta line, reserved. Without a fixed height the
    // rail's baseline jitters as one-line and two-line titles alternate.
    minHeight: s(56),
  },
});
