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

Voice commands split two ways in `dispatch()`:

1. **Jokes** — served from the local bank, instant, no network.
2. **`LOCAL` regexes** — helmet control (open, lights, battle mode). Instant, no
   network. This is what he uses most, so it must keep working offline.
3. **Everything else** — goes to the model via `callModel()`.

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
  Anything on the `LOCAL` list works with the network down.
- **Everything the model says is spoken aloud**, never read. Keep replies to two
  or three sentences, and strip markdown — `forSpeech()` does this because small
  models emit `**bold**` and `### headings` regardless of instructions.
- **Test the joke bank and validator after editing either.** `node check.mjs`
  verifies no joke trips the validator, none repeat, none contain non-ASCII,
  that known-bad lines are still blocked, that ordinary science answers are
  *not* blocked, and that every `LOCAL` command still routes offline. It reads
  the `<script>` out of `index.html` in memory and writes nothing.
  A `PostToolUse` hook in `.claude/settings.json` runs it automatically
  whenever `index.html` is edited, so it does not depend on anyone remembering.
- The child's name is entered in Settings and stored in `localStorage` on the
  device. Do not hard-code it anywhere.

---

## Barge-in is parked — leave it off

Interrupting him by voice ("Jarvis, stop") is behind the **Interrupt him** toggle
in Settings and **ships off**. Devices that saved it on are reset once, via
`bargeParked` in `localStorage`. Do not turn it back on by default.

It is off because the browser cannot separate his voice from the child's when
the helmet speaker sits inches from the phone mic:

- The Web Speech API hands you text and nothing else — no audio, no levels, no
  way to apply echo cancellation.
- `MediaStreamTrack` input to `SpeechRecognition`, which would let us feed it a
  cleaned stream, shipped Chrome 133 on desktop only. **Android is explicitly
  excluded**, and the helmet is Android.
- Android's echo canceller lives on the `VOICE_COMMUNICATION` capture path.
  `speechSynthesis` plays out of the media path, so on most devices there is no
  reference signal connecting the two.

What is left is guessing from the transcript, which is what `isEcho()` and
`echoRun()` do. That code stays in the file, unused, because the analysis in it
is worth keeping — but it cannot be made reliable enough to point at a child.

**Revisit it only via the input channel, not the heuristics.** A physical button
on the helmet over BLE (the ESP32 is already there) is near-100% reliable and
works offline; moving audio to an earbud or bone-conduction pad removes the echo
at source and would make the existing code work as designed.

With the mic asleep during speech, a `speechSynthesis` `end` event that never
fires would leave the helmet deaf until reload. `speakAwait()` has a watchdog
that wakes the mic regardless. Do not remove it while barge-in is off.

## Known gaps

- ESP32 firmware is not in this repo and has never been tested with the app.
- No transcript logging — there is currently no way to review what he asked or
  what the model answered.
- Never run on the actual phone; all testing so far is desktop Chrome.
- `awaitingCommand` has no timeout: after a bare "Jarvis", the next thing anyone
  says is treated as a command.
- `service` is a wake-word variant and false-triggers on ordinary speech.
