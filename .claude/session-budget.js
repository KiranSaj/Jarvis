// Reports how much of the Claude plan budget this machine has consumed, so a session
// can stop at a clean boundary instead of dying mid-edit.
//
// Claude Code Desktop samples plan usage every ~5 minutes into plan-usage-history.json.
// That file is the only local surface carrying it: the documented `rate_limits.*` fields
// go to a status-line script, and Desktop renders no status line, so on this setup they
// are never produced. Reading Desktop's own store needs no configuration at all.
//
// Sample shape: { t: epoch_ms, org: uuid, u: { fh: <5h percent>, sd: <7d percent> } }
//
// Usage:  node .claude/session-budget.js
// Exits 0 with GO under the threshold, 0 with STOP over it, and 0 with UNKNOWN when the
// file is absent. Never exits non-zero — an unreadable budget is not a build failure.

const fs = require("fs");
const os = require("os");
const path = require("path");

const THRESHOLD = 75;

function storePath() {
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "Claude", "plan-usage-history.json");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(), "Library", "Application Support", "Claude",
      "plan-usage-history.json"
    );
  }
  return path.join(os.homedir(), ".config", "Claude", "plan-usage-history.json");
}

function minutes(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) {
    return m + "m";
  }
  return Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0") + "m";
}

const file = storePath();
let samples;
try {
  samples = JSON.parse(fs.readFileSync(file, "utf8")).samples;
} catch {
  console.log("UNKNOWN — no plan usage store at " + file);
  console.log("Fall back on judgement; do not read this as zero.");
  process.exit(0);
}

if (!Array.isArray(samples) || samples.length === 0) {
  console.log("UNKNOWN — plan usage store is empty.");
  process.exit(0);
}

const last = samples[samples.length - 1];
const fh = last.u && last.u.fh;
const sd = last.u && last.u.sd;
const age = Date.now() - last.t;

// Burn rate over roughly the last half hour. Fewer than two samples in that span means
// the app was closed or idle, and an extrapolation from one point would be invented.
const window = samples.filter((s) => last.t - s.t <= 30 * 60000);
let projection = null;
if (window.length >= 2) {
  const first = window[0];
  const spanMin = (last.t - first.t) / 60000;
  const rate = (fh - first.u.fh) / spanMin;
  if (spanMin >= 5 && rate > 0.01) {
    const remaining = (THRESHOLD - fh) / rate;
    projection = {
      perHour: (rate * 60).toFixed(1),
      toThreshold: remaining > 0 ? minutes(remaining * 60000) : "already past",
    };
  }
}

const verdict = fh >= THRESHOLD ? "STOP" : "GO";
console.log(
  verdict + " — 5h window " + fh + "% used (threshold " + THRESHOLD + "%), 7d " + sd + "%"
);
console.log("sample age: " + minutes(age) + (age > 15 * 60000 ? "  ⚠ stale" : ""));
if (projection) {
  console.log(
    "burn rate: ~" + projection.perHour + "%/hour · reaches threshold in " +
    projection.toThreshold
  );
}
if (verdict === "STOP") {
  console.log("Do not start another queue item. Finish, commit, update BACKLOG.md, hand off.");
}
