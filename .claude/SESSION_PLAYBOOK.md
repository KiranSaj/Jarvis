# Session playbook

How to start, run, and end a Claude Code session on JARVIS Jr. without burning tokens on
re-derivation. Companion to the "Development workflow" section of `CLAUDE.md` — that file
says *what* the rules are; this one says *when* to apply them across a session boundary.

Ported from the Suvarnkar repo, including the measurement that shaped it.

## Start (spend ~15k tokens, no more)

1. `node .claude/session-budget.js` — if it says STOP, do not start a new item.
2. Read `HANDOFF.md` if present at repo root — **that is the state, do not re-derive it.**
3. If no `HANDOFF.md`: `git log --oneline -5` and Grep `BACKLOG.md` for the item id. Do not
   read `BACKLOG.md` whole, and do not run `git status` + `git diff` + `git log` as an
   orientation ritual — pick one, not all three.
4. State the item in one line, then start.

The audio work has a second kind of state that is not in git: **the numbers**. Thresholds
in `index.html` came from logged sessions and every constant has a comment saying which.
Read the comment rather than re-measuring.

## During

- Announce the model at each phase boundary: "design on opus" / "switching to sonnet to
  wire this up".
- Batch every independent read into one message.
- Verify narrowly. `node check.mjs` prints one line; keep it that way.
- If you catch yourself re-reading a file to remember something, scroll back in the
  transcript instead.

## Delegate or not

**Implementation: never — inline.** Measured on Suvarnkar: sessions that delegated
implementation cost 5.6M tokens per code mutation; inline sessions cost 0.60M. Spawning a
`developer` subagent to save tokens does the opposite, which is why this repo has no
`developer` agent to spawn.

**The reviewer, on opus, for changes that touch:**

- anything in `CLAUDE.md`'s Safety rules — `contentOK()`, the joke intercept, the system
  prompt, the BLE command vocabulary, the barge-in default;
- the audio decision path — the level gate, the pitch gate, `isEcho()`, `tryInterrupt()`,
  `interruptNow()`, or the `speaking`/`barged`/`awaitingCommand` state machine.

Everything else is inline with no review. Run it on the **finished diff**, name the changed
files in the prompt, and brief it on *what changed and why* — not on a checklist of what to
check. A prompt that lists what to look for narrows it to exactly those things, and the
findings worth paying opus for are the ones you did not think to ask about.

Act on findings yourself; there is no developer to hand them to. Say in your summary that
the review ran and what it returned.

Round 2+: resume the *same* reviewer via `SendMessage` and tell it what changed since its
last pass. Never re-spawn — a cold reviewer re-reads everything. Stop after 3 rounds and
summarize for Kiran rather than looping.

## `/compact` vs a fresh session

- **Fresh session (default).** The item is done, or you are about to start a logically
  separate one. Write `HANDOFF.md` first. A cold start costs ~40k of prefix; a 500k-deep
  session costs 500k *per turn* from here on.
- **`/compact`.** Only mid-item, when the item genuinely is not finishable in a new session
  — a long debugging chase where the dead ends themselves are the value. Immediately after
  compacting, restate the invariant you are protecting; compaction drops exactly that kind
  of detail first.
- **Never** compact just to keep a finished item's session alive.

## Verification gates

```bash
node check.mjs
awk '/^<script>/{f=1;next} /^<\/script>/{f=0} f' index.html > /tmp/idx.mjs && node --check /tmp/idx.mjs
```

`check.mjs` also runs automatically via the `PostToolUse` hook whenever `index.html` is
edited, so it does not depend on anyone remembering.

**Neither gate proves the app works.** They cannot: the app needs a microphone, speakers
and a browser. Every runtime behaviour in this repo has been established by Kiran running
it and pasting the console log. Plan for that — make the change *observable* (a log line
that names what was decided and why) before asking him to test it, because the recurring
failure mode here is silence that looks identical to working.

Where a change adds a pure function to the audio path — pitch detection, MFCC, similarity
— extract it in a scratch Node script and test it against synthetic signals before shipping
it. Two real bugs were caught that way that were invisible from the app: an autocorrelation
octave error reading a child as an adult, and a spectral fingerprint that encoded pitch
instead of timbre.

## Handoff

Write `HANDOFF.md` at repo root before ending any session mid-feature. Keep it under ~40
lines:

- The item and a one-line goal
- Files changed so far (paths only, no content — it is still on disk)
- Decisions already made and why, especially anything Kiran answered directly
- The exact next step, phrased as an instruction to the next session
- Gate state: `check.mjs` green, and what the last console log from a real run showed

Delete it once the item lands.
