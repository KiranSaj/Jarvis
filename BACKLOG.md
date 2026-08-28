# Backlog & project state

Living document. `CLAUDE.md` is the stable brief — the safety rules, the architecture, the
things that cost hours to learn. **This** file is the moving part: what is done, what is
queued, what is blocked. A cold session should be able to read `HANDOFF.md` plus this file
and continue without asking anything.

**Last updated:** 2026-08-28 (first browser run: Phase 3 verified, player initialises)

---

## 1. Where we are

| | |
|---|---|
| Branch | `main`. All work inline, no feature branches. |
| Gates | `node check.mjs` → 26 checks passed (101 jokes, 6 block rules). JS parses. |
| Runtime | Desktop Chrome 151 only, never the phone. Three runs on 2026-08-28, one on 2026-08-29, plus a mic-free driven run on 2026-08-28 that exercised Phase 3 and the music plumbing through `dispatch()`. The 08-29 run confirmed the self-loop fix and produced the arm-timing measurement below. |
| Current item | **Phase 3 (weather) verified in a browser** on 2026-08-28 — geocoder, live fetch, cache, the `not` rule and the failure path all exercised through `dispatch()`. **Phase 4 (music) is verified only as far as an empty `TRACKS` allows**: the player initialises and the no-tracks path speaks, but nothing has played. The arming work is still unverified. See `HANDOFF.md` for the run that remains. |
| Blocked | Nothing. **On-device speech recognition is now `"available"`** as of the 2026-08-28 browser run — the en-GB pack arrived, and boot logs `recognition live on Chrome's own microphone, on-device model`. It was `"unavailable"` for every prior session, so every transcription measurement in this file predates the recogniser now in use. |

## 2. Done

**Phase 0 — own the microphone stream.** The app opens `getUserMedia` with echo
cancellation and holds it, instead of letting Chrome open one privately inside
`SpeechRecognition`. `prepareOnDevice()` checks for the on-device model and switches to it
in the background if the language pack ever arrives.

`USE_TRACK_INPUT` is **off**. Chrome 151 accepts `start(track)` — the probe in
`aec-test.html` proves it is not merely ignoring the argument — but recognition then
returns nothing at all. Nothing depends on it: the reason for owning the stream is to
measure it, and the meter reads `micStream` directly.

**Phase 1 — barge-in.** He interrupts by talking; no keyword. A level threshold on the
cancelled stream, plus a pitch check so only a voice unlike JARVIS's counts, plus the
spacebar as push-to-interrupt which also reports what the gate missed. Ships **off**, as it
always has.

**Phase 2a — voice roster.** Enrolment in Settings and identification on every phrase, both
working.

**He answered himself once, and the echo memory is why.** In the third run of 2026-08-28 his
own reply came back as a final 1218 ms after a barge and was dispatched to the model. Replayed
through the app's own `echoRun`, that text scores 1.000 against itself — the comparison was
never the problem, the single `recentSpeech` string it compares against was empty.
`stopSpeaking()` sets it from `spokenNow` and then clears `spokenNow`, so a second call blanks
it. It is now `spokenHistory`: the last `SPOKEN_MEMORY` (3) lines with timestamps, appended by
`rememberSpoken()`, which ignores empty writes and de-duplicates the start-of-utterance and
end-of-utterance write of the same line. `isEcho()` takes the best run across everything still
in the window, and logs `not his voice: best run N% against M recent lines` whenever it lets
something through with an interruption live — the line whose absence made this take a replay to
diagnose.

**The room does not get to talk to him.** Two sentences of other people's conversation reached
the model in the same session, both by matching `WAKE` ("i will transfer it to jarvis") on
audio the roster never saw, because the meter does not collect while he is talking. The
no-fingerprint allowance now requires somebody to be *armed*, not merely to have said his name:
the arm was set either by an utterance that passed the gate or by an interruption, and an
interruption has no fingerprint by construction. Cost: "Jarvis, open up" shouted across the room
while he is mid-sentence needs saying twice.

