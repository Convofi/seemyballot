#!/usr/bin/env node
// Pull the 2026 general-election nominees for every House and Senate race
// from Wikipedia into src/data/nominees2026.json, keyed like fec2026.json
// ("TX-H-10", "OH-S-00").
//
//   npm run fetch-nominees
//
// Why: the FEC snapshot lists every filer, including primary losers, and FEC
// data can't tell them apart. Wikipedia's per-state election pages list who
// is on the general-election ballot.
//
// One MediaWiki API request per page (action=parse, redirects followed),
// 4 at a time, with a descriptive User-Agent; 429s wait out Retry-After.
// Per race, first that yields anyone (recorded as `via`):
//   election_box      {{Election box candidate...}} in the "General election" section
//   general_list      "Candidates"/"Nominees"/"Declared" bullets in that section
//   primary_nominees  each primary's "Nominee" list plus minor-party/independent
//                     "Declared" lists (pages whose general section has no box yet)
//   overview_table    California-style per-district table of general candidates
// Races we can't parse are left out (logged), so src/lib/fec.ts falls back to
// its FEC heuristic for them.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const OUT = new URL("../src/data/nominees2026.json", import.meta.url);
const API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT =
  "BallotHelper/0.1 (nonpartisan sample-ballot helper; one-off nominee fetch)";
const CONCURRENCY = 4;

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "the District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
// One House seat (or DC's delegate): the page is "election", not "elections".
const AT_LARGE = new Set(["AK", "DE", "DC", "ND", "SD", "VT", "WY"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reads senate2026.ts's state -> "regular" | "special" table without a TS loader. */
async function senateStates() {
  const src = await readFile(new URL("../src/data/senate2026.ts", import.meta.url), "utf8");
  return Object.fromEntries([...src.matchAll(/^\s*([A-Z]{2}): "(regular|special)"/gm)].map((m) => [m[1], m[2]]));
}

function pageTitles(state, office, kind) {
  const name = STATE_NAMES[state];
  if (office === "S") {
    return kind === "special"
      ? [`2026 United States Senate special election in ${name}`, `2026 United States Senate election in ${name}`]
      : [`2026 United States Senate election in ${name}`];
  }
  const one = `2026 United States House of Representatives election in ${name}`;
  const many = `2026 United States House of Representatives elections in ${name}`;
  return AT_LARGE.has(state) ? [one, many] : [many, one];
}

/** Wikitext of the first title that exists. null if none do. */
export async function fetchPage(titles) {
  for (const title of titles) {
    const params = new URLSearchParams({
      action: "parse",
      page: title,
      prop: "wikitext|revid",
      redirects: "1",
      format: "json",
      formatversion: "2",
      maxlag: "5",
    });
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${API}?${params}`, {
        headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      }).catch((e) => ({ ok: false, status: 0, error: e }));
      const body = res.ok ? await res.json() : null;
      if (body?.parse) {
        return { title: body.parse.title, revisionId: body.parse.revid, wikitext: body.parse.wikitext };
      }
      if (body?.error?.code === "missingtitle") break; // try the next title form
      if (res.status === 429 && attempt < 10) {
        const wait = Number(res.headers.get("retry-after")) || 30;
        console.log(`  rate limited; waiting ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }
      if (attempt >= 4) throw new Error(`Wikipedia ${res.status} ${body?.error?.code ?? res.error ?? ""} for ${title}`);
      await sleep(attempt * 5_000);
    }
  }
  return null;
}

// ---------- wikitext parsing ----------

const HEADING = /^(={2,6})\s*(.+?)\s*\1\s*$/;

function stripNoise(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
}

/** Headings as [{ level, text, start, end }]; end = next heading at the same or a higher level. */
function sections(lines) {
  const heads = [];
  lines.forEach((line, i) => {
    const m = HEADING.exec(line);
    if (m) heads.push({ level: m[1].length, text: plain(m[2]), start: i });
  });
  for (const [i, h] of heads.entries()) {
    const next = heads.slice(i + 1).find((n) => n.level <= h.level);
    h.end = next ? next.start : lines.length;
  }
  return heads;
}

