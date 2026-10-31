#!/usr/bin/env node
// Gate for research-agent output (docs/POSITIONS_AGENT_BRIEF.md). Validates
// src/data/positions/batch-<nnn>.json against the CandidatePositions schema in
// src/lib/positions.ts and its queue file src/data/positions/queue/batch-<nnn>.json,
// then fetches every website and sourceUrl. Exit 0 = pass, 1 = fail.
//
//   node scripts/positions-merge-check.mjs src/data/positions/batch-001.json
//   node scripts/positions-merge-check.mjs /tmp/batch-001.json --queue src/data/positions/queue/batch-001.json
import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};
const STATUSES = new Set(["ok", "no_website_found", "website_no_issues_page", "website_unreachable"]);
// Never a campaign's own site.
const BANNED_HOSTS =
  /(^|\.)(ballotpedia\.org|wikipedia\.org|votesmart\.org|vote411\.org|fec\.gov|facebook\.com|x\.com|twitter\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|linktr\.ee|nytimes\.com|washingtonpost\.com|politico\.com|apnews\.com|cnn\.com|foxnews\.com)$|\.gov$/i;
const ENTRY_FIELDS = ["name", "website", "positions", "bio", "status", "generatedAt", "method"];

const file = process.argv[2];
if (!file || !/^batch-\d{3,}\.json$/.test(basename(file))) {
  console.error("Usage: node scripts/positions-merge-check.mjs src/data/positions/batch-<nnn>.json");
  process.exit(1);
}
// --queue <path> overrides the default queue/<same name> (e.g. to check a temp copy).
const qi = process.argv.indexOf("--queue");
const queuePath =
  qi > 0 && process.argv[qi + 1]
    ? resolve(process.argv[qi + 1])
    : join(import.meta.dirname, "..", "src", "data", "positions", "queue", basename(file));

const errors = [];
const warnings = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

let data, queue;
try {
  data = JSON.parse(readFileSync(resolve(file), "utf8"));
} catch (e) {
  console.error(`FAIL: cannot read ${file} as JSON (${e.message})`);
  process.exit(1);
}
try {
  queue = JSON.parse(readFileSync(queuePath, "utf8"));
} catch (e) {
  console.error(`FAIL: no queue file for this batch at ${queuePath} (${e.message})`);
  process.exit(1);
}
if (!data || typeof data !== "object" || Array.isArray(data)) {
  console.error("FAIL: top level must be an object keyed by candidate key");
  process.exit(1);
}
const queued = new Map(queue.candidates.map((c) => [c.key, c]));

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const host = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname.toLowerCase().replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

// ---------- schema ----------
const urls = new Map(); // url -> [where]
const needUrl = (url, where) => urls.set(url, [...(urls.get(url) ?? []), where]);

