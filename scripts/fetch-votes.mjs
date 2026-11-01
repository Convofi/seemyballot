#!/usr/bin/env node
// Voting record for every federal nominee who is a sitting member of Congress
// (the `likely` tier of src/lib/fec.ts, loaded through jiti like fetch-finance).
// Writes src/data/votes2026.json, keyed by FEC candidate_id.
//
//   npm run fetch-votes
//   VOTES_CACHE=/some/dir npm run fetch-votes   # where raw downloads are kept
//
// One uniform rule, nothing hand-picked: every final-passage roll-call vote in
// the member's chamber on a measure that became law in the 119th Congress,
// plus the share of all of that chamber's roll calls the member missed.
//
// Sources:
//   members   unitedstates/congress-legislators legislators-current.json
//             (id.fec -> id.bioguide, current chamber)
//   measures  GovInfo bulk BILLSTATUS XML (hr, s, hjres, sjres): bills with
//             <laws>, and per chamber the last recorded vote whose action is a
//             passage / concurrence vote (procedural votes such as cloture skipped)
//   House     Clerk roll-call XML, clerk.house.gov/evs/{year}/rollNNN.xml
//   Senate    senate.gov blocks scripted requests, so member positions come
//             from Voteview's mirror of the Senate roll calls (S119_votes.csv,
//             keyed by ICPSR id; S119_members.csv maps ICPSR to bioguide);
//             links still point to senate.gov.
//
// Resumable: every download is cached (VOTES_CACHE, default $TMPDIR/ballothelper-votes)
// and skipped when present; House rolls are fetched one at a time with a delay.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "src", "data", "votes2026.json");
const CACHE = process.env.VOTES_CACHE || join(tmpdir(), "ballothelper-votes");
const CONGRESS = 119;
const YEARS = { 1: 2025, 2: 2026 };
const RULE =
  "Every final-passage roll-call vote in this chamber on a measure that became law in the 119th Congress, plus the share of all roll-call votes missed. Nothing is hand-picked.";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { "User-Agent": "ballothelper voting-record snapshot (nonpartisan voter guide)" };

/** Download url to file once; returns the file's text. */
async function cached(url, file, { binary = false } = {}) {
  if (!existsSync(file)) {
    mkdirSync(join(file, ".."), { recursive: true });
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120_000) }).catch((e) => ({ ok: false, status: e.message }));
      if (res.ok) {
        await writeFile(file, binary ? Buffer.from(await res.arrayBuffer()) : await res.text());
        break;
      }
      if (attempt >= 4) throw new Error(`${res.status} for ${url}`);
      console.log(`  ${res.status} for ${url}; retry ${attempt}`);
      await sleep(attempt * 5000);
    }
  }
  return binary ? null : readFileSync(file, "utf8");
}

const tag = (xml, name) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1].trim() ?? null;
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
const unescape = (s) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// ---------- universe: the app's own likely tier ----------
const BY_POPULATION =
  "OH CA TX FL NY PA IL GA NC MI NJ VA WA AZ MA TN IN MD MO WI CO MN SC AL LA KY OR OK CT UT IA NV AR MS KS NM NE ID WV HI NH ME MT RI DE SD ND AK DC VT WY".split(
    " ",
  );

async function nominees() {
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": join(ROOT, "src"),
      "server-only": join(ROOT, "node_modules", "next", "dist", "compiled", "server-only", "empty.js"),
    },
  });
  const { getFederalContests, MissingDataError } = await jiti.import(join(ROOT, "src", "lib", "fec.ts"));
  const keys = new Set([
    ...Object.keys(JSON.parse(readFileSync(join(ROOT, "src", "data", "fec2026.json"), "utf8")).races),
    ...Object.keys(JSON.parse(readFileSync(join(ROOT, "src", "data", "nominees2026.json"), "utf8")).races),
  ]);
  const guard = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof MissingDataError) return null;
      throw e;
    }
  };
  const ids = [];
  const add = (contest) => contest?.likely.forEach((c) => !c.candidateId.startsWith("wiki:") && ids.push(c.candidateId));
  for (const st of BY_POPULATION) {
    add((await guard(() => getFederalContests(st, null)))?.senate);
    const districts = [...keys].filter((k) => k.startsWith(`${st}-H-`)).map((k) => k.split("-")[2]).sort();
    for (const d of new Set(districts)) add((await guard(() => getFederalContests(st, String(Number(d)))))?.house);
  }
  return [...new Set(ids)];
}

// ---------- members ----------
async function legislators() {
  const text = await cached(
    "https://unitedstates.github.io/congress-legislators/legislators-current.json",
    join(CACHE, "legislators-current.json"),
  );
  return JSON.parse(text).map((l) => ({
    bioguide: l.id.bioguide,
    fec: l.id.fec ?? [],
    chamber: l.terms.at(-1).type === "sen" ? "senate" : "house",
  }));
}

