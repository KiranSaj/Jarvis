# JARVIS Jr.

A voice-driven AI assistant that lives inside a wearable Iron Man helmet.

A phone sits in the helmet running a single self-contained `index.html`. It
listens through the phone's microphone, answers out loud, and drives an ESP32
over Bluetooth to move the faceplate and light the eyes and arc reactor. It was
built for a seven-year-old, and that fact drives every design decision in this
repository — the safety rules below are not stylistic preferences, and neither
is the choice to keep the whole app in one file that can be read end to end.

---

## Safety

Read this section before you build one. Each rule exists because of a specific
way this can hurt a child.

- **The servo must de-energise (detach) after every move.** Magnets hold the
  faceplate shut, not the motor. A motor applying holding torque against a
  child's face is the exact failure this design exists to prevent.
- **Use an SG90 plastic-gear servo, never a metal-gear or high-torque part.**
  The plastic gears are a mechanical fuse: if something jams, they strip before
  anything else gives.
- **Cap the LED brightness** (`MAX_BRIGHTNESS` in the firmware). The LEDs sit a
  few inches from the wearer's eyes.
- **`contentOK()` gates every model reply.** The system prompt asks the model to
  stay kind and age-appropriate; a 3B model does not reliably comply. The prompt
  is a request, the validator is the control. Nothing reaches `speak()` without
  passing through it — see [index.html:725](index.html#L725).
- **Jokes come from the `JOKES` bank, never from the model.** The model once
  offered a joke about an astronaut breaking up with his girlfriend. Jokes are
  intercepted in `dispatch()` before any network call, and each pick is run
  through `contentOK()` anyway.
- **Do not shorten the system prompt for latency.** It costs about 120 ms, has
  never been the bottleneck, and carries the "never frightening, violent or
  unkind" instruction.

The first three are firmware rules, and **the ESP32 firmware is not in this
repository** — see [Status](#status).

---

## How it works

```
phone in helmet (Chrome)            your PC
  index.html                          Caddy (Docker)  :443
    Web Speech  - listen / talk         -> serves the app
    Web BT      - drive the helmet      -> proxies /api/* to Ollama
                                        Ollama :11434  llama3.2:3b
ESP32 (BLE Nordic UART)
  SG90 servo  - faceplate
  WS2812B     - eyes + arc reactor
```

Speech is recognised continuously, filtered for the wake word, and then split
three ways in `dispatch()` ([index.html:526](index.html#L526)):

1. **Jokes** — matched by `JOKE_RE` and served from the local bank. Instant, no
   network, no model.
2. **`LOCAL` regexes** — helmet control: open, close, lights, battle mode,
   systems check. Instant, no network. This is what gets used most, so it must
   keep working with the internet down.
3. **Everything else** — goes to the model via `callModel()`, then through
   `contentOK()`, then to speech.

The unusual deployment shape is forced by browser security rules. The
microphone, Web Bluetooth and wake-lock only work in a *secure context* — HTTPS,
or literally `localhost`. A plain LAN address is neither, so the app would
render perfectly and hear nothing. But an HTTPS page also cannot call
`http://<host>:11434`, because that is mixed content. Caddy resolves both by
serving the app and proxying Ollama from one HTTPS origin, which incidentally
removes the CORS problem too.

---

## Requirements

**Hardware**

| Part | Notes |
| --- | --- |
| Android phone | Chrome. Must fit the helmet and reach the wearer's ear. |
| ESP32 dev board | Any board with BLE. Runs a Nordic UART Service peripheral. |
| SG90 servo | Plastic gears only — see [Safety](#safety). Moves the faceplate. |
| WS2812B LEDs | Eyes and arc reactor. Brightness capped in firmware. |
| Magnets | Hold the faceplate closed so the servo can power down. |

A full bill of materials and wiring guide is out of scope here.

**Software**

| | Why |
| --- | --- |
| Chrome on Android | Web Speech **and** Web Bluetooth. Safari has no Web Bluetooth at all, so an iPhone can talk to JARVIS but can never drive the helmet. |
| Docker Desktop | Runs Caddy for the HTTPS LAN deployment. |
| [Ollama](https://ollama.com) | Local model. Default is `llama3.2:3b`. Optional — you can point at the Anthropic or an OpenAI-compatible API instead. |
| Python 3 | Only for the local-only `start_the_server.bat` path. |
| Node 18+ | Only to run `check.mjs`. |

Windows with PowerShell is the primary environment; the helper scripts are
`.bat` and `.ps1`.

---

## Install

Two ways to serve the app. Pick the LAN route if the phone in the helmet is a
different device from the machine running the model, which is the normal case.

### Route A — HTTPS on the LAN (Docker + Caddy)

1. **Clone the repo.**

   ```powershell
   git clone <this-repo> jarvis
   cd jarvis
   ```

2. **Give the PC a fixed address.** The IP is written into `Caddyfile`, so a
   DHCP-assigned address that changes will break everything. Set a DHCP
   reservation on the router or assign a static IP.

3. **Put your address in `Caddyfile`.** Replace `192.168.0.243` everywhere it
   appears — the `default_sni` line and both site blocks.

4. **Pull the model and expose Ollama to the container.**

   ```powershell
   ollama pull llama3.2:3b
   [Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0','User')
   ```

   Restart Ollama afterwards. This binds it to all interfaces, but with no
   firewall rule for port 11434 only Caddy can reach it.

5. **Start it.**

   ```powershell
   docker compose up -d
   docker compose logs -f      # watch requests
   ```

   Success looks like `https://<YOUR-PC-IP>/` loading in a browser on the PC.

6. **Open the firewall and trust the certificate on the PC.** Double-click
   `setup-lan.bat`; it asks for administrator rights, trusts Caddy's root CA
   and opens ports 80 and 443 **to the local subnet only**. Quit Chrome
   completely afterwards — it caches certificate decisions.

7. **Trust the certificate on the phone.** Download it from
   `http://<YOUR-PC-IP>/root.crt` and install it as a CA certificate. The exact
   per-platform steps, and the reasoning behind all of this, are in
   [LAN-SETUP.md](LAN-SETUP.md).

8. **Open `https://<YOUR-PC-IP>/` on the phone.** No certificate warning means
   step 7 worked. A warning means it did not — the microphone will not work
   until it is fixed.

### Route B — local only, no Docker

For development on the machine itself:

```powershell
.\start_the_server.bat
```

Serves `http://localhost:8000/` and opens a browser. `localhost` counts as a
secure context, so the microphone and Web Bluetooth both work. The app detects
how it was loaded (`VIA_PROXY`) and calls Ollama directly at
`http://localhost:11434` instead of through the proxy.

> Git Bash `curl` is broken on some Windows setups (`schannel: The Local
> Security Authority cannot be contacted` on every HTTPS request) and will
> mislead you when testing. Use PowerShell's `Invoke-WebRequest`.

---

## Usage

Tap **Initialise** on the boot screen. That tap is the user gesture the browser
requires before it will grant the microphone and Web Bluetooth. A boot log
plays, then the HUD appears and JARVIS greets the pilot by name.

### Talking to him

Say **"Jarvis"** and then a command — before or after the name both work
("Jarvis, open up" and "open up Jarvis"). Saying the wake word alone arms him:
he chirps, shows *Listening*, and treats the next thing he hears as a command.
Common mishearings (`jervis`, `javis`, `jaris`) are accepted.

Anything not on the local list goes to the model. Replies are kept to two or
three sentences because they are heard, not read, and markdown is stripped
before speaking — small models emit `**bold**` regardless of instructions.

### Commands that never touch the network

| Say | What happens |
| --- | --- |
| "open the helmet", "faceplate up", "open up" | Faceplate opens (`OPEN` over BLE) |
| "close the helmet", "lower the visor", "faceplate down" | Faceplate closes (`CLOSE`) |
| "lights on" / "lights off" | Eye and reactor LEDs on or off |
| "battle mode", "combat" | Red HUD, weapons-hot line |
| "stealth" | Deep blue, quiet |
| "charge the repulsors" | Bright cyan charging state |
| "power down", "stand down" | Back to standby |
| "systems check", "diagnostics", "suit status" | Scripted four-line self-test |
| "tell me a joke", "make me laugh" | One of 101 jokes from the local bank |

Jokes do not repeat until half the bank has been used.

### Settings

**Press and hold** the faint circle at the bottom-right of the HUD for about a
second. The long press is deliberate — it keeps a seven-year-old out of it.

- **Pilot's name** — spoken in greetings and in the system prompt. Stored in
  `localStorage` on the device and never hard-coded in the source.
- **AI source** — `Ollama on home PC` (default), `Anthropic API`, or any
  OpenAI-compatible endpoint. Endpoint and model fall back to sensible defaults
  per provider if left blank.
- **API key** — stored on the device only. Set a monthly spend cap in your
  provider's dashboard if you use a hosted API.
- **Voice** — any English voice the phone offers. **Test voice** speaks a line
  without saving.
- **Interrupt him** — voice barge-in. **Ships off deliberately**; see
  [Status](#status).

Tapping **Save** also triggers Bluetooth pairing (a Web Bluetooth device picker
needs a user gesture, and the Save tap is it). Pick the ESP32 from the list; the
HUD's *Helmet* field reads `Linked` when it connects.

---

## Development

The whole app is one file. [index.html](index.html) contains the HUD, the speech
handling, the safety validator, the joke bank and the Bluetooth code, with the
reasoning kept in comments next to the code it explains. Keep it that way, and
keep exactly one copy — an hour was once lost editing one `index.html` while the
browser served a different one.

After changing the joke bank or the validator, run:

```powershell
node check.mjs
```

It reads the `<script>` block out of `index.html` in memory, writes nothing, and
asserts 12 invariants: the script parses, no joke trips `contentOK()`, no joke
repeats or contains non-ASCII, jokes stay short enough to say in one breath,
known-bad lines are still blocked, ordinary science answers are *not* blocked,
every offline command still routes locally, and the joke regex does not shadow
the helmet commands. It exits non-zero on failure.

A `PostToolUse` hook in [.claude/settings.json](.claude/settings.json) runs it
automatically whenever `index.html` is edited, so it does not depend on anyone
remembering.

Live Ollama timings, per request:

```powershell
.\watch-ollama.ps1
```

If you are working with a reasoning model, note that Ollama leaves reasoning
**on** by default and the app sets `think:false`. Without it, Qwen3 spent 4,080
tokens deliberating on one question and returned an empty string — which
presents as a hang, not as slowness.

Design rationale, conventions and the longer list of things that cost hours to
learn are in [CLAUDE.md](CLAUDE.md).

---

## Status

Honest about what has and has not been proven:

- **The ESP32 firmware is not in this repository** and has never been tested
  against the app. The BLE side of the app is written against the Nordic UART
  Service (`6e400001-b5a3-f393-e0a9-e50e24dcca9e`), writing newline-terminated
  ASCII commands: `OPEN`, `CLOSE`, `MODE:STANDBY|OFF|BATTLE|STEALTH|CHARGE`.
- **Voice barge-in ships off on purpose.** With the helmet speaker inches from
  the phone microphone, the browser gives no way to tell his voice from the
  child's — the Web Speech API hands you text and nothing else, and Android's
  echo canceller sits on a capture path the speech synthesiser does not use.
  The heuristics remain in the file, unused. The fix is a different input
  channel (a physical button over BLE, or an earbud), not better guessing.
- Testing so far has been desktop Chrome, not a phone in a helmet.
- There is no transcript logging, so there is no way to review what was asked
  or answered.

---

## Licence

No licence file is set yet. Until one is added, all rights are reserved by the
author — ask before reusing this in something you publish.
