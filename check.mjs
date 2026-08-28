/* Standalone safety check for index.html.
 *
 *   node check.mjs           - run every check, exit 1 if any fail
 *   node check.mjs --hook    - same, but reads Claude Code's PostToolUse JSON
 *                              from stdin and stays quiet unless index.html
 *                              was the file that changed. Exits 2 on failure
 *                              so the harness feeds the error back.
 *
 * What this protects, and why it is worth a file of its own:
 *
 *   contentOK() and the JOKES bank are the two controls standing between a 3B
 *   model and a seven-year-old's ears. CLAUDE.md has claimed since the start
 *   that a check like this exists; until now it did not, and the invariants
 *   were being re-verified by hand or not at all.
 *
 * This never writes a file. An earlier version of the syntax check left a
 * jarvis_extracted.js lying beside index.html, and an hour went into editing
 * the wrong copy of the app. Everything here happens in memory.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP  = join(HERE, 'index.html');
const HOOK = process.argv.includes('--hook');

/* In hook mode the harness pipes the PostToolUse payload in on stdin. Every
   edit in the repo fires this, so bow out unless index.html was the file that
   changed. Anything unreadable or unexpected is treated as "not index.html"
   rather than as a failure - a broken hook must not block editing CLAUDE.md. */
if (HOOK) {
  const raw = await new Promise((res) => {
    let buf = '';
    if (process.stdin.isTTY) return res('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { buf += d; });
    process.stdin.on('end', () => res(buf));
    process.stdin.on('error', () => res(''));
    setTimeout(() => res(buf), 2000).unref();
  });
  let touched = '';
  try { touched = JSON.parse(raw)?.tool_input?.file_path ?? ''; } catch { touched = ''; }
  if (!touched || resolve(touched) !== resolve(APP)) process.exit(0);
}

const failures = [];
const fail = (name, detail) => failures.push({ name, detail });
let checks = 0;
const ok = () => { checks++; };
const NL = String.fromCharCode(10);   // keeps escapes out of the slice markers below

/* ---------- pull the app's own source out of the page ---------- */

const html = readFileSync(APP, 'utf8');

const open  = html.indexOf('<script>');
const close = html.lastIndexOf('</script>');
if (open === -1 || close === -1 || close < open) {
  console.error('check: could not find the <script> block in index.html');
  process.exit(1);
}
const source = html.slice(open + '<script>'.length, close);

/* Slice a top-level declaration out by its markers. Deliberately strict: if
   the source is reformatted so a marker no longer matches, this errors rather
   than quietly checking nothing. A safety check that can silently become a
   no-op is worse than no check at all. */
function slice(startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  if (a === -1) throw new Error(`marker not found in index.html: ${startMarker.trim()}`);
  const b = source.indexOf(endMarker, a + startMarker.length);
  if (b === -1) throw new Error(`end marker not found after: ${startMarker.trim()}`);
  return source.slice(a, b + endMarker.length);
}

/* ---------- 1. the whole script parses ---------- */

try {
  new vm.Script(source, { filename: 'index.html <script>' });
  ok();
} catch (err) {
  fail('index.html parses', err.message);
  // Nothing below can be trusted if the source does not parse.
  report();
}

/* ---------- 2. lift the safety-critical pieces into a sandbox ---------- */

const warnings = [];
const sandbox = {
  console: { warn: (m) => warnings.push(m), log: () => {}, error: () => {} },
  // LOCAL's last entry references systemsCheck by name at construction time.
  systemsCheck: () => {},
  plate: () => {}, mode: () => {},
};

let JOKES, BLOCK, contentOK, JOKE_RE, LOCAL;
try {
  const lifted = [
    slice('const JOKE_RE = ', ';\n'),
    slice('const JOKES = [', '\n];'),
    slice('const BLOCK = [', '\n];'),
    slice('function contentOK(text){', '\n}'),
    slice('const LOCAL = [', '\n];'),
  ].join('\n\n');

  vm.createContext(sandbox);
  vm.runInContext(lifted + '\n;({ JOKES, BLOCK, contentOK, JOKE_RE, LOCAL })', sandbox);
  ({ JOKES, BLOCK, contentOK, JOKE_RE, LOCAL } =
    vm.runInContext('({ JOKES, BLOCK, contentOK, JOKE_RE, LOCAL })', sandbox));
  ok();
} catch (err) {
  fail('safety code can be extracted', err.message);
  report();
}

/* ---------- 3. every joke survives the validator ---------- */

const tripped = JOKES.filter((j) => !contentOK(j));
if (tripped.length) {
  fail('no joke trips contentOK',
    tripped.map((j) => `  ${JSON.stringify(j)}`).join('\n'));
} else ok();

/* ---------- 4. no joke repeats ---------- */
/* tellJoke() holds back half the pool by index, so a duplicated line would be
   told twice as often as the rest and read as a bug in the no-repeat memory. */

const seen = new Map();
const dupes = [];
for (const j of JOKES) {
  const key = j.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (seen.has(key)) dupes.push(j); else seen.set(key, j);
}
if (dupes.length) {
  fail('no duplicate jokes', dupes.map((j) => `  ${JSON.stringify(j)}`).join('\n'));
} else ok();

/* ---------- 5. everything is ASCII ---------- */
/* Smart quotes and dashes get pasted in from the web constantly, and speech
   synthesis reads some of them aloud as words. */

const nonAscii = JOKES.filter((j) => /[^\x20-\x7E]/.test(j));
if (nonAscii.length) {
  fail('jokes are ASCII only', nonAscii.map((j) => {
    const bad = [...j].filter((c) => /[^\x20-\x7E]/.test(c));
    return `  ${JSON.stringify(j)}  <- ${bad.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ')}`;
  }).join('\n'));
} else ok();

/* ---------- 6. jokes stay short enough to say in one breath ---------- */

const longOnes = JOKES.filter((j) => j.length > 120);
if (longOnes.length) {
  fail('jokes are short (<=120 chars)',
    longOnes.map((j) => `  ${j.length} chars: ${JSON.stringify(j)}`).join('\n'));
} else ok();

/* ---------- 7. the pool is big enough for the no-repeat memory ---------- */

if (JOKES.length < 20) {
  fail('joke bank is large enough', `only ${JOKES.length} jokes; half-pool hold-back needs more`);
} else ok();

/* ---------- 8. known-bad lines are still blocked ---------- */
/* The first of these is the real one the model produced. The rest cover each
   BLOCK rule, so deleting a rule fails here instead of silently. */

const MUST_BLOCK = [
  "Why did the astronaut break up with his girlfriend? He needed space.",
  "The knight killed the dragon and there was blood everywhere.",
  "It was a terrifying nightmare full of monsters.",
  "That is a stupid question and you are an idiot.",
  "Oh damn, what the hell was that.",
  "He drank too much beer and smoked a cigarette.",
];
const leaked = MUST_BLOCK.filter((t) => contentOK(t));
if (leaked.length) {
  fail('known-bad lines are blocked',
    leaked.map((t) => `  got through: ${JSON.stringify(t)}`).join('\n'));
} else ok();

/* ---------- 9. ordinary answers are not blocked ---------- */
/* contentOK is deliberately blunt, but if it starts eating normal science
   answers he loses the assistant. This is the other side of that trade. */

const MUST_PASS = [
  "The seasons come from the tilt of Earth's axis, sir. Not from how close we are to the Sun.",
  "A rocket works by throwing gas backwards, so the rocket goes forwards.",
  "Jupiter is the largest planet in our solar system. It has a storm bigger than Earth.",
  "Good morning, sir. All systems are green and the suit is ready when you are.",
];
const eaten = MUST_PASS.filter((t) => !contentOK(t));
if (eaten.length) {
  fail('ordinary answers pass',
    eaten.map((t) => `  wrongly blocked: ${JSON.stringify(t)}`).join('\n'));
} else ok();

/* ---------- 10. offline commands still route locally ---------- */
/* These must never reach callModel(). This is what he uses most, and it has to
   keep working with the network down. */

const MUST_BE_LOCAL = [
  'open the helmet', 'faceplate up', 'open up',
  'close the helmet', 'lower the visor', 'faceplate down',
  'lights on', 'lights off',
  'battle mode', 'stealth', 'power down',
  'charge the repulsors', 'systems check', 'suit status',
];
const notLocal = MUST_BE_LOCAL.filter((c) => !LOCAL.some((l) => l.re.test(c)));
if (notLocal.length) {
  fail('offline commands route locally',
    notLocal.map((c) => `  would hit the network: ${JSON.stringify(c)}`).join('\n'));
} else ok();

/* ---------- 11. joke detection does not swallow helmet commands ---------- */
/* dispatch() tests JOKE_RE before LOCAL, so a greedy joke regex would make the
   helmet stop responding. */

const jokeHijack = MUST_BE_LOCAL.filter((c) => JOKE_RE.test(c));
if (jokeHijack.length) {
  fail('JOKE_RE does not shadow LOCAL',
    jokeHijack.map((c) => `  ${JSON.stringify(c)} would tell a joke instead`).join('\n'));
} else ok();

const MUST_BE_JOKE = ['tell me a joke', 'say something funny', 'make me laugh'];
const missedJokes = MUST_BE_JOKE.filter((c) => !JOKE_RE.test(c));
if (missedJokes.length) {
  fail('joke requests reach the bank',
    missedJokes.map((c) => `  ${JSON.stringify(c)} would go to the model`).join('\n'));
} else ok();

/* ---------- 12. roster gating decides the way it says it does ---------- */
/* mayCommand() now stands between a voice and dispatch(), which means between a
   voice and the faceplate servo. Two ways to get it wrong: rejecting his voice
   makes the helmet useless, and accepting the room makes it unpredictable. Both
   are testable here with a synthetic identification, and neither is visible from
   inside the app without a second person in the room. */

let mayCommand;
const spoken = [];
try {
  const gateBox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    performance: { now: () => gateBox.clock },
    clock: 100000,
    speak: (t) => spoken.push(t),
    meterRunning: true,
    awaitingCommand: false, armStrong: false,
    REFUSE_MS: 30000,
    lastRefusalAt: -30000,
    cfg: { gate: 'anyone' },
    roster: [],
  };
  vm.createContext(gateBox);
  vm.runInContext(
    slice('function mayCommand(id, addressedHim, text){', NL + '}') +
    NL + ';({ mayCommand })', gateBox);
  ({ mayCommand } = vm.runInContext('({ mayCommand })', gateBox));

  const known  = { name: 'Pilot', allow: true, takes: [{ f0: 200 }] };
  const sure   = (name) => ({ sure: true, name, candidate: name, allow: true });
  const unsure = { sure: false, name: null, candidate: 'Pilot', allow: true };
  // Two enrolled voices that scored within 0.005 of each other - the household
  // case, and the one the follow-up rule most easily refuses by accident.
  const ambig  = { sure: false, ambiguous: true, near: ['SKS', 'Shree'],
                   name: null, candidate: 'SKS', allow: true };

  const cases = [
    ['gate off allows anyone',           () => { gateBox.cfg.gate = 'anyone'; gateBox.roster = [known]; }, unsure, true],
    ['empty roster allows anyone',       () => { gateBox.cfg.gate = 'roster'; gateBox.roster = []; },      unsure, true],
    ['an allowed voice gets through',    () => { gateBox.cfg.gate = 'roster'; gateBox.roster = [known]; }, sure('Pilot'), true],
    ['an unknown voice is rejected',     () => {}, unsure, false],
    ['a switched-off voice is rejected', () => { gateBox.roster = [{ ...known, allow: false }]; }, sure('Pilot'), false],
    // The room talking is not a command. A short command from the pilot either
    // carries his name or answers something he just asked, and both of those
    // arrive armed - which is what separates the two cases.
    ['the room with nobody armed is ignored', () => { gateBox.roster = [known]; gateBox.awaitingCommand = false; gateBox.armStrong = false; }, null, false],
    ['a short command while armed gets through', () => { gateBox.awaitingCommand = true; gateBox.armStrong = true; }, null, true],
    ['an interrupt is not a rejection',   () => { gateBox.awaitingCommand = true; gateBox.armStrong = true; }, undefined, true],
    // The follow-up window is a weak arm: it lets an identified voice carry on
    // without the wake word, and buys an unidentifiable one nothing at all.
    // Without this the window would hand the microphone to whoever spoke next
    // for FOLLOWUP_MS after every single answer.
    ['a follow-up window does not waive the fingerprint',
      () => { gateBox.awaitingCommand = true; gateBox.armStrong = false; }, null, false],
    ['a follow-up window still admits the pilot',
      () => { gateBox.awaitingCommand = true; gateBox.armStrong = false; }, sure('Pilot'), true],
    /* And the same two on the configuration that actually ships. cfg.gate is
       'anyone' by default and returns true on mayCommand's first line, so a
       rule written below it protects nothing on any helmet in use. These two
       are the ones that would have caught that. */
    ['gate off: a follow-up window still does not waive the fingerprint',
      () => { gateBox.cfg.gate = 'anyone'; gateBox.roster = [known];
              gateBox.awaitingCommand = true; gateBox.armStrong = false; }, null, false],
    ['gate off: a follow-up window still admits the pilot',
      () => { gateBox.awaitingCommand = true; gateBox.armStrong = false; }, sure('Pilot'), true],
    /* With no roster nobody can be identified, so the rule above would make the
       follow-up window useless rather than safe. It stands down; earnsFollowUp's
       one-turn bound is what limits the exposure there. */
    ['gate off and no roster: a follow-up window works',
      () => { gateBox.roster = []; gateBox.awaitingCommand = true; gateBox.armStrong = false; }, null, true],
    /* Two cases the follow-up rule must not catch, because both are people it
       was written to protect. An ambiguity between enrolled voices is admitted
       further down mayCommand for a reason - SKS and Shree live together - and
       refusing it here would refuse the pilot by his own household. */
    ['a follow-up from an ambiguous household voice gets through',
      () => { gateBox.roster = [known]; gateBox.awaitingCommand = true; gateBox.armStrong = false; },
      ambig, true],
    /* And the keyword-interrupt path has no fingerprint by construction: it is
       reachable whenever a weak arm is live and somebody says "stop". */
    ['a follow-up window does not refuse the interrupt path',
      () => { gateBox.awaitingCommand = true; gateBox.armStrong = false; }, undefined, true],
  ];
  const wrong = [];
  for (const [name, setup, id, want] of cases) {
    setup();
    const got = mayCommand(id, false, 'open up');
    if (got !== want) wrong.push(`  ${name}: got ${got}, wanted ${want}`);
  }
  // Saying his name was never leaning on the arm, so the follow-up rule must
  // not swallow it: a phrase with the wake word behaves as it always did.
  gateBox.cfg.gate = 'anyone'; gateBox.roster = [known];
  gateBox.awaitingCommand = true; gateBox.armStrong = false;
  if (mayCommand(null, true, 'jarvis open up') !== true)
    wrong.push('  the wake word still works inside a follow-up window: got false, wanted true');
  if (wrong.length) fail('roster gating decides correctly', wrong.join(NL));
  else ok();

  /* The refusal is the only thing the gate says out loud, and a room with a
     television in it must not hear it on a loop. */
  gateBox.cfg.gate = 'roster';
  gateBox.roster = [known];
  gateBox.lastRefusalAt = -30000;
  spoken.length = 0;
  mayCommand(unsure, true, 'jarvis open up');          // addressed him: refuse
  mayCommand(unsure, true, 'jarvis open up');          // again, at once: silent
  mayCommand(unsure, false, 'nothing to do with him'); // room chatter: silent
  const firstBurst = spoken.length;
  gateBox.clock += 31000;
  mayCommand(unsure, true, 'jarvis open up');          // 31 s later: refuse again
  if (firstBurst !== 1 || spoken.length !== 2)
    fail('the spoken refusal is rate limited',
      `  ${firstBurst} refusal(s) in the first burst, ${spoken.length} in total; wanted 1 then 2`);
  else ok();
} catch (err) {
  fail('roster gating can be extracted', err.message);
}

