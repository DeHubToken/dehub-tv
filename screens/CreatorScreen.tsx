import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Grid } from '../components/Grid';
import { PosterCard } from '../components/PosterCard';
import { Txt } from '../components/Txt';
import { Focusable } from '../components/Focusable';
import { Loading, EmptyState } from '../components/States';
import { getAccountInfo } from '../services/user.service';
import { isFollowing, setFollowing, type FollowStatus } from '../services/engagement.service';
import { getFeed, isPlayableOnTv, resolveViewCount } from '../services/feed.service';
import { useAuth } from '../contexts/AuthContext';
import { avatarUrl, posterUrl } from '../lib/media';
import { openFeedItem } from '../lib/open';
import { useGrid } from '../lib/useGrid';
import { compactNumber } from '../lib/format';
import { colors, radius, spacing, OVERSCAN, STAGE_INSET, s } from '../config/theme';
import type { RootStackParamList } from '../navigation/types';

const COLUMNS = 4;
const PAGE_SIZE = 24;

/**
 * A creator's page: who they are, and everything they have posted.
 *
 * The catalogue comes from `/feed?minter=<address>` rather than a dedicated
 * profile-posts endpoint, which means it arrives already filtered, sorted and
 * paginated exactly like every other rail in the app — one code path, one set of
 * quirks, and a post that is playable on the home screen is playable here.
 *
 * The Follow button is the second thing a television can write, after reacting,
 * and for the same reason: it is a bearer-token call with no wallet anywhere
 * near it. It is hidden entirely when signed out rather than shown and then
 * refused, because the recovery from a sign-in wall on a remote is expensive
 * enough that it should never be sprung on someone.
 */
export function CreatorScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Creator'>>();
  const { handle, name } = route.params;
  const { user, isSignedIn } = useAuth();
  const { cellWidth, cellHeight } = useGrid(COLUMNS, 16 / 9);

  const profile = useQuery({
    queryKey: ['creator', handle],
    queryFn: () => getAccountInfo(handle),
    staleTime: 5 * 60 * 1000,
  });

  // The address the feed filter needs. It can arrive on the route (from a feed
  // item, which always carries `minter`) or only from the profile lookup (when
  // navigating by username), so the query waits for whichever turns up.
  const address = route.params.address ?? profile.data?.address;

  const posts = useInfiniteQuery({
    queryKey: ['creator', 'posts', address ?? ''],
    initialPageParam: 1,
    enabled: !!address,
    queryFn: ({ pageParam }) =>
      getFeed({ minter: address, sortBy: 'createdAt', page: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last) =>
      last.pagination?.hasMore ? (last.pagination.page ?? 1) + 1 : undefined,
  });

  const items = useMemo(
    () => (posts.data?.pages ?? []).flatMap((p) => p.result).filter(isPlayableOnTv),
    [posts.data],
  );

  if (profile.isLoading) return <Loading label={name ? `Loading ${name}` : 'Loading creator'} />;

  const account = profile.data;
  const displayName = account?.displayName || account?.username || name || 'Creator';

  return (
    <View style={styles.root}>
      <Grid
        data={items}
        columns={COLUMNS}
        itemWidth={cellWidth}
        itemHeight={cellHeight}
        keyExtractor={(item, i) => String(item.tokenId ?? i)}
        emptyLabel={posts.isLoading ? 'Loading…' : `${displayName} has not posted any video yet`}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
        }}
        header={
          <View style={styles.header}>
            {account?.avatarImageUrl ? (
              <Image
                source={{ uri: avatarUrl(account.avatarImageUrl, 96) }}
                style={styles.avatar}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Ionicons name="person" size={s(32)} color={colors.neutrals[600]} />
              </View>
            )}

            <View style={styles.headerText}>
              <Txt variant="title" numberOfLines={1}>
                {displayName}
              </Txt>
              <Txt variant="meta" color={colors.mutedForeground}>
                {[
                  account?.username ? `@${account.username}` : null,
                  `${compactNumber(account?.followers ?? 0)} followers`,
                ]
                  .filter(Boolean)
                  .join('  ·  ')}
              </Txt>
              {!!account?.aboutMe && (
                <Txt variant="meta" color={colors.neutrals[300]} numberOfLines={2}>
                  {account.aboutMe}
                </Txt>
              )}
            </View>

            {isSignedIn && !!address && address !== user?.address && (
              <FollowButton myAddress={user?.address} targetAddress={address} />
            )}
          </View>
        }
        renderItem={(item, _index, autoFocus) => (
          <PosterCard
            title={item.name || 'Untitled'}
            imageUrl={posterUrl(item, cellWidth)}
            durationSeconds={item.videoDuration}
            views={resolveViewCount(item)}
            width={cellWidth}
            height={cellHeight}
            onPress={() => openFeedItem(navigation, item)}
            autoFocus={autoFocus}
          />
        )}
      />
    </View>
  );
}

/**
 * Follow state is read once and then owned locally.
 *
 * `/request_follow` is a **GET that mutates**, and re-reading `is_following`
 * after every toggle would be a second round-trip to learn what the toggle
 * already told us. A failure reverts, which is the only case where the server
 * and the button can disagree.
 */
function FollowButton({
  myAddress,
  targetAddress,
}: {
  myAddress?: string;
  targetAddress: string;
}) {
  const [pending, setPending] = useState(false);
  const [override, setOverride] = useState<FollowStatus | null>(null);

  const known = useQuery({
    queryKey: ['creator', 'following', targetAddress],
    queryFn: () => isFollowing(targetAddress),
    staleTime: 60_000,
  });

  const status: FollowStatus = override ?? (known.data ? 'following' : 'none');

  const toggle = useCallback(async () => {
    if (!myAddress || pending) return;
    const next = status === 'none';
    setPending(true);
    setOverride(next ? 'following' : 'none');
    try {
      const result = await setFollowing(myAddress, targetAddress, next);
      setOverride(result);
    } catch {
      setOverride(next ? 'none' : 'following');
    } finally {
      setPending(false);
    }
  }, [myAddress, pending, status, targetAddress]);

  const label =
    status === 'following' ? 'Following' : status === 'requested' ? 'Requested' : 'Follow';

  return (
    <Focusable onPress={toggle} scaleOnFocus={false} ring={false} borderRadius={radius.pill}>
      {(focused) => (
        <View style={[styles.follow, focused && styles.followFocused, pending && styles.followBusy]}>
          <Ionicons
            name={status === 'none' ? 'person-add-outline' : 'checkmark'}
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: OVERSCAN.y,
    paddingLeft: STAGE_INSET,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: s(64),
    height: s(64),
    borderRadius: s(32),
    backgroundColor: colors.neutrals[800],
  },
  avatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: s(2),
  },
  follow: {
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
  followFocused: {
    backgroundColor: colors.controlFocused,
    borderColor: colors.borderFocused,
  },
  followBusy: {
    opacity: 0.55,
  },
});
