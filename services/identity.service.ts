import { apiClient } from '../lib/api.client';
import { getAuthUser, saveAuthUser, type TvUser } from '../lib/session';
import { getAccountInfo } from './user.service';
import { createLogger } from '../lib/logger';

const log = createLogger('identity');

/**
 * Work out who this television is signed in as.
 *
 * Necessary because **pairing hands over a session and nothing else**. The
 * `tv/pair/status` response is a token pair by design — it is collected by an
 * unauthenticated poller, so it says as little as it can get away with — which
 * leaves the app authenticated and anonymous.
 *
 * That is not cosmetic. Without an address the navigation never confirms the
 * sign-in worked, the Saved rail queries for nobody, and the Follow button on a
 * creator page silently does nothing at all, because it refuses to act without
 * a `myAddress`. Signing in appears to half-work, which is worse than it
 * failing.
 *
 * Two calls, both cheap: `/auth/verify` turns the token into an address, and
 * `/account_info` turns the address into a name and a face.
 */
export async function resolveIdentity(): Promise<TvUser | null> {
  // Already known — a re-resolve on every screen mount would be a round trip
  // to learn something stored on disk.
  const known = await getAuthUser();
  if (known?.address) return known;

  let address: string | undefined;
  try {
    const res = await apiClient.get<{ status?: boolean; address?: string }>('/auth/verify');
    address = res?.address;
  } catch (error) {
    log.warn('verify failed', error);
    return null;
  }
  if (!address) return null;

  // The address alone is enough for everything functional — Saved, Follow, the
  // creator check. The profile is only for showing a name and a face, so a
  // failure there must not throw the identity away.
  const profile = await getAccountInfo(address).catch(() => null);

  const user: TvUser = {
    address,
    username: profile?.username,
    displayName: profile?.displayName,
    avatarImageUrl: profile?.avatarImageUrl,
  };

  await saveAuthUser(user);
  return user;
}
