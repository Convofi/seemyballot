#!/usr/bin/env node
// Fill src/data/positions.json with each likely federal candidate's own stated
// positions, read from their official campaign website by Claude (web search +
// web fetch, server-side), then link-checked here.
//
//   ANTHROPIC_API_KEY=... npm run fetch-positions -- --state OH
//   ANTHROPIC_API_KEY=... npm run fetch-positions -- --key H2OH03125
//   ANTHROPIC_API_KEY=... npm run fetch-positions -- --all
//
// Candidates = the "likely" tier of src/data/fec2026.json (same rules as
// src/lib/fec.ts). Resumable: keys already "ok" are skipped (hand-written
// "manual" entries are never overwritten); the file is saved after each one.
import { readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";

const FEC = new URL("../src/data/fec2026.json", import.meta.url);
const OUT = new URL("../src/data/positions.json", import.meta.url);
const MODEL = "claude-opus-5-5";
const CONCURRENCY = 3;
const ATTEMPTS = 3;
const ELECTION_YEAR = 2026;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---------- args ----------
const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const onlyState = argValue("--state")?.toUpperCase() ?? null;
const onlyKey = argValue("--key");
const all = args.includes("--all");
if (!onlyState && !onlyKey && !all) {
  console.error("Usage: npm run fetch-positions -- (--state OH | --key H2OH03125 | --all)");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Get a key at https://platform.claude.com/ and run:\n" +
      "  ANTHROPIC_API_KEY=sk-ant-... npm run fetch-positions -- --state OH",
  );
  process.exit(1);
}

// ---------- likely-tier filter (mirrors src/lib/fec.ts; keep in sync) ----------
const MAJOR = new Set(["DEM", "REP"]);
const OFFICE = { S: "U.S. Senate", H: "U.S. House" };

