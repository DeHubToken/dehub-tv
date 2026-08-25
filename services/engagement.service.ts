import { apiClient } from '../lib/api.client';
import { createLogger } from '../lib/logger';

const log = createLogger('engagement');

/**
 * The writes a television is allowed to make.
 *
 * Every call here is a plain bearer-token request. None of them touches the
 * wallet, which is the entire reason they can exist on a device that holds no
 * key — and it is worth being precise about where that line falls, because it
 * is not obvious from the outside:
 *
 *   reacting, saving, following, reposting   → bearer token. Fine here.
 *   tipping, buying, minting, going live     → wallet signature. Impossible here,
 *                                              and that is the security model
 *                                              working, not a gap to close.
 *
 * If a future endpoint in this file starts needing a signature, it does not
 * belong in this file.
 */

/**
 * The nine reactions ride on the old boolean vote through a polarity map:
 * like/love/respect/hot/lol/sad/cry are positive and move `totalVotes.for`,
 * dislike/poo are negative. This client sends `like` and nothing else — a
 * nine-way picker is a lot of D-pad travel for a decision nobody makes from a
 * sofa — but the server contract is the full set, so the type is honest about
 * it and a picker can be added without touching the service.
 */
export type PostReaction =
  | 'like'
  | 'love'
  | 'respect'
  | 'hot'
  | 'lol'
  | 'sad'
  | 'cry'
  | 'dislike'
  | 'poo';

export interface ReactionResult {
  result?: boolean;
  totalVotes?: { for?: number; against?: number };
  reactionCounts?: Record<string, number>;
  myReaction?: PostReaction | null;
  [key: string]: any;
}

/**
 * Cast or clear a reaction.
 *
 * The server toggles: sending the reaction the user already holds removes it,
 * and sending a different one swaps it — moving `totalVotes` only when the
 * polarity actually changed. So "unlike" is the same call as "like", and the
 * caller never has to know which way it will land.
 */
export async function react(
  tokenId: number | string,
  reaction: PostReaction = 'like',
): Promise<ReactionResult | null> {
  if (tokenId === null || tokenId === undefined) return null;
  try {
    return await apiClient.post<ReactionResult>('/request_reaction', {
      streamTokenId: Number(tokenId),
      reaction,
    });
  } catch (error) {
    log.warn('react failed', error);
    throw error;
  }
}

/** Toggles server-side, same as reacting. */
export async function toggleSave(tokenId: number | string): Promise<boolean> {
  const res = await apiClient.post<{ result?: any }>('/savePost', {
    tokenId: Number(tokenId),
  });
  // The endpoint reports the new state inconsistently across shapes, so the
  // caller re-reads rather than trusting a guess.
  return !!res;
}

export async function isFollowing(targetAddress: string): Promise<boolean> {
  if (!targetAddress) return false;
  try {
    const res = await apiClient.get<any>('/is_following', {
      params: { target: targetAddress },
    });
    const payload = res?.result ?? res;
    return !!(payload?.isFollowing ?? payload?.following ?? payload === true);
  } catch (error) {
    log.warn('isFollowing failed', error);
    return false;
  }
}

export type FollowStatus = 'following' | 'requested' | 'none';

/**
 * Follow and unfollow are the same GET with a flag, which is unusual enough to
 * be worth naming: it is a **GET that mutates**. Do not let it near a prefetch,
 * a retry-on-focus, or anything that treats GETs as safe to repeat.
 */
export async function setFollowing(
  myAddress: string,
  targetAddress: string,
  next: boolean,
): Promise<FollowStatus> {
  const res = await apiClient.get<any>('/request_follow', {
    params: {
      address: myAddress,
      following: targetAddress,
      ...(next ? {} : { unFollowing: true }),
    },
    // A follow must not be replayed by the timeout retry — the toggle is not
    // idempotent, so a retried request can silently undo the thing it just did.
    timeoutMs: 12_000,
  });

  const payload = res?.data?.result ?? res?.result ?? res;
  if (payload?.isPrivateAccount && next) return 'requested';
  return next ? 'following' : 'none';
}
