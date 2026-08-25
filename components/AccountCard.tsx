import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Focusable } from './Focusable';
import { Txt } from './Txt';
import { avatarUrl } from '../lib/media';
import { compactNumber } from '../lib/format';
import { colors, radius, spacing, cardSize, s } from '../config/theme';
import type { AccountInfo } from '../services/user.service';

export interface AccountCardProps {
  account: AccountInfo;
  width?: number;
  onPress?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
}

/**
 * A person, in the same rail geometry as everything else.
 *
 * The avatar is a circle at the top of a square tile rather than filling it.
 * Filling reads as a poster — the same shape as a video — and in a rail that
 * mixes accounts and content, two things that look identical and behave
 * differently is the one confusion worth spending space to avoid.
 */
export function AccountCard({
  account,
  width = cardSize.square.width,
  onPress,
  onFocus,
  autoFocus,
}: AccountCardProps) {
  const name = account.displayName || account.username || 'Creator';
  const avatar = avatarUrl(account.avatarImageUrl, 96);

  return (
    <Focusable onPress={onPress} onFocus={onFocus} autoFocus={autoFocus} borderRadius={radius.md}>
      {(focused) => (
        <View style={{ width }}>
          <View style={[styles.plate, { width, height: width }]}>
            {avatar ? (
              <Image
                source={{ uri: avatar }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={160}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Ionicons name="person" size={s(30)} color={colors.neutrals[600]} />
              </View>
            )}
          </View>

          <View style={styles.meta}>
            <Txt
              variant="card"
              numberOfLines={1}
              color={focused ? colors.foreground : colors.neutrals[200]}
            >
              {name}
            </Txt>
            <Txt variant="meta" color={colors.mutedForeground} numberOfLines={1}>
              {compactNumber(account.followers ?? 0)} followers
            </Txt>
          </View>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  plate: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: s(2),
    borderColor: 'transparent',
  },
  avatar: {
    width: '68%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: colors.neutrals[800],
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    paddingTop: spacing.sm,
    gap: s(2),
    minHeight: s(56),
    alignItems: 'center',
  },
});
