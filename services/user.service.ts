import { apiClient } from '../lib/api.client';
import { createLogger } from '../lib/logger';

const log = createLogger('user');

export interface AccountInfo {
  address?: string;
  username?: string;
  displayName?: string;
  aboutMe?: string;
  avatarImageUrl?: string;
  coverImageUrl?: string;
  followers?: number;
  followings?: number;
  badgeBalance?: number;
  receivedTips?: number;
  sentTips?: number;
  isPrivate?: boolean;
  createdAt?: string;
  [key: string]: any;
}

/**
 * Account search.
 *
 * The parameter really is `searchParam` — not `q`, not `search`, not the
 * `search` the feed endpoint uses. Getting it wrong returns an unfiltered list
 * rather than an error, which looks like the search silently matching everyone.
 */
export async function searchAccounts(query: string, limit = 12): Promise<AccountInfo[]> {
  const term = query.trim();
  if (!term) return [];
  try {
    const res = await apiClient.get<any>('/users_search', { params: { searchParam: term } });
    const rows = res?.result ?? res?.data?.result ?? res;
    return (Array.isArray(rows) ? rows : []).slice(0, limit) as AccountInfo[];
  } catch (error) {
    log.warn('searchAccounts failed', error);
    return [];
  }
}

/**
 * A creator's public profile.
 *
 * Takes a username OR an address, which is why the parameter is named for
 * neither — the feed hands out both depending on the field, and normalising to
 * one of them client-side would mean resolving the other first, an extra
 * round-trip for nothing.
 */
export async function getAccountInfo(usernameOrAddress: string): Promise<AccountInfo | null> {
  if (!usernameOrAddress) return null;
  try {
    const res = await apiClient.get<any>(
      `/account_info/${encodeURIComponent(usernameOrAddress)}`,
    );
    return (res?.result ?? res?.data?.result ?? res) as AccountInfo;
  } catch (error) {
    log.warn('getAccountInfo failed', error);
    return null;
  }
}
