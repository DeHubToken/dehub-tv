# QR pairing — the flow, and what it needs

Email-and-code works and ships today. This is the better flow for the common
case: someone already signed in on their phone, who should not have to type an
address on a D-pad keyboard at all.

**Nothing here exists yet.** `src/pair/` in `dehub-stream-backend` is the
Omegle-style random chat system and is unrelated — it shares only the word.

## The shape

```
TV                          backend                        phone / dehub.io
 │                              │                                │
 ├─ POST /tv/pair/start ───────►│                                │
 │◄─ { pairingId, code,         │                                │
 │     expiresAt }              │                                │
 │                              │                                │
 │  renders code + QR of        │                                │
 │  dehub.io/link?code=WXYZ-42  │                                │
 │                              │         scans / opens ─────────┤
 │                              │◄─ POST /tv/pair/approve ───────┤
 │                              │   Bearer <their DeHub token>   │
 │                              │   { code }                     │
 ├─ GET /tv/pair/status ───────►│                                │
 │◄─ { status: 'approved',      │                                │
 │     token, refreshToken }    │                                │
```

## Why it is shaped this way

**The TV polls; it is never pushed to.** A socket would be tidier and is not
worth it — the TV is the only party that needs the answer, the window is about
two minutes, and a five-second poll over that window is a handful of requests.
It also degrades correctly on the flaky living-room wifi these boxes ship with.

**The phone sends the identity, the TV never sees one.** Approval is a normal
authenticated call from a device that already has a session. The TV's half is
unauthenticated by construction — it has nothing to authenticate with yet — so
everything that decides *who* is being signed in happens on the phone's side of
the exchange.

**The code has to be short, and that is a real constraint.** Eight characters in
two groups (`WXYZ-42K8`) is what someone can read across a room and type on a
phone if the camera fails. Short codes are guessable, so the security is not in
the code's entropy — it is in the two-minute expiry, a single-use row, and a
strict rate limit on `approve`. Say 10 attempts per account per minute.

**Approval must name the device.** The phone shows "Sign in DeHub TV (SHIELD
Android TV)?" before it approves, using the `X-Device-Name` the TV sent at
`start`. An approval prompt that does not say what is being approved trains
people to approve anything.

## What each repo needs

**`dehub-stream-backend`** — a small module, roughly the size of `email-link`:

- `models/TvPairSession.ts` — `{ code, pairingId, deviceId, deviceName, status,
  address?, approvedAt?, expiresAt }` with a TTL index on `expiresAt`, so
  expired rows evaporate rather than needing a sweeper.
- `POST /tv/pair/start` — unauthenticated, throttled hard by IP. Returns the
  code and pairing id.
- `GET /tv/pair/status?pairingId=` — unauthenticated. Returns `pending`,
  `expired`, or `approved` **with the token pair, exactly once**; a second read
  gets `consumed`. Handing out a token twice makes the code replayable.
- `POST /tv/pair/approve` — `AuthGuard`, throttled per account. Marks the row
  approved and mints the pair via the same path `supabaseAuth` uses, so the TV
  ends up with the same non-spending session and the same `X-Device-Id`-keyed
  Active sessions row it would get from the email flow.

Note `master` is branch-protected with auto-merge off — `gh pr merge --admin` is
the route.

**`dehub-mobile`** — a scanner and an approval sheet. `expo-camera` is already a
dependency, so this is a screen, not a new native module. Reached from a deep
link (`dehub://link?code=`) so the QR can open it directly, and from a menu item
for the camera-failed case.

**`dehubweb`** — a `/link` route doing the same thing with a typed code, so a
laptop works when no phone is to hand. It is also what the QR's URL points at,
which means a phone with no DeHub app installed still lands somewhere useful.

**`dehub-tv`** — a QR panel beside the email form on `SignInScreen`, and a
poller. Rendering the QR needs a generator; `react-native-qrcode-svg` pulls in
`react-native-svg`, which is a native module this app has so far avoided — the
cheaper option is to have the backend return a QR as a data URI at `start`, so
the TV renders an `<Image>` and stays free of it.

## What it does not change

Pairing is a second door to the same room. It produces the same session the
email flow produces: watch, not spend; revocable from Settings → Active
sessions; no wallet key on the television. If a future change to `approve` would
issue anything stronger than that, it is the wrong change.