/* ---------- 13. the pitch detector reads a voice at its true pitch ---------- */
/* The gate that decides "is this JARVIS or a person" is a comparison of two
   numbers out of pitchHz(), and an octave error there is invisible from inside
   the app - it once read a 270 Hz child as a 135 Hz adult. Synthetic voices are
   the only way to see it. A sawtooth has the full harmonic stack that makes
   autocorrelation pick the wrong multiple; the second shape has no fundamental
   at all, which is what a small speaker and an echo canceller between them can
   leave of a voice. Pure sines are deliberately not tested: they read a few per
   cent high and no voice is one. */

try {
  const pitchBox = { meterRate: 48000, ncBuf: null, console: { log: () => {} } };
  vm.createContext(pitchBox);
  vm.runInContext(
    slice('const PITCH_DECIM', 'PITCH_TOL     = 0.12;') + NL +
    'let meterBuf, pitchBuf;' + NL +
    slice('function pitchHz(){', NL + '}') + NL +
    ';({ setBuf: (b) => { meterBuf = b; pitchBuf = new Float32Array(b.length / PITCH_DECIM); }, pitchHz })',
    pitchBox);
  const { setBuf, pitchHz } = vm.runInContext(
    '({ setBuf: (b) => { meterBuf = b; pitchBuf = new Float32Array(b.length / PITCH_DECIM); }, pitchHz })',
    pitchBox);

  const wave = (f, kind) => {
    const b = new Float32Array(2048);
    for (let i = 0; i < b.length; i++) {
      const ph = (i * f / 48000) % 1;
      b[i] = 0.3 * (kind === 'saw'
        ? 2 * ph - 1
        : Math.sin(4 * Math.PI * ph) + 0.6 * Math.sin(6 * Math.PI * ph) + 0.4 * Math.sin(8 * Math.PI * ph));
    }
    return b;
  };

  const off = [];
  for (const kind of ['saw', 'no fundamental'])
    for (const f of [83, 120, 204, 270, 325]) {
      setBuf(wave(f, kind));
      const got = pitchHz();
      // A tenth of an octave. Anything that misses by more is a wrong multiple,
      // which is the failure this exists to catch.
      if (!got || Math.abs(Math.log2(got / f)) > 0.1)
        off.push(`  ${kind} at ${f} Hz read as ${got ? got.toFixed(1) + ' Hz' : 'silence'}`);
    }
  if (off.length) fail('pitchHz reads synthetic voices at their true pitch', off.join(NL));
  else ok();
} catch (err) {
  fail('the pitch detector can be extracted', err.message);
}

