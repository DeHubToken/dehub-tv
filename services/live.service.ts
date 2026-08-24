import { apiClient } from '../lib/api.client';

/**
 * Livestream reads.
 *
 * `GET /live` is public and returns the whole roster — every stream ever
 * created, most of them long finished — as a bare array with no pagination and
 * no server-side status filter. Twenty rows on 2026-08-24, all `OFFLINE`.
 *
 * That shape drives two decisions on this client:
 *
 * 1. The split into live / replayable happens here, once, rather than in each
 *    screen. A "Live now" rail that is empty most of the day is correct; a
 *    "Live now" rail full of streams that ended in February is not.
 * 2. Nothing here assumes the rail is non-empty. `LIVE` is genuinely rare, so
 *    the empty case is the common case and the home screen drops the rail
 *    entirely rather than rendering a header over nothing.
 */

export enum StreamStatus {
  OFFLINE = 'OFFLINE',
  LIVE = 'LIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
  SCHEDULED = 'SCHEDULED',
}

export interface LiveAccount {
  address?: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  followers?: number;
  badgeBalance?: number;
}

export interface LiveStream {
  _id: string;
  title?: string;
  description?: string;
  playbackId?: string;
  playbackUrl?: string;
  status?: string;
  categories?: string[];
  peakViewers?: number;
  totalViews?: number;
  likes?: number;
  totalTips?: number;
  /** Seconds. Present on finished streams. */
  duration?: number;
  address?: string;
  tokenId?: number;
  /** CDN-relative, e.g. `live/thumbnails/<id>.jpg`. */
  thumbnail?: string;
  createdAt?: string;
  startedAt?: string;
  scheduledFor?: string;
  account?: LiveAccount;
  [key: string]: any;
}

/** `PAUSED` is a host who stepped away mid-broadcast, not a stream that ended —
 *  it stays on the live rail, which is what web and the phone app both do. */
export function isLiveNow(stream: LiveStream): boolean {
  return stream.status === StreamStatus.LIVE || stream.status === StreamStatus.PAUSED;
}

/** A finished stream is only worth a tile if Livepeer still has something to
 *  play; without a playbackId the card is a dead end. */
export function isReplayable(stream: LiveStream): boolean {
  return !isLiveNow(stream) && !!stream.playbackId && stream.status !== StreamStatus.SCHEDULED;
}

export async function getStreams(): Promise<LiveStream[]> {
  const res = await apiClient.get<LiveStream[] | { result?: LiveStream[] }>('/live', {
    withAuth: false,
  });
  if (Array.isArray(res)) return res;
  return Array.isArray(res?.result) ? res.result : [];
}

export interface StreamBuckets {
  live: LiveStream[];
  replay: LiveStream[];
}

function newestFirst(a: LiveStream, b: LiveStream): number {
  const at = Date.parse(a.startedAt || a.createdAt || '') || 0;
  const bt = Date.parse(b.startedAt || b.createdAt || '') || 0;
  return bt - at;
}

export async function getStreamBuckets(): Promise<StreamBuckets> {
  const all = await getStreams();
  return {
    live: all.filter(isLiveNow).sort(newestFirst),
    replay: all.filter(isReplayable).sort(newestFirst),
  };
}

export async function getStream(streamId: string): Promise<LiveStream | null> {
  const res = await apiClient.get<LiveStream | { result?: LiveStream }>(
    `/live/${encodeURIComponent(streamId)}`,
  );
  if (!res) return null;
  return (res as any).result ?? (res as LiveStream);
}
