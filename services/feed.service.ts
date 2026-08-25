import { apiClient } from '../lib/api.client';

/**
 * Feed reads.
 *
 * `/feed` answers unauthenticated — verified against production — which is what
 * makes a signed-out TV worth switching on. Every request still carries the
 * bearer token if one exists, so a paired device gets its personalised
 * ordering and its own interaction flags for free.
 */

/**
 * The six values the deployed API recognises, as of 2026-08.
 *
 * These are an allow-list rather than a hint, and widening them is a
 * server-first change. `NftService.getFeed` applies its filter as
 * `if (contentFilter[postType]) …`, so an unrecognised value adds **no filter
 * at all** and returns every post type — a rail that looks plausible and is
 * wrong. A seventh type must ship to the backend before it may be requested
 * from here.
 */
export type FeedPostType =
  | 'video'
  | 'short'
  | 'live'
  | 'feed-images'
  | 'feed-simple'
  | 'feed-audio';

export type FeedSortBy = 'score' | 'likes' | 'views' | 'createdAt' | 'tips' | 'comments' | 'random';
export type FeedRange = 'day' | 'week' | 'month' | 'year';

export interface FeedParams {
  page?: number;
  limit?: number;
  postType?: FeedPostType;
  sortBy?: FeedSortBy;
  sortOrder?: 'asc' | 'desc';
  category?: string;
  range?: FeedRange;
  minter?: string;
  search?: string;
}

export interface FeedMinter {
  address?: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  followers?: number;
  badgeBalance?: number;
}

export interface FeedItem {
  tokenId?: number | string;
  name?: string;
  description?: string;
  postType: string;
  status?: string;
  category?: string[];

  imageUrl?: string;
  imageUrls?: string[];
  thumbnailUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  audioUrl?: string;
  audioDuration?: number;

  /** Signed-in viewers only. Never render this one — see resolveViewCount. */
  views?: number;
  /** Every viewer, signed in or out. The API folds the anonymous half in
   *  already, so it is read as-is and never summed on the client. */
  totalViews?: number;

  /** The real polarity rollup. */
  totalVotes?: { for?: number; against?: number };
  reactionCounts?: Record<string, number>;
  /** Legacy scalar, present on some documents and stale on others. Only ever
   *  reached when `totalVotes` is absent. */
  likes?: number;

  commentCount?: number;
  totalTips?: number;
  totalReposts?: number;

  minter?: string;
  minterUsername?: string;
  minterDisplayName?: string;
  minterAvatarUrl?: string;
  minterUser?: FeedMinter;

  streamInfo?: {
    isPayPerView?: boolean;
    isLockContent?: boolean;
    isAddBounty?: boolean;
    isLive?: boolean;
  };

  createdAt?: string;
  [key: string]: any;
}

export interface FeedResponse {
  status: boolean;
  result: FeedItem[];
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * A feed item carries three disagreeing like counts and only one of them is
 * real. `totalVotes.for` is the polarity rollup and is what both other clients
 * read first; `reactionCounts.like` agrees with it; the bare `likes` scalar is
 * legacy, stale on documents that have it and absent on documents that don't.
 * Reach for it last or a post shows 121 likes next to 354 reactions.
 */
export function resolveLikeCount(item: FeedItem): number {
  const forVotes = item.totalVotes?.for;
  if (typeof forVotes === 'number') return forVotes;
  const reaction = item.reactionCounts?.like;
  if (typeof reaction === 'number') return reaction;
  return typeof item.likes === 'number' ? item.likes : 0;
}

/** `totalViews` already includes the signed-out half. Summing the two
 *  double-counts every anonymous view. */
export function resolveViewCount(item: FeedItem): number {
  if (typeof item.totalViews === 'number') return item.totalViews;
  return typeof item.views === 'number' ? item.views : 0;
}

export function creatorName(item: FeedItem): string {
  return (
    item.minterDisplayName ||
    item.minterUser?.displayName ||
    item.minterUsername ||
    item.minterUser?.username ||
    'DeHub'
  );
}

export async function getFeed(params: FeedParams = {}): Promise<FeedResponse> {
  const res = await apiClient.get<FeedResponse>('/feed', {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 20,
      postType: params.postType,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      category: params.category,
      range: params.range,
      minter: params.minter,
      search: params.search,
    },
  });

  return {
    status: res?.status ?? true,
    result: Array.isArray(res?.result) ? res.result : [],
    pagination: res?.pagination,
  };
}

/**
 * The signed-in user's saved posts.
 *
 * Two shape traps, both inherited from the endpoint and both silent if missed:
 * `page` is ZERO-indexed here while `/feed`'s is one-indexed, and the page size
 * parameter is `unit`, not `limit`. Passing `limit` gets the default twenty and
 * looks like it worked.
 */
export async function getSavedPosts(params: {
  address?: string;
  page?: number;
  unit?: number;
} = {}): Promise<FeedItem[]> {
  const res = await apiClient.get<FeedResponse | FeedItem[] | { data?: FeedItem[] }>(
    '/savedPosts',
    {
      params: {
        page: params.page ?? 0,
        unit: params.unit ?? 20,
        address: params.address,
      },
    },
  );

  if (Array.isArray(res)) return res;
  if (Array.isArray((res as FeedResponse)?.result)) return (res as FeedResponse).result;
  if (Array.isArray((res as any)?.data)) return (res as any).data;
  return [];
}

/**
 * Playable videos only.
 *
 * Two filters that matter on a TV and matter less elsewhere. A post still
 * transcoding has a `videoUrl` that 404s, which on a phone is a spinner the
 * user scrolls past and on a TV is a black screen the user cannot escape from
 * without the remote. And a locked or pay-per-view post cannot be unlocked from
 * a device with no wallet and no keyboard, so surfacing one is an advertisement
 * for a dead end.
 */
export function isPlayableOnTv(item: FeedItem): boolean {
  if (item.transcodingStatus && item.transcodingStatus !== 'done') return false;
  const stream = item.streamInfo;
  if (stream?.isPayPerView || stream?.isLockContent) return false;
  return true;
}
