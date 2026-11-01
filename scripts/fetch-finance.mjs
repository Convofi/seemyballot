#!/usr/bin/env node
// Campaign-finance snapshot for every federal general-election nominee (the
// `likely` tier of src/lib/fec.ts, loaded through jiti so it is the same code
// the app runs; "wiki:*" nominees have no FEC filing and are skipped).
// Writes src/data/finance2026.json, keyed by FEC candidate_id.
//
//   npm run fetch-finance                  # needs FEC_API_KEY in .env.local or env
//   npm run fetch-finance -- --refresh     # refetch everyone
//   npm run fetch-finance -- --only H2OH15228,S6OH00163
//
// Resumable: the file is saved after every candidate and finished ones are
// skipped on the next run. Per candidate (cycle 2026 = the 2025-26 two-year
// period), at most 3 + 2 per principal committee OpenFEC requests:
//   /candidate/{id}/committees/?designation=P     principal committee(s)
//   /candidate/{id}/totals/                       receipts, individual, PAC, self-funding
//   /schedules/schedule_a/by_employer/            top employers of individual donors
//   /schedules/schedule_a/by_size/                small-donor (<$200) share
//   /schedules/schedule_e/by_candidate/           outside spending for / against
// Top PAC/committee donors come from FEC's bulk "contributions from committees
// to candidates" file (pas226.zip, with cm26.zip for committee names), so they
// cost no API requests. Donors are never classified; we store names and sums.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "src", "data", "finance2026.json");
const API = "https://api.open.fec.gov/v1";
const CYCLE = 2026;
const BULK_DIR = join(tmpdir(), "ballothelper-fec-bulk-2026");
const BULK = "https://www.fec.gov/files/bulk-downloads/2026";

function apiKey() {
  if (process.env.FEC_API_KEY) return process.env.FEC_API_KEY;
  const env = join(ROOT, ".env.local");
  const m = existsSync(env) && readFileSync(env, "utf8").match(/^FEC_API_KEY=["']?([^"'\n]+)/m);
  return m ? m[1] : "DEMO_KEY";
}
const API_KEY = apiKey();

const args = process.argv.slice(2);
const REFRESH = args.includes("--refresh");
const ONLY = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
let lastRequest = 0;
// OpenFEC reports x-ratelimit-limit: 60; stay just under one request a second.
const MIN_GAP_MS = 1050;

async function get(path, params = {}) {
  const qs = new URLSearchParams({ ...params, api_key: API_KEY });
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    requests++;
    const res = await fetch(`${API}${path}?${qs}`, { signal: AbortSignal.timeout(30_000) }).catch((e) => ({
      ok: false,
      status: 0,
      headers: new Headers(),
      error: e,
    }));
    if (res.ok) return res.json();
    if (res.status === 429) {
      const secs = Number(res.headers.get("retry-after")) || 120;
      console.log(`  rate limited; waiting ${secs}s (Ctrl-C is safe, rerun to resume)`);
      await sleep(secs * 1000);
      continue;
    }
    if (attempt >= 5) throw new Error(`FEC ${res.status || res.error} for ${path}`);
    console.log(`  FEC error ${res.status || res.error} for ${path}; retry ${attempt}`);
    await sleep(attempt * 10_000);
  }
}

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

// ---------- PAC donors from the bulk file ----------
async function download(name) {
  const zip = join(BULK_DIR, name);
  if (existsSync(zip)) return;
  console.log(`Downloading ${BULK}/${name}…`);
  const res = await fetch(`${BULK}/${name}`);
  if (!res.ok) throw new Error(`${res.status} for ${name}`);
  await writeFile(zip, Buffer.from(await res.arrayBuffer()));
}

/** candidate_id -> top 10 [{ name, committeeId, amount }] of direct committee contributions. */
async function pacDonors() {
  mkdirSync(BULK_DIR, { recursive: true });
  await download("pas226.zip");
  await download("cm26.zip");
  const unzip = (zip, file) =>
    execFileSync("unzip", ["-p", join(BULK_DIR, zip), file], { maxBuffer: 1 << 30 }).toString("utf8");
  const names = new Map();
  for (const line of unzip("cm26.zip", "cm.txt").split("\n")) {
    const f = line.split("|");
    if (f[0]) names.set(f[0], f[1]);
  }
  // itpas2 columns: 0 CMTE_ID (donor), 5 TRANSACTION_TP, 14 TRANSACTION_AMT,
  // 16 CAND_ID, 17 TRAN_ID, 19 MEMO_CD. 24K = direct contribution, 24Z = in-kind;
  // independent expenditures (24E/24A) are covered by schedule E instead.
  // Memo lines (X) restate other lines. The same TRAN_ID can appear in an
  // original and an amended report; the last row seen wins.
  const rows = new Map();
  for (const line of unzip("pas226.zip", "itpas2.txt").split("\n")) {
    const f = line.split("|");
    if (f.length < 20 || !["24K", "24Z"].includes(f[5]) || f[19] === "X" || !f[16]) continue;
    rows.set(`${f[0]}|${f[17] || f[21]}`, { donor: f[0], cand: f[16], amount: Number(f[14]) || 0 });
  }
  const byCand = new Map();
  for (const { donor, cand, amount } of rows.values()) {
    const m = byCand.get(cand) ?? new Map();
    m.set(donor, (m.get(donor) ?? 0) + amount);
    byCand.set(cand, m);
  }
  const out = new Map();
  for (const [cand, m] of byCand) {
    out.set(
      cand,
      [...m]
        .filter(([, amt]) => amt > 0)
        .sort((a, b) => b[1] - a[1] || (names.get(a[0]) ?? a[0]).localeCompare(names.get(b[0]) ?? b[0]))
        .slice(0, 10)
        .map(([id, amt]) => ({ name: names.get(id) ?? id, committeeId: id, amount: round(amt) })),
    );
  }
  return out;
}

// ---------- per-candidate API pull ----------
const round = (n) => Math.round(n * 100) / 100;
const share = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null);

