# Handoff

**Item:** Phases 3 (weather) and 4 (music), both written, gates green, **never run in a
browser.**
**State:** `node check.mjs` → 26 checks. JS parses. **Committed** as `0ead3fb`; working tree
clean. Committed is not verified — nothing below has run in a browser.

Three unverified bodies of work now sit in one tree: the arming/follow-up work from earlier
today (reviewer APPROVED), Phase 3, and Phase 4 (reviewer APPROVED on round 4, after
CHANGES_REQUESTED three times).

---

## 1. Phase 4 — music

A fixed `TRACKS` list of YouTube ids driven by `LOCAL` commands. `TRACKS` **ships empty**: a
guessed eleven-character id is not a broken link, it is an unknown video playing inside a
helmet on a child's head. Add ids by editing the list or pasting links into Settings →
**Music**, one per line as `name = link`. Named tracks must say "song" or "track" ("play the
dinosaur song"), because a bare `play X` catch-all swallowed "play a game".

**`musicOn` gates the entire listening path, and this is the safety rule of the phase.** A
loudspeaker three inches from the microphone means every lyric arrives as a final, and `LOCAL`
contains `open up`, `lights off` and `battle mode`. While a track plays:

- the meter stops collecting fingerprints (`startTrack()` also drops any half-built take);
- the level and pitch gates are **suspended outright**, so barge-in does not work during music
  — `bargeFloor` and `jarvisF0` would otherwise become properties of the song;
- `handleSpeech()` requires `WAKE_STRICT` (no `service`, a known false trigger) and honours no
  arms, because an arm is a claim about who is talking and nothing knows that any more;
- `onresult` passes **`undefined`**, never `null`. `null` means "the roster refused this
  voice", and passing it there made the helmet refuse *every* command including "stop the
  music", with no way out but a reload. `check.mjs` asserts the caller, not just the contract.

Escape hatch that is not voice: a **STOP MUSIC** button beside the player, bottom-left. It
ships hidden and appears only while something is playing. Neither box goes near `#gear`
(bottom-right) any more - an overlay there swallowed every press on it, and `#gear` is the only
way into Settings. The player is 200x200 because that is YouTube policy's minimum, and the stop
button sits beside it rather than over it because a transparent div across a playing video is
the "obscured" case the same policy calls out.

**Unverified assumption, and the first thing to check in a browser:** the player is parked
off-screen when idle rather than `display:none`, because a `YT.Player` built inside a hidden
container may never reach `onReady` - and if it does not, `playerReady` stays false and every
request answers "the music player is still waking up" for the life of the page. The console
logs `music: player ready` when it works.

## 2. Phase 3 — weather

`LIVE` list between `LOCAL` and `ask()`, behind `cfg.live`, defaulted off. Not a model
tool-call — the numbers come from Open-Meteo and the sentence is assembled from a fixed
vocabulary. Entries may carry a `not` that keeps explanations ("what is rain") out of the
forecast. Location is geolocation-once or a town name typed in Settings. Verified from
PowerShell against the live API: field names and `Access-Control-Allow-Origin: *` on both
hosts. It says `An 82 percent`, not `A 82` — it is spoken, never read.

## 3. The run these need

**Music, and do this one first — it is the one with a helmet on a head.**

1. Add two or three tracks in Settings. Boot log should read `MUSIC 2 TRACKS`.
2. "Play some music." Then **say ordinary things while it plays** and watch the log fill with
   `music is playing - ignoring "..."`. Read what it ignored — that is the first measurement
   of what a song actually transcribes as, and the assumption the whole rule rests on.
3. "Jarvis, stop the music" must work. If it does not, that is the trap from round 2 back
   again — check for `no fingerprint and nobody strongly armed` in the log.
4. **Hold the gear.** Settings must open, with music playing and with it stopped.
5. Tap **STOP MUSIC**: music stops.
6. Watch for `music: player ready` in the console at boot. If it never appears, the off-screen
   player never initialised and every music request will say he is still waking up.

**Weather.** Turn Live answers on, set a location. Ask; expect `live:` then `weather:` then an
answer. Ask again inside ten minutes for `weather from cache`. **Then turn the wifi off and
ask again** — expect `weather failed:` and a calm spoken line, not silence and not a hang.

**Arming**, still outstanding from earlier today: read `(NNNN ms after the interrupt)` — 1218
and 5782 ms so far, and near 12000 means `ARM_BARGE_MS` and `echoCompareUntil` both need
raising together. Count `follow-up window, but this voice is not the one he was talking to`.

## 4. What to be suspicious of

Three of this session's fixes each introduced a new blocking bug, every one caught by review
rather than by the checks: a rule written below `mayCommand`'s `cfg.gate` short-circuit and so
inert on the shipped build; a fingerprint rule that refused the pilot by his own household; a
null identification that trapped the music on; an overlay that swallowed the gear. **In this
area the fixes are where the bugs are, not the features.**

**Mutation-test every new check before believing it.** Four checks written this session passed
without testing anything until they were flipped and confirmed to fail — one because a `let`
inside the lifted block shadowed the sandbox global, one because a regex's escapes had been
mangled into literal backspace characters, and two because the sandbox's gate was set to a
value that refused the input before the rule under test could run.

## Then

Phase 5 — space and science news. `BACKLOG.md` §3. Needs a `handle /feeds/*` block in the
Caddyfile, because RSS has no CORS.

## Files touched this session

`index.html`, `check.mjs`, `CLAUDE.md`, `BACKLOG.md`, `HANDOFF.md` — all in `0ead3fb`.

## Session of 2026-08-28 (background job): first browser run

Driven through Chrome on `http://localhost:8000/` (literal `localhost`, so a secure context).
Gates green, 26 checks. Everything below was reached without a microphone, by calling
`dispatch()` — the same entry point the voice path calls, so everything downstream of
recognition is genuinely under test. Settings were changed **in memory only and never saved**;
a reload restored the shipped defaults.

**Settled — the off-screen player initialises.** `music: player ready` appears at boot and
`playerReady` is `true`. Parking the `YT.Player` off-screen rather than `display:none` works.
That was §1's "unverified assumption, and the first thing to check in a browser".

**New, and it changes a Blocked row: on-device recognition is now `"available"`.** Boot logs
`recognition live on Chrome's own microphone, on-device model`. The en-GB pack that Windows
did not have has arrived on this machine. This is the fix for the recurring
`recognition error: network` dropouts — but it means **every voice measurement taken before
today was taken on a different recogniser**, so treat old transcription behaviour as stale.

**Phase 3 is verified in a browser, end to end.** Geocoder resolved "London" in 59 ms over
real `fetch` with CORS clean; `weather: 18.9 C, code 61, rain 85%`; a second ask logged
`weather from cache`; `what is rain` logged `-> model:` and never reached the forecast, so the
`not` rule holds; and with `fetchJSON` forced to throw, `weather failed:` printed and it spoke
*"I cannot reach the weather station just now, sir."* — a calm named line, no silence, no hang,
and the `navigator.onLine` arm chosen correctly. The spoken article rule is real: it said
**"An 85 percent"**.

**The gear is not swallowed.** `document.elementFromPoint()` at the gear's centre returns
`#gear` both idle and with the `#tubeStop` box forced visible, and a press-and-hold opened
Settings. The overlay bug from round 4 is genuinely fixed.

**Music plumbing, as far as an empty list allows.** `play some music` with `TRACKS` empty logs
`music: nothing in the list` and speaks *"I have no music loaded, sir. Add some in settings."*
`play a game` logs `-> model:` and is **not** swallowed by the music matcher.

### Then three tracks were added, and the music half ran

**The `musicOn` safety rule holds.** With a track "playing", `open up`, `lights off`,
`battle mode`, `at your service`, `open up the faceplate now` and `turn the lights off` were
every one ignored — the faceplate never moved, nothing was spoken. `jarvis stop the music` got
through and stopped it. The gear stayed reachable with music on, and STOP MUSIC stopped
playback on a real click. The round-2 trap (no way out but a reload) is not present.

**Music now plays, and the missing `origin` playerVar was why it did not.** Verified on the
merged build at `localhost:8000`: `getPlayerState() === 1`, `currentTime` advancing, 92 s of
audio out of the speakers, stopped cleanly by "jarvis stop the music". Before the fix the same
ids sat in BUFFERING with `getDuration() === 0` for over four minutes and `onError` never fired.

**Correction, recorded because it was briefly written down as fact:** an intermediate test
served the app from `http://127.0.0.1:8010`, where every track returned **player error 150**,
and that was reported as "the rights holder disallows embedding, these ids can never play". It
was wrong — 150 was an artefact of that test origin. The ids are fine.

**Three defects were found on the way there and are fixed** (see `BACKLOG.md` §2 for the full
reasoning): `parseTracks` silently turned a bare pasted link into a track *named after its own
URL*, which he read aloud as the title; the player was built without `origin`, which suppressed
`onError` entirely and turned an unplayable video into an unbounded **silent** buffer; and
nothing bounded "the track never started", so `musicOn` could stay true — gates suspended,
helmet name-only — for a song nobody could hear. All three fixed, `check.mjs` green at 26, JS
parses, and the new guard verified in the browser in both directions (fires when a load never
starts, silent after a deliberate stop).

### What is still unrun

- **What a *sung* song transcribes as** — the measurement the whole `musicOn` rule rests on.
  92 s of an instrumental Silvestri score produced zero `ignoring` lines, which is one sample
  of the easiest case: no words, and the echo canceller possibly removing the music before the
  recogniser sees it at all. A track with lyrics is the case the rule exists for.
- **The arm timing** `(NNNN ms after the interrupt)`, and anything needing a real voice.
- **`locate()`** — the run set coordinates directly, so the geolocation prompt is still unseen.
- A `reviewer` pass. `CLAUDE.md` asks for one on a finished diff touching the music safety
  path, and this diff does. It was not run this session.

## Session of 2026-08-30: weather said coordinates instead of a place, plus a widget

**Item:** he was hearing the raw `lat, lon` he'd typed (or a value carried over from a GPS
fix) spoken back as if it were a place name, and there was no visual for a weather answer
beyond the spoken line. Both fixed, **neither run in a browser.**