/* ---------- 14. his pitch is learnt from the settled frames, not the onset ---------- */
/* This is the half of the pitch work that pitchHz() cannot cover. The onset of
   an utterance reads about an octave low, so an onset-derived profile makes his
   own leakage look like somebody else and lets the level gate fire on him. The
   rule is: prefer settled samples once there are three, fall back to the onset
   only while there are not, since the canceller can leave nothing else. */

try {
  const learnBox = {
    console: { log: () => {}, warn: () => {} },
    clock: 0,
    performance: { now: () => learnBox.clock },
    jarvisF0: 0,
    f0Samples: [],
    pitchHz: () => learnBox.nextF0,
    nextF0: 0,
    // Loud enough to be him, not the room: the learner takes a level and a
    // floor now, because a session on 2026-08-28 showed it profiling rumble.
    bargeFloor: -70,
    db: -55,
  };
  vm.createContext(learnBox);
  vm.runInContext(
    slice('const PITCH_DECIM', 'PITCH_TOL     = 0.12;') + NL +
    slice('const BARGE_FLOOR_MIN', 'Math.min(Math.max(bargeFloor, BARGE_FLOOR_MIN), BARGE_FLOOR_MAX);') + NL +
    slice('const railed = f =>', ';' + NL) + NL +
    slice('const F0_OVER_FLOOR_DB', 'let   lastF0SampleAt = 0, f0Onset = [];') + NL +
    slice('const medianOf = ', ';' + NL) + NL +
    slice('function learnJarvisPitch(inSettle, db){', NL + '}') + NL +
    ';({ learnJarvisPitch })', learnBox);
  const { learnJarvisPitch } = vm.runInContext('({ learnJarvisPitch })', learnBox);

  // Feed it what a real utterance feeds it: four onset frames an octave low,
  // then his true voice once the canceller has settled.
  const feed = (hz, n, inSettle, db = -55) => {
    for (let i = 0; i < n; i++) { learnBox.nextF0 = hz; learnBox.clock += 100; learnJarvisPitch(inSettle, db); }
  };

  const wrong = [];
  feed(85, 4, true);
  if (Math.abs(learnBox.jarvisF0 - 85) > 1)
    wrong.push(`  onset only: published ${learnBox.jarvisF0}, wanted the onset median 85`);
  feed(204, 3, false);
  if (Math.abs(learnBox.jarvisF0 - 204) > 1)
    wrong.push(`  three settled samples: published ${learnBox.jarvisF0}, wanted 204 - the onset must stop counting`);

  // The 100 ms rate limit: frames arriving faster than that are not samples.
  const before = learnBox.f0Samples.length;
  learnBox.nextF0 = 300; learnBox.clock += 10; learnJarvisPitch(false, -55);
  if (learnBox.f0Samples.length !== before)
    wrong.push('  a frame 10 ms after the last one was sampled anyway');

  // Unvoiced frames contribute nothing - a door closing must not be his voice.
  learnBox.nextF0 = 0; learnBox.clock += 500; learnJarvisPitch(false, -55);
  if (learnBox.f0Samples.length !== before)
    wrong.push('  an unvoiced frame was recorded as a pitch');

  // Near the floor it is the room, not him. This is the whole of the
  // 2026-08-28 finding: without it the profile was 78-92 Hz for a ~204 Hz voice.
  feed(88, 5, false, -68);
  if (learnBox.f0Samples.length !== before)
    wrong.push('  frames within 2 dB of the floor were taken for his voice');

  // A railed read is the detector saying it does not know.
  feed(400, 5, false, -55);
  if (learnBox.f0Samples.length !== before)
    wrong.push('  a railed 400 Hz read was recorded as a pitch');

  // A loud room: the raw floor here is -30, which unclamped would put the
  // learner's lower bound above the barge threshold and close the band for good.
  learnBox.bargeFloor = -30;
  feed(204, 5, false, -40);   // clamped floor -50, so the band opens at -42
  if (learnBox.f0Samples.length === before)
    wrong.push('  a loud room closed the sampling band - the floor is not being clamped');

  if (wrong.length) fail('his pitch is learnt from the settled frames', wrong.join(NL));
  else ok();
} catch (err) {
  fail('the pitch learner can be extracted', err.message);
}

