#!/usr/bin/env node
// Work queue for candidate-position research agents (docs/POSITIONS_AGENT_BRIEF.md).
//
//   node scripts/positions-queue.mjs list                 prioritized keys with no positions entry yet
//   node scripts/positions-queue.mjs batch <n> [--size 30] write the next n batch files to
//                                                         src/data/positions/queue/batch-<nnn>.json
//   node scripts/positions-queue.mjs status               done / pending / total
//   node scripts/positions-queue.mjs tier2 list           tier-2 universe (docs/POSITIONS_TIER2_BRIEF.md)
//   node scripts/positions-queue.mjs tier2 batch <n> [--size 30]
//                                                         write src/data/positions/queue/tier2-<nnn>.json
//   node scripts/positions-queue.mjs tier2 status         tier-2 done / pending
//
// Universe = every federal general-election nominee the app shows (the `likely`
// tier of src/lib/fec.ts, loaded through jiti so it is the exact same code,
// including "wiki:*" keys) + every candidate in src/data/state/*.json, minus
// write-ins. A key counts as done once any src/data/positions/*.json file has
// an entry for it, whatever its status. Batches never overlap: `batch` skips
// keys that are already in a queue file or a positions file.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "jiti";

const ROOT = join(import.meta.dirname, "..");
const POSITIONS_DIR = join(ROOT, "src", "data", "positions");
const QUEUE_DIR = join(POSITIONS_DIR, "queue");
const STATE_DIR = join(ROOT, "src", "data", "state");

// Rough 2020-census population order (DC placed by population).
const BY_POPULATION =
  "CA TX FL NY PA IL OH GA NC MI NJ VA WA AZ MA TN IN MD MO WI CO MN SC AL LA KY OR OK CT UT IA NV AR MS KS NM NE ID WV HI NH ME MT RI DE SD ND AK DC VT WY".split(
    " ",
  );
// Same set /api/contests accepts.
const APP_STATES = new Set(BY_POPULATION);
const STATE_NAMES = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(join(ROOT, "src", "data", "states.json"), "utf8"))).map(([k, v]) => [k, v.name]),
);
const stateName = (st) => STATE_NAMES[st] ?? st;

export const GROUPS = {
  1: "U.S. Senate nominees",
  2: "Governor / Lt. Governor tickets",
  3: "U.S. House nominees",
  4: "Other statewide executive offices",
  5: "Judicial / retention and everything else",
  6: "Local judges (county files)",
};
// Yes/no retention questions: judges almost never run campaign sites; skipped.
const RETENTION = /\b(retain|retention)\b/i;
const JUDICIAL = /\b(judge|justice|court|retention|retain)\b/i;
const GOVERNOR = /^(governor|lieutenant governor|lt\.? governor)\b(?! of )/i;
// Statewide, but boards/trustees rather than executive offices.
const BOARD = /\b(board|regent|trustee|governor of)\b/i;

// ---------- federal: the app's own fec.ts ----------
async function federalCandidates() {
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": join(ROOT, "src"),
      // positions.ts is server-only; outside Next the guard is a no-op.
      "server-only": join(ROOT, "node_modules", "next", "dist", "compiled", "server-only", "empty.js"),
    },
  });
  const { getFederalContests, MissingDataError } = await jiti.import(join(ROOT, "src", "lib", "fec.ts"));
  const raceKeys = new Set([
    ...Object.keys(JSON.parse(readFileSync(join(ROOT, "src", "data", "fec2026.json"), "utf8")).races),
    ...Object.keys(JSON.parse(readFileSync(join(ROOT, "src", "data", "nominees2026.json"), "utf8")).races),
  ]);
  const houseByState = new Map();
  for (const k of raceKeys) {
    const [st, office, district] = k.split("-");
    if (office !== "H" || !APP_STATES.has(st)) continue;
    houseByState.set(st, [...(houseByState.get(st) ?? []), district]);
  }

  const out = [];
  const add = (contest, st, office, group) => {
    for (const c of contest.likely) {
      if (c.writeIn) continue;
      out.push({
        key: c.candidateId,
        name: c.name,
        party: c.party,
        office,
        state: st,
        knownWebsite: null,
        fecUrl: c.fecUrl,
        incumbent: c.incumbent,
        group,
      });
    }
  };
  const guard = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof MissingDataError) return null;
      throw e;
    }
  };
  for (const st of BY_POPULATION) {
    const senate = (await guard(() => getFederalContests(st, null)))?.senate;
    if (senate) add(senate, st, `U.S. Senate${senate.special ? " (special election)" : ""}, ${stateName(st)}`, 1);
    for (const d of (houseByState.get(st) ?? []).sort()) {
      const house = (await guard(() => getFederalContests(st, String(Number(d)))))?.house;
      if (!house) continue;
      const where = d === "00" ? "At-Large" : `District ${Number(d)}`;
      add(house, st, `U.S. House, ${stateName(st)} ${where}`, 3);
    }
  }
  return out;
}

