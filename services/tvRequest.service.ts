import { apiClient, ApiError } from '../lib/api.client';
import { createLogger } from '../lib/logger';

const log = createLogger('tvRequest');

/**
 * Asking the account owner's phone to sign something.
 *
 * The television holds a session that cannot move funds — no wallet key ever
 * reaches it. So a tip is not a transaction this app makes; it is a request
 * this app raises, which the owner's phone approves and submits with the wallet
 * it already has unlocked.
 *
 * What goes over the wire is INTENT, never contract parameters. The TV says
 * "100 DHB to this address, for this post"; the phone resolves the token
 * address, the decimals, the controller and the chain. That split is
 * deliberate: contract configuration is the phone's to own, and a television
 * that could name a token address is a television that could be talked into
 * naming the wrong one.
 */

export type TvRequestKind = 'tip' | 'buy' | 'mint' | 'subscribe';
export type TvRequestStatus = 'pending' | 'approved' | 'rejected' | 'failed';

export interface TvRequest {
  requestId: string;
  kind: TvRequestKind;
  payload: Record<string, unknown>;
  status: TvRequestStatus;
  deviceName: string | null;
  txHash: string | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface TipIntent {
  tokenId: number | string;
  amount: number;
  tokenSymbol: string;
  recipient: string;
  /** Shown in the phone's prompt so the person knows who they are tipping. */
  recipientName?: string;
  /** Shown in the phone's prompt so they know what they are tipping for. */
  postTitle?: string;
}

export class TvRequestError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'TvRequestError';
    this.code = code;
  }
}

export async function requestTip(intent: TipIntent): Promise<TvRequest> {
  try {
    const res = await apiClient.post<{ request: TvRequest }>('/tv/requests', {
      kind: 'tip',
      payload: {
        tokenId: Number(intent.tokenId),
        amount: intent.amount,
        tokenSymbol: intent.tokenSymbol,
        recipient: intent.recipient,
        recipientName: intent.recipientName,
        postTitle: intent.postTitle,
      },
    });
    return res.request;
  } catch (error) {
    if (error instanceof ApiError) {
      const body = safeParse(error.message);
      if (body?.code === 'TOO_MANY_PENDING') {
        throw new TvRequestError(
          'There are already a few requests waiting on your phone. Answer those first.',
          body.code,
        );
      }
      throw new TvRequestError(body?.message || 'That request was refused.', body?.code);
    }
    log.warn('requestTip failed', error);
    throw new TvRequestError('Could not reach DeHub. Check the connection.');
  }
}

/**
 * Poll one request.
 *
 * Returns null for a request the server no longer has. That is EXPIRY, not
 * refusal, and the two must not be conflated: telling someone their tip was
 * declined when in fact nobody looked at it in time is both wrong and
 * needlessly alarming. The caller offers "ask again" instead.
 */
export async function pollRequest(requestId: string): Promise<TvRequest | null> {
  try {
    const res = await apiClient.get<{ request: TvRequest }>(
      `/tv/requests/${encodeURIComponent(requestId)}`,
    );
    return res.request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
