import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The signed-in session, as it exists on a television.
 *
 * Two properties of this design are deliberate and worth defending.
 *
 * **The TV never holds a wallet key.** DeHub's own account model is a
 * self-custody wallet whose key is encrypted at rest, and the phone and web
 * clients derive it on-device. A TV must not: it is a shared appliance in a
 * room the account holder does not always control, often signed in for years,
 * and frequently resold or handed on with the flat. The backend's
 * `POST web/auth/supabase` exchange exists precisely for this — it issues a
 * session from the Supabase identity alone and, in its own words, "does not
 * grant the ability to move funds". So the TV can watch, and cannot spend.
 *
 * **The Supabase session is thrown away after the exchange.** It is used once,
 * to prove identity to our backend, and never stored. What persists is the
 * DeHub token pair, which is revocable from any other device via Settings →
 * Active sessions. A lingering Supabase session would be a second, unrevocable
 * way into the account sitting in a living room.
 *
 * `expo-secure-store` is not used, on purpose: it is backed by the Android
 * keystore, which on a device with no lock screen — the normal state of a TV —
 * buys nothing over an app-private file, while adding a native module to build.
 */

const TOKEN_KEY = 'dehub_tv_auth_token';
const REFRESH_KEY = 'dehub_tv_refresh_token';
const EXPIRES_KEY = 'dehub_tv_token_expires_at';
const USER_KEY = 'dehub_tv_auth_user';

export interface TvUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

/** Read-through cache: `getAuthToken` sits in the header path of every request. */
let cachedToken: string | null | undefined;

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

/** Epoch ms, or null when unknown. */
export async function getTokenExpiresAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(EXPIRES_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export interface StoredSession {
  token: string;
  refreshToken?: string | null;
  /** Seconds, as the backend reports it. */
  expiresIn?: number | null;
  user?: TvUser | null;
}

export async function saveSession({ token, refreshToken, expiresIn, user }: StoredSession) {
  cachedToken = token;
  const writes: Promise<unknown>[] = [AsyncStorage.setItem(TOKEN_KEY, token)];

  if (refreshToken) writes.push(AsyncStorage.setItem(REFRESH_KEY, refreshToken));
  if (expiresIn) {
    writes.push(AsyncStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresIn * 1000)));
  }
  if (user) writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(user)));

  await Promise.all(writes).catch(() => {});
}

/**
 * Persist just the identity.
 *
 * Separate from `saveSession` because the identity is sometimes learned after
 * the tokens — pairing hands over a session with no user attached — and there
 * is no token to re-write at that point.
 */
export async function saveAuthUser(user: TvUser): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
}

export async function getAuthUser(): Promise<TvUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as TvUser) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  cachedToken = null;
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, EXPIRES_KEY, USER_KEY]).catch(() => {});
}

/**
 * Told when the session dies underneath the app.
 *
 * The request layer is where a dead session is discovered — a 401 that a
 * refresh could not rescue — but it cannot import the auth context to say so
 * without a cycle. So it announces here and the context listens.
 *
 * This is what makes "sign that television out" from another device actually
 * work. Without it the TV keeps a revoked token, every screen fills with
 * errors, and the navigation still shows the owner's name — which reads as the
 * app being broken rather than as the sign-out having succeeded.
 */
type SessionEndListener = () => void;
const sessionEndListeners = new Set<SessionEndListener>();

export function onSessionEnded(listener: SessionEndListener): () => void {
  sessionEndListeners.add(listener);
  return () => sessionEndListeners.delete(listener);
}

export function announceSessionEnded(): void {
  for (const listener of sessionEndListeners) {
    try {
      listener();
    } catch {
      // A listener that throws must not stop the others being told.
    }
  }
}
