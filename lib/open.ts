import type { NavigationProp } from '@react-navigation/native';
import { videoUrl, cdnPath, livepeerHlsCandidates, livepeerThumbnail } from './media';
import { compactNumber } from './format';
import { creatorName, resolveViewCount, type FeedItem } from '../services/feed.service';
import type { LiveStream } from '../services/live.service';
import type { TVChannel } from '../services/liveTv.service';
import type { RootStackParamList } from '../navigation/types';

type Nav = NavigationProp<RootStackParamList>;

/**
 * The three ways into the player, in one place.
 *
 * Each content type resolves its playable URL differently and each gets it
 * wrong differently — a feed post is a progressive MP4 derived from its
 * tokenId, a stream is HLS derived from a Livepeer playback id across two
 * hosts, and a channel already carries an absolute URL. Scattering that across
 * six call sites is how a rail ends up navigating to a player with an empty
 * source, which renders as a black screen with no error.
 */

export function openFeedItem(navigation: Nav, item: FeedItem) {
  const url = item.videoUrl ? cdnPath(item.videoUrl) : videoUrl(item.tokenId);
  if (!url) return;

  navigation.navigate('Player', {
    kind: 'video',
    title: item.name || 'Untitled',
    subtitle: `${creatorName(item)}  ·  ${compactNumber(resolveViewCount(item))} views`,
    sources: [url],
    poster: item.imageUrl ? cdnPath(item.imageUrl) : undefined,
    durationSeconds: item.videoDuration,
    tokenId: item.tokenId,
    isLiked: item.isLiked,
    isSaved: item.isSaved,
    creatorAddress: item.minter ?? item.minterUser?.address,
    creatorName: creatorName(item),
  });
}

export function openCreator(
  navigation: Nav,
  creator: { handle?: string; address?: string; name?: string },
) {
  // Prefer the username: it is what `/account_info` indexes fastest and what a
  // person recognises if the screen ever shows the raw handle.
  const handle = creator.handle || creator.address;
  if (!handle) return;
  navigation.navigate('Creator', {
    handle,
    address: creator.address,
    name: creator.name,
  });
}

/** Same as `openCreator`, from a feed item, so call sites do not re-derive the
 *  three fields the creator's identity is spread across. */
export function openCreatorFromItem(navigation: Nav, item: FeedItem) {
  openCreator(navigation, {
    handle: item.minterUsername ?? item.minterUser?.username,
    address: item.minter ?? item.minterUser?.address,
    name: creatorName(item),
  });
}

export function openStream(navigation: Nav, stream: LiveStream) {
  const sources = stream.playbackUrl
    ? [stream.playbackUrl, ...livepeerHlsCandidates(stream.playbackId)]
    : livepeerHlsCandidates(stream.playbackId);
  if (!sources.length) return;

  navigation.navigate('Player', {
    kind: 'live',
    title: stream.title || 'Untitled stream',
    subtitle: stream.account?.displayName || stream.account?.username || undefined,
    // De-duplicated: `playbackUrl` is usually byte-identical to the primary
    // Livepeer candidate, and retrying the same dead URL twice just doubles the
    // wait before the error shows.
    sources: [...new Set(sources)],
    poster: stream.thumbnail ? cdnPath(stream.thumbnail) : livepeerThumbnail(stream.playbackId),
    durationSeconds: stream.duration,
  });
}

export function openChannel(navigation: Nav, channel: TVChannel) {
  if (!channel.streamUrl) return;

  navigation.navigate('Player', {
    kind: 'channel',
    title: channel.name,
    subtitle: channel.country,
    sources: [channel.streamUrl],
    poster: channel.logo ?? undefined,
    channelId: channel.id,
  });
}
