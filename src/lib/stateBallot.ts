import OH from "@/data/state/OH.json";

// Per-state ballots below the federal level, hand-built from official
// certified lists (see each file's `sources`). One JSON file per state in
// src/data/state/; states without a file have no data (show the fallback).

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

const BALLOTS: Record<string, StateBallot> = {
  OH: OH as StateBallot,
};

export function getStateBallot(stateAbbr: string): StateBallot | null {
  return BALLOTS[stateAbbr.toUpperCase()] ?? null;
}

export function hasStateBallot(stateAbbr: string): boolean {
  return getStateBallot(stateAbbr) !== null;
}

/** True when we have county-level (and possibly municipal) data for this county. */
export function hasCountyBallot(stateAbbr: string, county: string | null): boolean {
  return getCountyBallot(getStateBallot(stateAbbr), county) !== null;
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
