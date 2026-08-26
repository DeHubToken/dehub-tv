/**
 * CDN URL rules.
 *
 * Both of these fail silently rather than loudly: rewriting a URL that is not
 * ours 404s the image, and dropping a width quietly serves a multi-megapixel
 * original to a 176dp tile. Neither shows up as an error anywhere.
 */
import {
  cdnImage,
  cdnPath,
  posterUrl,
  avatarUrl,
  videoUrl,
  livepeerHls,
  livepeerHlsCandidates,
  livepeerThumbnail,
} from '../lib/media';

const CDN = 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com';

describe('cdnImage', () => {
  it('returns the original untouched when no width is asked for', () => {
    // Opt-in sizing: a call site nobody has measured cannot silently lose
    // quality, and the fullscreen viewers rely on getting originals.
    expect(cdnImage(`${CDN}/images/1.jpg`)).toBe(`${CDN}/images/1.jpg`);
  });

  it('routes our own CDN through the resizer when a width is given', () => {
    const out = cdnImage(`${CDN}/images/1.jpg`, { width: 176 });
    expect(out).toContain('https://dehub.io/cdn-cgi/image/');
    expect(out).toContain(`${CDN}/images/1.jpg`);
    expect(out).toContain('format=webp');
  });

  it('leaves a foreign host alone even when a width is given', () => {
    // The zone only allows the Spaces host as a remote source. Rewriting an
    // imgur channel logo or a Supabase stage cover 404s it.
    const imgur = 'https://i.imgur.com/cDAsrBl.png';
    expect(cdnImage(imgur, { width: 200 })).toBe(imgur);

    const supabase = 'https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/x.png';
    expect(cdnImage(supabase, { width: 200 })).toBe(supabase);
  });

  it('asks for webp rather than auto', () => {
    // Native loaders do not advertise AVIF the way a browser does, so `auto`
    // would quietly degrade to JPEG.
    expect(cdnImage(`${CDN}/a.jpg`, { width: 100 })).not.toContain('format=auto');
  });

  it('is empty for nothing', () => {
    expect(cdnImage(null)).toBe('');
    expect(cdnImage(undefined, { width: 100 })).toBe('');
  });
});

describe('cdnPath', () => {
  it('joins a bare relative path onto the CDN', () => {
    expect(cdnPath('images/2581.jpg')).toBe(`${CDN}/images/2581.jpg`);
  });

  it('tolerates a leading slash without doubling it', () => {
    expect(cdnPath('/images/2581.jpg')).toBe(`${CDN}/images/2581.jpg`);
  });

  it('passes an already-absolute URL straight through', () => {
    expect(cdnPath('https://elsewhere.test/x.jpg')).toBe('https://elsewhere.test/x.jpg');
  });
});

describe('posterUrl', () => {
  it('reads the fields in the order the API populates them', () => {
    expect(posterUrl({ thumbnail: 'a.jpg', imageUrl: 'b.jpg' })).toContain('a.jpg');
    expect(posterUrl({ imageUrl: 'b.jpg' })).toContain('b.jpg');
    expect(posterUrl({ imageUrls: ['c.jpg'] })).toContain('c.jpg');
  });

  it('returns empty rather than a broken URL when there is no artwork', () => {
    // Callers branch on falsiness — a card with a broken image is worse than
    // one with a placeholder.
    expect(posterUrl({})).toBe('');
    expect(posterUrl(null)).toBe('');
  });
});

describe('avatarUrl', () => {
  it('re-bases a bare avatar filename onto the CDN', () => {
    expect(avatarUrl('avatars/0xabc.jpg', 64)).toContain('/avatars/0xabc.jpg');
  });

  it('does NOT reduce an absolute URL to its last path segment', () => {
    // The trap: `split('/').pop()` on a dicebear or Supabase URL and re-basing
    // it onto our CDN 404s every one of them.
    const absolute = 'https://api.dicebear.com/7.x/identicon/svg?seed=abc';
    expect(avatarUrl(absolute, 64)).toBe(absolute);
  });
});

describe('videoUrl', () => {
  it('builds from a tokenId of either type', () => {
    expect(videoUrl(2581)).toBe(`${CDN}/videos/2581.mp4`);
    expect(videoUrl('2581')).toBe(`${CDN}/videos/2581.mp4`);
  });

  it('is empty for a missing tokenId rather than building videos/undefined.mp4', () => {
    expect(videoUrl(null)).toBe('');
    expect(videoUrl(undefined)).toBe('');
    expect(videoUrl('')).toBe('');
  });
});

describe('livepeer', () => {
  it('builds the studio URL', () => {
    expect(livepeerHls('abc123')).toBe('https://livepeercdn.studio/hls/abc123/index.m3u8');
  });

  it('offers the legacy host as a fallback, studio first', () => {
    const candidates = livepeerHlsCandidates('abc123');
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toContain('livepeercdn.studio');
    expect(candidates[1]).toContain('livepeercdn.com');
  });

  it('is empty without a playback id', () => {
    expect(livepeerHls(null)).toBe('');
    expect(livepeerHlsCandidates(undefined)).toEqual([]);
    expect(livepeerThumbnail('')).toBe('');
  });
});
