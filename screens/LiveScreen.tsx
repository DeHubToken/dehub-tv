import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Grid } from '../components/Grid';
import { PosterCard } from '../components/PosterCard';
import { Txt } from '../components/Txt';
import { Badge } from '../components/Badge';
import { Loading, ErrorState, EmptyState } from '../components/States';
import { getStreamBuckets } from '../services/live.service';
import { cdnPath, livepeerThumbnail } from '../lib/media';
import { openStream } from '../lib/open';
import { useGrid } from '../lib/useGrid';
import { timeAgo } from '../lib/format';
import { colors, spacing, OVERSCAN } from '../config/theme';
import type { RootStackParamList } from '../navigation/types';

const COLUMNS = 4;

/**
 * Livestreams — live now on top, everything finished underneath.
 *
 * The empty case is the normal case and is designed for accordingly. Twenty
 * streams have ever been created on the platform and none were live when this
 * screen was written, so a "nobody is live" state that reads as deliberate
 * matters more here than the populated state does. It still shows the replays,
 * because a screen that says "nothing" while holding twenty watchable
 * recordings is just wrong.
 */
export function LiveScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { cellWidth, cellHeight } = useGrid(COLUMNS, 16 / 9);

  const query = useQuery({
    queryKey: ['live', 'buckets'],
    queryFn: getStreamBuckets,
    staleTime: 60_000,
  });

  if (query.isLoading) return <Loading label="Checking who is live" />;
  if (query.isError) {
    return (
      <ErrorState detail={(query.error as Error)?.message} onRetry={() => void query.refetch()} />
    );
  }

  const live = query.data?.live ?? [];
  const replay = query.data?.replay ?? [];

  if (!live.length && !replay.length) {
    return (
      <EmptyState
        icon="radio-outline"
        title="No streams yet"
        detail="When a DeHub creator goes live, their stream shows up here."
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Txt variant="title">Live</Txt>
          {live.length > 0 && <Badge label={`${live.length} live now`} tone="live" />}
        </View>
        {!live.length && (
          <Txt variant="body" color={colors.mutedForeground}>
            Nobody is live right now — here is what you missed.
          </Txt>
        )}
      </View>

      <Grid
        data={[...live, ...replay]}
        columns={COLUMNS}
        itemWidth={cellWidth}
        itemHeight={cellHeight}
        keyExtractor={(s) => s._id}
        renderItem={(stream, _index, autoFocus) => {
          const isLive = live.includes(stream);
          return (
            <PosterCard
              title={stream.title || 'Untitled stream'}
              imageUrl={
                stream.thumbnail ? cdnPath(stream.thumbnail) : livepeerThumbnail(stream.playbackId)
              }
              durationSeconds={isLive ? undefined : stream.duration}
              live={isLive}
              subtitle={
                stream.account?.displayName ||
                stream.account?.username ||
                timeAgo(stream.startedAt || stream.createdAt)
              }
              views={stream.totalViews}
              width={cellWidth}
              height={cellHeight}
              onPress={() => openStream(navigation, stream)}
              // No filter row on this screen, so the first tile is where a
              // remote should land. Leaving it to Android's default picks
              // whatever is first in the view tree, which is not always this.
              autoFocus={autoFocus}
            />
          );
        }}
      />
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
    paddingLeft: OVERSCAN.x,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
