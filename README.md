# DeHub TV

The DeHub client for televisions — Android TV and Fire TV first, tvOS from the
same source.

It is a lean-back app: browse rails with a remote, press OK, watch. Everything
it shows comes from the same production services the web and phone apps use, and
none of it needs an account.

---

## What it shows

| Surface | Source | Notes |
| --- | --- | --- |
| Trending / new / most-watched videos | `GET /feed` | ~780 videos |
| Quick clips | `GET /feed?postType=short` | duration-filtered videos, ~610 |
| Live streams + replays | `GET /live` | Livepeer HLS |
| Live TV | Supabase `tv_channels_verified` | ~700 free IPTV channels |
| Search | `GET /feed?search=` + channel search | videos and channels in one box |

## Why it is a separate app

`dehub-mobile` cannot become a TV app. It depends on WebRTC, Agora, Rive,
`react-native-argon2`, `react-native-quick-crypto`, image cropping and camera
modules — none of which build for the TV target, and none of which a TV needs.
More to the point, roughly nine tenths of that app is composing, chatting,
wallets and payments, which is the wrong shape for a device with a four-way pad
and no keyboard.

So this is a fresh, deliberately small app that speaks the same APIs. The pieces
worth keeping in step with the phone app — the CDN URL rules, the feed field
quirks, the IPTV filter list — are ported rule-for-rule and the comments say so,
because that is where drift causes real bugs.

## Things that are true about the data and are not obvious

These cost time to rediscover, so they are written down here and repeated at the
call sites.

- **`/feed` and `/live` answer unauthenticated.** That is what makes a
  signed-out TV worth switching on.
- **An unrecognised `postType` returns the entire feed, unfiltered.** The
  backend applies `if (contentFilter[postType]) …`. A lane asking for a type the
  deployed API does not know fills with everything and looks plausible. The
  allow-list in `services/feed.service.ts` is a hard boundary; widening it is a
  server-first change.
- **A feed item carries three disagreeing like counts.** `totalVotes.for` is
  real, `reactionCounts.like` agrees with it, and the bare `likes` scalar is
  legacy and stale. Go through `resolveLikeCount`.
- **`totalViews` already includes signed-out views.** Never add it to `views`.
- **Feed videos are progressive MP4, not HLS.** Only livestreams and IPTV are
  adaptive. A 83-second clip can be a 200 MB file, so bitrate on a weak
  connection is a real constraint on the video rails and not on the others.
- **There are no preview clips.** `previews/<tokenId>.mp4` 404s on production, so
  the hero is a still. If preview generation ever ships, `components/Hero.tsx` is
  the one place that changes.
- **`sortBy=likes` sorts on the legacy scalar**, so the "Most liked" lane is
  ordered by the same stale field described above. It is close enough to be
  useful and is not exact.

## Architecture

```
App.tsx                 fonts, splash, query client
navigation/             two routes: Browse (shell) and Player (push)
screens/BrowseScreen    persistent side nav + one section at a time
screens/PlayerScreen    fullscreen playback, custom D-pad chrome
components/Focusable    the focus ring — the only cursor a TV has
components/Rail|Grid    the two layouts, both focus-driven
services/               feed, live, liveTv, supabase
lib/media.ts            CDN + Cloudflare transform + Livepeer URL rules
config/theme.ts         monochrome palette, 10-foot type scale, overscan
```

**Focus is the whole interaction model.** `Focusable` exists so the ring is
consistent everywhere; `Rail` and `Grid` exist because a focused element must
scroll itself into view and must never be clipped or unmounted. Those two
failures — a clipped ring and a ring that vanishes when a `FlatList` recycles the
focused row — account for most of what makes a TV grid feel broken, and both are
handled in those components rather than at call sites.

## Running it

```bash
cp .env.sample .env
npm install
EXPO_TV=1 npx expo prebuild --clean
EXPO_TV=1 npx expo run:android
```

`EXPO_TV=1` is not optional. Without it the config plugin builds a phone app:
no leanback launcher intent, no TV banner, and the launcher will not show it.

To iterate on layout without a TV, the app runs in a normal Expo client — every
TV-only API is behind a soft import in `lib/tv.ts` and degrades to a no-op.
Focus behaviour obviously does not survive that trip, so anything focus-related
has to be checked on a real device or the Android TV emulator.

## Building

```bash
eas build --platform android --profile preview
```

`preview` produces a sideloadable APK with `EXPO_TV=1` set. `production` is an
app bundle for the Play Store's Android TV track.

Android TV store listings need their own artwork — the 320x180 banner in
`assets/tv-banner.png` is the launcher tile, and Play requires a separate 1280x720
feature graphic that is not in this repo yet.

## Not built yet

- **Sign-in.** Deliberate, not missing. Nobody should type a wallet address or a
  seed phrase on a remote. The shape this needs is a device-pairing code — TV
  shows a code, phone or dehub.io claims it, backend hands the TV a token — and
  the token plumbing in `lib/session.ts` is already in place for it, so it is
  additive rather than a refactor. Requires a backend endpoint.
- **Continue watching**, which needs the above.
- **Audio stages.** The table reads anonymously but exposes exactly one row, so
  a rail would be a rail of one. Worth adding when there is something in it.
- **Music.** Six `feed-audio` posts exist platform-wide.
- **Recommendations channel** — the Android TV home-screen row. Wants a real
  watch history first.
- **View counting.** The app reads view counts but does not report them. Left
  out on purpose until the app is actually released: a client under development
  writing into production engagement numbers corrupts the very metrics anyone
  would use to judge whether the TV app is worth keeping. Wire it to the same
  `anon-views` path web uses at release, not before.
