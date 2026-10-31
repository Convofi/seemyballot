import { SENATE_2026_STATES } from "@/data/senate2026";
import fec2026 from "@/data/fec2026.json";
import { getPositions, type CandidatePositions } from "@/lib/positions";

// Static snapshot of OpenFEC /candidates/ (all 2026 House + Senate filers,
// raw flags kept) written by `npm run fetch-fec`. No network at runtime.
const ELECTION_YEAR = 2026;

export type Party = "Democratic" | "Republican" | "Libertarian" | "Green" | "Independent" | "Other";

export type Candidate = {
  candidateId: string;
  /** Display name, e.g. "Ronald E. Kincaid Jr." */
  name: string;
  party: Party;
  /** Raw FEC party code, e.g. "DEM", "NON", "W". */
  partyCode: string;
  /** FEC says this candidate currently holds the seat. */
  incumbent: boolean;
  fecUrl: string;
  /** Stated positions from the campaign site; null = not looked up yet. */
  positions: CandidatePositions | null;
};

export type Contest = {
  office: "S" | "H";
  /** Senate special election (fills the rest of a term). */
  special: boolean;
  /** FEC district code: "00" for Senate and at-large/delegate House seats. */
  district: string;
  /** Incumbent, raised money, or the only DEM/REP option for their party. */
  likely: Candidate[];
  /** Every other active filer (may have withdrawn or lost a primary). */
  other: Candidate[];
};

export type FederalContests = {
  /** null = no Senate election in this state in 2026. */
  senate: Contest | null;
  /** null = no district requested. */
  house: Contest | null;
};

type FecCandidate = {
  candidate_id: string;
  name: string;
  party: string | null;
  incumbent_challenge: string | null;
  candidate_status: string | null;
  has_raised_funds: boolean;
  inactive_election_years: number[] | null;
  last_file_date: string | null;
};

type Snapshot = {
  fetchedAt: string | null;
  /** Fetch units ("S", "H-OH", ...) and whether every page was pulled. */
  progress: Record<string, { done: boolean }>;
  races: Record<string, FecCandidate[]>;
};

const DATA = fec2026 as Snapshot;

/** Thrown when the snapshot doesn't cover the requested race yet. */
export class MissingDataError extends Error {}

const PARTIES: Record<string, Party> = {
  DEM: "Democratic",
  REP: "Republican",
  LIB: "Libertarian",
  GRE: "Green",
  IND: "Independent",
};

const HONORIFICS = new Set(["MR", "MRS", "MS", "MISS", "DR", "REP", "SEN", "HON", "REV", "PROF"]);
const SUFFIXES: Record<string, string> = { JR: "Jr.", SR: "Sr.", II: "II", III: "III", IV: "IV" };

