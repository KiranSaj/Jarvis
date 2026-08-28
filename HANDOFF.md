# Handoff

**Item:** Phases 3 (weather) and 4 (music), both written, gates green, **never run in a
browser.**
**State:** `node check.mjs` → 26 checks. JS parses. Everything uncommitted.

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

`index.html`, `check.mjs`, `CLAUDE.md`, `BACKLOG.md`, `HANDOFF.md`. Nothing committed.
