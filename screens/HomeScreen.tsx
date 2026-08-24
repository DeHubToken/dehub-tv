import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Hero } from '../components/Hero';
import { Rail } from '../components/Rail';
import { PosterCard } from '../components/PosterCard';
import { ChannelCard } from '../components/ChannelCard';
import { Loading, ErrorState } from '../components/States';
import { getFeed, isPlayableOnTv, creatorName, resolveViewCount, type FeedItem } from '../services/feed.service';
import { getStreamBuckets } from '../services/live.service';
import { getChannelsByCountry } from '../services/liveTv.service';
import { cdnPath, posterUrl, livepeerThumbnail } from '../lib/media';
import { openFeedItem, openStream, openChannel } from '../lib/open';
import { timeAgo } from '../lib/format';
import { colors, spacing, cardSize, OVERSCAN } from '../config/theme';
import type { NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

const POSTER_WIDTH = cardSize.wide.width;

/**
 * The home screen.
 *
 * Rails are assembled from independent queries rather than one aggregate call,
 * because there is no aggregate endpoint and inventing one client-side would
 * mean the slowest source gates the whole screen. Each rail renders when its
 * own data lands; the page is useful as soon as the first one does.
 *
 * A rail with nothing in it is not rendered at all — `Rail` returns null on an
 * empty list. That matters more here than it looks: livestreams are genuinely
 * rare (twenty streams have ever been created and none were live when this was
 * built), so "Live now" is empty most of the day, and a header sitting over
 * blank space reads as a broken app rather than a quiet evening.
 */
export function HomeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const trending = useQuery({
    queryKey: ['feed', 'trending'],
    queryFn: () => getFeed({ postType: 'video', sortBy: 'score', range: 'week', limit: 20 }),
  });

  const fresh = useQuery({
    queryKey: ['feed', 'fresh'],
    queryFn: () => getFeed({ postType: 'video', sortBy: 'createdAt', limit: 20 }),
  });

  const clips = useQuery({
    queryKey: ['feed', 'clips'],
    queryFn: () => getFeed({ postType: 'short', sortBy: 'createdAt', limit: 20 }),
  });

  const streams = useQuery({
    queryKey: ['live', 'buckets'],
    queryFn: getStreamBuckets,
    // Live status is the one thing on this screen that goes stale in minutes.
    staleTime: 60_000,
  });

  const channels = useQuery({
    queryKey: ['tv', 'channels', 'all'],
    queryFn: () => getChannelsByCountry('all', 24),
    staleTime: 5 * 60 * 1000,
  });

  const trendingItems = useMemo(
    () => (trending.data?.result ?? []).filter(isPlayableOnTv),
    [trending.data],
  );
  const freshItems = useMemo(
    () => (fresh.data?.result ?? []).filter(isPlayableOnTv),
    [fresh.data],
  );
  const clipItems = useMemo(() => (clips.data?.result ?? []).filter(isPlayableOnTv), [clips.data]);

  const featured: FeedItem | undefined = trendingItems[0] ?? freshItems[0];
  const liveNow = streams.data?.live ?? [];
  const replays = streams.data?.replay ?? [];

  if (trending.isLoading && fresh.isLoading) return <Loading label="Loading DeHub" />;

  if (trending.isError && fresh.isError) {
    return (
      <ErrorState
        detail={(trending.error as Error)?.message}
        onRetry={() => {
          void trending.refetch();
          void fresh.refetch();
        }}
      />
    );
  }

  // Initial focus goes to the hero's Play button when there is a hero, and to
  // the first rail otherwise. Exactly one element may claim it — two elements
  // both asking for preferred focus is a coin toss the user watches happen.
  const heroClaimsFocus = !!featured;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {featured && (
        <Hero
          title={featured.name || 'DeHub'}
          description={featured.description}
          imageUrl={posterUrl(featured, 1280)}
          creator={creatorName(featured)}
          views={resolveViewCount(featured)}
          actions={[
            {
              label: 'Play',
              autoFocus: true,
              onPress: () => openFeedItem(navigation, featured),
            },
          ]}
        />
      )}

      <View style={styles.rails}>
        {liveNow.length > 0 && (
          <Rail
            title="Live now"
            subtitle={`${liveNow.length} streaming`}
            data={liveNow}
            itemWidth={POSTER_WIDTH}
            itemHeight={cardSize.wide.height}
            keyExtractor={(s) => s._id}
            renderItem={(stream, index, api) => (
              <PosterCard
                title={stream.title || 'Untitled stream'}
                imageUrl={
                  stream.thumbnail
                    ? cdnPath(stream.thumbnail)
                    : livepeerThumbnail(stream.playbackId)
                }
                subtitle={stream.account?.displayName || stream.account?.username}
                views={stream.totalViews}
                live
                width={POSTER_WIDTH}
                onPress={() => openStream(navigation, stream)}
                onFocus={() => api.focusIndex(index)}
              />
            )}
          />
        )}

        <Rail
          title="Trending this week"
          data={trendingItems}
          itemWidth={POSTER_WIDTH}
          itemHeight={cardSize.wide.height}
          autoFocusFirst={!heroClaimsFocus}
          keyExtractor={(item, i) => String(item.tokenId ?? i)}
          renderItem={(item, index, api) => (
            <PosterCard
              title={item.name || 'Untitled'}
              imageUrl={posterUrl(item, POSTER_WIDTH)}
              durationSeconds={item.videoDuration}
              subtitle={creatorName(item)}
              views={resolveViewCount(item)}
              width={POSTER_WIDTH}
              onPress={() => openFeedItem(navigation, item)}
              onFocus={() => api.focusIndex(index)}
              autoFocus={api.autoFocus}
            />
          )}
        />

        <Rail
          title="New on DeHub"
          data={freshItems}
          itemWidth={POSTER_WIDTH}
          itemHeight={cardSize.wide.height}
          keyExtractor={(item, i) => String(item.tokenId ?? i)}
          renderItem={(item, index, api) => (
            <PosterCard
              title={item.name || 'Untitled'}
              imageUrl={posterUrl(item, POSTER_WIDTH)}
              durationSeconds={item.videoDuration}
              subtitle={creatorName(item)}
              views={resolveViewCount(item)}
              width={POSTER_WIDTH}
              onPress={() => openFeedItem(navigation, item)}
              onFocus={() => api.focusIndex(index)}
            />
          )}
        />

        <Rail
          title="Quick clips"
          subtitle="Under a minute"
          data={clipItems}
          itemWidth={POSTER_WIDTH}
          itemHeight={cardSize.wide.height}
          keyExtractor={(item, i) => String(item.tokenId ?? i)}
          renderItem={(item, index, api) => (
            <PosterCard
              title={item.name || 'Untitled'}
              imageUrl={posterUrl(item, POSTER_WIDTH)}
              durationSeconds={item.videoDuration}
              subtitle={creatorName(item)}
              views={resolveViewCount(item)}
              width={POSTER_WIDTH}
              onPress={() => openFeedItem(navigation, item)}
              onFocus={() => api.focusIndex(index)}
            />
          )}
        />

        <Rail
          title="Live TV"
          subtitle="Free channels worldwide"
          data={channels.data ?? []}
          itemWidth={cardSize.square.width}
          itemHeight={cardSize.square.height}
          keyExtractor={(c) => c.id}
          renderItem={(channel, index, api) => (
            <ChannelCard
              channel={channel}
              onPress={() => openChannel(navigation, channel)}
              onFocus={() => api.focusIndex(index)}
            />
          )}
        />

        <Rail
          title="Past streams"
          data={replays}
          itemWidth={POSTER_WIDTH}
          itemHeight={cardSize.wide.height}
          keyExtractor={(s) => s._id}
          renderItem={(stream, index, api) => (
            <PosterCard
              title={stream.title || 'Untitled stream'}
              imageUrl={
                stream.thumbnail ? cdnPath(stream.thumbnail) : livepeerThumbnail(stream.playbackId)
              }
              durationSeconds={stream.duration}
              subtitle={
                stream.account?.displayName ||
                stream.account?.username ||
                timeAgo(stream.startedAt || stream.createdAt)
              }
              views={stream.totalViews}
              width={POSTER_WIDTH}
              onPress={() => openStream(navigation, stream)}
              onFocus={() => api.focusIndex(index)}
            />
          )}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: OVERSCAN.y + spacing.xxl,
  },
  rails: {
    // Pulled up under the hero's fade so the first rail overlaps the gradient
    // rather than starting on a hard edge below it.
    marginTop: -spacing.xxl,
  },
});
