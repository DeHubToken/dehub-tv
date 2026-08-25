import Constants from 'expo-constants';
import env from '../config/env';
import { createLogger } from './logger';
import { getAuthToken } from './session';
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
}

function queryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
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
