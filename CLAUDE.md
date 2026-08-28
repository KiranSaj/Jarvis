# JARVIS Jr.

A wearable Iron Man helmet with a voice-driven AI assistant, built for a
seven-year-old. A single self-contained `index.html` runs in Chrome on a phone
inside the helmet; it listens, talks back, and drives an ESP32 over Bluetooth.

**This is a toy worn on a child's head, and everything below follows from that.**

---

## Safety rules — never change these without saying so explicitly

These are not style preferences. Flag it clearly if a change would touch any of
them, and say why.

- **The servo must de-energise (detach) after every move.** Magnets hold the
  faceplate shut, not the motor. A motor holding torque against a child's face
  is the failure this design exists to prevent.
- **SG90 plastic-gear servo only.** Never a metal-gear or high-torque part. The
  plastic gears are the mechanical fuse.
- **LED brightness stays capped** (`MAX_BRIGHTNESS` in the firmware). They sit
  inches from his eyes.
- **`contentOK()` gates every model reply.** The system prompt asks the model to
  be kind and age-appropriate; a 3B model does not reliably comply. The prompt
  is a request, the validator is the control. Do not route model output to
  `speak()` without passing through it.
- **Jokes come from the `JOKES` bank, never the model.** The model once offered
  him a joke about an astronaut breaking up with his girlfriend. Jokes are
  intercepted in `dispatch()` before any network call.
- **Music silences the listening path (`musicOn`).** A loudspeaker three inches
  from the microphone means everything a track sings arrives as a final, and
  `LOCAL` contains `open up`, `lights off` and `battle mode` — a lyric is one
  regex away from moving the faceplate with nobody having spoken. While a track
  plays: the meter stops collecting fingerprints, the level and pitch gates are
  suspended outright (`bargeFloor` and `jarvisF0` would otherwise become
  properties of the song), and `handleSpeech()` requires `WAKE_STRICT` and
  honours no arms. `onresult` must pass `undefined` for the speaker, never
  `null` — `null` means "the roster refused this voice" and would trap him with
  no way to stop the music. There is a non-voice exit: tap the player.
- **Do not shorten the system prompt for latency.** It costs roughly 120 ms and
  has never been the bottleneck. It also carries the "never frightening,
  violent or unkind" instruction.

---

## Architecture

```
phone in helmet (Chrome)          Windows PC
  index.html                        Caddy (docker)  :443
    Web Speech  - listen/talk         -> serves the app
    Web BT      - to ESP32            -> proxies /api/* to Ollama
                                    Ollama :11434  llama3.2:3b
ESP32 (BLE Nordic UART)
  SG90 servo - faceplate
  WS2812B    - eyes + arc reactor
```

Voice commands split four ways in `dispatch()`, in this order:

1. **Jokes** — served from the local bank, instant, no network.
2. **`LOCAL` regexes** — helmet control (open, lights, battle mode). Instant, no
   network. This is what he uses most, so it must keep working offline.
3. **`LIVE` regexes** — questions with a real answer (weather, from Open-Meteo).
   Entries may carry a `not` that keeps explanations out of the forecast: "what
   is rain" is a question for the model, and answering it with a percentage is a
   non-sequitur rather than an answer.
   Behind `cfg.live`, **defaulted off**. Deliberately a regex intercept and not a
   model tool-call: a 3B model's function calling is not dependable enough to sit
   in front of a child, and its failure mode is a confident invention rather than
   a missing answer. The numbers come from the API and the sentence is assembled
   from a fixed vocabulary, so the model is never in the path.
4. **Everything else** — goes to the model via `callModel()`.

---

## Things that cost hours to learn

**Ollama reasoning models must have `think:false`.** Qwen3 reasons before
answering and Ollama leaves it on by default. Asking it "Hi" burned 561 tokens
to produce a 17-token reply; a real question spent 4,080 tokens deliberating and
returned an **empty string**. That presented as a hang, not as slowness. 28 s
became 1.3 s with one flag.

**Measure, don't guess.** Ollama returns `total_duration`, `load_duration`,
`eval_count` and `prompt_eval_count` on every reply. Use them before theorising.

**Verify which file the server is actually serving.** An hour was lost editing
one `index.html` while the browser loaded a different one. There is now exactly
one copy, at `C:\repo\Jarvis`. Keep it that way, and re-check after any change
that a request actually reflects the edit.

**Secure context rules govern the whole deployment.** The microphone, Web
Bluetooth and wake-lock only work over HTTPS or on literal `localhost`. A LAN
address over plain HTTP silently refuses all three — the HUD renders perfectly
and hears nothing. But an HTTPS page also cannot call `http://...:11434`
(mixed content). Hence Caddy: one origin serving both, which incidentally
removes the CORS requirement too.

