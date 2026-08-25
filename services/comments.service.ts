import { apiClient } from '../lib/api.client';
import { avatarUrl } from '../lib/media';
import { timeAgo } from '../lib/format';

/**
 * Comment reads.
 *
 * Read-only on purpose. A television has no keyboard worth the name — writing
 * a comment on one means an on-screen grid and twenty D-pad presses per word,
 * which is why every TV app that offers it is a joke and most do not offer it
 * at all. Reading them is the half that is actually wanted on a big screen,
 * and the half a remote is good at.
 *
 * `/nft/:tokenId/comments` answers unauthenticated, like `/feed` does, so the
 * panel works on a signed-out television.
 */

interface RawComment {
  id: string;
  content: string;
  createdAt: string;
  likeCount?: number;
  parentId?: number | null;
  writor?: {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

interface CommentsResponse {
  result?: {
    items?: RawComment[];
    totalCount?: number;
  };
}

export interface TvComment {
  id: string;
  author: string;
  avatar: string;
  text: string;
  when: string;
  likes: number;
}

/**
 * Top-level comments for a post, newest first.
 *
 * Replies are dropped rather than threaded: an indented tree is unreadable at
 * three metres, and following one with a four-way pad is worse. What a viewer
 * wants on a TV is the room's reaction, not the argument inside it.
 */
export async function getComments(
  tokenId: string | number,
  limit = 30,
): Promise<TvComment[]> {
  const res = await apiClient.get<CommentsResponse>(`/nft/${tokenId}/comments`, {
    params: { page: 0, limit },
  });

  const items = res?.result?.items ?? [];
  return items
    .filter((c) => !c.parentId)
    .map((c) => ({
      id: String(c.id),
      author: c.writor?.displayName || c.writor?.username || 'Someone',
      avatar: avatarUrl(c.writor?.avatarUrl, 64),
      text: (c.content || '').trim(),
      when: timeAgo(c.createdAt),
      likes: c.likeCount ?? 0,
    }))
    .filter((c) => !!c.text);
}