// ---------- enacted measures ----------
const TYPES = { hr: "H.R.", s: "S.", hjres: "H.J.Res.", sjres: "S.J.Res." };
// Passage, concurrence, or veto-override actions; cloture, motions to proceed,
// table, commit, and points of order are procedural and skipped.
const FINAL = /\bpass(ed)?\b|on passage|agree(d)? to the (house|senate) amendment|concur|override/i;
const PROCEDURAL = /cloture|motion to proceed|to table|to commit|recommit|point of order|motion to waive/i;

function pickTitle(bill) {
  const titles = tags(tag(bill, "titles") ?? "", "item").map((i) => ({ type: tag(i, "titleType"), title: tag(i, "title") }));
  const find = (t) => titles.find((x) => x.type === t)?.title;
  return unescape(find("Short Title(s) as Enacted") ?? find("Popular Titles") ?? find("Display Title"));
}

async function enacted() {
  const dir = join(CACHE, "billstatus");
  const out = [];
  for (const type of Object.keys(TYPES)) {
    const zip = join(dir, `BILLSTATUS-${CONGRESS}-${type}.zip`);
    await cached(`https://www.govinfo.gov/bulkdata/BILLSTATUS/${CONGRESS}/${type}/BILLSTATUS-${CONGRESS}-${type}.zip`, zip, {
      binary: true,
    });
    const files = join(dir, type);
    if (!existsSync(files)) execFileSync("unzip", ["-q", "-o", zip, "-d", files]);
    for (const f of readdirSync(files)) {
      const xml = readFileSync(join(files, f), "utf8");
      const laws = tag(xml, "laws");
      if (!laws) continue;
      const bill = tag(xml, "bill");
      const law = tags(laws, "item").map((i) => `${tag(i, "type")} ${tag(i, "number")}`)[0];
      const actions = tags(tag(bill, "actions") ?? "", "item");
      const lawDate = actions.find((a) => tag(a, "type") === "BecameLaw")?.match(/<actionDate>(.*?)</)?.[1] ?? null;
      const last = {};
      for (const a of actions) {
        const text = tag(a, "text") ?? "";
        if (!FINAL.test(text) || PROCEDURAL.test(text)) continue;
        for (const rv of tags(a, "recordedVote")) {
          const chamber = tag(rv, "chamber").toLowerCase();
          const date = tag(rv, "date");
          if (lawDate && date.slice(0, 10) > lawDate) continue;
          if (!last[chamber] || date > last[chamber].date)
            last[chamber] = { date, roll: Number(tag(rv, "rollNumber")), session: Number(tag(rv, "sessionNumber")), url: tag(rv, "url") };
        }
      }
      if (!Object.keys(last).length) continue;
      out.push({ measure: `${TYPES[type]} ${tag(bill, "number")}`, title: pickTitle(bill), law, last });
    }
  }
  return out;
}

// ---------- House roll calls (Clerk XML) ----------
const NORMALIZE = { Aye: "Yea", Yea: "Yea", No: "Nay", Nay: "Nay", Present: "Present", "Not Voting": "Not Voting" };

/** "{year}-{roll}" -> { date, positions: Map<bioguide, vote> } for every House roll call. */
async function houseRolls() {
  const rolls = new Map();
  for (const year of Object.values(YEARS)) {
    let misses = 0;
    for (let n = 1; misses < 3; n++) {
      const file = join(CACHE, "house", String(year), `roll${String(n).padStart(3, "0")}.xml`);
      const fresh = !existsSync(file);
      const xml = await cached(`https://clerk.house.gov/evs/${year}/roll${String(n).padStart(3, "0")}.xml`, file);
      if (fresh) await sleep(300);
      if (!xml.includes("<rollcall-vote")) {
        misses++;
        // Not published yet: don't cache the placeholder, so a rerun picks it up.
        execFileSync("rm", ["-f", file]);
        continue;
      }
      misses = 0;
      const positions = new Map();
      for (const m of xml.matchAll(/<legislator[^>]*name-id="([^"]+)"[^>]*>[\s\S]*?<\/legislator>\s*<vote>([^<]*)<\/vote>/g))
        positions.set(m[1], m[2]);
      const d = new Date(`${tag(xml, "action-date")} UTC`);
      rolls.set(`${year}-${n}`, { date: d.toISOString().slice(0, 10), positions });
      if (n % 50 === 0) console.log(`  House ${year}: roll ${n}`);
    }
  }
  return rolls;
}

// ---------- Senate roll calls (Voteview mirror) ----------
// Voteview cast codes: 1 Yea, 2-3 paired/announced yea, 4-5 announced/paired nay,
// 6 Nay, 7-8 Present, 9 Not Voting. Paired and announced positions are not
// recorded votes, so they count as Not Voting, as on the official tally.
const CAST = { 1: "Yea", 6: "Nay", 7: "Present", 8: "Present" };

