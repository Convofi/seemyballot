import "server-only";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Candidates' own stated positions, taken from their official campaign sites.
// Stored as src/data/positions/*.json (one file per writer: the Ohio seed,
// `npm run fetch-positions` (method "claude"), and one file per research-agent
// batch (method "agent"); see docs/POSITIONS_AGENT_BRIEF.md). Each file is an
// object keyed by FEC candidate_id for federal candidates, "wiki:<slug>" for
// nominees with no FEC filing, else a slug like "oh-gov-2026-lastname-firstname".
// Read from disk at request time (traced into the functions via
// outputFileTracingIncludes in next.config.ts) and merged in file-name order.

export type Position = {
  /** 2-4 words, e.g. "Health care". */
  topic: string;
  /** One sentence, ≤ 30 words, in the candidate's own words where possible. */
  stance: string;
  /** The exact campaign-site page the stance comes from. */
  sourceUrl: string;
};

/**
 * "website_unreachable": the official site is known (website set) but blocks
 * automated reading (e.g. bot protection), so positions are [].
 * "no_source_found": a tier-2 pass (docs/POSITIONS_TIER2_BRIEF.md) found no
 * other source in the candidate's own words; ignored when an earlier entry exists.
 */
export type PositionsStatus =
  | "ok"
  | "no_website_found"
  | "website_no_issues_page"
  | "website_unreachable"
  | "no_source_found"
  | "error";

/** Where the positions came from when not the campaign site's issues page (tier 2). */
export type PositionsSource = {
  kind: "campaign_site" | "official_office" | "questionnaire" | "statement" | "press_release";
  /** Short and user-facing, e.g. "their U.S. Senate office website". */
  label: string;
};

export type CandidatePositions = {
  name: string;
  website: string | null;
  /** At most 5, in the order the campaign site lists them. */
  positions: Position[];
  /** One neutral sentence (current/former job), from the campaign site or FEC. */
  bio: string | null;
  status: PositionsStatus;
  generatedAt: string;
  method: "manual" | "claude" | "agent";
  /** Absent = the candidate's campaign site. */
  source?: PositionsSource;
};

const DIR = path.join(process.cwd(), "src", "data", "positions");

let cache: { signature: string; data: Map<string, CandidatePositions> } | null = null;

/**
 * All positions files merged. Re-read only when a file is added, removed or
 * modified (signature = names + mtimes). Later files (by name) override
 * earlier ones, except that an "ok" entry is never replaced by a non-"ok" one
 * and a "no_source_found" entry never replaces any earlier entry.
 */
function load(): Map<string, CandidatePositions> {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const signature = files.map((f) => `${f}:${statSync(path.join(DIR, f)).mtimeMs}`).join("|");
  if (cache?.signature === signature) return cache.data;
  const data = new Map<string, CandidatePositions>();
  for (const f of files) {
    const entries = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Record<string, CandidatePositions>;
    for (const [key, entry] of Object.entries(entries)) {
      if (data.get(key)?.status === "ok" && entry.status !== "ok") continue;
      if (entry.status === "no_source_found" && data.has(key)) continue;
      data.set(key, entry);
    }
  }
  cache = { signature, data };
  return data;
}

/** null = we haven't looked this candidate up yet (not the same as "nothing found"). */
export function getPositions(key: string): CandidatePositions | null {
  return load().get(key) ?? null;
}
