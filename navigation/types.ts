export type PlayerKind = 'video' | 'live' | 'channel';

export interface PlayerParams {
  kind: PlayerKind;
  title: string;
  subtitle?: string;
  /**
   * Candidate URLs, best first.
   *
   * A list rather than a string because two of the three sources genuinely have
   * more than one address: Livepeer serves the same playback id from
   * `livepeercdn.studio` and the legacy `livepeercdn.com`, and an IPTV channel
   * that has rotted is indistinguishable from one that is briefly down. The
   * player walks the list on error before it gives up, which turns a black
   * rectangle into either playback or an honest error message.
   */
  sources: string[];
  poster?: string;
  /** Set for IPTV only — a failure here is reported back so the curated table
   *  can drop the channel. */
  channelId?: string;
  /** Seconds. Live sources ignore it. */
  durationSeconds?: number;
  /**
   * What the feed already said about this viewer's relationship to the post.
   *
   * Without these the player starts from `false` for everybody, so pressing
   * Like on something already liked TOGGLES IT OFF while the button changes to
   * "Liked" — the optimistic flip inverts from a wrong base and the interface
   * ends up stating the opposite of the truth.
   */
  isLiked?: boolean;
  isSaved?: boolean;
  /**
   * The post's on-chain id, when it has one. Present for feed videos and
   * absent for IPTV — which is exactly the distinction the player needs, since
   * every engagement action is keyed on it. No tokenId, no Like button.
   */
  tokenId?: number | string;
  /** Creator address and label, for the follow-through to their page. */
  creatorAddress?: string;
  creatorName?: string;
}

export interface CreatorParams {
  /** Either works — `/account_info` resolves both. */
  handle: string;
  address?: string;
  /** Shown immediately so the header does not pop in after the fetch. */
  name?: string;
}

export type RootStackParamList = {
  Browse: undefined;
  Player: PlayerParams;
  Creator: CreatorParams;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