**Root cause of the coordinates bug**, found in `weather()`/`resolvePlace()`: Settings accepts
a bare `"lat, lon"` as a valid location (documented behaviour), and the Settings box also
pre-fills with raw coordinates whenever `cfg.place` is empty (i.e. right after a silent GPS
fix, before anyone ever types a town). `resolvePlace()` returned `label: ''` for that
coordinate case, and the save handler's `cfg.place = r.label || placeText` fell back to the
*typed digits* — so hitting Save for any reason (even just toggling Live on) after a GPS fix
would silently turn a coordinate pair into the "place" `weatherLine()` speaks. Two ways in,
same bug.

**Fix:** a new `reverseGeocode(lat, lon)` (BigDataCloud's client-side reverse lookup — no
key, CORS enabled, same guarantee this repo already leans on for Open-Meteo) resolves
coordinates to a real name, used from both `resolvePlace()` (typed `"lat, lon"`) and `locate()`
(a fresh GPS fix). `placeLabel(hit)` is the pure part (`city || locality ||
principalSubdivision || countryName || ''`), covered in `check.mjs` and mutation-tested. The
settings save handler no longer falls back to `placeText` at all (`cfg.place = r.label`) — a
failed reverse-geocode now means *no place is mentioned*, never that the digits get spoken.
That fallback-removal is the actual fix; the reverse-geocode call is what makes "no place
mentioned" the rare case instead of the common one.