**TLS forbids IP addresses in SNI.** A browser opening `https://192.168.0.243`
sends no server name, so Caddy had nothing to match and aborted every handshake
with `alert internal error`. Fixed with `default_sni` in the Caddyfile.

**A silent recogniser looks exactly like a quiet room.** A change that passed
every gate left the helmet deaf for an evening: `SpeechRecognition.start(track)`
was accepted and then returned nothing at all — no results, no errors. Neither
`check.mjs` nor a syntax check can see that. Any change to the audio path must
log what it decided and why *before* it is handed to anyone to test.

**A `let` inside the block `check.mjs` lifts makes its assertions vacuous.** A
top-level `let` in a `vm` script is lexically scoped to that script, so the
sandbox writes to it are ignored and the binding keeps its initial value
forever. `armStrong` was declared that way and every strong/weak assertion
passed without testing anything. **Mutation-test a new check before believing
it** - flip its expectation and confirm it fails.

**Test pure audio functions in Node against synthetic signals.** Two real bugs
were caught that way and neither was visible from inside the app: an
autocorrelation octave error that read a seven-year-old as an adult, and a
spectral fingerprint that encoded pitch instead of timbre. Extract the function,
feed it a sawtooth at a known frequency, assert on the answer.

**Git Bash `curl` is broken on this machine** — `schannel: The Local Security
Authority cannot be contacted`, on all HTTPS. It will mislead you. Use
PowerShell's `Invoke-WebRequest`, or curl inside a container.

---

## Running it

```powershell
cd C:\repo\Jarvis
docker compose up -d          # serves https://192.168.0.243/ to the whole LAN
docker compose logs -f        # watch requests
.\watch-ollama.ps1            # live Ollama timings, per request
```

Local-only alternative, no Docker: `.\start_the_server.bat` serves
`http://localhost:8000/`. The app detects which way it was loaded and picks the
Ollama endpoint accordingly (`VIA_PROXY`).

First-time LAN setup — certificates and firewall — is in `LAN-SETUP.md`.

---

## Working conventions

- **Run it before claiming it works.** Several bugs here looked correct on the
  page and failed on execution: batch quoting, a caret continuation that died
  with "Access is denied", a PowerShell health check that reported a false
  failure because a cold `powershell.exe` times out doing proxy discovery.
- **Prefer local commands over the model** where behaviour must be reliable.
  Anything on the `LOCAL` list works with the network down — **except music**,
  which is routed locally but whose audio comes from YouTube. It is the one
  feature that does not survive the router going down, and every failure path in
  it says so aloud, because silence and a dead router are indistinguishable from
  inside a helmet.
- **Music comes from the `TRACKS` list, never a search.** Joke-bank shape and
  the same argument: it closes the door "play anything" would open. Tracks
  advance on `ENDED` rather than letting YouTube choose, because "up next" is a
  recommendation. **Never invent a video id** — a wrong eleven-character id is
  not a broken link, it is an unknown video playing inside a helmet on a child's
  head.
- **Everything the model says is spoken aloud**, never read. Keep replies to two
  or three sentences, and strip markdown — `forSpeech()` does this because small
  models emit `**bold**` and `### headings` regardless of instructions.
- **Test the joke bank and validator after editing either.** `node check.mjs`
  verifies no joke trips the validator, none repeat, none contain non-ASCII,
  that known-bad lines are still blocked, that ordinary science answers are
  *not* blocked, and that every `LOCAL` command still routes offline. It also
  lifts three audio-path functions into a sandbox — `mayCommand()`,
  `pitchHz()` and `learnJarvisPitch()` — and decides them against synthetic
  input, which is the only automated view of that path there is. It does the
  same for the weather path: `weatherLine()` is pure, so every WMO code at
  every temperature is decided offline against `contentOK()`. It reads
  the `<script>` out of `index.html` in memory and writes nothing.
  A `PostToolUse` hook in `.claude/settings.json` runs it automatically
  whenever `index.html` is edited, so it does not depend on anyone remembering.
- The child's name is entered in Settings and stored in `localStorage` on the
  device. Do not hard-code it anywhere.

---

## Barge-in works on the laptop — and still ships off

Interrupting him by voice is behind the **Interrupt him** toggle in Settings and
**ships off**. Devices that saved it on are reset once, via `bargeParked` in
`localStorage`. Do not turn it back on by default.

It works now on desktop, and it needs no keyword — he interrupts by talking.
Owning the microphone stream is what made that possible: with echo cancellation
applied, JARVIS talking alone measures −66 dB on that stream while a person
talking over him measures −34, because the canceller backs off the moment it
hears a second voice. So "is somebody talking over him?" became a question about
level rather than a guess about words. Every threshold in `index.html` carries a
comment saying which logged session it came from — read those before changing one.

