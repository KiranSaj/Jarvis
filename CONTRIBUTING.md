# Contributing

Thank you for looking at this. Before you change anything, please read the
section below on what this project is — the constraints here are unusual, and
they are unusual on purpose.

## What this is

JARVIS Jr. is a voice assistant that runs on a phone inside a helmet worn by a
seven-year-old. It moves a servo a few inches from a child's face and speaks
whatever a small language model produces.

That means a change that is merely *elegant* is not automatically an
improvement. The parts of this codebase that look over-cautious, repetitive, or
old-fashioned are usually the parts holding the safety properties up.

## Getting set up

[README.md](README.md) covers installation and both ways of running the app.
The short version for development:

```powershell
.\start_the_server.bat
```

That serves `http://localhost:8000/` — `localhost` counts as a secure context,
so the microphone and Web Bluetooth work without any certificate setup. You do
not need Docker, the ESP32, or the helmet to work on most of the app.

## The one test

```powershell
node check.mjs
```

Run it before opening a pull request. CI runs it on every push and PR, so a
failure will block the merge either way.

It reads the `<script>` block out of `index.html` in memory, writes nothing, and
asserts twelve things:

1. The script parses.
2. The safety-critical code can still be extracted (the markers it slices on
   have not moved).
3. No joke trips `contentOK()`.
4. No joke is a duplicate.
5. Every joke is ASCII only.
6. Every joke is 120 characters or fewer.
7. The bank holds at least 20 jokes.
8. Known-bad lines are still blocked — including the real one the model once
   produced.
9. Ordinary science answers are *not* blocked.
10. Every offline helmet command still routes locally.
11. The joke regex does not shadow a helmet command.
12. Joke requests still reach the bank rather than the model.

Check 2 is worth understanding before you reformat anything. `check.mjs` finds
the code it validates by slicing `index.html` on literal string markers such as
`const JOKES = [`. If you reformat those declarations, the check does not fall
back to a weaker test — it throws, deliberately, because a safety check that can
silently become a no-op is worse than no check at all.

## Things that are not up for discussion

These are the safety rules. They are documented with their reasoning in
[README.md](README.md) and [CLAUDE.md](CLAUDE.md).

- The servo de-energises after every move.
- SG90 plastic-gear servo only, never metal-gear or high-torque.
- LED brightness stays capped.
- `contentOK()` gates every model reply. Nothing reaches `speak()` without
  passing through it.
- Jokes come from the `JOKES` bank, never from the model.
- The system prompt does not get shortened for latency.

A pull request that touches any of these must say so in its description and
explain the reasoning. Pull requests that weaken `contentOK()`, route model
output around it, or source jokes from the model will be declined — not because
the idea is bad in general, but because the entire design assumes a small model
cannot be trusted to be kind unsupervised.

## The single-file constraint

The whole app is one self-contained `index.html`: HUD, speech handling, safety
validator, joke bank and Bluetooth code, with the reasoning kept in comments
beside the code it explains.

Please do not split it into modules, add a bundler, introduce a package manager,
or run a formatter over it. The file is meant to be readable top to bottom by
one person, deployable by copying it, and debuggable from a phone with no
toolchain present. There is also exactly one copy of it in the repo, and it
stays that way — an hour was once lost editing one `index.html` while the
browser served a different one.

New dependencies are a hard sell for the same reason. The app has none.

## Adding a joke

The easiest useful contribution. Add one line to the `JOKES` array in
`index.html` and run `node check.mjs`. The rules the check enforces:

- **ASCII only.** Smart quotes and en dashes get pasted in from the web
  constantly, and some speech synthesisers read them aloud as words.
- **120 characters or fewer**, so it can be said in one breath.
- **No duplicates**, compared case- and punctuation-insensitively.
- **It must pass `contentOK()`**, which is blunt and will reject jokes about
  anything it reads as violent, frightening, romantic or unkind.

Aim for the kind of joke a seven-year-old would repeat at school.

## Pull requests

- One change per pull request. Small is easier to review and easier to revert.
- Say what you changed and why. If you fixed something, say how you reproduced
  it — browser, device and OS, since most failures here are specific to Chrome
  on Android or to secure-context rules.
- Run `node check.mjs`.
- Test it in a browser. Several bugs in this repo's history looked correct on
  the page and failed on execution.

Commit messages: a short imperative subject line explaining what changed, and a
body explaining why if it is not obvious. There is no required prefix format.

## Reporting things

Bugs and ideas go in [issues](../../issues). Anything with a security or child-
safety dimension should go through [SECURITY.md](SECURITY.md) instead, privately.