/** Wikitext -> plain text: {{sortname|A|B}} -> "A B", [[a|b]] -> b; drops other templates, markup, html. */
function plain(s) {
  let out = s
    .replace(/\{\{sortname\|([^|}]*)\|([^|}]*)[^}]*\}\}/gi, "$1 $2")
    .replace(/\{\{(?:nowrap|nobr|small|nobold)\|((?:[^{}]|\{\{[^{}]*\}\})*)\}\}/gi, "$1");
  for (let i = 0; i < 5 && /\{\{[^{}]*\}\}/.test(out); i++) out = out.replace(/\{\{[^{}]*\}\}/g, "");
  return out
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Top-level {{...}} templates in text, each as its inner text (balanced braces). */
function templates(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") {
      if (depth === 0) start = i + 2;
      depth++;
      i++;
    } else if (text[i] === "}" && text[i + 1] === "}" && depth > 0) {
      depth--;
      if (depth === 0) out.push(text.slice(start, i));
      i++;
    }
  }
  return out;
}

/** Template name plus named/positional params, split on top-level "|". */
function params(inner) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      cur += two;
      i++;
    } else if ((two === "}}" || two === "]]") && depth > 0) {
      depth--;
      cur += two;
      i++;
    } else if (inner[i] === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += inner[i];
  }
  parts.push(cur);
  const [name, ...rest] = parts;
  const named = {};
  const positional = [];
  for (const p of rest) {
    const m = /^\s*([a-z_ ]+?)\s*=([\s\S]*)$/i.exec(p);
    if (m) named[m[1].toLowerCase()] = m[2].trim();
    else positional.push(p.trim());
  }
  return { name: name.trim(), named, positional };
}

/** Party from a party name, link target, abbreviation or section heading. null = not a party. */
function mapParty(raw) {
  const p = plain(raw ?? "").toLowerCase().trim();
  if (/^d$|democrat|dfl|farmer.labor/.test(p)) return "Democratic";
  if (/^r$|republican|\bgop\b/.test(p)) return "Republican";
  if (/^l$|libertarian/.test(p)) return "Libertarian";
  if (/^g$|green/.test(p)) return "Green";
  if (/^i$|independent|nonpartisan|non-partisan|no party|unaffiliated|^npa$/.test(p)) return "Independent";
  if (/party|alliance|working families|forward|constitution|socialist|conservative|reform|peace|unity/.test(p)) return "Other";
  return null;
}

const NOT_A_PERSON =
  /^(write-?ins?|others?|scattering|blank|none of these candidates|total|turnout|void|over ?votes|under ?votes|rejected|n\/?a|tbd|tba|.* nominee)$/i;

/** "[[Chris Gober]] (incumbent)" -> { name, writeIn }, or null for placeholders. */
function cleanName(raw) {
  const writeIn = /write-?in/i.test(raw);
  const name = plain(raw)
    .replace(/\((?:incumbent|write-?in|withdrawn|ranked-choice)[^)]*\)/gi, "")
    .replace(/\s*\(\s*\)\s*/g, " ")
    .replace(/[*†‡]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || NOT_A_PERSON.test(name) || !/[a-z]/i.test(name)) return null;
  return { name, writeIn };
}

function candidate(name, party, writeIn) {
  return { name, party, ...(writeIn ? { writeIn: true } : {}) };
}

/** NY/CT-style fusion lists one person per party line; keep one row, preferring a major party. */
function mergeFusion(list) {
  const byName = new Map();
  const rank = (p) => (p === "Democratic" || p === "Republican" ? 0 : p === "Other" ? 2 : 1);
  for (const c of list) {
    const prev = byName.get(c.name);
    if (!prev || rank(c.party) < rank(prev.party)) byName.set(c.name, c);
  }
  return [...byName.values()];
}

/** {{Election box candidate ...|party=...|candidate=...}} rows (named or positional params). */
function fromElectionBoxes(text) {
  const found = [];
  for (const t of templates(text)) {
    const { name, named, positional } = params(t);
    if (!/^election box (winning )?candidate/i.test(name)) continue;
    const rawName = named.candidate ?? positional[1];
    if (!rawName) continue;
    const c = cleanName(rawName);
    if (c) found.push(candidate(c.name, mapParty(named.party ?? positional[0]) ?? "Other", c.writeIn));
  }
  return mergeFusion(found);
}

