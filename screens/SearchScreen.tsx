import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Rail } from '../components/Rail';
import { PosterCard } from '../components/PosterCard';
import { ChannelCard } from '../components/ChannelCard';
import { AccountCard } from '../components/AccountCard';
import { Txt } from '../components/Txt';
import { EmptyState } from '../components/States';
import {
  getFeed,
  isPlayableOnTv,
  creatorName,
  resolveViewCount,
} from '../services/feed.service';
import { searchChannels } from '../services/liveTv.service';
import { searchAccounts } from '../services/user.service';
import { posterUrl } from '../lib/media';
import { openFeedItem, openChannel, openCreator } from '../lib/open';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { colors, radius, spacing, cardSize, OVERSCAN, STAGE_INSET, s } from '../config/theme';
import type { RootStackParamList } from '../navigation/types';

const MIN_QUERY_LENGTH = 2;

/**
 * Search across videos and channels at once.
 *
 * One box, two result rails, no mode switch. A TV user who types "bbc" cannot
 * be expected to have first decided whether BBC is a DeHub creator or a
 * broadcast channel, and making them pick a tab before searching means they
 * find nothing and conclude the catalogue is empty.
 *
 * The `TextInput` is the only place in the app that summons the system
 * keyboard, and it is worth knowing that on Android TV that keyboard is a
 * full-screen takeover — which is why results render underneath rather than
 * beside the box, and why nothing important shares the row with it.
 */
export function SearchScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [raw, setRaw] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const query = useDebouncedValue(raw.trim());
  const enabled = query.length >= MIN_QUERY_LENGTH;

  const videos = useQuery({
    queryKey: ['search', 'videos', query],
    queryFn: () => getFeed({ postType: 'video', search: query, limit: 20 }),
    enabled,
  });

  const channels = useQuery({
    queryKey: ['search', 'channels', query],
    queryFn: () => searchChannels(query, 24),
    enabled,
  });

  const accounts = useQuery({
    queryKey: ['search', 'accounts', query],
    queryFn: () => searchAccounts(query, 12),
    enabled,
  });

  const videoItems = (videos.data?.result ?? []).filter(isPlayableOnTv);
  const channelItems = channels.data ?? [];
  const accountItems = accounts.data ?? [];
  const settled =
    enabled && !videos.isFetching && !channels.isFetching && !accounts.isFetching;
  const nothingFound =
    settled && !videoItems.length && !channelItems.length && !accountItems.length;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Txt variant="title">Search</Txt>
        <View style={[styles.field, inputFocused && styles.fieldFocused]}>
          <Ionicons
            name="search"
            size={s(21)}
            color={inputFocused ? colors.foreground : colors.mutedForeground}
          />
          <TextInput
            value={raw}
            onChangeText={setRaw}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Creators, videos, channels"
            placeholderTextColor={colors.dimForeground}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            // The one element on the screen that should hold focus on arrival —
            // the user pressed Search, so they intend to type.
            {...{ hasTVPreferredFocus: true }}
          />
        </View>
      </View>

      {!enabled && (
        <EmptyState
          icon="search-outline"
          title="What are you looking for?"
          detail="Type at least two characters to search DeHub videos and live TV channels."
        />
      )}

      {nothingFound && (
        <EmptyState
          icon="search-outline"
          title={`Nothing for “${query}”`}
          detail="Try a creator name, a video title, or a broadcaster."
        />
      )}

      {enabled && (
        <View style={styles.results}>
          {/* Creators lead. Somebody typing a name is almost always looking for
              a person, and burying them under that person's videos means
              scrolling past the answer to reach it. */}
          <Rail
            title="Creators"
            data={accountItems}
            itemWidth={cardSize.square.width}
            itemHeight={cardSize.square.height}
            keyExtractor={(a, i) => String(a.address ?? a.username ?? i)}
            renderItem={(account, index, api) => (
              <AccountCard
                account={account}
                onPress={() =>
                  openCreator(navigation, {
                    handle: account.username,
                    address: account.address,
                    name: account.displayName || account.username,
                  })
                }
                onFocus={() => api.focusIndex(index)}
              />
            )}
          />

          <Rail
            title="Videos"
            subtitle={videoItems.length ? `${videoItems.length} results` : undefined}
            data={videoItems}
            itemWidth={cardSize.wide.width}
            itemHeight={cardSize.wide.height}
            keyExtractor={(item, i) => String(item.tokenId ?? i)}
            renderItem={(item, index, api) => (
              <PosterCard
                title={item.name || 'Untitled'}
                imageUrl={posterUrl(item, cardSize.wide.width)}
                durationSeconds={item.videoDuration}
                subtitle={creatorName(item)}
                views={resolveViewCount(item)}
                onPress={() => openFeedItem(navigation, item)}
                onFocus={() => api.focusIndex(index)}
              />
            )}
          />

          <Rail
            title="Live TV channels"
            subtitle={channelItems.length ? `${channelItems.length} results` : undefined}
            data={channelItems}
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
        </View>
      )}
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
    minHeight: '100%',
  },
  header: {
    paddingTop: OVERSCAN.y,
    paddingHorizontal: STAGE_INSET,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    height: s(56),
    maxWidth: s(700),
    borderRadius: radius.pill,
    borderWidth: s(2),
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  fieldFocused: {
    borderColor: colors.borderFocused,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  input: {
    flex: 1,
    color: colors.foreground,
    fontSize: s(19),
    fontFamily: 'Exo_400Regular',
    // Android vertically centres poorly in a fixed-height row without this.
    paddingVertical: 0,
  },
  results: {
    gap: spacing.md,
  },
});
