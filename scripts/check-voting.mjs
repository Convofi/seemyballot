// Validates src/data/voting2026.json: every state + DC present, every field present
// with the right type, and every date/time parses.
// Usage: node scripts/check-voting.mjs
import { readFile } from "node:fs/promises";

const STATES = (
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY " +
  "NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY"
).split(" ");
const WHO = ["any voter", "excuse required", "all-mail state"];
const TIME = /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/;

const data = JSON.parse(await readFile(new URL("../src/data/voting2026.json", import.meta.url), "utf8"));
const errors = [];

function isoDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function check(abbr, s) {
  const err = (m) => errors.push(`${abbr}: ${m}`);
  const str = (v) => typeof v === "string" && v.trim().length > 0;
  const optStr = (v, path) => v === undefined || str(v) || err(`${path} must be a non-empty string if present`);

  if (!str(s.name)) err("name missing");

  const p = s.pollHours ?? {};
  if (!TIME.test(p.open ?? "")) err(`pollHours.open "${p.open}" is not like "7:00 AM"`);
  if (!TIME.test(p.close ?? "")) err(`pollHours.close "${p.close}" is not like "7:00 PM"`);
  optStr(p.note, "pollHours.note");

  const e = s.earlyVoting ?? {};
  if (typeof e.available !== "boolean") err("earlyVoting.available must be boolean");
  for (const k of ["start", "end"]) {
    if (e[k] !== undefined && !isoDate(e[k])) err(`earlyVoting.${k} "${e[k]}" is not a valid YYYY-MM-DD date`);
  }
  if (e.available && (!e.start || !e.end) && !str(e.note)) err("earlyVoting available without start/end needs a note");
  if (e.start && e.end && e.start > e.end) err("earlyVoting.start is after end");
  if (e.end && e.end > "2026-11-02") err("earlyVoting.end is after Nov 2, 2026");
  optStr(e.note, "earlyVoting.note");

  const m = s.mailBallot ?? {};
  if (!WHO.includes(m.whoCanVote)) err(`mailBallot.whoCanVote "${m.whoCanVote}" not one of ${WHO.join(" | ")}`);
  if (!str(m.returnDeadline)) err("mailBallot.returnDeadline missing");
  optStr(m.requestDeadline, "mailBallot.requestDeadline");
  optStr(m.note, "mailBallot.note");

  if (typeof s.sameDayRegistration !== "boolean") err("sameDayRegistration must be boolean");
  if (!str(s.sameDayRegistrationNote)) err("sameDayRegistrationNote missing");
  if (typeof s.registrationDeadlinePassed !== "boolean") err("registrationDeadlinePassed must be boolean");
  if (!str(s.registrationNote)) err("registrationNote missing");
  if (!str(s.voterId)) err("voterId missing");
  if (!str(s.lineRule)) err("lineRule missing");
  optStr(s.sourceNote, "sourceNote");

  if (!Array.isArray(s.sources) || s.sources.length === 0) err("sources must be a non-empty array");
  else
    for (const u of s.sources) {
      try {
        if (new URL(u).protocol !== "https:" && new URL(u).protocol !== "http:") throw 0;
      } catch {
        err(`source "${u}" is not a URL`);
      }
    }

  if (!str(s.verifiedAt) || Number.isNaN(Date.parse(s.verifiedAt)) || !/^\d{4}-\d{2}-\d{2}T/.test(s.verifiedAt))
    err(`verifiedAt "${s.verifiedAt}" is not an ISO timestamp`);
}

for (const abbr of STATES) {
  if (!data[abbr]) errors.push(`${abbr}: missing`);
  else check(abbr, data[abbr]);
}
for (const k of Object.keys(data)) if (!STATES.includes(k)) errors.push(`${k}: unknown key`);

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} problem(s); ${Object.keys(data).length}/${STATES.length} states present.`);
  process.exit(1);
}
console.log(`OK: ${STATES.length} states, all fields valid.`);
