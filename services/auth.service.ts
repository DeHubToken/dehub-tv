import { supabase } from './supabase';
import { apiClient, ApiError } from '../lib/api.client';
import { saveSession, clearSession, getRefreshToken, type TvUser } from '../lib/session';
import { createLogger } from '../lib/logger';

const log = createLogger('auth');

/**
 * Sign-in on a television.
 *
 * The flow is three hops and every one of them already exists in production —
 * this client adds no new backend surface:
 *
 *   1. `supabase.auth.signInWithOtp({ email })` mails a six-digit code.
 *   2. `supabase.auth.verifyOtp` turns that code into a Supabase session.
 *   3. `POST web/auth/supabase` exchanges the Supabase access token for a DeHub
 *      token pair, resolving the account by `web3AuthMeta.verifierId`.
 *
 * Steps 1 and 2 are byte-for-byte what the phone app's primary email login
 * already does (`services/auth/supabaseAuth.service.ts`), which is the evidence
 * that the Supabase email template really does carry `{{ .Token }}` — without
 * it, mobile email sign-in would be broken in production today.
 *
 * Step 3 is the part that makes this safe for a shared appliance. It issues a
 * session from the identity alone and explicitly "does not grant the ability to
 * move funds" — spending still needs a wallet unlock on a device that has the
 * key, which a TV never does.
 */

/** Errors the sign-in screen has to say something specific about. */
export type SignInFailure =
  | 'NO_ACCOUNT'
  | 'WALLET_NOT_LINKED'
  | 'WALLET_LINK_AMBIGUOUS'
  | 'ACCOUNT_BANNED'
  | 'BAD_CODE'
  | 'RATE_LIMITED'
  | 'NETWORK';

export class SignInError extends Error {
  readonly reason: SignInFailure;
  constructor(reason: SignInFailure, message: string) {
    super(message);
    this.name = 'SignInError';
    this.reason = reason;
  }
}

/**
 * Mail a six-digit code.
 *
 * `shouldCreateUser: false` is the one line that differs from the phone app,
 * and it matters. Mobile is a signup surface, so it creates the identity if it
 * is missing. A television is not: signing up here would mint a brand-new
 * DeHub account with a wallet the TV cannot hold, and the person would end up
 * with a second empty account and no idea why their videos were missing. An
 * unknown address is told to sign up on a phone or at dehub.io instead.
 */
export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });

  if (!error) return;

  log.warn('sendEmailCode', error.message);
  const message = error.message?.toLowerCase() ?? '';

  // Supabase reports "Signups not allowed for otp" when shouldCreateUser is
  // false and the address is unknown. That is not an error the user caused.
  if (message.includes('signups not allowed') || message.includes('user not found')) {
    throw new SignInError(
      'NO_ACCOUNT',
      'No DeHub account uses that email address yet.',
    );
  }
  if (message.includes('rate') || message.includes('too many')) {
    throw new SignInError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.');
  }
  throw new SignInError('NETWORK', error.message || 'Could not send the code.');
}

interface ExchangeResponse {
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: TvUser;
  result?: { user?: TvUser };
  [key: string]: any;
}

/**
 * Verify the code, exchange it for a DeHub session, and store the result.
 *
 * The Supabase session is deliberately not persisted — it is used once, here,
 * and dropped. See `lib/session.ts` for why leaving one on a TV is a bad idea.
 */
export async function verifyEmailCode(email: string, code: string): Promise<TvUser | null> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });

  if (error || !data?.session?.access_token) {
    log.warn('verifyEmailCode', error?.message);
    throw new SignInError('BAD_CODE', 'That code is wrong or has expired.');
  }

  try {
    const res = await apiClient.post<ExchangeResponse>(
      '/web/auth/supabase',
      {},
      {
        withAuth: false,
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      },
    );

    if (!res?.token) {
      throw new SignInError('NETWORK', 'Sign-in did not return a session.');
    }

    const user = res.user ?? res.result?.user ?? null;
    await saveSession({
      token: res.token,
      refreshToken: res.refreshToken,
      expiresIn: res.expiresIn,
      user,
    });
    return user;
  } finally {
    // Whether the exchange succeeded or not, the Supabase identity has done its
    // job. Dropping it here rather than in the success path means a failed
    // exchange does not leave a half-session behind on the device.
    await supabase.auth.signOut().catch(() => {});
  }
}

/** Turn the exchange's error codes into something a person can act on. */
export function describeExchangeError(error: unknown): SignInError {
  if (error instanceof SignInError) return error;

  if (error instanceof ApiError) {
    const body = safeParse(error.message);
    const code = body?.code as string | undefined;

    if (code === 'WALLET_NOT_LINKED') {
      return new SignInError(
        'WALLET_NOT_LINKED',
        'That email is not connected to your DeHub account yet.',
      );
    }
    if (code === 'WALLET_LINK_AMBIGUOUS') {
      return new SignInError(
        'WALLET_LINK_AMBIGUOUS',
        'That email is connected to more than one account. Sign in with your wallet on a phone or at dehub.io to sort it out.',
      );
    }
    if (code === 'ACCOUNT_BANNED') {
      return new SignInError('ACCOUNT_BANNED', body?.message || 'This account has been banned.');
    }
    if (error.status === 429) {
      return new SignInError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.');
    }
  }

  return new SignInError('NETWORK', 'Could not reach DeHub. Check the connection and try again.');
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface RefreshResponse {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

/**
 * Trade the refresh token for a fresh access token.
 *
 * A TV is signed in once and then left alone for months, so this is not an edge
 * case — it is the normal path back in every single time the app is opened
 * after the access token's lifetime. A client that only refreshes on a 401
 * shows the user an error screen first.
 */
export async function refreshSession(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await apiClient.post<RefreshResponse>(
      '/auth/refresh',
      { refreshToken },
      { withAuth: false },
    );
    const token = res?.token ?? res?.accessToken;
    if (!token) return false;

    await saveSession({
      token,
      refreshToken: res.refreshToken ?? refreshToken,
      expiresIn: res.expiresIn,
    });
    return true;
  } catch (error) {
    log.warn('refreshSession failed', error);
    return false;
  }
}

export async function signOut(): Promise<void> {
  const refreshToken = await getRefreshToken();
  // Best effort: tell the backend so the session disappears from the user's
  // Active sessions list rather than lingering as a device they cannot revoke.
  if (refreshToken) {
    await apiClient.post('/auth/logout', { refreshToken }).catch(() => {});
  }
  await clearSession();
}