function capitalize(word: string): string {
  // Title-case each piece of hyphenated / apostrophe names; "MCCAUL" -> "McCaul".
  return word
    .toLowerCase()
    .replace(/(^|[-'])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase())
    .replace(/^Mc([a-z])/, (_, c: string) => "Mc" + c.toUpperCase());
}

/** "KINCAID, RONALD E JR" -> "Ronald E. Kincaid Jr."; drops honorifics (MR, DR., REP.). */
export function formatName(raw: string): string {
  const [last = "", first = ""] = raw.split(",", 2).map((s) => s.trim());
  const suffixes: string[] = [];
  const words = (part: string) =>
    part
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((w) => {
        const key = w.replace(/\./g, "").toUpperCase();
        if (HONORIFICS.has(key)) return [];
        if (SUFFIXES[key]) {
          suffixes.push(SUFFIXES[key]);
          return [];
        }
        // Single-letter middle initial gets a period.
        return [key.length === 1 ? `${key}.` : capitalize(w)];
      });
  const firstWords = words(first);
  const lastWords = words(last);
  return [...firstWords, ...lastWords, ...suffixes].join(" ");
}

const MAJOR = new Set(["DEM", "REP"]);

/**
 * FEC sets inactive_election_years for candidates who told it they aren't
 * running (e.g. retiring incumbents), so those are dropped entirely.
 */
function active(c: FecCandidate): boolean {
  return !c.inactive_election_years?.includes(ELECTION_YEAR);
}

/**
 * Split a race into likely candidates and other filers. Likely = incumbent,
 * raised money, or a DEM/REP filer whose party has no money-raiser in this
 * race (nominees in safe seats often report nothing, e.g. OH-03 GOP, 2026).
 * Likely is sorted incumbent first, then DEM/REP, then others; ties by last name.
 */
function split(rows: FecCandidate[]): { likely: FecCandidate[]; other: FecCandidate[] } {
  const fundedParties = new Set(rows.filter((r) => r.has_raised_funds).map((r) => r.party));
  const isLikely = (r: FecCandidate) =>
    r.incumbent_challenge === "I" ||
    r.has_raised_funds ||
    (MAJOR.has(r.party ?? "") && !fundedParties.has(r.party));
  const rank = (r: FecCandidate) =>
    r.incumbent_challenge === "I" ? 0 : MAJOR.has(r.party ?? "") ? 1 : 2;
  return {
    likely: rows.filter(isLikely).sort((a, b) => rank(a) - rank(b)),
    other: rows.filter((r) => !isLikely(r)),
  };
}

function toCandidate(c: FecCandidate): Candidate {
  const code = c.party ?? "";
  return {
    candidateId: c.candidate_id,
    name: formatName(c.name),
    party: PARTIES[code] ?? "Other",
    partyCode: code,
    incumbent: c.incumbent_challenge === "I",
    fecUrl: `https://www.fec.gov/data/candidate/${c.candidate_id}/`,
    positions: getPositions(c.candidate_id),
  };
}

/**
 * Some people file twice (new ID after switching districts). Collapse records
 * with the same display name and party, preferring the one that raised money,
 * then the most recent filing.
 */
function dedupe(rows: FecCandidate[]): FecCandidate[] {
  const byId = new Map(rows.map((r) => [r.candidate_id, r]));
  const byPerson = new Map<string, FecCandidate>();
  for (const r of byId.values()) {
    const key = `${formatName(r.name)}|${r.party}`;
    const prev = byPerson.get(key);
    const better =
      !prev ||
      (r.has_raised_funds && !prev.has_raised_funds) ||
      (r.has_raised_funds === prev.has_raised_funds &&
        (r.last_file_date ?? "") > (prev.last_file_date ?? ""));
    if (better) byPerson.set(key, r);
  }
  return [...byPerson.values()];
}

function candidatesFor(state: string, office: "S" | "H", district: string) {
  const rows = DATA.races[`${state}-${office}-${district}`];
  if (!rows) {
    // No rows: either nobody filed, or this unit hasn't been fetched yet.
    const unit = office === "S" ? "S" : `H-${state}`;
    if (!DATA.progress[unit]?.done) {
      throw new MissingDataError(`FEC snapshot does not include ${state}-${office}-${district} yet`);
    }
    return { likely: [], other: [] };
  }
  // FEC names are "LAST, FIRST", so this is last-name order; split's sort is stable.
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const { likely, other } = split(dedupe(sorted).filter(active));
  return { likely: likely.map(toCandidate), other: other.map(toCandidate) };
}

/**
 * Federal contests for a state and (optional) congressional district.
 * districtNumber: "3" -> district 03; "0" -> at-large / DC delegate ("00");
 * null -> House not requested. Throws MissingDataError if the snapshot
 * doesn't cover the race.
 */
export async function getFederalContests(
  stateAbbr: string,
  districtNumber: string | null,
): Promise<FederalContests> {
  const state = stateAbbr.toUpperCase();
  const senateKind = SENATE_2026_STATES[state];
  const district = districtNumber === null ? null : districtNumber.padStart(2, "0");

  return {
    senate: senateKind
      ? {
          office: "S",
          special: senateKind === "special",
          district: "00",
          ...candidatesFor(state, "S", "00"),
        }
      : null,
    house: district
      ? { office: "H", special: false, district, ...candidatesFor(state, "H", district) }
      : null,
  };
}