**The barge arm lasts as long as Chrome takes.** The second run of 2026-08-28 fired the level
gate for the first time and still lost the command: `armed window expired (the interruption)`
printed before the speaker's final arrived. The barge path now arms for `ARM_MS` like the wake
word, and `echoCompareUntil` keeps his own words comparable for exactly as long — without that,
the transcript most likely to land in the widened window is his own tail, which is the loop.

**The household is not a stranger.** SKS and Shree share a home and a timbre; margins of 0.005
and 0.026 had the pilot ignored twice on a command he had just been answered on. When everyone
within `ROSTER_MARGIN` of the top is enrolled and allowed, the gate stops trying to decide which
of them it is. A stranger landing between two enrolled voices is kept out by `cohesion()` —
how alike that person's own enrolment takes are, which is a bar the roster calibrates itself
rather than an absolute similarity threshold. Somebody with fewer than two takes abstains.

**A railed pitch no longer refuses the pilot.** The run of 2026-08-28 rejected the single word
"jarvis." from an enrolled voice: the timbre had him at margin 0.104 and the pitch veto threw it
out on 400 Hz — `PITCH_MAX_HZ` exactly, the detector railing on a sibilant. `railed()` now
marks either rail as "not measured"; `finishTake()` drops those reads and can return `f0: 0`,
`identify()` skips the veto when either side is unmeasured, and enrolment refuses a take with no
usable pitch rather than silently disabling that person's veto for good.

**The pitch gate reads his real voice.** `pitchHz()` was exonerated first — lifted into Node
it reads synthetic sawtooth and missing-fundamental voices from 83 to 325 Hz true, with noise,
so the octave-low number came from sampling only the 400 ms onset. Onset and settled samples
are now separate buckets. Covered by two checks in `check.mjs`, both mutation-tested.

**Phase 2b — roster gating.** `mayCommand()` decides, behind `cfg.gate` (defaulted to
"anyone"); per-person Listens/Ignored; unknown voices ignored in silence unless they used the
wake word, which earns one refusal per 30 s. It rejects only on positive evidence — an
utterance with no fingerprint is allowed, because a short command can finish before
`TAKE_MIN_FRAMES` of voiced frames exist. Covered by two checks in `check.mjs`.
**Awaiting one real run with a second person in the room.**

### The measurements everything rests on

From `aec-test.html`, on the cancelled stream:

| | |
|---|---|
| Room, silent | −63.8 dB |
| JARVIS talking alone | −66.0 dB (ERLE 32.8 dB) |
| Someone talking over him | −33.8 dB (ERLE 5.0 dB) |

The canceller backs off when it hears a second voice, which is why a level check works at
all. `speechSynthesis` is cancelled, so it stays — no in-page TTS rewrite needed.

From `voices-test.html`: MFCC fingerprint, 14 of 14 held-out takes correct under
leave-one-out, tightest margin 0.073.

### Decisions that were reversed by measurement

- **JARVIS is not on the roster.** The original design enrolled him and permanently ignored
  him. Three attempts to record him through the cancelled stream collected *zero voiced
  frames* — the canceller puts him below the activity floor and the residue is not
  periodic. There is nothing there to tell apart. He is handled by the canceller plus a
  pitch gate that relearns him every utterance.
- **Absolute similarity carries almost no information.** One take scored 0.635 against its
  own speaker and still identified them correctly, because the runner-up was 0.162 further
  away. The decision is nearest-match-with-a-margin, never a threshold.
- **The first fingerprint design encoded pitch, not timbre** — log-spaced bands narrower
  than the harmonic spacing. Replaced with MFCCs; the DCT is what separates the vocal tract
  from the harmonic comb.

## 3. Queued

**Phase 5 — space and science news.** NASA/ESA feeds, which avoid the trap a general news
feed walks into: on any day the top stories are war, crime and death, and the `BLOCK` list
would correctly reject nearly every headline, so he would ask for news and get silence.
RSS has no CORS, so add a `handle /feeds/*` block to the `Caddyfile` — which also keeps any
future key out of the client. Cache 30 min; run each headline through `contentOK()`
individually and skip failures rather than dropping the batch.

