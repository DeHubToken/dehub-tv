import { apiClient } from '../lib/api.client';
import { saveSession, type TvUser } from '../lib/session';
import { createLogger } from '../lib/logger';

const log = createLogger('pairing');

/**
 * Signing in without typing.
 *
 * The television asks for a short code, shows it, and polls. The owner types
 * that code into DeHub on a phone that is already signed in, and the next poll
 * comes back with a session.
 *
 * Both calls here are UNAUTHENTICATED, which is the point — this device has
 * nothing to authenticate with yet. What keeps that safe is that the token is
 * collected by `pairingId`, a UUID this app generated and never displays.
 * The code on screen is only good for *approving*, so someone reading it off a
 * photograph can sign their own account into this television and nothing more.
 */

export interface Pairing {
  pairingId: string;
  code: string;
  expiresAt: string;
}

export type PairingState = 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';

export interface PairingStatus {
  state: PairingState;
  token?: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: TvUser;
}

export async function startPairing(): Promise<Pairing> {
  const res = await apiClient.post<Pairing>('/tv/pair/start', {}, { withAuth: false });
  if (!res?.pairingId || !res?.code) {
    throw new Error('Could not get a pairing code.');
  }
  return res;
}

/**
 * Poll once.
 *
 * On `approved` the session is stored here rather than handed back for a
 * caller to remember to persist. The server hands the tokens over exactly once
 * — a second poll gets `consumed` and nothing else — so a caller that received
 * them and then failed to save them would have burned the pairing and left the
 * user staring at a code that will never work again.
 */
export async function pollPairing(pairingId: string): Promise<PairingState> {
  const res = await apiClient.get<PairingStatus>('/tv/pair/status', {
    params: { pairingId },
    withAuth: false,
  });

  const state = res?.state ?? 'pending';
  if (state !== 'approved') return state;

  if (!res.token) {
    log.warn('approved without a token');
    return 'expired';
  }

  await saveSession({
    token: res.token,
    refreshToken: res.refreshToken,
    expiresIn: res.expiresIn,
    user: res.user ?? null,
  });
  return 'approved';
}
