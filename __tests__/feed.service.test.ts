/**
 * The feed's field quirks, which are the ones that silently produce wrong
 * numbers rather than errors.
 *
 * Every case here is a trap the API actually sets: three disagreeing like
 * counts, a view count that must not be summed, and a `postType` allow-list
 * that fails open on the server.
 */
import {
  resolveLikeCount,
  resolveViewCount,
  creatorName,
  isPlayableOnTv,
  type FeedItem,
} from '../services/feed.service';

const base: FeedItem = { postType: 'video' };

describe('resolveLikeCount', () => {
  it('prefers totalVotes.for, the only real one', () => {
    // Token 2008 on production: totalVotes 354, reactionCounts 354, and a
    // stale `likes` scalar of 121. Reading the scalar invents a bug.
    expect(
      resolveLikeCount({
        ...base,
        totalVotes: { for: 354, against: 1 },
        reactionCounts: { like: 354, dislike: 1 },
        likes: 121,
      }),
    ).toBe(354);
  });

  it('falls back to reactionCounts when there is no split', () => {
    expect(resolveLikeCount({ ...base, reactionCounts: { like: 12 }, likes: 3 })).toBe(12);
  });

  it('reaches the legacy scalar only when nothing else is there', () => {
    expect(resolveLikeCount({ ...base, likes: 7 })).toBe(7);
  });

  it('is zero, not NaN, on a post with no engagement at all', () => {
    expect(resolveLikeCount(base)).toBe(0);
  });

  it('keeps a genuine zero rather than falling through it', () => {
    // `0` is falsy, so a `||` chain here would skip a real zero and report the
    // stale scalar instead.
    expect(resolveLikeCount({ ...base, totalVotes: { for: 0 }, likes: 99 })).toBe(0);
  });
});

describe('resolveViewCount', () => {
  it('reads totalViews, which already folds the signed-out half in', () => {
    expect(resolveViewCount({ ...base, views: 100, totalViews: 825 })).toBe(825);
  });

  it('never sums the two', () => {
    expect(resolveViewCount({ ...base, views: 100, totalViews: 825 })).not.toBe(925);
  });

  it('falls back to views when totalViews is absent', () => {
    expect(resolveViewCount({ ...base, views: 42 })).toBe(42);
  });

  it('keeps a genuine zero', () => {
    expect(resolveViewCount({ ...base, totalViews: 0, views: 50 })).toBe(0);
  });
});

describe('creatorName', () => {
  it('prefers a display name, then a username', () => {
    expect(creatorName({ ...base, minterDisplayName: 'Last Chad', minterUsername: 'lastchad' })).toBe(
      'Last Chad',
    );
    expect(creatorName({ ...base, minterUsername: 'lastchad' })).toBe('lastchad');
  });

  it('reads the nested minterUser when the flat fields are missing', () => {
    expect(creatorName({ ...base, minterUser: { displayName: 'Nested' } })).toBe('Nested');
  });

  it('never renders undefined', () => {
    expect(creatorName(base)).toBe('DeHub');
  });
});

describe('isPlayableOnTv', () => {
  it('allows a finished transcode', () => {
    expect(isPlayableOnTv({ ...base, transcodingStatus: 'done' })).toBe(true);
  });

  it('rejects one still transcoding — its videoUrl 404s', () => {
    expect(isPlayableOnTv({ ...base, transcodingStatus: 'pending' })).toBe(false);
  });

  it('rejects locked and pay-per-view, which a keyless device cannot unlock', () => {
    expect(isPlayableOnTv({ ...base, streamInfo: { isPayPerView: true } })).toBe(false);
    expect(isPlayableOnTv({ ...base, streamInfo: { isLockContent: true } })).toBe(false);
  });

  it('allows a post with a bounty, which costs the viewer nothing', () => {
    expect(isPlayableOnTv({ ...base, streamInfo: { isAddBounty: true } })).toBe(true);
  });

  it('allows a post with no transcoding field at all', () => {
    // Posts predating the field are playable; treating absent as "not done"
    // would empty the rails of everything older.
    expect(isPlayableOnTv(base)).toBe(true);
  });
});