## 4. Carried debt

- **Nobody has heard what the recogniser transcribes with a track playing.** The whole music
  rule — `musicOn` suspending the meter, the gates and the arms — rests on the assumption that
  a song produces a stream of arbitrary finals. That is near-certain and completely unmeasured.
  The first run with music should simply watch how many
  `music is playing - ignoring "..."` lines appear per minute and what they contain.
- **Music and the level gate have never been in the same room.** With `cfg.barge='on'` and a
  track playing, the gate is now suspended outright rather than adjusted, because `bargeFloor`
  and `jarvisF0` would both become properties of the song. That means **barge-in does not work
  while music plays** — deliberate, and worth knowing before wondering why.
- ~~**A `YT.Player` in a hidden container may never fire `onReady`.**~~ Closed by the
  2026-08-28 browser run: `music: player ready` appears at boot and `playerReady` is `true`.
  Parking it off-screen works. Noted while confirming it — the line logs **twice** from one
  `<iframe id="tube">`, so `onReady` fires twice on a single player. Harmless (it re-sets a
  boolean); recorded because a duplicate player would not have been harmless.
- **Three of this session's fixes each introduced a new blocking bug**, every one caught by
  review rather than by the checks: a rule written below `mayCommand`'s `cfg.gate`
  short-circuit and therefore inert; a fingerprint rule that refused the pilot by his own
  household; a null identification that trapped the helmet with the music unstoppable; and an
  overlay that swallowed the gear. The pattern is worth naming — the fixes in this area are
  where the bugs are, not the features.

- ~~**Phase 3 has never fetched anything from inside the browser.**~~ Mostly closed by the
  2026-08-28 browser run: the geocoder resolved a town name in 59 ms over real `fetch` with
  CORS clean, the forecast fetched and spoke, a second ask hit `weather from cache`, the `not`
  rule kept `what is rain` on the model path, and a forced `fetchJSON` throw produced
  `weather failed:` plus a calm spoken line rather than silence. **Still unrun: `locate()`.**
  The run set coordinates directly, so the geolocation permission prompt has still never been
  seen — and on the helmet it will appear over the HUD.
- **`cfg.live` off means weather questions still reach the model**, which answers them
  confidently and wrongly. That is today's behaviour and the toggle is what changes it, but
  "off" is not "he declines" — it is "he guesses".

- ~~**`awaitingCommand` has no timeout.**~~ Closed: arming runs through
  `armForCommand(why, ms, weak)` with an expiry — `ARM_MS` (8 s) after a wake word,
  `ARM_BARGE_MS` (12 s) after a barge, `FOLLOWUP_MS` (6 s) after a reply.
- **How late Chrome finalises is still not bounded.** Two real interruptions, two very
  different answers: 1218 ms on 2026-08-28 and **5782 ms on 2026-08-29**, in the same room,
  on the same build. `ARM_BARGE_MS` is 12 s because 8 s was 72% consumed by the larger of
  those, but two samples do not describe a distribution and there is no reason to think 5782
  is the ceiling. Every run should read the `(NNNN ms after the interrupt)` figure and add
  it here. If one ever approaches 12000, raise `ARM_BARGE_MS` and `echoCompareUntil`
  together — they are the same number for a reason.
- **The follow-up window is a weak arm, and weak is doing real work.** After every reply he is
  armed for `FOLLOWUP_MS`, so a conversation continues without the wake word. Unlike the
  wake-word and barge arms it does **not** waive `mayCommand()`'s fingerprint requirement,
  because it is set by him having finished talking rather than by anyone having addressed him,
  and it is live during exactly the seconds the room is most likely to speak. Consequence, and
  it is deliberate: **with the gate on, a genuine follow-up too short to fingerprint
  (`TAKE_MIN_FRAMES`) is dropped.** Unmeasured — the log line for it says
  `no fingerprint and nobody strongly armed`, and how often that fires on him rather than on
  the room is the thing to count on the next run.