// Employer fields that name no employer; dropped so the list shows employers.
const NOT_EMPLOYERS =
  /^(NONE|N\/?A|NOT EMPLOYED|UNEMPLOYED|RETIRED|SELF|SELF[- ]?EMPLOYED|HOMEMAKER|INFORMATION REQUESTED.*|REQUESTED|NULL|-|\.)?$/;

async function pull(id, pacs) {
  const committees = await get(`/candidate/${id}/committees/`, { designation: "P", cycle: CYCLE, per_page: 20 });
  const committeeIds = committees.results.map((c) => c.committee_id);
  const totals = (await get(`/candidate/${id}/totals/`, { cycle: CYCLE })).results[0];
  if (!totals) return null; // no 2025-26 financial report on file

  const receipts = totals.receipts ?? 0;
  const pacContributions = totals.other_political_committee_contributions ?? 0;
  const selfFunding = (totals.candidate_contribution ?? 0) + (totals.loans_made_by_candidate ?? 0);

  const employers = new Map();
  let small = 0;
  let sized = 0;
  if (receipts > 0) {
    for (const cid of committeeIds) {
      const emp = await get("/schedules/schedule_a/by_employer/", {
        committee_id: cid,
        cycle: CYCLE,
        sort: "-total",
        per_page: 20,
      });
      for (const r of emp.results) {
        const name = (r.employer ?? "").trim();
        if (NOT_EMPLOYERS.test(name.toUpperCase())) continue;
        employers.set(name, (employers.get(name) ?? 0) + r.total);
      }
      const size = await get("/schedules/schedule_a/by_size/", { committee_id: cid, cycle: CYCLE });
      for (const r of size.results) {
        sized += r.total;
        if (r.size === 0) small += r.total;
      }
    }
  }

  const outside = await get("/schedules/schedule_e/by_candidate/", {
    candidate_id: id,
    cycle: CYCLE,
    sort: "-total",
    per_page: 100,
  });
  const spenders = (ind) => {
    const m = new Map();
    for (const r of outside.results.filter((r) => r.support_oppose_indicator === ind && r.total > 0)) {
      const prev = m.get(r.committee_id);
      m.set(r.committee_id, { spender: r.committee_name ?? r.committee_id, committeeId: r.committee_id, amount: (prev?.amount ?? 0) + r.total });
    }
    return [...m.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((s) => ({ ...s, amount: round(s.amount) }));
  };

  return {
    committeeIds,
    coverageEnd: totals.coverage_end_date ? totals.coverage_end_date.slice(0, 10) : null,
    receipts: round(receipts),
    individualItemized: round(totals.individual_itemized_contributions ?? 0),
    individualUnitemized: round(totals.individual_unitemized_contributions ?? 0),
    pacContributions: round(pacContributions),
    selfFunding: round(selfFunding),
    smallDonorShare: share(small, sized),
    pacShare: share(pacContributions, receipts),
    topPacs: pacs.get(id) ?? [],
    topEmployers: [...employers]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([employer, amount]) => ({ employer, amount: round(amount) })),
    outsideSupport: spenders("S"),
    outsideOppose: spenders("O"),
    fecUrl: `https://www.fec.gov/data/candidate/${id}/?cycle=${CYCLE}`,
  };
}

async function load() {
  if (!existsSync(OUT)) return { generatedAt: null, cycle: CYCLE, candidates: {} };
  return JSON.parse(await readFile(OUT, "utf8"));
}

async function save(data) {
  data.generatedAt = new Date().toISOString();
  data.candidates = Object.fromEntries(Object.entries(data.candidates).sort(([a], [b]) => a.localeCompare(b)));
  // Write then rename, so an interrupted save never leaves a truncated file.
  await writeFile(`${OUT}.tmp`, JSON.stringify(data, null, 1) + "\n");
  await rename(`${OUT}.tmp`, OUT);
}

const data = await load();
const ids = (await nominees()).filter((id) => !ONLY || ONLY.has(id));
console.log(`${ids.length} nominees with FEC ids; ${ids.filter((id) => id in data.candidates).length} already done.`);
const pacs = await pacDonors();
let n = 0;
for (const id of ids) {
  n++;
  if (!REFRESH && id in data.candidates) continue;
  const before = requests;
  // null = FEC has no 2025-26 financial report for this candidate.
  data.candidates[id] = await pull(id, pacs);
  await save(data);
  const r = data.candidates[id];
  console.log(
    `[${n}/${ids.length}] ${id} ${r ? `$${Math.round(r.receipts).toLocaleString("en-US")}` : "no report"} (${requests - before} req, ${requests} total)`,
  );
}
console.log(`Done. ${requests} API requests this run.`);
