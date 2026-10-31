#!/usr/bin/env node
// Pull every 2026 House and Senate candidate from OpenFEC into
// src/data/fec2026.json, keyed "{STATE}-{OFFICE}-{DISTRICT}" (e.g. "OH-H-03").
//
//   FEC_API_KEY=... npm run fetch-fec        # DEMO_KEY is 10 requests/hour
//
// Resumable: progress is saved after every page; finished units are skipped
// and a partial unit restarts at its next page. Delete the file to refetch.
//
// We use /candidates/ with NO candidate_status filter, and store raw FEC
// flags so the noise filter lives in src/lib/fec.ts and can be tuned without
// refetching. Reason: on 2026-10-31 both candidate_status=C and
// /candidates/search/ dropped the OH-03 Republican nominee (status "N").
import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../src/data/fec2026.json", import.meta.url);
const ENDPOINT = "https://api.open.fec.gov/v1/candidates/";
const API_KEY = process.env.FEC_API_KEY ?? "DEMO_KEY";

// Senate (all states) first, then House for the states we test with, then the rest.
const PRIORITY_HOUSE = ["OH", "TX", "CA", "DC"];
const ALL_STATES =
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const UNITS = [
  { id: "S", office: "S" },
  ...[...PRIORITY_HOUSE, ...ALL_STATES.filter((s) => !PRIORITY_HOUSE.includes(s))].map(
    (state) => ({ id: `H-${state}`, office: "H", state }),
  ),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return { fetchedAt: null, progress: {}, races: {} };
  }
}

async function save(data) {
  data.fetchedAt = new Date().toISOString();
  // Stable key order keeps diffs readable.
  data.races = Object.fromEntries(Object.entries(data.races).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(OUT, JSON.stringify(data, null, 1) + "\n");
}

async function getPage(unit, page) {
  const params = new URLSearchParams({
    api_key: API_KEY,
    election_year: "2026",
    office: unit.office,
    per_page: "100",
    sort: "candidate_id", // unique, so pagination is stable
    page: String(page),
  });
  if (unit.state) params.set("state", unit.state);

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(30_000) }).catch(
      (e) => ({ ok: false, status: 0, headers: new Headers(), error: e }),
    );
    if (res.ok) {
      const remaining = res.headers.get("x-ratelimit-remaining");
      console.log(`  ${unit.id} page ${page} ok (rate limit remaining: ${remaining ?? "?"})`);
      return res.json();
    }
    if (res.status === 429) {
      // api.data.gov's hourly window is rolling and usually sends no Retry-After.
      const wait = Number(res.headers.get("retry-after")) || 300;
      console.log(`  rate limited; waiting ${wait}s (Ctrl-C is safe, rerun to resume)`);
      await sleep(wait * 1000);
      continue;
    }
    if (attempt >= 5) throw new Error(`FEC ${res.status} for ${unit.id} page ${page}`);
    console.log(`  FEC error ${res.status || res.error}; retry ${attempt}`);
    await sleep(attempt * 10_000);
  }
}

const data = await load();
for (const unit of UNITS) {
  const p = data.progress[unit.id];
  if (p?.done) continue;
  console.log(`${unit.id}…`);
  for (let page = (p?.page ?? 0) + 1; ; page++) {
    const { results, pagination } = await getPage(unit, page);
    for (const r of results) {
      const key = `${r.state}-${r.office}-${r.office === "S" ? "00" : (r.district ?? "00")}`;
      const race = (data.races[key] ??= []);
      const row = {
        candidate_id: r.candidate_id,
        name: r.name,
        party: r.party,
        incumbent_challenge: r.incumbent_challenge,
        candidate_status: r.candidate_status,
        has_raised_funds: r.has_raised_funds,
        inactive_election_years: r.inactive_election_years,
        last_file_date: r.last_file_date,
      };
      const i = race.findIndex((x) => x.candidate_id === r.candidate_id);
      if (i >= 0) race[i] = row;
      else race.push(row);
    }
    const done = page >= pagination.pages;
    data.progress[unit.id] = { page, pages: pagination.pages, done, at: new Date().toISOString() };
    await save(data);
    if (done) break;
  }
}
console.log("All units complete.");