function displayName(raw) {
  const [last = "", first = ""] = raw.split(",", 2).map((s) => s.trim());
  const strip = (s) =>
    s.split(/\s+/).filter((w) => !/^(MR|MRS|MS|MISS|DR|REP|SEN|HON|REV|PROF)\.?$/i.test(w));
  const title = (w) => w.toLowerCase().replace(/(^|[-'])([a-z])/g, (_, a, c) => a + c.toUpperCase());
  const words = [...strip(first), ...strip(last)];
  const isSuffix = (w) => /^(JR|SR|II|III|IV)\.?$/i.test(w);
  return [...words.filter((w) => !isSuffix(w)).map(title), ...words.filter(isSuffix)].join(" ");
}

function likely(rows) {
  const active = rows.filter((r) => !r.inactive_election_years?.includes(ELECTION_YEAR));
  // Collapse duplicate filings for the same person (see dedupe() in fec.ts).
  const byPerson = new Map();
  for (const r of active) {
    const k = `${displayName(r.name)}|${r.party}`;
    const prev = byPerson.get(k);
    if (
      !prev ||
      (r.has_raised_funds && !prev.has_raised_funds) ||
      (r.has_raised_funds === prev.has_raised_funds &&
        (r.last_file_date ?? "") > (prev.last_file_date ?? ""))
    )
      byPerson.set(k, r);
  }
  const people = [...byPerson.values()];
  const funded = new Set(people.filter((r) => r.has_raised_funds).map((r) => r.party));
  return people.filter(
    (r) =>
      r.incumbent_challenge === "I" ||
      r.has_raised_funds ||
      (MAJOR.has(r.party ?? "") && !funded.has(r.party)),
  );
}

function candidates(fec) {
  const out = [];
  for (const [race, rows] of Object.entries(fec.races)) {
    const [state, office, district] = race.split("-");
    if (onlyState && state !== onlyState) continue;
    for (const r of likely(rows)) {
      if (onlyKey && r.candidate_id !== onlyKey) continue;
      out.push({
        key: r.candidate_id,
        name: displayName(r.name),
        party: r.party,
        incumbent: r.incumbent_challenge === "I",
        state,
        office: OFFICE[office],
        district: office === "H" ? district : null,
      });
    }
  }
  return out;
}

// ---------- Claude ----------
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["website", "bio", "status", "positions"],
  properties: {
    website: { anyOf: [{ type: "string" }, { type: "null" }] },
    bio: { anyOf: [{ type: "string" }, { type: "null" }] },
    status: { type: "string", enum: ["ok", "no_website_found", "website_no_issues_page"] },
    positions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "stance", "sourceUrl"],
        properties: {
          topic: { type: "string" },
          stance: { type: "string" },
          sourceUrl: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `You research U.S. election candidates for a strictly nonpartisan voter guide.
You report only what a candidate says about themselves on their OWN official campaign website.

Steps:
1. Use web_search to find the candidate's official ${ELECTION_YEAR} campaign website. Directories such as Ballotpedia or FEC may help you find the address, but the website must be the campaign's own domain — never Ballotpedia, Wikipedia, Vote Smart, news sites, social media, or an official government (.gov) office site.
2. Use web_fetch to open the site. Accept it only if the page text names this candidate AND the office or race they are running for. If you cannot confirm both, treat it as not found.
3. Find and web_fetch its issues / priorities / platform page (sometimes titled "Issues", "Priorities", "Platform", "Our Fight", "Where I Stand", or a section of the home page).
4. Return JSON:
   - website: the campaign site's home URL, or null if not found.
   - bio: one neutral sentence giving the candidate's current or former job(s), taken from the site; null if the site does not say.
   - positions: up to 5 items, the FIRST five issues in the order the site lists them (do not choose by importance). Each item:
       topic: 2-4 words, plain and neutral (e.g. "Health care", "Border security").
       stance: one sentence, at most 30 words, paraphrasing the candidate's own stated position. Quote directly (in double quotes, exact wording) when the wording is short enough.
       sourceUrl: the exact URL of the page you fetched that contains this text.
   - status: "ok" if you returned positions; "website_no_issues_page" if the site exists but states no issue positions; "no_website_found" if you found no official site.

Hard rules:
- Use only text you actually fetched in this conversation. No outside knowledge, no inference, no summaries of voting records, news coverage, or opponents' claims.
- Never construct, guess, or shorten a URL. Every URL must be one you fetched successfully.
- No adjectives of your own, no evaluation, no comparison with other candidates.
- If there is no issues content, return positions: [] with the matching status. An empty answer is always better than a guessed one.`;

async function askClaude(client, c) {
  const race = c.district ? `${c.office}, ${c.state} district ${Number(c.district)}` : `${c.office}, ${c.state}`;
  const messages = [
    {
      role: "user",
      content:
        `Candidate: ${c.name}\nParty (FEC code): ${c.party ?? "none"}\nRace: ${race} (${ELECTION_YEAR})\n` +
        `${c.incumbent ? "Currently holds this seat.\n" : ""}FEC candidate ID: ${c.key}`,
    },
  ];
  // Server tools can pause a long turn; resend the paused turn to continue.
  for (let turn = 0; turn < 6; turn++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 8 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 12 },
      ],
      messages,
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason === "refusal") throw new Error(`refused (${msg.stop_details?.category ?? "no category"})`);
    if (msg.stop_reason === "max_tokens") throw new Error("hit max_tokens");
    const text = msg.content.findLast((b) => b.type === "text")?.text;
    if (!text) throw new Error(`no text block (stop_reason ${msg.stop_reason})`);
    return JSON.parse(text);
  }
  throw new Error("still paused after 6 turns");
}

// ---------- link check ----------
async function loads(url) {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    await res.body?.cancel();
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

async function verify(result) {
  const website = result.website && (await loads(result.website)) ? result.website : null;
  const kept = [];
  for (const p of result.positions.slice(0, 5)) {
    // Must be on the campaign's own domain and actually load.
    const sameSite = website && host(p.sourceUrl)?.endsWith(host(website));
    if (sameSite && (await loads(p.sourceUrl))) kept.push(p);
    else console.warn(`    dropped "${p.topic}": ${p.sourceUrl} (off-site or did not load)`);
  }
  let status = result.status;
  if (!website) status = "no_website_found";
  else if (kept.length === 0 && status === "ok") status = "error"; // retried next run
  return { website, bio: website ? result.bio : null, positions: kept, status };
}

// ---------- main ----------
const fec = JSON.parse(await readFile(FEC, "utf8"));
let data = {};
try {
  data = JSON.parse(await readFile(OUT, "utf8"));
} catch {
  // first run
}

let saving = Promise.resolve();
const save = () =>
  (saving = saving.then(() => {
    const sorted = Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)));
    return writeFile(OUT, JSON.stringify(sorted, null, 1) + "\n");
  }));

const todo = candidates(fec).filter((c) => data[c.key]?.status !== "ok" && data[c.key]?.method !== "manual");
console.log(`${todo.length} candidate(s) to look up.`);
const client = new Anthropic();

async function work(c) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      console.log(`→ ${c.key} ${c.name} (attempt ${attempt})`);
      const checked = await verify(await askClaude(client, c));
      data[c.key] = { name: c.name, ...checked, generatedAt: new Date().toISOString(), method: "claude" };
      console.log(`  ${c.key}: ${checked.status}, ${checked.positions.length} position(s)`);
      break;
    } catch (e) {
      console.warn(`  ${c.key}: ${e.message}`);
      if (attempt === ATTEMPTS) {
        data[c.key] = {
          name: c.name,
          website: null,
          bio: null,
          positions: [],
          status: "error",
          generatedAt: new Date().toISOString(),
          method: "claude",
        };
      } else {
        await new Promise((r) => setTimeout(r, 5000 * attempt));
      }
    }
  }
  await save();
}

const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) await work(queue.shift());
  }),
);
console.log("Done.");
