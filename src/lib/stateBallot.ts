import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CandidatePositions } from "@/lib/positions";

// Per-state ballots below the federal level, hand-built from official
// certified lists (see each file's `sources`). One JSON file per state in
// src/data/state/; states without a file have no data (show the fallback).
// Server-only: files are read from disk per request by /api/state-ballot so
// no state's data ships to the browser. Client code may `import type` only.

export type BallotParty =
  | "Democratic"
  | "Republican"
  | "Libertarian"
  | "Green"
  | "Independent"
  | "Nonpartisan"
  | "Other";

export type BallotCandidate = {
  /** Stable slug, e.g. "oh-gov-2026-acton-amy". */
  key: string;
  name: string;
  party: BallotParty;
  runningMate?: string;
  incumbent: boolean;
  /** Certified write-in candidate: not printed on the ballot. */
  writeIn?: boolean;
  /** Official campaign site; only set when verified to load and belong to them. */
  website?: string;
};

export type BallotContest = {
  /** e.g. "Attorney General", "Justice of the Supreme Court (term beginning 1/1/2027)". */
  office: string;
  /** Vote for N; omitted means 1. */
  seats?: number;
  candidates: BallotCandidate[];
  source: string;
};

export type BallotMeasure = {
  /** As numbered on the ballot, e.g. "Issue 3". */
  id: string;
  /** Official short title. */
  title: string;
  /** 2-3 neutral plain-English sentences. */
  summary: string;
  yesMeans: string;
  noMeans: string;
  /** Official ballot language. */
  source: string;
  moreInfo?: string;
};

export type BallotSection = { contests: BallotContest[]; measures: BallotMeasure[] };

export type CountyBallot = BallotSection & {
  /** Keyed by Census place BASENAME, e.g. "Columbus". */
  municipalities: Record<string, BallotSection>;
  note?: string;
};

export type StateBallot = {
  state: string;
  electionDate: string;
  verifiedAt: string;
  /** One-line provenance notice shown above the contests. */
  notice: string;
  sources: string[];
  /** Races and issues known to be missing. */
  gaps: string[];
  statewide: BallotSection;
  /** Keyed by district number without leading zeros ("3", "25"). */
  legislative: {
    senate: Record<string, BallotContest>;
    house: Record<string, BallotContest>;
  };
  /** Keyed by Census county NAME, e.g. "Franklin County". */
  counties: Record<string, CountyBallot>;
};

// What /api/state-ballot returns: one voter's slice, positions attached.
export type StateBallotCandidate = BallotCandidate & { positions: CandidatePositions | null };
export type StateBallotContest = Omit<BallotContest, "candidates"> & { candidates: StateBallotCandidate[] };
export type StateBallotSection = { contests: StateBallotContest[]; measures: BallotMeasure[] };

/** Just this voter's slice of the state ballot. */
export type StateBallotResponse = {
  notice: string;
  statewide: StateBallotSection;
  legislative: { senate: StateBallotContest | null; house: StateBallotContest | null };
  /** null when we have no data for this county. */
  county: (StateBallotSection & { note?: string }) | null;
  municipal: StateBallotSection | null;
  hasCounty: boolean;
  gaps: string[];
};

const STATE_DIR = path.join(process.cwd(), "src", "data", "state");

/** Reads src/data/state/{ST}.json; null when the state has no file. */
export async function readStateBallot(stateAbbr: string): Promise<StateBallot | null> {
  const st = stateAbbr.toUpperCase();
  if (!/^[A-Z]{2}$/.test(st)) return null;
  try {
    return JSON.parse(await readFile(path.join(STATE_DIR, `${st}.json`), "utf8")) as StateBallot;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export function getCountyBallot(ballot: StateBallot | null, county: string | null): CountyBallot | null {
  if (!ballot || !county) return null;
  return ballot.counties[county] ?? null;
}

export function getMunicipalBallot(
  ballot: StateBallot | null,
  county: string | null,
  place: string | null,
): BallotSection | null {
  if (!place) return null;
  return getCountyBallot(ballot, county)?.municipalities[place] ?? null;
}

const normalize = (d: string | null) => (d ? d.replace(/^0+(?=.)/, "") : null);

/** State senate / house contests for the voter's districts; null when not up or not covered. */
export function getLegislativeContests(
  ballot: StateBallot | null,
  senateDistrict: string | null,
  houseDistrict: string | null,
): { senate: BallotContest | null; house: BallotContest | null } {
  const s = normalize(senateDistrict);
  const h = normalize(houseDistrict);
  return {
    senate: (ballot && s && ballot.legislative.senate[s]) || null,
    house: (ballot && h && ballot.legislative.house[h]) || null,
  };
}
