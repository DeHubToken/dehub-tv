import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import env from '../config/env';

/**
 * Anonymous Supabase client.
 *
 * Two DeHub surfaces live in Postgres rather than behind the NestJS API — the
 * verified IPTV channel list (`tv_channels_verified`, 701 rows) and audio
 * stages (`audio_spaces`) — and both read fine with the publishable anon key,
 * verified against production.
 *
 * No session persistence and no auto-refresh: this client is only ever used for
 * anonymous table reads, and a TV that silently kept a Supabase session around
 * would be holding an identity for whoever used the living room last.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
