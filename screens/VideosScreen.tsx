import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Grid } from '../components/Grid';
import { PillRow, type Pill } from '../components/PillRow';
import { PosterCard } from '../components/PosterCard';
import { Txt } from '../components/Txt';
import { Loading, ErrorState } from '../components/States';
import {
  getFeed,
  isPlayableOnTv,
  creatorName,
  resolveViewCount,
  type FeedSortBy,
  type FeedPostType,
} from '../services/feed.service';
import { posterUrl } from '../lib/media';
import { openFeedItem } from '../lib/open';
import { useGrid } from '../lib/useGrid';
import { colors, spacing, OVERSCAN, STAGE_INSET } from '../config/theme';
import type { RootStackParamList } from '../navigation/types';

const COLUMNS = 4;
const PAGE_SIZE = 24;

interface Lane {
  id: string;
  label: string;
  postType: FeedPostType;
  sortBy: FeedSortBy;
  range?: 'day' | 'week' | 'month' | 'year';
}

/**
 * Every lane names an explicit `postType` from the API's allow-list.
 *
 * Never widen one of these to pick up a new kind of content: the backend's feed
 * filter is `if (contentFilter[postType]) …`, so an unrecognised value applies
 * NO filter and quietly returns the entire feed. A lane labelled "Music" that
 * silently fills with videos is worse than a lane that does not exist yet.
 */
const LANES: Lane[] = [
  { id: 'trending', label: 'Trending', postType: 'video', sortBy: 'score', range: 'week' },
  { id: 'new', label: 'Newest', postType: 'video', sortBy: 'createdAt' },
  { id: 'views', label: 'Most watched', postType: 'video', sortBy: 'views' },
  { id: 'liked', label: 'Most liked', postType: 'video', sortBy: 'likes' },
  { id: 'clips', label: 'Quick clips', postType: 'short', sortBy: 'createdAt' },
];

export function VideosScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [laneId, setLaneId] = useState(LANES[0].id);
  const lane = LANES.find((l) => l.id === laneId) ?? LANES[0];
  const { cellWidth, cellHeight } = useGrid(COLUMNS, 16 / 9);

  const query = useInfiniteQuery({
    queryKey: ['feed', 'grid', lane.id],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getFeed({
        postType: lane.postType,
        sortBy: lane.sortBy,
        range: lane.range,
        page: pageParam,
        limit: PAGE_SIZE,
      }),
    getNextPageParam: (last) =>
      last.pagination?.hasMore ? (last.pagination.page ?? 1) + 1 : undefined,
  });

  const items = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => p.result).filter(isPlayableOnTv),
    [query.data],
  );

  const pills: Pill[] = LANES.map((l) => ({ id: l.id, label: l.label }));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Txt variant="title">Videos</Txt>
        <PillRow pills={pills} activeId={laneId} onSelect={setLaneId} autoFocusFirst />
      </View>

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState detail={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
      ) : (
        <Grid
          data={items}
          columns={COLUMNS}
          itemWidth={cellWidth}
          itemHeight={cellHeight}
          keyExtractor={(item, i) => String(item.tokenId ?? i)}
          emptyLabel="No videos in this lane yet"
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
          }}
          footer={
            query.isFetchingNextPage ? (
              <View style={styles.footer}>
                <Txt variant="meta" color={colors.mutedForeground}>
                  Loading more…
                </Txt>
              </View>
            ) : null
          }
          renderItem={(item) => (
            <PosterCard
              title={item.name || 'Untitled'}
              imageUrl={posterUrl(item, cellWidth)}
              durationSeconds={item.videoDuration}
              subtitle={creatorName(item)}
              views={resolveViewCount(item)}
              width={cellWidth}
              height={cellHeight}
              onPress={() => openFeedItem(navigation, item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: OVERSCAN.y,
    paddingLeft: STAGE_INSET,
    gap: spacing.xs,
  },
  footer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
});
