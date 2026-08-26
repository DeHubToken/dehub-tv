import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getAuthToken,
  getAuthUser,
  getTokenExpiresAt,
  onSessionEnded,
  type TvUser,
} from '../lib/session';
import { resolveIdentity } from '../services/identity.service';
import { refreshSession, signOut as doSignOut } from '../services/auth.service';
import { queryClient } from '../config/queryClient';

interface AuthValue {
  user: TvUser | null;
  isSignedIn: boolean;
  /** True until the stored session has been read and, if stale, refreshed. */
  isRestoring: boolean;
  /** Called by the sign-in screen once the exchange has stored a session. */
  adopt: (user: TvUser | null) => void;
  /**
   * Re-read whatever is in storage and adopt it.
   *
   * Pairing writes the session inside the poll — it has to, because the server
   * hands the tokens over exactly once and a caller that received them and then
   * failed to persist them would have burned the code. So there is nothing to
   * pass back up; the context just re-reads.
   */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  isSignedIn: false,
  isRestoring: true,
  adopt: () => {},
  refresh: async () => {},
  signOut: async () => {},
});

/** Refresh this far ahead of expiry rather than waiting for a 401. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Session state for the app.
 *
 * The restore path is the interesting part. A television is signed in once and
 * then left alone for months, so "the access token expired while the app was
 * closed" is not an edge case — it is what happens every single time the app is
 * opened after the token's lifetime. Refreshing eagerly at boot, before any
 * screen has asked for data, is the difference between a TV that is simply
 * signed in and one that greets its owner with an error rail and a sign-in
 * prompt they have already completed.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<TvUser | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getAuthToken();
      if (!token) {
        if (!cancelled) setIsRestoring(false);
        return;
      }

      const expiresAt = await getTokenExpiresAt();
      const stale = expiresAt !== null && expiresAt - Date.now() < REFRESH_MARGIN_MS;

      // A refresh that fails means the session was revoked from another device
      // — which is exactly what Active sessions is for — so the right response
      // is to fall back to signed-out rather than to retry.
      const alive = stale ? await refreshSession() : true;

      if (cancelled) return;
      if (alive) {
        // Resolves from storage when it can and from the API when it cannot —
        // a paired television has a session and no stored identity.
        setUser(await resolveIdentity());
        setIsSignedIn(true);
      }
      setIsRestoring(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback((next: TvUser | null) => {
    setUser(next);
    setIsSignedIn(true);
    // Every feed query carries the bearer token, so the signed-out copies now
    // in cache are the wrong answer — they have no isSaved/isLiked flags and no
    // personalised ordering.
    void queryClient.invalidateQueries();
  }, []);

  const refresh = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) return;
    // Pairing yields a session and no identity — the pairing response carries
    // tokens only — so who we are has to be resolved separately or the whole
    // app runs anonymously while signed in.
    setUser(await resolveIdentity());
    setIsSignedIn(true);
    void queryClient.invalidateQueries();
  }, []);

  /**
   * Stop pretending to be signed in when the session has been taken away.
   *
   * Raised by the request layer when a 401 survives a refresh, which means
   * either the refresh token expired or somebody revoked this television from
   * another device. The second is the whole point of showing a TV in Active
   * sessions, and it only works if the TV notices.
   */
  useEffect(
    () =>
      onSessionEnded(() => {
        setUser(null);
        setIsSignedIn(false);
        void queryClient.invalidateQueries();
      }),
    [],
  );

  const signOut = useCallback(async () => {
    await doSignOut();
    setUser(null);
    setIsSignedIn(false);
    void queryClient.invalidateQueries();
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, isSignedIn, isRestoring, adopt, refresh, signOut }),
    [user, isSignedIn, isRestoring, adopt, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}