/* ---------- 15. a railed pitch must not veto an identification ---------- */
/* The 2026-08-28 session refused the pilot on the single word "jarvis.": the
   timbre named him with a margin of 0.104, and the pitch veto threw it out on
   400 Hz - PITCH_MAX_HZ exactly, which is the detector railing on a sibilant
   rather than a measurement of anyone. Refusing the pilot is the one failure
   that makes the helmet useless, so it is worth a check of its own. */

let finishTake, identify;
const idBox = { console: { log: () => {} }, roster: [] };
const vecOne = () => { const v = new Float32Array(12); v[0] = 1; return v; };
try {
  vm.createContext(idBox);
  const idSrc =
    slice('const MEL_BANDS = 32', 'const TAKE_GAP_MS      = 1200;') + NL +
    slice('const PITCH_DECIM', 'PITCH_TOL     = 0.12;') + NL +
    slice('const railed = f =>', ';' + NL) + NL +
    slice('const cosine = (a, b) =>', '};' + NL) + NL +
    slice('function finishTake(take){', NL + '}') + NL +
    slice('function cohesion(p){', NL + '}') + NL +
    slice('const AMBIG_SLACK', ';' + NL) + NL +
    slice('function identify(take){', NL + '}') + NL +
    ';({ finishTake, identify })';
  ({ finishTake, identify } = vm.runInContext(idSrc, idBox));

  const wrong = [];

  // A phrase whose every pitch read railed comes back unmeasured, not as 400.
  const vec = vecOne;
  const sibilant = { vecs: Array.from({ length: 14 }, vec), pitches: Array(14).fill(400) };
  const t = finishTake(sibilant);
  if (!t || t.f0 !== 0) wrong.push(`  a phrase of railed reads came back as f0 ${t && t.f0}, wanted 0`);

  const voiced = { vecs: Array.from({ length: 14 }, vec), pitches: Array(14).fill(150) };
  const tv = finishTake(voiced);
  if (!tv || Math.abs(tv.f0 - 150) > 1) wrong.push(`  a voiced phrase came back as f0 ${tv && tv.f0}, wanted 150`);

  // The pilot, enrolled at 148 Hz, on a phrase with no usable pitch.
  const near = new Float32Array(12); near[0] = 0.99; near[1] = 0.14;
  const far  = new Float32Array(12); far[0] = 0.6; far[1] = 0.8;
  idBox.roster = [
    { name: 'Pilot', allow: true, takes: [{ v: Array.from(near), f0: 148 }] },
    { name: 'Other', allow: true, takes: [{ v: Array.from(far),  f0: 325 }] },
  ];
  const pilot = { v: Array.from(near), f0: 0 };
  const idNoPitch = identify(pilot);
  if (!idNoPitch.sure || idNoPitch.name !== 'Pilot')
    wrong.push('  the pilot was refused on a phrase with no usable pitch');

  // But a pitch that IS measured still vetoes: this is the wrong-name case the
  // veto was added for - 182 Hz claiming to be someone who speaks at 325.
  const impostor = { v: Array.from(far), f0: 182 };
  const idPitched = identify(impostor);
  if (idPitched.sure)
    wrong.push('  a voice 44% off the enrolled pitch was accepted anyway');

  if (wrong.length) fail('a railed pitch does not veto an identification', wrong.join(NL));
  else ok();
} catch (err) {
  fail('identify() can be extracted', err.message);
}

/* ---------- 16. the household is not a stranger ---------- */
/* Two people who live together sound alike. On 2026-08-28 "tell me another one"
 put SKS 0.005 ahead of Shree, the margin guard called it unknown, and the
 pilot was ignored twice running. Deciding *which* of two enrolled and allowed
 people is talking is not a question the gate needs answered - but the same
 leniency must not extend to a voice that is switched off. */

try {
const wrong = [];
const near = new Float32Array(12); near[0] = 0.99; near[1] = 0.14;
const alike = new Float32Array(12); alike[0] = 0.985; alike[1] = 0.17;
const far = new Float32Array(12); far[0] = 0.6; far[1] = 0.8;
const take = (v, f0) => ({ v: Array.from(v), f0 });

// Three takes each, so cohesion() has something to calibrate against - which
// is what tells a household apart from a stranger who lands between them.
const spread = (v, n) => Array.from({ length: n }, (_, i) => {
  const t = [v[0] - i * 0.01, v[1] + i * 0.01];
  const norm = Math.hypot(t[0], t[1]);
  return { v: [t[0] / norm, t[1] / norm, ...Array(10).fill(0)], f0: 148 };
});
const household = (shreeAllowed) => [
  { name: 'SKS',   allow: true,         takes: spread(near, 3) },
  { name: 'Shree', allow: shreeAllowed, takes: spread(alike, 3) },
];

idBox.roster = household(true);
const tooClose = identify(take(near, 150));
if (tooClose.sure) wrong.push('  the two takes were not close enough to test ambiguity at all');
if (!tooClose.ambiguous)
  wrong.push('  a phrase between two enrolled, allowed voices was called unknown');

// The whole point of per-person allow: an ignored voice must not ride in on
// being hard to tell apart from an allowed one.
idBox.roster = household(false);
if (identify(take(near, 150)).ambiguous)
  wrong.push('  ambiguity with a switched-off voice was treated as admissible');

// A genuine stranger, far from everyone, is still a stranger.
idBox.roster = household(true);
const stranger = identify(take(far, 150));
if (stranger.sure || stranger.ambiguous)
  wrong.push('  a voice unlike anyone enrolled was admitted');

// One take each is a roster with nothing to calibrate against. The stranger
// guard has to abstain rather than wave everybody through: nobody in
// contention can vouch for the take, so the ambiguity is not admitted.
idBox.roster = household(true).map((p) => ({ ...p, takes: p.takes.slice(0, 1) }));
if (identify(take(far, 150)).ambiguous)
  wrong.push('  a one-take roster switched the stranger guard off');

// A short phrase carries no pitch to veto with; a full one still does.
const shortPhrase = finishTake({ vecs: Array.from({ length: 14 }, () => vecOne()), pitches: Array(4).fill(286).concat(Array(10).fill(400)) });
if (shortPhrase.f0 !== 0)
  wrong.push(`  four unrailed reads were treated as a pitch measurement (${shortPhrase.f0})`);
const fullPhrase = finishTake({ vecs: Array.from({ length: 14 }, () => vecOne()), pitches: Array(14).fill(150) });
if (Math.abs(fullPhrase.f0 - 150) > 1)
  wrong.push('  a fully voiced phrase lost its pitch');

if (wrong.length) fail('the household is not a stranger', wrong.join(NL));
else ok();
} catch (err) {
  fail('the ambiguity rule can be extracted', err.message);
}