for (const [key, e] of Object.entries(data)) {
  const where = key;
  if (!queued.has(key)) {
    fail(where, `key is not in queue/${basename(queuePath)}`);
    continue;
  }
  if (!e || typeof e !== "object") {
    fail(where, "entry must be an object");
    continue;
  }
  for (const f of ENTRY_FIELDS) if (!(f in e)) fail(where, `missing field "${f}"`);
  for (const f of Object.keys(e)) if (!ENTRY_FIELDS.includes(f)) fail(where, `unknown field "${f}"`);
  if (!isStr(e.name)) fail(where, "name must be a non-empty string");
  else if (e.name !== queued.get(key).name) warnings.push(`${where}: name "${e.name}" differs from queue "${queued.get(key).name}"`);
  if (e.method !== "agent") fail(where, `method must be "agent" (got ${JSON.stringify(e.method)})`);
  if (!isStr(e.generatedAt) || Number.isNaN(Date.parse(e.generatedAt))) fail(where, "generatedAt must be an ISO date");
  if (!STATUSES.has(e.status)) fail(where, `status must be one of ${[...STATUSES].join(" / ")} (got ${JSON.stringify(e.status)})`);
  if (e.bio !== null && !isStr(e.bio)) fail(where, "bio must be a string or null");

  const siteHost = e.website === null ? null : host(e.website);
  if (e.website !== null) {
    if (!siteHost) fail(where, `website is not an http(s) URL: ${JSON.stringify(e.website)}`);
    else if (BANNED_HOSTS.test(siteHost)) fail(where, `website ${e.website} is not a campaign's own site`);
    // website_unreachable: the site is known but blocks automated reads, so skip the fetch.
    else if (e.status !== "website_unreachable") needUrl(e.website, `${where} website`);
  }
  if (e.status === "no_website_found" && e.website !== null) fail(where, "no_website_found must have website: null");
  if (e.status !== "no_website_found" && e.website === null) fail(where, `status ${e.status} needs a website`);
  if (e.website === null && e.bio !== null) fail(where, "bio must be null when no website was found");

  if (!Array.isArray(e.positions)) {
    fail(where, "positions must be an array");
    continue;
  }
  if (e.positions.length > 5) fail(where, `${e.positions.length} positions (max 5)`);
  if (e.status === "ok" && e.positions.length === 0) fail(where, 'status "ok" needs at least one position');
  if (e.status !== "ok" && e.positions.length > 0) fail(where, `status ${e.status} must have positions: []`);
  e.positions.forEach((p, i) => {
    const pw = `${where} position ${i + 1}`;
    if (!p || typeof p !== "object") return fail(pw, "must be an object");
    for (const f of Object.keys(p)) if (!["topic", "stance", "sourceUrl"].includes(f)) fail(pw, `unknown field "${f}"`);
    if (!isStr(p.topic)) fail(pw, "topic must be a non-empty string");
    else if (words(p.topic) > 6) warnings.push(`${pw}: topic "${p.topic}" is long (aim for 2-4 words)`);
    if (!isStr(p.stance)) fail(pw, "stance must be a non-empty string");
    else if (words(p.stance) > 35) fail(pw, `stance is ${words(p.stance)} words (max 35)`);
    else if (words(p.stance) > 30) warnings.push(`${pw}: stance is ${words(p.stance)} words (aim for ≤ 30)`);
    const h = isStr(p.sourceUrl) ? host(p.sourceUrl) : null;
    if (!h) return fail(pw, `sourceUrl is not an http(s) URL: ${JSON.stringify(p.sourceUrl)}`);
    if (siteHost && h !== siteHost) fail(pw, `sourceUrl host ${h} differs from website host ${siteHost}`);
    needUrl(p.sourceUrl, pw);
  });
}
const missing = [...queued.keys()].filter((k) => !(k in data));
for (const k of missing) fail(k, "queued key has no entry (use a not-found status rather than leaving it out)");

// ---------- links ----------
import { execFile } from "node:child_process";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHALLENGE = /just a moment|checking your browser|403 forbidden|access denied|attention required/i;
function chromeRenders(url) {
  return new Promise((resolve) => {
    execFile(
      CHROME,
      ["--headless=new", "--disable-gpu", "--virtual-time-budget=25000", "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "--dump-dom", url],
      { timeout: 60_000, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve(false);
        const text = stdout.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ");
        resolve(text.replace(/\s+/g, " ").trim().length > 400 && !CHALLENGE.test(stdout.slice(0, 5000)));
      },
    );
  });
}
async function check(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(20_000) });
      await res.body?.cancel();
      if (res.status >= 200 && res.status < 400) return null;
      // Bot walls answer 403 to plain fetches but often render in a real browser.
      if (res.status === 403 && (await chromeRenders(url))) return null;
      if (attempt === 2 || res.status < 500) return `HTTP ${res.status}`;
    } catch (e) {
      if (attempt === 2) return e.cause?.code ?? e.name ?? String(e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const list = [...urls.keys()];
let next = 0;
let loaded = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < list.length) {
      const url = list[next++];
      const problem = await check(url);
      if (problem) fail(urls.get(url).join(", "), `${url} did not load (${problem})`);
      else loaded++;
    }
  }),
);

// ---------- report ----------
const entries = Object.values(data);
const count = (s) => entries.filter((e) => e?.status === s).length;
console.log(`Batch ${basename(file)} vs queue/${basename(queuePath)}`);
console.log(
  `  ${queued.size - missing.length}/${queued.size} queued candidates covered: ${count("ok")} ok, ` +
    `${count("website_no_issues_page")} website_no_issues_page, ${count("website_unreachable")} website_unreachable, ` +
    `${count("no_website_found")} no_website_found`,
);
console.log(`  ${loaded}/${list.length} URLs loaded`);
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}, not blocking):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (errors.length) {
  console.log(`\nFAIL (${errors.length} problem(s)):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nPASS");