/** One "* [[Name]] (Party), description" bullet. Party in parentheses wins over the section's. */
function fromBullet(line, sectionParty) {
  const m = /^\*(?!\*)\s*(.+)$/.exec(line);
  if (!m) return null;
  // Name runs to the first comma; parentheticals in it are a party, "incumbent" or a pronunciation.
  const head = plain(m[1]).split(",")[0];
  const c = cleanName(head.replace(/\([^)]*\)/g, ""));
  if (!c) return null;
  // Else a trailing "(Independent)" after the description, else the section's party.
  const party =
    [...head.matchAll(/\(([^)]*)\)/g)].map((p) => mapParty(p[1])).find(Boolean) ??
    mapParty(/\(([^)]*)\)\s*$/.exec(plain(m[1]))?.[1]);
  return candidate(c.name, party ?? sectionParty ?? "Other", c.writeIn || /write-?in/i.test(m[1]));
}

/** Bullets directly under a heading (not under its child headings). */
function bulletsUnder(lines, head, party) {
  const out = [];
  for (let i = head.start + 1; i < head.end && !HEADING.test(lines[i]); i++) {
    const c = fromBullet(lines[i], party);
    if (c) out.push(c);
  }
  return out;
}

/** The heading that gives a nominee list its party: its parent, skipping a "Candidates" layer. */
function contextOf(heads, idx) {
  const h = heads[idx];
  let p = idx - 1;
  while (p >= 0 && heads[p].level >= h.level) p--;
  if (p < 0) return null;
  if (/^candidates$/i.test(heads[p].text) && p > 0 && heads[p - 1].level <= heads[p].level) {
    // "===Third-party candidates=== ===Candidates=== ====Declared====" or
    // "===Democratic primary=== ====Candidates==== =====Nominee=====".
    return heads[p - 1];
  }
  return heads[p];
}

const NOMINEE_HEAD = /^(nominees?|nominated|advanced to (the )?general( election)?)$/i;
const MINOR_LIST_HEAD = /^(declared|qualified|certified|on the ballot)$/i;

/**
 * Fallback when the General election section has no result box yet: party
 * primaries' "Nominee" lists (and "Advanced to general" for top-four), plus
 * minor-party/independent "Declared"/"Qualified" lists. A major-party
 * primary's "Declared" list is skipped (those people had to win a primary).
 * Never reads "Filed paperwork", "Withdrawn", "Eliminated", "Declined", etc.
 */
function fromPrimaryNominees(lines, heads, from, to) {
  const found = [];
  heads.forEach((h, idx) => {
    if (h.start < from || h.start >= to) return;
    const isNominee = NOMINEE_HEAD.test(h.text);
    if (!isNominee && !MINOR_LIST_HEAD.test(h.text)) return;
    const ctx = contextOf(heads, idx);
    if (!ctx || ctx.start < from || /general election/i.test(ctx.text)) return;
    const party = mapParty(ctx.text);
    const major = party === "Democratic" || party === "Republican";
    if (!isNominee && major && /primary|convention|caucus/i.test(ctx.text)) return;
    found.push(...bulletsUnder(lines, h, party));
  });
  return mergeFusion(found);
}

/** "Candidates" / "Nominees" / "Declared" bullets inside the General election section. */
function fromGeneralLists(lines, heads, general) {
  const found = [];
  for (const h of heads) {
    if (h.start <= general.start || h.start >= general.end) continue;
    if (/^(candidates|nominees?|declared|on the ballot)$/i.test(h.text)) found.push(...bulletsUnder(lines, h, null));
  }
  return mergeFusion(found);
}