/* ---------- 17. his own words stay comparable for as long as he is armed ---------- */
/* Arming for 8 s after a barge was measured - Chrome finalises long after the
   speaker stops - but the echo comparison used to go blind at ECHO_MEMORY_MS
   (2500 ms), leaving a window in which the next transcript to arrive was
   dispatched with nothing to compare it against. The transcript most likely to
   arrive there is his own tail, and dispatching that is the feedback loop this
   whole file exists to prevent. */

try {
  const echoBox = {
    console: { log: () => {} },
    speaking: false,
    spokenNow: '',
    speechEndedAt: 0,
    echoCompareUntil: 0,
    clock: 0,
    performance: { now: () => echoBox.clock },
  };
  vm.createContext(echoBox);
  const { isEcho, rememberSpoken, spokenHistory } = vm.runInContext(
    slice('const ECHO_MEMORY_MS = 2500;', 'const ECHO_TAIL_MS = 900;') + NL +
    slice('const SPOKEN_MEMORY = 3;', NL + '}') + NL +
    slice('const words = s =>', ';' + NL) + NL +
    slice('function echoRun(heard, spoken){', NL + '}') + NL +
    slice('function isEcho(text, afterBarge){', NL + '}') + NL +
    ';({ isEcho, rememberSpoken, spokenHistory })', echoBox);

  const tail = 'the temperature is around seventy five';
  const human = 'open the faceplate please';
  const wrongEcho = [];

  echoBox.clock = 900;
  rememberSpoken('the temperature is around seventy five degrees');

  // Straight after he stops, with no barge: his tail is his tail.
  echoBox.clock = 1000; echoBox.speechEndedAt = 1000;
  if (!isEcho(tail, false)) wrongEcho.push('  his own tail was not recognised at all');

  // An empty write must not erase what he said - stopSpeaking() called twice
  // did exactly that, and a whole reply was dispatched back to the model.
  rememberSpoken('');
  if (!isEcho(tail, false))
    wrongEcho.push('  an empty write erased his words - this is the 2026-08-28 loop');

  // And a newer line must not push the one still echoing out of reach.
  echoBox.clock = 1100;
  rememberSpoken('the arc reactor is at full charge');
  if (!isEcho(tail, false))
    wrongEcho.push('  a newer line displaced the one whose echo was still arriving');


  // Four seconds after a barge - past ECHO_MEMORY_MS, inside the armed window.
  echoBox.clock = 5000; echoBox.speechEndedAt = 1000;
  echoBox.echoCompareUntil = 9000;
  if (!isEcho(tail, true))
    wrongEcho.push('  his tail was dispatchable inside the armed window - this is the loop');
  if (isEcho(human, true))
    wrongEcho.push('  a real interruption was thrown away as his own voice');

  // Past the armed window it goes back to normal: nothing to compare against.
  echoBox.clock = 12000; echoBox.echoCompareUntil = 9000;
  if (isEcho(tail, true))
    wrongEcho.push('  the comparison outlived the armed window');

  // Depth. Every line is written twice - once when it starts speaking, once
  // when it ends - so without the dedupe in rememberSpoken() three lines fill
  // six slots and SPOKEN_MEMORY holds one and a half. A scripted sequence like
  // systemsCheck speaks four in a row, and the line whose echo is still in the
  // air is the one that gets pushed out.
  const seq = ['power core nominal', 'repulsors charged and holding', 'faceplate servo responding'];
  for (const line of seq){ rememberSpoken(line); rememberSpoken(line); }
  if (!isEcho('power core nominal', false))
    wrongEcho.push('  three lines filled the history twice over - the oldest was displaced');

  if (wrongEcho.length) fail('his words stay comparable while he is armed', wrongEcho.join(NL));
  else ok();
} catch (err) {
  fail('isEcho can be extracted', err.message);
}

/* ---------- 18. what actually reaches dispatch() ---------- */
/* Checks 12 and 16 test mayCommand() in isolation, and that is not where the
   outcome lives: a clause can change every log line and refuse nothing, because
   handleSpeech() drops an unmatched utterance anyway. On 2026-08-28 two
   sentences of other people's conversation reached the model, and it took the
   log rather than any check here to find the path - both matched WAKE on an
   utterance the roster could not see. So this one asserts at the level the
   question is really asked: given a phrase, a fingerprint and a state, does
   dispatch() run? */

