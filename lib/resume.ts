/**
 * Where you got to.
 *
 * A television is the device people most often stop watching halfway through —
 * someone comes in, the food is ready, the episode is long — and it is the one
 * device where finding your place again by holding fast-forward is genuinely
 * miserable. So the player remembers the position of everything it plays, and
 * the home screen offers those back on a Continue watching rail.
 *
 * Stored locally rather than on the account, on purpose: it follows the panel,
 * not the person. The living-room TV is shared, the position it holds is the
 * position of the thing that was last watched *in that room*, and there is no
 * account-level watch-position API to write to anyway.
 *
 * The entry keeps the full player params rather than a token id, so a card can
 * reopen a video without a feed lookup — the rail must render before, and
 * without, any network call.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlayerParams } from '../navigation/types';

const STORAGE_KEY = 'dehub.resume.v1';

/** Shelf depth. Twenty is more than a rail shows and less than a memory leak. */
const MAX_ENTRIES = 20;

/**
 * Below this, nobody has "started watching" — they glanced at it — and the
 * rail fills with things the viewer bounced off.
 */
const MIN_POSITION_SECONDS = 30;

/**
 * Within this of the end, it is finished. Storing it would put a video the
 * viewer just completed at the top of Continue watching, which reads as the app
 * not having noticed.
 */
const END_MARGIN_SECONDS = 60;

export interface ResumeEntry {
  /** Post token id, as a string — the key everything here is filed under. */
  id: string;
  params: PlayerParams;
  position: number;
  duration: number;
  /** ms epoch; the rail is ordered by this. */
  updatedAt: number;
}

let cache: ResumeEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  // Fire and forget: the in-memory copy is what the UI reads, and a failed
  // write costs a resume point rather than breaking playback.
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache)).catch(() => {});
}

function sanitise(value: unknown): ResumeEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: ResumeEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as ResumeEntry;
    if (!entry.id || !entry.params?.sources?.length) continue;
    if (!Number.isFinite(entry.position) || entry.position < MIN_POSITION_SECONDS) continue;
    entries.push({
      id: String(entry.id),
      params: entry.params,
      position: Number(entry.position),
      duration: Number(entry.duration) || 0,
      updatedAt: Number(entry.updatedAt) || 0,
    });
  }
  return entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES);
}

/** Read the shelf off disk once, at startup. Safe to call again; it no-ops. */
export async function loadResumeShelf(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = sanitise(JSON.parse(raw));
      emit();
    }
  } catch {
    // A corrupt blob is not worth a crash on launch; start with an empty shelf.
    cache = [];
  }
}

export function resumeEntries(): ResumeEntry[] {
  return cache;
}

/** The stored position for one video, or 0. */
export function resumePosition(id: string | number | undefined): number {
  if (id === undefined || id === null) return 0;
  const key = String(id);
  return cache.find((entry) => entry.id === key)?.position ?? 0;
}

/**
 * Record where the viewer is. Called on a timer while playing, so it is cheap
 * and idempotent; the decision about whether this position is worth keeping
 * lives here rather than at the call site.
 */
export function saveResumePoint(input: {
  id: string | number | undefined;
  params: PlayerParams;
  position: number;
  duration: number;
}): void {
  if (input.id === undefined || input.id === null) return;
  const key = String(input.id);
  const { position, duration } = input;

  const tooEarly = position < MIN_POSITION_SECONDS;
  const finished = duration > 0 && position > duration - END_MARGIN_SECONDS;
  if (tooEarly || finished) {
    clearResumePoint(key);
    return;
  }

  cache = [
    { id: key, params: input.params, position, duration, updatedAt: Date.now() },
    ...cache.filter((entry) => entry.id !== key),
  ].slice(0, MAX_ENTRIES);

  persist();
  emit();
}

export function clearResumePoint(id: string | number | undefined): void {
  if (id === undefined || id === null) return;
  const key = String(id);
  if (!cache.some((entry) => entry.id === key)) return;
  cache = cache.filter((entry) => entry.id !== key);
  persist();
  emit();
}

export function subscribeResume(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