**Unverified, and the first thing to check in a browser:** `api.bigdatacloud.net` has never
actually been called — this sandbox's egress proxy blocks every external host, `open-meteo.com`
included, so nothing live could be exercised this session. Ask a first weather question after a
fresh GPS fix and check the console for `location named: ...` (success) versus `reverse geocode
failed: ...` (falls back to no place, not to digits — confirm it never says a number). Then
type a bare `"51.5, -0.1"` into Settings → Location, Save, and ask again: same two outcomes,
never digits.

**Weather widget**, new: a dashboard-style card (`#wxCard`) — icon, temperature, place, rain
chance — shown the moment a weather question is asked (a pulsing "..." while the fetch is in
flight) and faded a few seconds after `speak()` finishes the answer. `speak()` now returns
`speakAwait()`'s promise (previously discarded) so the widget can time its fade off real speech
completion rather than a guess; checked every existing caller of `speak()` first — none used the
return value, so this is not a behaviour change anywhere else. `skyIcon(code)` groups WMO codes
the same way `skyPhrase()` does, covered in `check.mjs` by asserting each group shares one icon
and distinct groups don't collide — the first version of that check was vacuous (the fallback
icon makes "does it return something" untestable) and was mutation-tested into something that
actually catches a group falling through to the wrong icon.

**Unverified, and the second thing to check in a browser:** the card's placement (`top:3.6rem`,
centred, `width:min(72vw,300px)`) was reasoned from the CSS against the reactor's own
`top:50%` centring, never seen on a real phone screen — on a short one it may sit closer to the
reactor's top edge than intended. Also unconfirmed: that the fade-out actually fires (the
`speak().then()` chain depends on `speakAwait()`'s `finish()` resolving, which it always has
so far, watchdog included, but this exact chain is new).

**Files touched this session:** `index.html`, `check.mjs`, `HANDOFF.md`, `BACKLOG.md`.
