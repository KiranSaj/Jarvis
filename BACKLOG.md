# Backlog & project state

Living document. `CLAUDE.md` is the stable brief — the safety rules, the architecture, the
things that cost hours to learn. **This** file is the moving part: what is done, what is
queued, what is blocked. A cold session should be able to read `HANDOFF.md` plus this file
and continue without asking anything.

**Last updated:** 2026-08-28

---

## 1. Where we are

| | |
|---|---|
| Branch | `main`. All work inline, no feature branches. |
| Gates | `node check.mjs` → 12 checks passed (101 jokes, 6 block rules). JS parses. |
| Runtime | Verified by Kiran in desktop Chrome 151 only. Never run on the phone. |
| Current item | **Phase 2b** — post-interruption dropped command fixed in code, awaiting a real run (see `HANDOFF.md`); then roster gating. |
| Blocked | On-device speech recognition (`"unavailable"` — Windows has no en-GB speech pack). Not blocking anything, just unavailable. |

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
working. Nothing is gated on it yet.

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

**Phase 2b — roster gating.** Allow/ignore per enrolled voice. Unknown voices ignored
silently *unless* they used the wake word, in which case one spoken refusal ("I only listen
to my pilot"), rate-limited to once per 30 s. Kiran chose this split: silence is right for
room chatter, a reply is right for someone clearly addressing him. Log every rejection with
its scores. **An empty roster must behave exactly as today** — gating only applies once
someone is enrolled, and it goes behind its own Settings toggle defaulted to "anyone".

**Phase 3 — weather.** Open-Meteo: no key, no signup, `Access-Control-Allow-Origin: *`, so
the page fetches it directly with no Caddy route and no secret in the file. Geolocate once,
store it, manual override in Settings. Route it as a regex intercept in a new `LIVE` list
between `LOCAL` and `ask()` — **not** as a model tool-call; a 3B model's function calling is
not dependable enough to sit in front of a child. Behind a toggle, defaulted off.

**Phase 4 — music.** A fixed `TRACKS` list of YouTube video IDs, driven by `LOCAL`
commands. Joke-bank shape, same reason: it closes the door "play anything" would open. Duck
to 12% while he speaks (`player.setVolume`, not a `GainNode`). Advance tracks on
`onStateChange` ENDED rather than letting YouTube pick. Two known gotchas: playing with
sound needs a user gesture (the Initialise tap can carry it if the player starts muted), and
YouTube's terms want a visible player, so put a small one in the HUD. **This is the one
feature that does not survive the network going down** — say so in the code.

**Phase 5 — space and science news.** NASA/ESA feeds, which avoid the trap a general news
feed walks into: on any day the top stories are war, crime and death, and the `BLOCK` list
would correctly reject nearly every headline, so he would ask for news and get silence.
RSS has no CORS, so add a `handle /feeds/*` block to the `Caddyfile` — which also keeps any
future key out of the client. Cache 30 min; run each headline through `contentOK()`
individually and skip failures rather than dropping the batch.

## 4. Carried debt

- ~~**`awaitingCommand` has no timeout.**~~ Closed: arming runs through `armForCommand(why, ms)`
  with an expiry — 8 s after a wake word, `BARGE_LIVE_MS` after a barge. Whether the barge
  window is long enough for Chrome's final to land is the open question in `HANDOFF.md`.
- **No automated coverage of the echo/arming invariants.** `isEcho(tail, true)` and the armed
  window are both testable from `check.mjs`, which already extracts the `<script>` in memory.
- **The JARVIS pitch gate is calibrated ~an octave low** (73–96 Hz measured, ~204 Hz true).
  Sample F0 across the whole utterance instead of only the settle window.
- **`service` is a wake-word variant that false-triggers on ordinary speech.** Roster gating
  may make the wake word redundant enough to drop the variant — but do not remove the wake
  word until the roster has been measured in real use.
- **No transcript logging.** There is still no way to review what he asked or what the model
  answered.
- **ESP32 firmware is not in this repo** and has never been tested with the app.
- **Never run on the actual phone.** Everything so far is desktop Chrome, and the two
  desktop-only APIs the audio path leans on (`start(track)`, on-device recognition) do not
  exist on Android. The helmet will need the physical BLE button.
