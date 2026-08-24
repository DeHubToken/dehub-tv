import { PixelRatio } from 'react-native';
import env from '../config/env';

/**
 * CDN URL construction, ported from the phone app's `libs/cdnImage.ts` +
 * `libs/misc.ts` and kept rule-for-rule identical so a poster that renders on
 * a phone renders here.
 *
 * The API returns media as bare relative paths — `videos/2581.mp4`,
 * `images/2581.jpg`, `avatars/0xabc….jpg` — which are meaningless until they
 * are joined onto the Spaces CDN origin. Every consumer must go through these
 * helpers rather than concatenating, because two of the rules below are easy to
 * get wrong and both fail silently.
 *
 * ── Rule 1: no width means no transform ──
 * A call that does not say how big the element is gets the original back, byte
 * for byte. Sizing is opt-in per call site, so a surface nobody has measured
 * cannot quietly lose quality.
 *
 * ── Rule 2: only our own CDN is rewritten ──
 * The Cloudflare zone allows the Spaces host as a remote source and nothing
 * else, so an `api.dehub.io` URL, a Supabase storage object (stage covers live
 * there) or an `i.imgur.com` channel logo (the IPTV playlist is full of them)
 * would 404 if it were rewritten. Those pass through untouched.
 *
 * ── The live dependency ──
 * These transform URLs only exist while the zone's Images -> Transformations
 * setting is on. If it is switched off they 404 rather than falling back to the
 * original, which is the same trade the other two clients already took.
 */

const TRANSFORM_ORIGIN = 'https://dehub.io';
const SPACES_HOST = 'dehubcdn.ams3.cdn.digitaloceanspaces.com';

const CDN_BASE = (env.CDN_BASE_URL || '').replace(/\/+$/, '');

function isOurCdn(url: string): boolean {
  return url.includes(SPACES_HOST) || (!!CDN_BASE && url.startsWith(CDN_BASE));
}

/** Already a full URL, or a local/bundled asset — either way, do not re-base it. */
function isAddressable(url: string): boolean {
  return /^(https?:|data:|file:|asset:)/i.test(url);
}

export interface CdnImageOptions {
  /** Rendered width in layout points. Omit for the untouched original. */
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'scale-down';
  quality?: number;
}

/**
 * Route a CDN image through Cloudflare's resizer.
 *
 * `format=webp`, not `format=auto`: `auto` negotiates on the `Accept` header,
 * and native image loaders (Glide under `expo-image`) do not advertise AVIF the
 * way a browser does, so `auto` degrades to JPEG — most of the saving, none of
 * the certainty.
 */
export function cdnImage(url: string | null | undefined, opts: CdnImageOptions = {}): string {
  if (!url) return '';
  if (!opts.width) return url;
  if (!isOurCdn(url)) return url;

  // `PixelRatio` is 1 on nearly every Android TV panel (1080p rendered 1:1) and
  // 2 on a 4K device that reports a 1080p logical viewport, which is exactly
  // when a 2x asset is wanted. Capped at 2 so a mis-reporting panel cannot ask
  // the CDN for a 4x image nobody can see.
  const dpr = Math.min(PixelRatio.get() || 1, 2);
  const params = [
    `width=${Math.round(opts.width * dpr)}`,
    opts.height ? `height=${Math.round(opts.height * dpr)}` : null,
    `fit=${opts.fit ?? 'cover'}`,
    `quality=${opts.quality ?? 82}`,
    'format=webp',
  ]
    .filter(Boolean)
    .join(',');

  return `${TRANSFORM_ORIGIN}/cdn-cgi/image/${params}/${url}`;
}

/** Join a bare CDN-relative path (`images/2581.jpg`) onto the CDN origin. */
export function cdnPath(path: string | null | undefined): string {
  if (!path) return '';
  if (isAddressable(path)) return path;
  return `${CDN_BASE}/${path.replace(/^\/+/, '')}`;
}

/**
 * Poster for any feed item, in the order the API actually populates the fields.
 * Returns '' rather than a placeholder path so callers can branch on falsiness
 * — a TV card with a broken image URL is worse than one with no image.
 */
export function posterUrl(
  item: Record<string, any> | null | undefined,
  width?: number,
): string {
  if (!item) return '';
  const raw =
    item.thumbnail ||
    item.thumbnailUrl ||
    item.imageUrl ||
    (Array.isArray(item.imageUrls) ? item.imageUrls[0] : undefined);
  if (!raw) return '';
  return cdnImage(cdnPath(raw), { width });
}

export function avatarUrl(
  raw: string | null | undefined,
  size = 64,
): string {
  if (!raw) return '';
  // An absolute URL must not be reduced to its last path segment and re-based
  // onto our CDN — dicebear fallbacks and Supabase-hosted avatars both arrive
  // absolute, and re-basing them 404s every one.
  if (isAddressable(raw)) return cdnImage(raw, { width: size });
  const fileName = raw.split('/').pop();
  return cdnImage(`${CDN_BASE}/avatars/${fileName}`, { width: size });
}

/** Full-quality video for a minted post. */
export function videoUrl(tokenId: string | number | null | undefined): string {
  if (tokenId === null || tokenId === undefined) return '';
  const id = String(tokenId).trim();
  return id ? `${CDN_BASE}/videos/${id}.mp4` : '';
}

/** Short muted loop used for the hero backdrop. Not every post has one. */
export function previewUrl(tokenId: string | number | null | undefined): string {
  if (tokenId === null || tokenId === undefined) return '';
  const id = String(tokenId).trim();
  return id ? `${CDN_BASE}/previews/${id}.mp4` : '';
}

/**
 * Livepeer HLS for a live stream. This is the only source on the platform that
 * is genuinely adaptive — feed videos are progressive MP4 on the CDN — so a
 * live rail costs a fraction of what a video rail does on a weak connection.
 *
 * Two hosts, in the order web tries them: `.studio` is current and `.com` is
 * the legacy edge that some older streams still resolve on. A player that only
 * knows the first shows a black rectangle for those rather than an error.
 */
const LIVEPEER_HOSTS = ['https://livepeercdn.studio', 'https://livepeercdn.com'] as const;

export function livepeerHls(playbackId: string | null | undefined): string {
  if (!playbackId) return '';
  return `${LIVEPEER_HOSTS[0]}/hls/${playbackId}/index.m3u8`;
}

/** Every candidate playback URL, primary first, for retry-on-error. */
export function livepeerHlsCandidates(playbackId: string | null | undefined): string[] {
  if (!playbackId) return [];
  return LIVEPEER_HOSTS.map((host) => `${host}/hls/${playbackId}/index.m3u8`);
}

/** Livepeer's own frame grab — the only poster a stream has before its first
 *  recording is stored, and the one the live rail leans on. */
export function livepeerThumbnail(playbackId: string | null | undefined): string {
  if (!playbackId) return '';
  return `${LIVEPEER_HOSTS[0]}/hls/${playbackId}/thumbnail.jpg`;
}