async function senateRolls() {
  const base = "https://voteview.com/static/data/out";
  const calls = await cached(`${base}/rollcalls/S${CONGRESS}_rollcalls.csv`, join(CACHE, "voteview", `S${CONGRESS}_rollcalls.csv`));
  const votes = await cached(`${base}/votes/S${CONGRESS}_votes.csv`, join(CACHE, "voteview", `S${CONGRESS}_votes.csv`));
  const members = await cached(`${base}/members/S${CONGRESS}_members.csv`, join(CACHE, "voteview", `S${CONGRESS}_members.csv`));
  // The legislators file lacks ICPSR ids for some newer senators, so map by bioguide.
  // Names are quoted and contain commas ("TUBERVILLE, Thomas Hawley (Tommy)").
  const fields = (line) => [...line.matchAll(/(?:"((?:[^"]|"")*)"|([^,]*))(?:,|$)/g)].map((m) => m[1] ?? m[2]);
  const [header, ...rows] = members.split("\n").filter(Boolean).map(fields);
  const [ci, cb] = [header.indexOf("icpsr"), header.indexOf("bioguide_id")];
  const bioguide = new Map(rows.filter((f) => f[cb]).map((f) => [f[ci], f[cb]]));
  const rolls = new Map();
  const byVoteview = new Map();
  for (const line of calls.split("\n").slice(1)) {
    // congress,chamber,rollnumber,date,session,clerk_rollnumber,...
    const [, , rollnumber, date, session, clerk] = line.split(",");
    if (!clerk) continue;
    const roll = { date, positions: new Map() };
    rolls.set(`${YEARS[session]}-${clerk}`, roll);
    byVoteview.set(rollnumber, roll);
  }
  for (const line of votes.split("\n").slice(1)) {
    const [, , rollnumber, icpsr, cast] = line.split(",");
    const roll = byVoteview.get(rollnumber);
    if (roll && bioguide.has(icpsr)) roll.positions.set(bioguide.get(icpsr), CAST[cast] ?? "Not Voting");
  }
  return rolls;
}

// ---------- assemble ----------
function missed(rolls, key) {
  let total = 0;
  let miss = 0;
  let through = null;
  for (const r of rolls.values()) {
    const v = r.positions.get(key);
    if (v === undefined) continue;
    total++;
    if (v === "Not Voting") miss++;
    if (!through || r.date > through) through = r.date;
  }
  return total ? { missed: miss, total, pct: Math.round((miss / total) * 1000) / 10, through } : null;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  console.log(`Cache: ${CACHE}`);
  const ids = new Set(await nominees());
  const members = (await legislators()).flatMap((l) => l.fec.filter((f) => ids.has(f)).map((fecId) => ({ fecId, ...l })));
  console.log(`${ids.size} likely nominees with FEC ids; ${members.length} map to sitting members.`);

  const measures = await enacted();
  for (const ch of ["house", "senate"])
    console.log(`${measures.filter((m) => m.last[ch]).length} enacted measures with a final-passage roll call in the ${ch}.`);

  const rolls = { house: await houseRolls(), senate: await senateRolls() };
  console.log(`${rolls.house.size} House and ${rolls.senate.size} Senate roll calls.`);

  const candidates = {};
  for (const m of members) {
    const key = m.bioguide;
    const missedVotes = missed(rolls[m.chamber], key);
    if (!missedVotes) continue; // e.g. delegates, who have no floor votes
    const votes = [];
    for (const x of measures) {
      const rv = x.last[m.chamber];
      if (!rv) continue;
      const roll = rolls[m.chamber].get(`${YEARS[rv.session]}-${rv.roll}`);
      if (!roll) throw new Error(`No ${m.chamber} roll ${rv.session}-${rv.roll} for ${x.measure}`);
      const raw = roll.positions.get(key);
      if (raw === undefined) continue; // not yet a member at the time
      const vote = m.chamber === "house" ? (NORMALIZE[raw] ?? "Yea") : raw;
      const year = YEARS[rv.session];
      const rollUrl =
        m.chamber === "house"
          ? `https://clerk.house.gov/Votes/${year}${rv.roll}`
          : `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${CONGRESS}${rv.session}/vote_${CONGRESS}_${rv.session}_${String(rv.roll).padStart(5, "0")}.htm`;
      votes.push({ measure: x.measure, title: x.title, law: x.law, date: rv.date.slice(0, 10), vote, rollUrl });
    }
    votes.sort((a, b) => b.date.localeCompare(a.date) || a.measure.localeCompare(b.measure));
    candidates[m.fecId] = { bioguide: m.bioguide, chamber: m.chamber, missedVotes, votes };
  }

  const out = { generatedAt: new Date().toISOString(), congress: CONGRESS, rule: RULE, candidates };
  await writeFile(`${OUT}.tmp`, JSON.stringify(out) + "\n");
  await rename(`${OUT}.tmp`, OUT);
  console.log(`Wrote ${Object.keys(candidates).length} candidates to ${OUT}`);
}

await main();