// ---------- state / local: src/data/state/*.json ----------
function stateCandidates() {
  const out = [];
  for (const f of readdirSync(STATE_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const ballot = JSON.parse(readFileSync(join(STATE_DIR, f), "utf8"));
    const st = ballot.state;
    const countyDir = join(STATE_DIR, "counties", st);
    for (const cf of existsSync(countyDir) ? readdirSync(countyDir).filter((x) => x.endsWith(".json")) : []) {
      const c = JSON.parse(readFileSync(join(countyDir, cf), "utf8"));
      ballot.counties[c.county] = c;
    }
    const name = stateName(st);
    const add = (contests, where, statewide) => {
      for (const contest of contests) {
        if (!statewide && RETENTION.test(contest.office)) continue;
        const group = JUDICIAL.test(contest.office)
          ? (where ? 6 : 5)
          : statewide && GOVERNOR.test(contest.office)
            ? 2
            : statewide && !BOARD.test(contest.office)
              ? 4
              : 5;
        const office = contest.office.includes(name) && !where ? contest.office : `${contest.office}, ${where ? `${where}, ` : ""}${name}`;
        for (const c of contest.candidates) {
          if (c.writeIn) continue;
          out.push({
            key: c.key,
            name: c.name,
            party: c.party,
            office,
            state: st,
            knownWebsite: c.website ?? null,
            fecUrl: null,
            incumbent: c.incumbent ?? null,
            group,
          });
        }
      }
    };
    add(ballot.statewide.contests, null, true);
    for (const chamber of ["senate", "house"]) add(Object.values(ballot.legislative[chamber]), null, false);
    for (const [county, cb] of Object.entries(ballot.counties)) {
      add(cb.contests, county, false);
      for (const [place, mb] of Object.entries(cb.municipalities)) add(mb.contests, `${place}, ${county}`, false);
    }
  }
  return out;
}

// ---------- queue ----------
const partyRank = (p) => (p === "Democratic" || p === "Republican" ? 0 : 1);
const stateRank = (st) => {
  const i = BY_POPULATION.indexOf(st);
  return i === -1 ? BY_POPULATION.length : i;
};

/** Every candidate, deduped by key (highest-priority listing kept), in priority order. */
async function universe() {
  const all = [...(await federalCandidates()), ...stateCandidates()].map((c, i) => ({ ...c, i }));
  all.sort(
    (a, b) =>
      a.group - b.group || partyRank(a.party) - partyRank(b.party) || stateRank(a.state) - stateRank(b.state) || a.i - b.i,
  );
  const seen = new Set();
  return all.filter((c) => !seen.has(c.key) && seen.add(c.key));
}

function positionKeys() {
  const keys = new Set();
  for (const f of readdirSync(POSITIONS_DIR).filter((f) => f.endsWith(".json")))
    for (const k of Object.keys(JSON.parse(readFileSync(join(POSITIONS_DIR, f), "utf8")))) keys.add(k);
  return keys;
}

function batchFiles() {
  mkdirSync(QUEUE_DIR, { recursive: true });
  return readdirSync(QUEUE_DIR)
    .filter((f) => /^batch-\d{3,}\.json$/.test(f))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(QUEUE_DIR, f), "utf8")) }));
}