try {
  const dispatched = [];
  const speechBox = {
    console: { log: () => {}, warn: () => {} },
    performance: { now: () => speechBox.clock },
    clock: 100000,
    heardEl: { textContent: '' },
    setState: () => {}, chirp: () => {},
    speak: () => {}, dispatch: (t) => dispatched.push(t),
    setTimeout: () => 0, clearTimeout: () => {},
    speaking: false, meterRunning: true,
    awaitingCommand: false, armStrong: false, wantFollowUp: false, lastRefusalAt: -30000,
    musicOn: false,
    interruptedAt: 0,
    cfg: { gate: 'roster' },
    roster: [{ name: 'Pilot', allow: true, takes: [{ v: [1, 0], f0: 148 }] }],
  };
  vm.createContext(speechBox);
  vm.runInContext(
    slice('const REFUSE_MS = 30000;', ';') + NL +
    slice('const WAKE = ', ';' + NL) + NL +
    slice('const WAKE_STRICT = ', ';' + NL) + NL +
    slice('const ARM_MS = 8000;', 'let armTimer = 0;') + NL +
    slice('function armForCommand(why, ms, weak){', NL + '}') + NL +
    slice('function earnsFollowUp(who, wasStrong){', NL + '}') + NL +
    slice('function disarm(){', '}' + NL) + NL +
    slice('function mayCommand(id, addressedHim, text){', NL + '}') + NL +
    slice('function handleSpeech(text, who){', NL + '}') + NL +
    ';({ handleSpeech })', speechBox);
  const { handleSpeech } = vm.runInContext('({ handleSpeech })', speechBox);

  const pilot = { sure: true, name: 'Pilot', candidate: 'Pilot', allow: true, ambiguous: false, near: ['Pilot'] };
  const roomVoice = { sure: false, name: null, candidate: 'Pilot', allow: true, ambiguous: false, near: ['Pilot'] };

  const wrong = [];

  /* The bug that made the strong/weak assertions below pass without testing
     anything: index.html declared `let armStrong` inside the block lifted here,
     and a top-level `let` in a vm script is lexically scoped to that script, so
     speechBox's writes to it were ignored and the binding sat permanently
     false. Moving the declarations out fixed it; this keeps them out. */
  const armBlock = slice('const ARM_MS = 8000;', 'let armTimer = 0;');
  const shadowed = ['armStrong', 'wantFollowUp'].find(n => armBlock.includes('let ' + n));
  if (shadowed)
    wrong.push('  the lifted arm block declares ' + shadowed +
               ', which shadows the sandbox global and makes every ' +
               'strong/weak assertion here vacuous');

  const run = (label, text, who, armed, wantDispatch) => {
    // 'strong' is the wake-word/interruption arm; 'weak' is the follow-up
    // window, which dispatches an identified voice and nothing else.
    speechBox.awaitingCommand = armed !== false;
    speechBox.armStrong = armed === 'strong';
    dispatched.length = 0;
    handleSpeech(text, who);
    const got = dispatched.length > 0;
    if (got !== wantDispatch)
      wrong.push(`  ${label}: ${got ? 'dispatched' : 'dropped'}, wanted ${wantDispatch ? 'dispatch' : 'no dispatch'}`);
  };

  // The pilot, identified, with his name in the phrase.
  run('the pilot asking for something', 'jarvis open the faceplate', pilot, false, true);

  // The follow-up window, which is the whole point of it: he answers back
  // without saying the name again, and gets through because he was identified.
  run('the pilot following up inside the window', 'tell me another one', pilot, 'weak', true);

  // ...and the same window with the room talking into it, unidentified.
  run('the room talking into the follow-up window', 'can you ask him something',
      null, 'weak', false);

  // Repeated on the default configuration. This is the pair that matters: the
  // helmet ships with gate 'anyone', and a follow-up window that leaks there
  // leaks on every helmet, gate or no gate.
  speechBox.cfg.gate = 'anyone';
  run('gate off: the pilot following up', 'tell me another one', pilot, 'weak', true);
  run('gate off: the room talking into the follow-up window', 'can you ask him something',
      null, 'weak', false);
  speechBox.cfg.gate = 'roster';

  const household = { sure: false, ambiguous: true, near: ['Pilot', 'Other'],
                      name: null, candidate: 'Pilot', allow: true };
  run('a follow-up from an ambiguous household voice', 'tell me another one',
      household, 'weak', true);
  run('an interrupt keyword during a follow-up window', 'stop', undefined, 'weak', true);

  /* earnsFollowUp's one-turn bound. With no roster it is the whole of the
     protection - nothing can be identified, so the pre-gate rule stands down -
     and nothing asserted it until now. An unidentified turn must not leave a
     follow-up armed behind it, or the window sustains itself and a room that
     keeps talking holds an armed microphone for as long as it keeps talking. */
  /* A loudspeaker in the same room as the microphone. Everything a track sings
     arrives as a final, and LOCAL contains "open up", "lights off" and "battle
     mode" - so without a rule here a lyric moves the faceplate with nobody
     having spoken. While music plays only his name gets through, and only the
     strict spelling of it: `service` false-triggers on ordinary speech, and a
     song is three minutes of ordinary speech. */
  const withMusic = (label, text, who, armed, wantDispatch) => {
    // On the shipped configuration. With the gate on, mayCommand would refuse an
    // unidentified lyric first and these would pass without exercising the music
    // rule at all - which is how two of them passed before being tightened.
    const gateWas = speechBox.cfg.gate;
    speechBox.cfg.gate = "anyone";
    speechBox.musicOn = true;
    run(label, text, who, armed, wantDispatch);
    speechBox.musicOn = false;
    speechBox.cfg.gate = gateWas;
  };
  withMusic('a lyric that reads as a helmet command', 'open up', pilot, false, false);
  withMusic('a lyric that reads as a helmet command, while armed', 'lights off', pilot, 'strong', false);
  withMusic('a lyric inside a follow-up window', 'battle mode', pilot, 'weak', false);
  withMusic('a lyric containing the loose wake variant', 'always at your service tonight',
            null, false, false);
  withMusic('he asks for the music to stop', 'jarvis stop the music', pilot, false, true);
  /* The escape hatch, on the configuration that traps it. With the gate on and
     the meter suspended there is no take to place, and passing null there means
     "the roster looked and could not place this voice" - which mayCommand
     refuses, including for the one command that ends the music. It has to be
     undefined: no fingerprint by construction, like the keyword interrupt. */
  /* handleSpeech only ever sees what its caller passed, so the case above
     asserts the contract and not the bug: the regression was in onresult,
     which handed it null. Assert the caller too - null and undefined behave
     differently by design, and reading the two lines together is the only way
     to see that the right one is being sent.

     The pair below says why it matters: the same phrase, the same state, one
     refused and one allowed, decided entirely by which kind of no-answer
     arrives. */
  /* The music player sits over #gear, and #gear is the only way into Settings -
     which is in turn the only way to fix a bad track list or turn anything off.
     An overlay that is always in the document swallows every press on the gear
     whether or not music is playing, because an early return in the handler
     stops the action and not the hit test. So it must ship hidden and be shown
     and hidden alongside the player. None of this is visible to a parser, so it
     is asserted against the source. */
  const box = (id) => html.slice(html.indexOf("id=\"" + id + "\""), html.indexOf("id=\"" + id + "\"") + 420);
  if (!box("tubeStop").includes("display:none"))
    wrong.push("  the music stop button ships visible");
  /* The player itself intercepts presses on its own, so asserting only the
     stop button would let the same bug back in through the other box. It is
     parked off-screen rather than hidden, because a YT.Player built inside a
     display:none container may never reach onReady. */
  if (!box("tube").includes("left:-9999px"))
    wrong.push("  the music player does not ship parked off-screen");
  /* musicOn true must mean the non-microphone way out is on screen. PLAYING is
     the one place musicOn is set without startTrack having shown it. */
  const playing = html.slice(html.indexOf("PlayerState.PLAYING"), html.indexOf("PlayerState.PLAYING") + 220);
  if (!playing.includes("showPlayer(true)"))
    wrong.push("  PLAYING sets musicOn without showing the way out of it");
  for (const fn of ["function startTrack", "function stopMusic"]) {
    const body = html.slice(html.indexOf(fn), html.indexOf(fn) + 900);
    if (!body.includes("showPlayer("))
      wrong.push("  " + fn + " does not move the player and its tap target together");
  }
  if (!html.includes("musicOn ? undefined : whoSpoke()"))
    wrong.push("  onresult does not pass undefined while music plays - a null there " +
               "means the roster refused the voice, and traps him with no way to stop it");
  speechBox.musicOn = true;
  run("the trap: a null identification with the gate on", "jarvis stop the music", null, false, false);
  speechBox.musicOn = false;
  speechBox.musicOn = true;
  run("stopping the music with the gate on", "jarvis stop the music", undefined, false, true);
  run("a lyric with the gate on", "open up", undefined, "weak", false);
  speechBox.musicOn = false;

  // And with no music playing, the same phrase behaves as it always did.
  run('the same command with the music off', 'open up', pilot, 'strong', true);

  const rosterWas = speechBox.roster;
  speechBox.roster = [];
  speechBox.cfg.gate = 'anyone';
  const chains = (label, who, armed, want) => {
    speechBox.awaitingCommand = armed !== false;
    speechBox.armStrong = armed === 'strong';
    speechBox.wantFollowUp = false;
    handleSpeech('tell me another one', who);
    if (speechBox.wantFollowUp !== want)
      wrong.push(`  ${label}: wantFollowUp ${speechBox.wantFollowUp}, wanted ${want}`);
  };
  chains('an unidentified follow-up does not chain', null, 'weak', false);
  chains('an identified follow-up chains', pilot, 'weak', true);
  chains('an unidentified turn after a wake word earns one follow-up', null, 'strong', true);
  // Put the sandbox back: the cases below share it and read the roster.
  speechBox.roster = rosterWas;
  speechBox.cfg.gate = 'roster';

  // The 2026-08-28 hole: a room conversation that happens to say his name, on
  // audio the roster never saw because he was talking over it.
  run('room speech that says his name', 'i will transfer it to jarvis tell me what is kali project',
      null, false, false);

  // ...but an interruption has no fingerprint by construction, and the arm is
  // what says somebody just addressed him.
  run('an interruption, armed, no fingerprint', 'stop that and open up', undefined, 'strong', true);

  // A voice the roster looked at and could not place is still refused.
  run('an unplaceable voice', 'jarvis open the faceplate', roomVoice, false, false);

  if (wrong.length) fail('only the right things reach dispatch', wrong.join(NL));
  else ok();
} catch (err) {
  fail('handleSpeech can be extracted', err.message);
}

