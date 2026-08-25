import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Txt } from './Txt';
import { Focusable } from './Focusable';
import { getComments } from '../services/comments.service';
import { colors, radius, spacing, OVERSCAN, s } from '../config/theme';

/**
 * What the room said, over the right-hand third of the picture.
 *
 * Read-only — see `services/comments.service` for why a television is the
 * wrong place to type. The panel sits over the video rather than pausing it:
 * on a lean-back device the comments are a side channel to what is playing,
 * and stopping the film to read them is not what anyone wants.
 *
 * Every row is focusable and does nothing when pressed. That is deliberate:
 * the focus ring is the only cursor a TV has, so a list you cannot move
 * through is a list you cannot read past the first screenful — the ring is
 * what scrolls it.
 */
export function CommentsPanel({
  tokenId,
  visible,
}: {
  tokenId: string | number;
  visible: boolean;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['comments', String(tokenId)],
    queryFn: () => getComments(tokenId),
    enabled: visible,
    staleTime: 2 * 60 * 1000,
  });

  if (!visible) return null;

  const comments = data ?? [];

  return (
    <View style={styles.panel}>
      <Txt variant="rail" color={colors.neutrals[300]} style={styles.heading}>
        Comments{comments.length ? ` · ${comments.length}` : ''}
      </Txt>

      {isLoading && (
        <Txt variant="body" color={colors.neutrals[300]}>
          Loading…
        </Txt>
      )}

      {isError && (
        <Txt variant="body" color={colors.neutrals[300]}>
          Comments could not be loaded.
        </Txt>
      )}

      {!isLoading && !isError && comments.length === 0 && (
        <Txt variant="body" color={colors.neutrals[300]}>
          No comments yet.
        </Txt>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {comments.map((comment, index) => (
          <Focusable
            key={comment.id}
            autoFocus={index === 0}
            scaleOnFocus={false}
            borderRadius={radius.md}
            style={styles.row}
          >
            <View style={styles.rowInner}>
              {!!comment.avatar && (
                <Image source={{ uri: comment.avatar }} style={avatarStyle} contentFit="cover" />
              )}
              <View style={styles.body}>
                <Txt variant="meta" color={colors.neutrals[300]} numberOfLines={1}>
                  {comment.author}
                  {comment.when ? `  ·  ${comment.when}` : ''}
                </Txt>
                <Txt variant="body" numberOfLines={6}>
                  {comment.text}
                </Txt>
              </View>
            </View>
          </Focusable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Kept out of the sheet: StyleSheet.create widens a mixed sheet to a union
 *  and expo-image will not take a ViewStyle. */
const avatarStyle = {
  width: s(44),
  height: s(44),
  borderRadius: s(22),
  backgroundColor: colors.neutrals[800],
} as const;

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: OVERSCAN.y,
    right: OVERSCAN.x,
    bottom: OVERSCAN.y,
    width: s(520),
    backgroundColor: 'rgba(1,3,5,0.88)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  heading: {
    marginBottom: spacing.sm,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  row: {
    marginBottom: spacing.sm,
  },
  rowInner: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  body: {
    flex: 1,
    gap: s(4),
  },
});