/** Candidates for the race in lines[from, to): election box, then lists, then primary nominees. */
function raceCandidates(lines, heads, from, to) {
  const general = heads.find((h) => h.start >= from && h.start < to && /^general election\b/i.test(h.text));
  if (general) {
    const end = Math.min(general.end, to);
    const boxed = fromElectionBoxes(lines.slice(general.start + 1, end).join("\n"));
    if (boxed.length) return { candidates: boxed, via: "election_box" };
    const listed = fromGeneralLists(lines, heads, { start: general.start, end });
    if (listed.length) return { candidates: listed, via: "general_list" };
  }
  const nominees = fromPrimaryNominees(lines, heads, from, to);
  if (nominees.length) return { candidates: nominees, via: "primary_nominees" };
  return { error: general ? "no election box, candidate list or primary nominees" : "no General election section or nominees" };
}

/** California-style overview table: "!{{ushr|CA|22|X}}" rows with a plainlist of general candidates. */
function fromOverviewTable(lines) {
  const races = {};
  let district = null;
  for (const line of lines) {
    const row = /^!.*\{\{ushr\|[A-Z]{2}\|(\d+)\|/i.exec(line);
    if (row) district = row[1].padStart(2, "0");
    else if (/^\|\}/.test(line)) district = null;
    else if (district) {
      const c = fromBullet(line, null);
      if (c) (races[district] ??= []).push(c);
    }
  }
  return races;
}

/**
 * Parse one page. House pages with several seats are split on "District N"
 * headings (or, failing that, an overview table); at-large and Senate pages
 * are one race. Returns { races: { "03": { candidates, via } }, failures }.
 */
export function parsePage(wikitext, { multiDistrict }) {
  const lines = stripNoise(wikitext).split("\n");
  const heads = sections(lines);
  const races = {};
  const failures = [];
  if (!multiDistrict) {
    const r = raceCandidates(lines, heads, 0, lines.length);
    if (r.candidates) races["00"] = r;
    else failures.push({ district: "00", error: r.error });
    return { races, failures };
  }
  for (const h of heads) {
    const m = /^District (\d{1,2})$/i.exec(h.text);
    if (!m || races[m[1].padStart(2, "0")]) continue;
    const district = m[1].padStart(2, "0");
    const r = raceCandidates(lines, heads, h.start, h.end);
    if (r.candidates) races[district] = r;
    else failures.push({ district, error: r.error });
  }
  if (!Object.keys(races).length && !failures.length) {
    for (const [district, list] of Object.entries(fromOverviewTable(lines))) {
      races[district] = { candidates: mergeFusion(list), via: "overview_table" };
    }
    if (!Object.keys(races).length) failures.push({ district: "*", error: "no District N headings or overview table" });
  }
  return { races, failures };
}

// ---------- main ----------

async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

async function main() {
  const senate = await senateStates();
  const jobs = [
    ...Object.keys(STATE_NAMES).map((state) => ({ state, office: "H" })),
    ...Object.entries(senate).map(([state, kind]) => ({ state, office: "S", kind })),
  ];
  const out = { fetchedAt: new Date().toISOString(), races: {} };
  const failures = [];
  await pool(jobs, CONCURRENCY, async (job) => {
    const label = `${job.state}-${job.office}`;
    const page = await fetchPage(pageTitles(job.state, job.office, job.kind)).catch((e) => {
      failures.push(`${label}: ${e.message}`);
      return undefined;
    });
    if (page === undefined) return;
    if (page === null) {
      failures.push(`${label}: no Wikipedia page`);
      return;
    }
    const source = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
    const multiDistrict = job.office === "H" && !AT_LARGE.has(job.state);
    const { races, failures: bad } = parsePage(page.wikitext, { multiDistrict });
    for (const [district, r] of Object.entries(races)) {
      const key = `${job.state}-${job.office}-${job.office === "S" ? "00" : district}`;
      out.races[key] = { source, revisionId: page.revisionId, via: r.via, candidates: r.candidates };
    }
    for (const f of bad) failures.push(`${job.state}-${job.office}-${f.district}: ${f.error} (${page.title})`);
    console.log(`${label}: ${Object.keys(races).length} race(s) parsed, ${bad.length} failed`);
  });
  out.races = Object.fromEntries(Object.entries(out.races).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`\nWrote ${Object.keys(out.races).length} races to src/data/nominees2026.json`);
  if (failures.length) {
    console.log(`\n${failures.length} not parsed (left to the FEC heuristic):`);
    for (const f of failures.sort()) console.log(`  ${f}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
