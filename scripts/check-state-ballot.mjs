// Validates src/data/state/*.json against the StateBallot shape in
// src/lib/stateBallot.ts. Usage: node scripts/check-state-ballot.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "src", "data", "state");
const PARTIES = new Set(["Democratic", "Republican", "Libertarian", "Green", "Independent", "Nonpartisan", "Other"]);
const errors = [];
const keys = new Set();

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isUrl = (v) => isStr(v) && /^https:\/\/[^\s]+$/.test(v);
function need(cond, where, msg) {
  if (!cond) errors.push(`${where}: ${msg}`);
}

function checkCandidate(c, where) {
  need(isStr(c.key) && /^[a-z0-9-]+$/.test(c.key), where, `bad key ${JSON.stringify(c.key)}`);
  need(!keys.has(c.key), where, `duplicate key ${c.key}`);
  keys.add(c.key);
  need(isStr(c.name), where, "missing name");
  need(PARTIES.has(c.party), where, `bad party ${JSON.stringify(c.party)}`);
  need(typeof c.incumbent === "boolean", where, "incumbent must be boolean");
  need(c.runningMate === undefined || isStr(c.runningMate), where, "bad runningMate");
  need(c.writeIn === undefined || typeof c.writeIn === "boolean", where, "bad writeIn");
  need(c.website === undefined || isUrl(c.website), where, `bad website ${c.website}`);
}

function checkContest(c, where) {
  need(isStr(c.office), where, "missing office");
  need(c.seats === undefined || (Number.isInteger(c.seats) && c.seats > 0), where, "bad seats");
  need(Array.isArray(c.candidates) && c.candidates.length > 0, where, "no candidates");
  need(isUrl(c.source), where, "bad source");
  (c.candidates ?? []).forEach((x, i) => checkCandidate(x, `${where} > ${x.name ?? i}`));
}

function checkMeasure(m, where) {
  for (const f of ["id", "title", "summary", "yesMeans", "noMeans"]) need(isStr(m[f]), where, `missing ${f}`);
  need(isUrl(m.source), where, "bad source");
  need(m.moreInfo === undefined || isUrl(m.moreInfo), where, "bad moreInfo");
}

function checkSection(s, where) {
  need(Array.isArray(s?.contests) && Array.isArray(s?.measures), where, "needs contests[] and measures[]");
  (s?.contests ?? []).forEach((c) => checkContest(c, `${where} > ${c.office}`));
  (s?.measures ?? []).forEach((m) => checkMeasure(m, `${where} > ${m.id}`));
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
for (const file of files) {
  const b = JSON.parse(readFileSync(join(DIR, file), "utf8"));
  const w = file;
  need(b.state === file.replace(".json", ""), w, "state must match filename");
  need(/^\d{4}-\d{2}-\d{2}$/.test(b.electionDate), w, "bad electionDate");
  need(/^\d{4}-\d{2}-\d{2}$/.test(b.verifiedAt), w, "bad verifiedAt");
  need(isStr(b.notice), w, "missing notice");
  need(Array.isArray(b.sources) && b.sources.every(isUrl), w, "sources must be https URLs");
  need(Array.isArray(b.gaps) && b.gaps.every(isStr), w, "gaps must be strings");
  checkSection(b.statewide, `${w} statewide`);
  for (const chamber of ["senate", "house"]) {
    const map = b.legislative?.[chamber];
    need(map && typeof map === "object", w, `missing legislative.${chamber}`);
    for (const [d, c] of Object.entries(map ?? {})) {
      need(/^[1-9]\d*$/.test(d), w, `${chamber} district key "${d}" must have no leading zeros`);
      checkContest(c, `${w} ${chamber} ${d}`);
    }
  }
  for (const [county, cb] of Object.entries(b.counties ?? {})) {
    checkSection(cb, `${w} ${county}`);
    need(cb.note === undefined || isStr(cb.note), `${w} ${county}`, "bad note");
    for (const [place, mb] of Object.entries(cb.municipalities ?? {})) checkSection(mb, `${w} ${county} > ${place}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`OK: ${files.length} state file(s), ${keys.size} candidates`);