/* ---------- 19-21. the live weather path ---------- */
/* Phase 3 puts a network answer in front of the model on purpose, so the thing
   worth protecting is that the sentence he hears is assembled here from a
   fixed vocabulary and never by a 3B model. That makes it decidable offline:
   weatherLine() is pure, so it can be fed the extremes a real week will not
   produce - minus twenty-five, a hundred percent rain, thundery with hail. */

let LIVE, SKY, weatherLine, kitAdvice, skyPhrase;
try {
  const wxBox = { console: { log: () => {} } };
  vm.createContext(wxBox);
  vm.runInContext(
    slice('const LIVE = [', NL + '];') + NL +
    slice('const SKY = {', NL + '};') + NL +
    slice('function skyPhrase(code){', '}') + NL +
    slice('function kitAdvice(t, rain){', NL + '}') + NL +
    slice('function article(n){', NL + '}') + NL +
    slice('function weatherLine(w, intent, place){', NL + '}') + NL +
    ';({ LIVE, SKY, skyPhrase, kitAdvice, weatherLine })', wxBox);
  ({ LIVE, SKY, skyPhrase, kitAdvice, weatherLine } =
    vm.runInContext('({ LIVE, SKY, skyPhrase, kitAdvice, weatherLine })', wxBox));
} catch (err) {
  fail('the weather functions can be extracted', err.message);
}

