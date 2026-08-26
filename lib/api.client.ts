import Constants from 'expo-constants';
import env from '../config/env';
import { createLogger } from './logger';
import {
  getAuthToken,
  getRefreshToken,
  saveSession,
  clearSession,
  announceSessionEnded,
} from './session';
import { getDeviceHeaders } from './device';

const log = createLogger('api');

const APP_VERSION = Constants.expoConfig?.version ?? '0.1.0';

/**
 * Wall-clock ceiling on a single request, carried over from the phone client
 * for the same reason it exists there: `fetch` with no signal hangs for the
 * platform default, and a promise that never settles never rejects — so React
 * Query's retry never fires and the rail sits on a skeleton forever with no
 * error and no way back. This is a backstop against a dead socket, not a
 * latency budget.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

export class RequestTimeoutError extends Error {
  readonly isTimeout = true;
  readonly url: string;
  constructor(url: string, ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'RequestTimeoutError';
    this.url = url;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(url: string, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  /** Attach the stored bearer token when one exists. Never *requires* one —
   *  the whole catalogue is browsable signed out and must stay that way. */
  withAuth?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Internal: set on the single replay after a successful refresh, so a 401
   *  that survives the refresh cannot loop. */
  isRetry?: boolean;
}

function queryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

/**
 * Rescue an expired access token, or give up and say the session is over.
 *
 * The access token lives fifteen minutes. On a phone that is barely noticeable
 * because the app is opened and closed constantly; on a television, which is
 * signed in once and then left running for hours, **it means every
 * authenticated call starts failing a quarter of an hour in** — the saved rail
 * empties, Like stops working, tipping stops working, and nothing says why.
 * Refreshing only at launch is therefore not enough, and this is not an edge
 * case but the normal path.
 *
 * Deliberately a raw `fetch` rather than `apiClient.post`: this is called from
 * inside `request`, and routing it back through would be a cycle.
 *
 * Concurrent callers share one attempt. Six rails all 401-ing at once must
 * produce one refresh, not six — the backend rotates refresh tokens and treats
 * reuse as a replay, so a burst of parallel refreshes is how a session
 * destroys itself.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${env.API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;

      const body = await res.json().catch(() => null);
      const token = body?.token ?? body?.accessToken;
      if (!token) return false;

      await saveSession({
        token,
        refreshToken: body.refreshToken ?? refreshToken,
        expiresIn: body.expiresIn,
      });
      return true;
    } catch {
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    params,
    withAuth = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    isRetry = false,
  } = options;

  const url = `${env.API_URL}${endpoint}${queryString(params)}`;

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    // The backend segments analytics and rate limits on these. A TV must be
    // distinguishable from a phone in the logs, or every playback-behaviour
    // difference gets attributed to mobile.
    'X-Client-Type': 'tv',
    'X-Platform': 'androidtv',
    'X-App-Version': APP_VERSION,
    // Identifies this TV as a revocable session in the user's Active sessions
    // list. Sent on every request, not just sign-in, because the backend
    // refreshes a session's last-seen from whatever it sees.
    ...(await getDeviceHeaders()),
    ...headers,
  };

  if (withAuth) {
    const token = await getAuthToken();
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // A caller-supplied signal (screen unmounted, playback moved on) has to be
  // able to cancel too, so it is chained rather than replacing ours.
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  try {
    const res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.status === 401 && withAuth && !isRetry) {
      // Either the fifteen-minute access token ran out — the common case on a
      // television — or the session was revoked from another device. A refresh
      // separates the two: if it works this was expiry, so replay the call once
      // and the user never sees it. If it does not, the session is genuinely
      // over and the app has to stop pretending otherwise.
      if (await refreshAccessToken()) {
        return request<T>(endpoint, { ...options, isRetry: true });
      }
      await clearSession();
      announceSessionEnded();
      throw new ApiError(url, 401, 'Session ended');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(url, res.status, text?.slice(0, 300) || res.statusText);
    }

    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch (error: any) {
    if (error?.name === 'AbortError' && !signal?.aborted) {
      log.warn('timeout', url);
      throw new RequestTimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

export const apiClient = {
  request,
  get: <T>(endpoint: string, options?: Omit<ApiOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown, options?: Omit<ApiOptions, 'method' | 'body'>) =>
    request<T>(endpoint, { ...options, method: 'POST', body }),
};
