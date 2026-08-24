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
  SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY || '',
  APP_ENV: APP_ENV || 'production',
  DEBUG: DEBUG === 'true' || DEBUG === '1',
} as const;

export default env;
