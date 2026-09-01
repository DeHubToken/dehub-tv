import {
  API_URL,
  CDN_BASE_URL,
  APP_ORIGIN,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  APP_ENV,
  DEBUG,
} from '@env';

/**
 * Every value here ships inside the binary and is extractable, so the fallbacks
 * are the real production values rather than placeholders — an unset variable
 * must degrade to "works against production", never to "silently points at
 * nothing". The phone app learned this the hard way with WEBSOCKET_URL, whose
 * fallback included the `/api` path and pointed the socket at the wrong origin.
 */
const env = {
  API_URL: API_URL || 'https://api.dehub.io/api',
  CDN_BASE_URL: CDN_BASE_URL || 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com',
  APP_ORIGIN: APP_ORIGIN || 'https://dehub.io',
  SUPABASE_URL: SUPABASE_URL || 'https://aigxuutjaqsywioxjefr.supabase.co',
  /**
   * The anon/publishable key, with a real fallback rather than an empty string.
   *
   * EAS respects `.gitignore` when it packs the project, and `.env` is ignored,
   * so a cloud build sees NONE of these variables — every other value here
   * already falls back to production for exactly that reason and this one did
   * not. An empty key builds a Supabase client that fails every request, which
   * would have shipped an APK with Live TV — all seven hundred channels, the
   * app's strongest surface — silently broken.
   *
   * Not a secret: this is the publishable anon key, already committed in this
   * repo's `.env.sample`, in dehubweb's `.env`, and shipped inside every web
   * bundle and phone build. RLS is what protects the data, not this string.
   */
  SUPABASE_PUBLISHABLE_KEY:
    SUPABASE_PUBLISHABLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ3h1dXRqYXFzeXdpb3hqZWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MzY0MzIsImV4cCI6MjA4MzIxMjQzMn0.hjMx0kShuJlaZ26UoG7RFGu3OC_aLR0C1Sf1qdk3x0I',
  APP_ENV: APP_ENV || 'production',
  DEBUG: DEBUG === 'true' || DEBUG === '1',
} as const;

export default env;
