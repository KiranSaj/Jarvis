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

**No sound was ever produced, and the reason is not the app.** All three tracks were official
Marvel/VEVO uploads and every one returned **player error 150** — the rights holder disallows
embedded playback. Those ids can never play in the helmet. **Before adding a track, check it
embeds**; an id that errors 150 is not a fixable app problem.

**Three defects were found on the way there and are fixed** (see `BACKLOG.md` §2 for the full
reasoning): `parseTracks` silently turned a bare pasted link into a track *named after its own
URL*, which he read aloud as the title; the player was built without `origin`, which suppressed
`onError` entirely and turned an unplayable video into an unbounded **silent** buffer; and
nothing bounded "the track never started", so `musicOn` could stay true — gates suspended,
helmet name-only — for a song nobody could hear. All three fixed, `check.mjs` green at 26, JS
parses, and the new guard verified in the browser in both directions (fires when a load never
starts, silent after a deliberate stop).

### What is still unrun

- **What a song actually transcribes as** — the measurement the whole `musicOn` rule rests on.
  It needs a track that embeds; none of the three did.
- **The arm timing** `(NNNN ms after the interrupt)`, and anything needing a real voice.
- **`locate()`** — the run set coordinates directly, so the geolocation prompt is still unseen.
- A `reviewer` pass. `CLAUDE.md` asks for one on a finished diff touching the music safety
  path, and this diff does. It was not run this session.
