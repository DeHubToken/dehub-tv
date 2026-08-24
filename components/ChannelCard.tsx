import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Focusable } from './Focusable';
import { Txt } from './Txt';
import { colors, radius, spacing, cardSize, s } from '../config/theme';
import type { TVChannel } from '../services/liveTv.service';

export interface ChannelCardProps {
  channel: TVChannel;
  width?: number;
  height?: number;
  onPress?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
}

/**
 * An IPTV channel tile.
 *
 * Channel logos are third-party artwork off the Free-TV playlist — mostly
 * `i.imgur.com`, wildly inconsistent, and a good number of them are dark PNGs
 * with transparent backgrounds designed to sit on a light page. So the tile
 * gives them a light plate and `contain`, never `cover`: cropping a broadcaster's
 * mark is worse than letterboxing it, and a transparent dark logo on our black
 * background is an empty square.
 *
 * The name is repeated underneath even when the logo carries it, because a
 * third of the catalogue has no logo at all and a rail where some tiles are
 * labelled and some are not looks like a loading failure.
 */
export function ChannelCard({
  channel,
  width = cardSize.square.width,
  height = cardSize.square.height,
  onPress,
  onFocus,
  autoFocus,
}: ChannelCardProps) {
  return (
    <Focusable onPress={onPress} onFocus={onFocus} autoFocus={autoFocus} borderRadius={radius.md}>
      {(focused) => (
        <View style={{ width }}>
          <View style={[styles.plate, { width, height }]}>
            {channel.logo ? (
              <Image
                source={{ uri: channel.logo }}
                style={styles.logo}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={160}
              />
            ) : (
              <Txt variant="rail" color={colors.neutrals[700]} numberOfLines={2} style={styles.initials}>
                {initials(channel.name)}
              </Txt>
            )}
          </View>

          <View style={styles.meta}>
            <Txt
              variant="card"
              numberOfLines={2}
              color={focused ? colors.foreground : colors.neutrals[200]}
            >
              {channel.name}
            </Txt>
            <Txt variant="meta" color={colors.mutedForeground} numberOfLines={1}>
              {channel.country}
            </Txt>
          </View>
        </View>
      )}
    </Focusable>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

const styles = StyleSheet.create({
  plate: {
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // Light plate, deliberately. Broadcaster logos are drawn for white pages.
    backgroundColor: colors.neutrals[200],
    padding: spacing.md,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  initials: {
    textAlign: 'center',
  },
  meta: {
    paddingTop: spacing.sm,
    gap: 2,
    minHeight: s(56),
  },
});
