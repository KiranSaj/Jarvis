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
