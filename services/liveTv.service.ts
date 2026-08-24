import { supabase } from './supabase';
import { createLogger } from '../lib/logger';

/**
 * Live TV channels.
 *
 * This is the surface with the strongest claim to a television: 700-odd free
 * IPTV channels that DeHub already curates for web and the phone app, which on
 * a phone is a novelty and on a TV is the thing the device is for.
 *
 * Ported from the phone app's `services/liveTv.service.ts`, which is itself a
 * port of web's `lib/api/live-tv.ts`. Same source table, same filters, same
 * five-minute cache, same broken-channel report — a channel that plays on one
 * client must play on all three, and three divergent copies of this filter is
 * how that stops being true.
 */

const log = createLogger('liveTv');

const FREE_TV_PLAYLIST_URL =
  'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';

export interface TVChannel {
  id: string;
  name: string;
  logo: string | null;
  category: string;
  streamUrl: string;
  country: string;
}

export interface TVCountry {
  id: string;
  label: string;
  count: number;
}

const COUNTRY_DISPLAY_OVERRIDES: Record<string, string> = {
  '日本 / Japan': 'Japan',
  'News (AR)': 'News (Arabic)',
  'News (ES)': 'News (Spanish)',
  'Documentaries (EN)': 'Documentaries',
  'North Macedonia': 'N. Macedonia',
};

/** Strip resolution tags like (720p) from channel names. */
function cleanChannelName(name: string): string {
  return name.replace(/\s*\(\d+p\)/gi, '').trim();
}

let channelsCache: TVChannel[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

/** Reported once per session, as on the other clients. */
const reportedChannels = new Set<string>();

async function fetchVerifiedChannels(): Promise<TVChannel[]> {
  const { data, error } = await supabase
    .from('tv_channels_verified')
    .select('id,name,logo,category,stream_url,country')
    .eq('is_active', true)
    .order('name');

  if (error) {
    log.warn('database fetch failed, will use playlist fallback:', error.message);
    return [];
  }
  if (!data?.length) return [];

  return (data as any[]).map((row) => ({
    id: row.id,
    name: cleanChannelName(row.name),
    logo: row.logo,
    category: row.category,
    streamUrl: row.stream_url,
    country: row.country,
  }));
}

function generateIdFromUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash = hash & hash;
  }
  return `ch-${Math.abs(hash).toString(36)}`;
}

/**
 * The same exclusions the other clients apply: DRM (`.mpd`), embed-only hosts
 * that need a browser and a referrer, plain `http` (cleartext is blocked by the
 * network security config), and the geo-blocked marker. Only HLS survives,
 * which is the one thing ExoPlayer will definitely play.
 */
function isValidStream(url: string, name: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('.mpd')) return false;
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return false;
  if (lower.includes('twitch.tv')) return false;
  if (lower.includes('dailymotion.com')) return false;
  if (url.startsWith('http://')) return false;
  if (name.includes('Ⓖ')) return false;
  return lower.includes('.m3u8');
}

function parseM3U8Playlist(content: string): TVChannel[] {
  const lines = content.split('\n');
  const channels: TVChannel[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF:')) continue;

    const nameMatch = line.match(/tvg-name="([^"]+)"/);
    const logoMatch = line.match(/tvg-logo="([^"]+)"/);
    const groupMatch = line.match(/group-title="([^"]+)"/);
    const titleMatch = line.match(/,(.+)$/);

    let streamUrl = '';
    for (let j = i + 1; j < lines.length && j < i + 3; j++) {
      const next = lines[j]?.trim();
      if (next && !next.startsWith('#')) {
        streamUrl = next;
        break;
      }
    }

    const name = cleanChannelName(nameMatch?.[1] || titleMatch?.[1] || 'Unknown Channel');
    if (!streamUrl || seenUrls.has(streamUrl)) continue;
    if (!isValidStream(streamUrl, name)) continue;

    seenUrls.add(streamUrl);
    const groupTitle = groupMatch?.[1] || 'Other';

    channels.push({
      id: generateIdFromUrl(streamUrl),
      name,
      logo: logoMatch?.[1] || null,
      category: groupTitle,
      streamUrl,
      country: groupTitle,
    });
  }

  return channels;
}

async function fetchFallbackChannels(): Promise<TVChannel[]> {
  const res = await fetch(FREE_TV_PLAYLIST_URL);
  if (!res.ok) throw new Error('Failed to fetch TV channels');
  return parseM3U8Playlist(await res.text());
}

async function fetchAllChannels(): Promise<TVChannel[]> {
  const now = Date.now();
  if (channelsCache?.length && now - cacheTimestamp < CACHE_TTL) return channelsCache;

  let channels = await fetchVerifiedChannels();
  if (channels.length === 0) {
    log.info('falling back to raw playlist parsing');
    channels = await fetchFallbackChannels();
  }

  channelsCache = channels;
  cacheTimestamp = now;
  return channels;
}

/** Logos first, then alphabetical — a grid of unbranded text tiles is
 *  unreadable at three metres, so channels that have artwork lead. */
function byLogoThenName(a: TVChannel, b: TVChannel): number {
  if (!!a.logo !== !!b.logo) return a.logo ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export async function getChannelsByCountry(country: string, limit = 60): Promise<TVChannel[]> {
  const all = await fetchAllChannels();
  const filtered = country === 'all' ? [...all] : all.filter((c) => c.country === country);
  return filtered.sort(byLogoThenName).slice(0, limit);
}

export async function searchChannels(query: string, limit = 60): Promise<TVChannel[]> {
  if (!query.trim()) return getChannelsByCountry('all', limit);

  const all = await fetchAllChannels();
  const q = query.toLowerCase();

  return all
    .filter((c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
    .sort((a, b) => {
      const aExact = a.name.toLowerCase() === q;
      const bExact = b.name.toLowerCase() === q;
      if (aExact !== bExact) return aExact ? -1 : 1;

      const aStarts = a.name.toLowerCase().startsWith(q);
      const bStarts = b.name.toLowerCase().startsWith(q);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;

      return byLogoThenName(a, b);
    })
    .slice(0, limit);
}

export async function getCountries(): Promise<TVCountry[]> {
  const all = await fetchAllChannels();
  const counts = new Map<string, number>();
  for (const c of all) counts.set(c.country, (counts.get(c.country) ?? 0) + 1);

  const out: TVCountry[] = [{ id: 'all', label: 'All', count: all.length }];
  for (const [country, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    out.push({ id: country, label: COUNTRY_DISPLAY_OVERRIDES[country] ?? country, count });
  }
  return out;
}

/**
 * Auto-called when playback fails. An IPTV playlist rots continuously — hosts
 * disappear, tokens expire — and the only way the verified table stays verified
 * is clients reporting what actually failed to play. Deduped per session so a
 * channel that retries three times reports once.
 */
export async function reportBrokenChannel(channelId: string): Promise<void> {
  if (reportedChannels.has(channelId)) return;
  reportedChannels.add(channelId);
  try {
    await supabase.functions.invoke('report-broken-channel', {
      body: { channel_id: channelId },
    });
  } catch (error) {
    log.warn('failed to report broken channel:', error);
  }
}
