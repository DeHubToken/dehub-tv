import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the signed-in session will live.
 *
 * There is no sign-in surface in this build, and that is a decision rather than
 * an omission: the whole DeHub catalogue answers unauthenticated (`/feed` and
 * `/live` both do), so a TV can be genuinely useful before anyone has typed
 * anything. What it must never do is ask someone to enter a wallet, a seed
 * phrase or a password on a remote control — that is a keyboard the user does
 * not have, guarding a credential they cannot afford to fat-finger.
 *
 * The shape it will take instead is a device-pairing code: the TV shows a short
 * code, the phone app or dehub.io claims it, and the backend hands the TV a
 * token. Only the two functions below need to exist for that to slot in, which
 * is why they exist now — every call site is already token-aware, so pairing is
 * additive rather than a refactor.
 *
 * SecureStore is deliberately not used: `expo-secure-store` is backed by the
 * Android keystore, which on a shared living-room device buys nothing a plain
 * app-private file does not already give, while adding a native module that has
 * to build for the TV target.
 */
const TOKEN_KEY = 'dehub_tv_auth_token';
const USER_KEY = 'dehub_tv_auth_user';

export interface TvUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

/** Read-through cache: this sits in the header path of every request. */
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

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function getAuthUser(): Promise<TvUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as TvUser) : null;
  } catch {
    return null;
  }
}

export async function setAuthUser(user: TvUser | null): Promise<void> {
  if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  else await AsyncStorage.removeItem(USER_KEY);
}

export async function clearSession(): Promise<void> {
  await Promise.all([setAuthToken(null), setAuthUser(null)]);
}