- **The pitch learner follows the room when the room is talking.** The third 2026-08-28 run
  swung between 125 and 273 Hz for "his" pitch with people talking under the barge threshold,
  and 2026-08-29 read 231, 214, 179 and 169 Hz (right for Ryan) but also **83 Hz from 7
  settled samples** on a quiet utterance — peak −41.1 dB against a −67.7 floor. So the
  `F0_OVER_FLOOR_DB` rule stopped it profiling the room on loud speech and does not on quiet
  speech. That is a sample-count problem, not a threshold to nudge. The quiet-frame
  filter cannot tell his leakage from a person who is simply not loud, and this is the known
  fail-towards-missing-an-interrupt direction.
- **An ambiguous identification chains a follow-up window indefinitely.** `earnsFollowUp()`
  treats `sure || ambiguous` as placed, matching what `mayCommand()` admits — without that,
  a conversation would work for one turn and then silently stop for the two people who live
  together, which is the household this was built for. The consequence is that the one-turn
  bound does not apply to an ambiguous phrase, so the only thing between that and an unbounded
  armed window is `cohesion()` in `identify()`, **which has never run with a second person in
  the room**. Nothing to change statically. The evidence that settles it is a logged run with
  two people talking: count how often `too close to call` fires, and whether it ever fires on
  a voice that is not in the roster at all.
- **One identification scored 0.663** — background chatter matched to an enrolled voice that is
  allowed. Nothing consults absolute similarity, by measurement (see above); the
  `decided on timbre alone` and `too close to call` lines are the instruments for judging how
  often this matters before changing it.
- **The keyword-interrupt path bypasses the gate.** `tryInterrupt()` dispatches with no
  identification, because the meter does not collect while he is talking. With gate on and
  barge on, an Ignored voice can reach `dispatch()` by interrupting him with a keyword.
- **A `let` inside the block `check.mjs` lifts makes its assertions vacuous.** A top-level
  `let` in a `vm` script is lexically scoped to that script, so the sandbox's writes to it are
  ignored and the binding keeps its initial value forever. `armStrong` was declared that way
  and every strong/weak assertion passed without testing anything. `check.mjs` now asserts the
  lifted block declares neither `armStrong` nor `wantFollowUp` — but the same trap is open for
  any future flag, and the general lesson is that a new check should be mutation-tested (flip
  its expectation, confirm it fails) before it is believed.
- **No automated coverage of the echo/arming invariants.** `isEcho(tail, true)` and the armed
  window are testable from `check.mjs` the way `mayCommand()` now is. Partly addressed: the
  strong/weak arm distinction is now asserted in both sandboxes, but nothing tests that
  `echoCompareUntil` actually covers the window `armForCommand()` opened, which is the
  invariant the self-loop fix rests on.
- **The pitch gate reads him when there is anything to read.** The second 2026-08-28 run logged
  164 and 169 Hz from settled samples, which is right for Ryan at `u.pitch = 0.85`, and
  `not measured` on the quieter utterances. On those, `soundsLikeJarvis()` is inert and the
  level gate is the only thing standing between his leakage and a false barge.
- **Timbre-only identification has no absolute floor.** When a phrase has no usable pitch the
  decision is nearest-match on timbre alone, so a stranger need only out-rank the second-best
  enrolled voice. Deliberate: the roster measurements show absolute similarity carries almost no
  information (a correct take scored 0.635). The `decided on timbre alone` log line is there to
  count how often it happens before anything is changed — and on the 2026-08-29 run it did not
  appear once, so pitch was measurable on every take and this path is rarer than feared.
- **`service` is a wake-word variant that false-triggers on ordinary speech.** Roster gating
  may make the wake word redundant enough to drop the variant — but do not remove the wake
  word until the roster has been measured in real use.
- **No transcript logging.** There is still no way to review what he asked or what the model
  answered.
- **ESP32 firmware is not in this repo** and has never been tested with the app.
- **Never run on the actual phone.** Everything so far is desktop Chrome, and the two
  desktop-only APIs the audio path leans on (`start(track)`, on-device recognition) do not
  exist on Android. The helmet will need the physical BLE button.