// ---------- tier 2: candidates whose own campaign site gave no positions ----------
const TIER2_PRIOR = new Set(["no_website_found", "website_no_issues_page", "website_unreachable"]);

/** Tier-1 entries merged as src/lib/positions.ts does (file-name order, "ok" wins); tier2-* files excluded. */
function mergedTier1() {
  const data = new Map();
  for (const f of readdirSync(POSITIONS_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("tier2-")).sort()) {
    for (const [key, entry] of Object.entries(JSON.parse(readFileSync(join(POSITIONS_DIR, f), "utf8")))) {
      if (data.get(key)?.status === "ok" && entry.status !== "ok") continue;
      data.set(key, entry);
    }
  }
  return data;
}

function tier2Files() {
  mkdirSync(QUEUE_DIR, { recursive: true });
  return readdirSync(QUEUE_DIR)
    .filter((f) => /^tier2-\d{3,}\.json$/.test(f))
    .sort()
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(QUEUE_DIR, f), "utf8")) }));
}

/** Keys with an entry in any src/data/positions/tier2-*.json. */
function tier2Done() {
  const keys = new Set();
  for (const f of readdirSync(POSITIONS_DIR).filter((f) => /^tier2-\d{3,}\.json$/.test(f)))
    for (const k of Object.keys(JSON.parse(readFileSync(join(POSITIONS_DIR, f), "utf8")))) keys.add(k);
  return keys;
}

/** Non-judicial candidates whose merged tier-1 status found no positions, in priority order (all, incl. covered). */
async function tier2Universe() {
  const merged = mergedTier1();
  return (await universe())
    .filter((c) => TIER2_PRIOR.has(merged.get(c.key)?.status) && !JUDICIAL.test(c.office))
    .map((c) => ({ ...c, priorStatus: merged.get(c.key).status, knownWebsite: merged.get(c.key).website ?? c.knownWebsite }));
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = rest.indexOf(name);
  return i === -1 ? dflt : rest[i + 1];
};

