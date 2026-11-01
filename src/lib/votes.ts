import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Voting record for federal nominees who sit in Congress, written by
// `npm run fetch-votes` to src/data/votes2026.json (keyed by FEC candidate_id).
// One uniform rule (see `rule` in the file): every final-passage roll call on
// a measure enacted in the 119th Congress, plus the missed-vote rate. Read from
// disk at request time (traced into /api/contests via outputFileTracingIncludes).

export type MemberVote = {
  /** "H.R. 1", "S.J.Res. 13" */
  measure: string;
  title: string;
  /** "Public Law 119-21" */
  law: string;
  /** "YYYY-MM-DD" */
  date: string;
  vote: "Yea" | "Nay" | "Present" | "Not Voting";
  rollUrl: string;
};

export type CandidateVotes = {
  bioguide: string;
  chamber: "house" | "senate";
  /** Every roll call in the chamber while a member; through = last roll counted. */
  missedVotes: { missed: number; total: number; pct: number; through: string };
  votes: MemberVote[];
  rule: string;
};

type Snapshot = {
  generatedAt: string;
  congress: number;
  rule: string;
  candidates: Record<string, Omit<CandidateVotes, "rule">>;
};

const FILE = path.join(process.cwd(), "src", "data", "votes2026.json");

let cache: { mtime: number; data: Snapshot } | null = null;

function load(): Snapshot | null {
  if (!existsSync(FILE)) return null;
  const mtime = statSync(FILE).mtimeMs;
  if (cache?.mtime === mtime) return cache.data;
  try {
    const data = JSON.parse(readFileSync(FILE, "utf8")) as Snapshot;
    cache = { mtime, data };
    return data;
  } catch {
    return cache?.data ?? null;
  }
}

/** null = not a sitting member of Congress (or not pulled yet). */
export function getVotes(candidateId: string): CandidateVotes | null {
  const snap = load();
  const c = snap?.candidates[candidateId];
  return c ? { ...c, rule: snap.rule } : null;
}
