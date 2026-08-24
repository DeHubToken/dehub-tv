/**
 * Display formatting.
 *
 * Deliberately terse output: a TV card has one line for metadata and the
 * viewer is three metres away, so "1.2M views · 4:31" beats
 * "1,204,882 views · 4 minutes 31 seconds" every time.
 */

/** 1204882 -> "1.2M". Anything under a thousand keeps its digits. */
export function compactNumber(n: number | null | undefined): string {
  const value = Number(n);
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) {
    const k = value / 1_000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`;
  }
  const m = value / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`;
}

/** Seconds -> "4:31" or "1:04:31". */
export function duration(seconds: number | null | undefined): string {
  const total = Math.floor(Number(seconds) || 0);
  if (total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Coarse relative time. Nothing on a TV card needs minute precision. */
export function timeAgo(iso: string | null | undefined): string {
  const then = Date.parse(iso || '');
  if (!Number.isFinite(then)) return '';
  const seconds = Math.max(0, (Date.now() - then) / 1000);

  if (seconds < 3600) return 'Just now';
  const hours = seconds / 3600;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 7) return `${Math.floor(days)}d ago`;
  const weeks = days / 7;
  if (weeks < 5) return `${Math.floor(weeks)}w ago`;
  const months = days / 30;
  if (months < 12) return `${Math.floor(months)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
