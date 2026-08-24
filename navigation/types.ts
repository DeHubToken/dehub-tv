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
}

export type RootStackParamList = {
  Browse: undefined;
  Player: PlayerParams;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
