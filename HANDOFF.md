# Handoff

**Item:** Phase 2b — post-interruption dropped command **fixed in code, unverified on a real run**, then roster gating.
**State:** `check.mjs` green (12 checks). JS parses. Reviewer (opus) returned APPROVED after two rounds.

---

## What changed in `index.html`

**The bug:** after a barge-in, the interrupting command was silently dropped — `handleSpeech()`
only acts on a WAKE match or `awaitingCommand`, and after an interruption neither held, so the
utterance fell off the end of the function with no log line.

- `interruptNow()` now arms him for a command. Somebody who has just cut in is addressing him.
- Arming goes through `armForCommand(why, ms)` / `disarm()` with an expiry, closing the
  "`awaitingCommand` latches forever" debt rather than widening it. 8 s (`ARM_MS`) on the
  wake-word path; `BARGE_LIVE_MS` (5 s) on the barge path, the same constant that now drives
  `bargedTimer`, so the armed window and the tail-guard relaxation cannot drift apart.
- Expiry logs a line and repaints Standby only when `!speaking && wantListening`.
- **Separate bug the review caught:** `stopSpeaking()` nulls `currentUtterance`, so the
  utterance's own `finish()` skipped its `startListening()`. With barge-in **off** — the
  shipped default — the mic had been stopped for the speech, so a spacebar interrupt left the
  helmet deaf until reload while the HUD read "Standby / listening". `interruptNow()` now
  restarts recognition.

## Next step: verify on a real run — Kiran only, the gates cannot see this

Barge-in on, interrupt him mid-sentence. Expected log:

```
barge-in: ... / interrupted by level
ignored own voice: "..."  /  that was his tail - still waiting for the interruption
armed - taking this as a command (NNNN ms after the interrupt)
-> model: "..."
```

with **no** `wake word only - armed` line in between.

**Read the NNNN.** That delta is the open question the reviewer raised and neither of us can
settle without audio: the level gate fires ~250 ms into the interrupting phrase, but Chrome's
final for it only lands after the speaker stops, so it could plausibly run to 3–4 s. If it ever
approaches `BARGE_LIVE_MS` (5000), the window is too tight and the dropped-command symptom is
back — and the fix then is to keep the arm alive while `barged` is set rather than simply
lengthening it, because an arm that outlives the echo guard lets a false barge (the television)
dispatch a sentence nobody addressed to him.

Also watch for `armed window expired (...)` appearing where a command was expected.

## Then

Phase 2b roster gating, unchanged — see `BACKLOG.md` §3.

## Reviewer suggestions not acted on (both pre-existing, both reasonable)

- No automated coverage for the `isEcho`/`afterBarge` invariant. `check.mjs` already extracts
  the `<script>` in memory, so `isEcho(tail, true) === true` for word-overlapping text plus an
  arm-expiry case would pin both halves of this change.
- `startMeter()` logs "level meter running" without checking `ctx.state`; a suspended
  `AudioContext` yields constant −180 dB, which reads as a quiet room.

## Files touched this run

`index.html` only (plus this file and `BACKLOG.md`).
