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

## Signing in

Two ways, pairing first.

### Pair with your phone

The TV shows an eight-character code; you type it into DeHub on a phone that is
already signed in; the TV collects a session. No typing on a remote.

There is deliberately **no QR code**. Rendering one needs either a native SVG
module this app has avoided or a thousand-odd nested views for the matrix — and
Netflix, Disney+ and Spotify all show a code and a short URL for the same
reason: a code works when the camera does not, when the phone is across the
room, and when someone is reading it out to another person. A QR is additive
later, not a rewrite.

It is a device-code flow, so it carries the device-code risk — approving a code
somebody *else* is displaying hands them a session for your account. The server
does what it can (two-minute expiry, ten approvals a minute, tokens minted only
at collection) and the approving client names the device it is authorising,
which is the part that actually stops it.

The two halves use different keys on purpose: approving needs the short code,
collecting needs a `pairingId` UUID only the television holds. So a code read
off a photograph signs the reader's *own* account into someone else's TV, and
never the other way round.

### Or email and a six-digit code

It adds no backend surface — all three hops already run in production:

1. `supabase.auth.signInWithOtp({ email })` mails the code
2. `supabase.auth.verifyOtp` turns it into a Supabase session
3. `POST web/auth/supabase` exchanges that for a DeHub token pair

Steps 1 and 2 are exactly what the phone app's primary email login already does,
which is also the evidence that the Supabase email template carries
`{{ .Token }}` — without it, mobile email sign-in would be broken today.

**The TV never holds a wallet key, and cannot spend.** The exchange endpoint
issues a session from the Supabase identity alone and, in the backend's own
words, "does not grant the ability to move funds". Tipping, posting and going
live still need a wallet unlock on a device that has the key. That is the right
trade for an appliance that sits in a shared room, is signed in for years, and
gets resold with the flat.

Three consequences worth knowing:

- **`shouldCreateUser: false`.** Mobile is a signup surface and creates the
  identity if it is missing; a TV must not. Signing up here would mint a second,
  empty DeHub account with a wallet the TV cannot hold.
- **A wallet-first account has no email until someone attaches one.** The
  exchange answers `409 WALLET_NOT_LINKED`, and the sign-in screen spells out
  the fix — dehub.io → Settings → Profile → Sign-in — because there is no way to
  do it from a television.
- **The Supabase session is discarded after the exchange.** What persists is the
  DeHub token pair, which is revocable from any other device. A lingering
  Supabase session would be a second, unrevocable way into the account sitting in
  a living room.

The TV sends `X-Device-Id` / `X-Device-Name` on every request, so it appears in
Settings → Active sessions as "DeHub TV" and can be signed out remotely.

## What a TV can and cannot do

This app is not, and should not become, feature-parity with the phone. The
surface splits four ways, and only one of those is a backlog.

**Can, and does.** Watch anything; browse and search videos, clips, livestreams,
replays and 700 IPTV channels; creator pages; react; save; follow. Every write
in that list is a plain bearer-token call — `/request_reaction`, `/savePost`,
`/request_follow` — with no wallet anywhere near it, which is exactly why a
keyless device may make them.

**Cannot, structurally.** Tipping, gifting, buying (PPV, plans, stores, dpay),
minting, posting, going live — everything on-chain. These need a wallet
signature, and the TV holds no key by design. This is the security model
working, not a gap to close. If a change here ever starts needing a signature,
it belongs on a phone instead.

**Could, but shouldn't.** DMs, comments, composing, community moderation. All
reachable over the same token, all requiring sustained typing on a D-pad
keyboard. A reply written at one character per two seconds is not a feature.

**Blocked on native modules.** Live audio Stages need Agora and livestream
publishing needs WebRTC; neither is worth building for the TV target. Stage
*recordings* are plain audio URLs and would play fine — that one is a real
backlog item.

The short version: roughly everything consumptive is reachable, everything
custodial is not, and the middle is a judgement call that mostly lands on "no".

## Tipping from the sofa

The TV cannot send a tip — it holds no key. What it does is **raise a request**
that the owner's phone approves and submits with the wallet it already has
unlocked (`dehub-stream-backend` PR #164, `tv/requests`).

What goes over the wire is **intent, never contract parameters**: the TV says
"100 DHB to this address, for this post" and the phone resolves the token
address, decimals, controller and chain. A television that could name a token
address is a television that could be talked into naming the wrong one.

Amounts are presets only. A free-text amount means typing digits on a D-pad,
and the least acceptable place for that is the screen deciding how much money
leaves your account.

The waiting state is the real screen here, not an afterthought — the user has
pressed a button and nothing further will happen on the television until they
pick up a different device. Said plainly and immediately, or the natural
reading is that the app broke and the natural next move is to press it again.

## Not built yet

- **The phone half of pairing.** `tv/pair/*` is live in production and this app
  shows a code against it, but nothing claims one yet — `dehub-mobile` needs a
  "Sign in a TV" screen. Until that ships, a pairing code will always expire.
- **The phone half of tipping.** `tv/requests` is live in production and the TV
  raises requests against it, but nothing answers them yet — `dehub-mobile`
  needs a pending-approvals surface that signs and reports the txHash back.
  Until that ships, a tip raised here will always time out.
- **An actual QR.** The code works and is what the big services do; a scannable
  version is a nicety on top, and costs either a native SVG module or a
  server-rendered image. See `docs/qr-pairing.md`.
- **Recently watched.** `GET /my_watched_nfts` already exists and is populated
  as a side effect of view reporting — so this is really "start reporting
  views", which is a data-integrity decision (see below) rather than a feature.
- **Stage recordings.** Live rooms need Agora, but a finished stage is an audio
  URL and would play today. Worth doing once there is more than one row in
  `audio_spaces`.
- **The nine-reaction picker.** The service already types the full set; the UI
  sends `like` only, because a nine-way choice is a lot of D-pad travel for a
  decision nobody makes from a sofa.
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