if (cmd === "list") {
  const done = positionKeys();
  const todo = (await universe()).filter((c) => !done.has(c.key));
  let group = 0;
  for (const c of todo) {
    if (c.group !== group) {
      group = c.group;
      const n = todo.filter((x) => x.group === group).length;
      console.log(`\n## ${group}. ${GROUPS[group]} (${n})`);
    }
    console.log(`${c.key}\t${c.name}\t${c.party}\t${c.office}`);
  }
  console.log(`\n${todo.length} candidate(s) without a positions entry.`);
} else if (cmd === "batch") {
  const count = Number(rest[0]);
  const size = Number(flag("--size", "30"));
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(size) || size < 1) {
    console.error("Usage: node scripts/positions-queue.mjs batch <n> [--size 30]");
    process.exit(1);
  }
  const batches = batchFiles();
  const taken = positionKeys();
  for (const b of batches) for (const c of b.candidates) taken.add(c.key);
  const todo = (await universe()).filter((c) => !taken.has(c.key));
  let next = Math.max(0, ...batches.map((b) => Number(b.batch))) + 1;
  for (let n = 0; n < count && todo.length; n++, next++) {
    const id = String(next).padStart(3, "0");
    const candidates = todo.splice(0, size).map(({ key, name, party, office, state, knownWebsite, fecUrl }) => ({
      key,
      name,
      party,
      office,
      state,
      knownWebsite,
      fecUrl,
      status: "pending",
    }));
    const file = join(QUEUE_DIR, `batch-${id}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        { batch: id, createdAt: new Date().toISOString(), output: `src/data/positions/batch-${id}.json`, candidates },
        null,
        1,
      ) + "\n",
    );
    console.log(`wrote src/data/positions/queue/batch-${id}.json (${candidates.length} candidates)`);
  }
  console.log(`${todo.length} candidate(s) left unbatched.`);
} else if (cmd === "status") {
  const all = await universe();
  const done = positionKeys();
  const batched = new Set();
  for (const b of batchFiles()) {
    const keys = b.candidates.map((c) => c.key);
    keys.forEach((k) => batched.add(k));
    console.log(`batch-${b.batch}: ${keys.filter((k) => done.has(k)).length}/${keys.length} done`);
  }
  console.log("");
  for (const g of Object.keys(GROUPS).map(Number)) {
    const inGroup = all.filter((c) => c.group === g);
    console.log(`${g}. ${GROUPS[g]}: ${inGroup.filter((c) => done.has(c.key)).length}/${inGroup.length} done`);
  }
  const nDone = all.filter((c) => done.has(c.key)).length;
  const nBatched = all.filter((c) => !done.has(c.key) && batched.has(c.key)).length;
  console.log(
    `\nTotal ${all.length}: done ${nDone}, pending ${all.length - nDone} ` +
      `(${nBatched} in a batch, ${all.length - nDone - nBatched} not yet batched).`,
  );
} else if (cmd === "tier2" && rest[0] === "list") {
  const done = tier2Done();
  for (const b of tier2Files()) for (const c of b.candidates) done.add(c.key);
  const todo = (await tier2Universe()).filter((c) => !done.has(c.key));
  let group = 0;
  for (const c of todo) {
    if (c.group !== group) {
      group = c.group;
      const n = todo.filter((x) => x.group === group).length;
      console.log(`\n## ${group}. ${GROUPS[group]} (${n})`);
    }
    console.log(`${c.key}\t${c.name}\t${c.party}\t${c.office}\t${c.priorStatus}`);
  }
  console.log(`\n${todo.length} tier-2 candidate(s) not yet covered or queued.`);
} else if (cmd === "tier2" && rest[0] === "batch") {
  const count = Number(rest[1]);
  const size = Number(flag("--size", "30"));
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(size) || size < 1) {
    console.error("Usage: node scripts/positions-queue.mjs tier2 batch <n> [--size 30]");
    process.exit(1);
  }
  const batches = tier2Files();
  const taken = tier2Done();
  for (const b of batches) for (const c of b.candidates) taken.add(c.key);
  const todo = (await tier2Universe()).filter((c) => !taken.has(c.key));
  let next = Math.max(0, ...batches.map((b) => Number(b.batch))) + 1;
  for (let n = 0; n < count && todo.length; n++, next++) {
    const id = String(next).padStart(3, "0");
    const candidates = todo
      .splice(0, size)
      .map(({ key, name, party, office, state, incumbent, knownWebsite, fecUrl, priorStatus }) => ({
        key,
        name,
        party,
        office,
        state,
        incumbent,
        knownWebsite,
        fecUrl,
        priorStatus,
        status: "pending",
      }));
    const file = join(QUEUE_DIR, `tier2-${id}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        { batch: id, createdAt: new Date().toISOString(), output: `src/data/positions/tier2-${id}.json`, candidates },
        null,
        1,
      ) + "\n",
    );
    console.log(`wrote src/data/positions/queue/tier2-${id}.json (${candidates.length} candidates)`);
  }
  console.log(`${todo.length} tier-2 candidate(s) left unbatched.`);
} else if (cmd === "tier2" && rest[0] === "status") {
  const all = await tier2Universe();
  const done = tier2Done();
  const batched = new Set();
  for (const b of tier2Files()) {
    const keys = b.candidates.map((c) => c.key);
    keys.forEach((k) => batched.add(k));
    console.log(`tier2-${b.batch}: ${keys.filter((k) => done.has(k)).length}/${keys.length} done`);
  }
  // Union, in case a key left the tier-1 universe after it was queued.
  const keys = new Set([...all.map((c) => c.key), ...done, ...batched]);
  const nDone = [...keys].filter((k) => done.has(k)).length;
  const nBatched = [...keys].filter((k) => !done.has(k) && batched.has(k)).length;
  console.log(
    `\nTier 2 total ${keys.size}: done ${nDone}, pending ${keys.size - nDone} ` +
      `(${nBatched} in a batch, ${keys.size - nDone - nBatched} not yet batched).`,
  );
} else {
  console.error(
    "Usage: node scripts/positions-queue.mjs (list | batch <n> [--size 30] | status | tier2 (list | batch <n> [--size 30] | status))",
  );
  process.exit(1);
}