**None of it transfers to the helmet.** Both APIs it leans on are desktop-only:

- `MediaStreamTrack` input to `SpeechRecognition` — **Android is explicitly
  excluded**, and the helmet is Android. It is also `USE_TRACK_INPUT = false`
  even on desktop: Chrome 151 accepts the track and then recognises nothing.
- On-device recognition — desktop only, and not installed here anyway.
- Android's echo canceller lives on the `VOICE_COMMUNICATION` capture path.
  `speechSynthesis` plays out of the media path, so on most devices there is no
  reference signal connecting the two — and that reference is exactly what the
  level gate depends on.

`isEcho()` and `echoRun()` are still in the file and still load-bearing: they are
what stops a false interrupt dispatching his own tail back at him as a command.

**For the helmet, revisit via the input channel, not the heuristics.** A physical
button over BLE (the ESP32 is already there) is near-100% reliable and works
offline; an earbud or bone-conduction pad removes the echo at source.

With the mic asleep during speech, a `speechSynthesis` `end` event that never
fires would leave the helmet deaf until reload. `speakAwait()` has a watchdog
that wakes the mic regardless. Do not remove it while barge-in is off.

## Development workflow

`HANDOFF.md` (when present) is the current state — read it first and do not
re-derive it. `BACKLOG.md` is what is done, queued and blocked.
`.claude/SESSION_PLAYBOOK.md` says how to start, run and end a session.

**Implement inline. Do not spawn a `developer` subagent.** Measured on the
Suvarnkar repo: sessions that delegated implementation cost 5.6M tokens per code
mutation against 0.60M inline. Delegating to save tokens does the opposite, which
is why there is no `developer` agent here to spawn.

**The one exception** is `.claude/agents/reviewer.md`, on `opus`, for a finished
diff that touches either the Safety rules above or the audio decision path (the
level gate, the pitch gate, `isEcho`, `tryInterrupt`, `interruptNow`, or the
`speaking`/`barged`/`awaitingCommand` state machine). Brief it on *what changed
and why*, never on a checklist of what to look for — a prompt that lists the
things to check narrows it to exactly those, and the findings worth paying for
are the ones you did not think to ask about. It has no Edit tool: it flags, you
fix. Resume it with `SendMessage` for a second round rather than re-spawning.

### Token discipline

Every tool call re-bills the whole conversation, so cost is round-trips × depth.

- Batch independent reads into one message.
- Read the range, not the file. Grep for the symbol, then read around the hit.
- Never re-read a file already in context — the harness re-injects it after edits.
- Prefer Edit over Write on existing files; a Write parks the whole file in
  context permanently. `index.html` is ~1500 lines, so this matters here.
- Keep verification narrow: `node check.mjs` prints one line, so let it.
- Do not run `git status` + `git diff` + `git log` as an orientation ritual.

### Model routing

`opus` for design, the audio decision path, safety reasoning, and review.
`sonnet` for wiring, docs, backlog updates, and applying agreed findings.
Announce the switch out loud so the transcript records why.

## Known gaps

- ESP32 firmware is not in this repo and has never been tested with the app.
- No transcript logging — there is currently no way to review what he asked or
  what the model answered.
- Never run on the actual phone; all testing so far is desktop Chrome 151.
- Being armed for a command expires (`armForCommand`): 8 s after a bare
  "Jarvis", `BARGE_LIVE_MS` after a barge-in, because somebody who has just
  interrupted is addressing him and needs no wake word. Whether that barge
  window outlasts Chrome's final for the interrupting phrase is unverified on a
  real run — see `HANDOFF.md`.
- `service` is a wake-word variant and false-triggers on ordinary speech.
- Roster gating is on `cfg.gate`, defaulted to "anyone", and has never run with a
  second person in the room. The keyword-interrupt path bypasses it: no
  fingerprint of an interruption exists, because the meter does not collect
  while he is talking.
- The pitch gate learns him from settled frames that are 8 dB or more over the
  clamped floor, after a run where it profiled the room instead (78-92 Hz for a
  ~204 Hz voice). Unconfirmed. Its remaining weakness is that the quiet-frame
  filter is a filter and not a proof: a second voice under the barge threshold
  still feeds his profile, which fails towards missing an interrupt rather than
  firing on him.
- A phrase with no usable pitch is identified on timbre alone, with no absolute
  similarity floor. `decided on timbre alone` in the log marks every such call.
- Cloud speech recognition drops out regularly (`recognition error: network`).
  The on-device model would fix it but Windows has no en-GB speech pack here.