if (weatherLine) {
  /* 19. routing. LIVE sits after LOCAL and after the joke intercept, so it
     cannot shadow either today - but it is one reorder away from being able
     to, and a helmet that needs the network to open its own faceplate is the
     regression that would matter most. */
  const WEATHER_Qs = [
    'what is the weather', 'what is the weather like today', 'how hot is it',
    'is it going to rain', 'do i need a coat', 'do i need my umbrella',
    'what is the temperature', 'is it sunny', 'is it snowing',
    'what is the forecast for today'
  ];
  // A LIVE entry may carry a `not` that keeps explanations out of the forecast.
  const liveHit = (q) => LIVE.some(l => l.re.test(q) && !(l.not && l.not.test(q)));
  const missed = WEATHER_Qs.filter(q => !liveHit(q));
  const stolen = MUST_BE_LOCAL.filter(c => liveHit(c));
  const joked  = JOKES.slice(0, 40).filter(j => liveHit(j.toLowerCase()));
  /* Questions about how weather works are for the model. Answering "what is
     rain" with a percentage is a non-sequitur, not an answer. */
  const EXPLAIN_Qs = [
    'what is rain', 'why does it rain', 'how does a jacket keep you warm',
    'what are clouds made of', 'why do we need a coat in winter'
  ];
  const explained = EXPLAIN_Qs.filter(q => liveHit(q));
  const wrongRoute = [];
  if (missed.length) wrongRoute.push('  not recognised as weather: ' + missed.join(' | '));
  if (stolen.length) wrongRoute.push('  LIVE would swallow an offline command: ' + stolen.join(' | '));
  if (joked.length)  wrongRoute.push('  LIVE matches a joke: ' + joked.join(' | '));
  if (explained.length)
    wrongRoute.push('  an explanation answered with a forecast: ' + explained.join(' | '));
  if (wrongRoute.length) fail('LIVE routes weather and nothing else', wrongRoute.join(NL));
  else ok();

  /* 20. every WMO code the API can return has words of its own. An unmapped
     code is not a crash, it is "hard to read from here", which would be a
     quiet lie about a sky he can see out of the window. */
  const WMO = [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,
               80,81,82,85,86,95,96,99];
  const unmapped = WMO.filter(c => !SKY[c]);
  const uglyCode = WMO.filter(c => SKY[c] && !/^[\x20-\x7e]+$/.test(SKY[c]));
  const wrongSky = [];
  if (unmapped.length) wrongSky.push('  no words for WMO code: ' + unmapped.join(', '));
  if (uglyCode.length) wrongSky.push('  not plain ASCII: ' + uglyCode.join(', '));
  // The fallback has to survive a code nobody has seen yet.
  if (!skyPhrase(1234)) wrongSky.push('  an unknown code produces nothing at all');
  if (wrongSky.length) fail('every weather code has words of its own', wrongSky.join(NL));
  else ok();

  /* 21. what he actually hears. Everything here is spoken, so it must pass the
     same validator model output does, carry no markdown, and stay short. */
  const wrongLine = [];
  for (const code of WMO)
    for (const t of [-25, -5, 0, 4, 5, 12, 13, 20, 26, 35, 45])
      for (const rain of [0, 29, 30, 50, 69, 70, 100])
        for (const intent of ['now', 'rain'])
          for (const place of ['', 'Reading']) {
            const line = weatherLine({ tempC: t, code, rainPct: rain }, intent, place);
            const say = (what) => '  ' + what + ': code ' + code + ', ' + t + 'C, ' +
                                  rain + '%, ' + intent + ' -> "' + line + '"';
            if (!contentOK(line)) { wrongLine.push(say('blocked by contentOK')); }
            else if (!/^[\x20-\x7e]+$/.test(line)) { wrongLine.push(say('not plain ASCII')); }
            else if (/[*#`_]/.test(line)) { wrongLine.push(say('carries markdown')); }
            else if (!line.includes(String(t) + ' degrees')) { wrongLine.push(say('does not say the temperature')); }
            else if (line.split('.').filter(x => x.trim()).length > 3) { wrongLine.push(say('more than three sentences')); }
            if (wrongLine.length > 4) break;
          }
  /* Cold beats rain: at four degrees he is told to wrap up warm even when it
     is also about to pour, because being cold is the thing he will not
     mention. This is the one ordering in kitAdvice that is a judgement rather
     than a threshold, so it is asserted rather than left to reading. */
  if (!/hat and gloves/i.test(kitAdvice(3, 100)))
    wrongLine.push('  at 3 degrees and 100% rain he is not told to wrap up warm');
  /* Said aloud, so the article has to agree with the number. "A 82 percent
     chance" reads fine on the page and is wrong out loud, which is the only
     place this sentence ever goes. An eight, an eleven, an eighteen, an
     eighty-something; a everything else. */
  for (const n of [8, 11, 18, 80, 82, 89])
    if (!weatherLine({ tempC: 10, code: 0, rainPct: n }, "rain", "").includes("An " + n + " percent"))
      wrongLine.push("  wrong article: should be an " + n + " percent chance");
  for (const n of [7, 9, 12, 19, 79, 90])
    if (!weatherLine({ tempC: 10, code: 0, rainPct: n }, "rain", "").includes("A " + n + " percent"))
      wrongLine.push("  wrong article: should be a " + n + " percent chance");
  if (!/coat/i.test(kitAdvice(15, 80)))
    wrongLine.push('  at 15 degrees and 80% rain he is not told to take a coat');
  if (wrongLine.length) fail('everything he is told about the weather is sayable', wrongLine.join(NL));
  else ok();
}

/* ---------- 24-26. the music path ---------- */
/* Phase 4's whole safety argument is the fixed list: he can play what is on it
   and nothing else, with no search, no recommendation and no autoplay of
   whatever YouTube would pick next. Two things have to hold for that to mean
   anything - an id has to be read exactly or refused, and the commands must
   not reach past the list. Both are decidable here. */

let TRACKS, youtubeId, parseTracks, trackNameFrom;
try {
  const musicBox = { console: { log: () => {} } };
  vm.createContext(musicBox);
  vm.runInContext(
    slice('const TRACKS = [', NL + '];') + NL +
    slice('function youtubeId(s){', NL + '}') + NL +
    slice('function parseTracks(text){', NL + '}') + NL +
    slice('function trackNameFrom(c){', NL + '}') + NL +
    ';({ TRACKS, youtubeId, parseTracks, trackNameFrom })', musicBox);
  ({ TRACKS, youtubeId, parseTracks, trackNameFrom } =
    vm.runInContext('({ TRACKS, youtubeId, parseTracks, trackNameFrom })', musicBox));
} catch (err) {
  fail('the music functions can be extracted', err.message);
}

if (youtubeId) {
  /* 24. reading an id. A wrong id is not a broken link, it is an unknown video
     playing in a helmet, so anything not recognised must come back empty
     rather than half-parsed. */
  const ID = 'dQw4w9WgXcQ';       // shape only - eleven of the legal characters
  const takes = [
    ['https://www.youtube.com/watch?v=' + ID, ID],
    ['https://www.youtube.com/watch?v=' + ID + '&list=PLxx&index=2', ID],
    ['https://youtu.be/' + ID, ID],
    ['https://youtu.be/' + ID + '?t=42', ID],
    ['https://www.youtube.com/embed/' + ID, ID],
    ['https://www.youtube.com/shorts/' + ID, ID],
    ['  ' + ID + '  ', ID],
    ['', ''],
    ['not a link at all', ''],
    ['https://example.com/watch?v=short', ''],
    ['https://www.youtube.com/watch?v=tooshort', ''],
    ['https://vimeo.com/123456789', ''],
    // A bare token has to be exactly eleven characters. Anything else is a
    // guess, and a guessed id plays a video nobody chose.
    ['shortid', ''],
    ['way_too_long_for_an_id', ''],
    ['dQw4w9WgXc', ''],
    ['dQw4w9WgXcQQ', '']
  ];
  const wrongId = takes
    .filter(([input, want]) => youtubeId(input) !== want)
    .map(([input, want]) => '  "' + input + '" -> "' + youtubeId(input) + '", wanted "' + want + '"');
  if (wrongId.length) fail('a YouTube id is read exactly or refused', wrongId.join(NL));
  else ok();

  /* 25. the playlist a parent types. Bad lines come back rather than vanishing:
     a list that quietly lost half its entries is worse than one that says
     which lines it could not read. */
  const parsed = parseTracks([
    'Dinosaur Song = https://youtu.be/' + ID,
    '',
    '   ',
    'Space = https://www.youtube.com/watch?v=' + ID,
    'no equals sign here',
    'Missing Id = ',
    ' = https://youtu.be/' + ID
  ].join('\n'));
  const wrongParse = [];
  if (parsed.out.length !== 2) wrongParse.push('  kept ' + parsed.out.length + ' tracks, wanted 2');
  if (parsed.bad.length !== 3) wrongParse.push('  reported ' + parsed.bad.length + ' bad lines, wanted 3');
  // Lower-cased, because what he says is lower-cased before it ever gets here.
  if (parsed.out[0] && parsed.out[0].name !== 'dinosaur song')
    wrongParse.push('  name not lower-cased: "' + parsed.out[0].name + '"');
  if (parsed.out[0] && parsed.out[0].id !== ID)
    wrongParse.push('  id not extracted: "' + parsed.out[0].id + '"');
  if (parseTracks('').out.length) wrongParse.push('  an empty playlist produced tracks');
  if (wrongParse.length) fail('a typed playlist keeps what it can and reports the rest', wrongParse.join(NL));
  else ok();

  /* 26. routing, and the shipped list. Music commands are on LOCAL so they are
     never sent to a model to be interpreted - "play the dinosaur song" reaching
     a 3B model is how he gets a different song. */
  const MUSIC_Qs = [
    'play some music', 'put some music on', 'music on',
    'stop the music', 'turn off the music', 'music off',
    'next song', 'skip this track', 'play the dinosaur song', 'put on the space track'
  ];
  const wrongMusic = [];
  const unrouted = MUSIC_Qs.filter(q => !LOCAL.some(l => l.re.test(q)));
  if (unrouted.length) wrongMusic.push('  not routed locally: ' + unrouted.join(' | '));
  // A bare "play X" catch-all would answer these with "I do not have that one".
  const NOT_MUSIC = ['play a game', 'play rock paper scissors', 'play with me', 'lets play outside'];
  const hijacked = NOT_MUSIC.filter(q => LOCAL.some(l => l.re.test(q)));
  if (hijacked.length) wrongMusic.push('  swallowed by the music commands: ' + hijacked.join(' | '));
  // Jokes are intercepted before LOCAL, so a music command that also looks like
  // a joke request would never reach the music at all.
  const jokeFirst = MUSIC_Qs.filter(q => JOKE_RE.test(q));
  if (jokeFirst.length) wrongMusic.push('  intercepted as a joke: ' + jokeFirst.join(' | '));
  if (trackNameFrom('play the dinosaur song') !== 'dinosaur')
    wrongMusic.push('  the track name came out as "' + trackNameFrom('play the dinosaur song') + '"');
  if (trackNameFrom('put on the space track') !== 'space')
    wrongMusic.push('  the track name came out as "' + trackNameFrom('put on the space track') + '"');
  /* Anything shipped in TRACKS is a real id somebody chose. Empty is fine and
     is the default; malformed is not, because it would play something nobody
     picked. */
  TRACKS.forEach((t, i) => {
    if (!t.name || t.name !== String(t.name).toLowerCase())
      wrongMusic.push('  TRACKS[' + i + '] has no lower-case name');
    if (!/^[A-Za-z0-9_-]{11}$/.test(t.id || ''))
      wrongMusic.push('  TRACKS[' + i + '] ("' + t.name + '") is not a valid id: "' + t.id + '"');
  });
  if (wrongMusic.length) fail('music commands reach the list and nothing else', wrongMusic.join(NL));
  else ok();
}

report();

/* ---------- reporting ---------- */

function report() {
  if (!failures.length) {
    console.log(`check: ${checks} checks passed (${JOKES?.length ?? '?'} jokes, ${BLOCK?.length ?? '?'} block rules)`);
    process.exit(0);
  }
  console.error(`check: ${failures.length} FAILED of ${checks + failures.length} in index.html\n`);
  for (const f of failures) console.error(`  x ${f.name}\n${f.detail}\n`);
  process.exit(HOOK ? 2 : 1);
}
