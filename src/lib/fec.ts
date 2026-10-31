import { cacheLife } from "next/cache";
import { SENATE_2026_STATES } from "@/data/senate2026";

// OpenFEC: https://api.open.fec.gov/developers/
// We use /candidates/ rather than /candidates/search/: on 2026-10-31 the search
// endpoint returned only 1 of 4 OH-03 filers and dropped the Republican
// nominee (Cleophus Dulaney, who has no principal committee on file).
const ENDPOINT = "https://api.open.fec.gov/v1/candidates/";
const ELECTION_YEAR = 2026;
const MAX_PAGES = 10;

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
};

export type Contest = {
  office: "S" | "H";
  /** Senate special election (fills the rest of a term). */
  special: boolean;
  /** FEC district code: "00" for Senate and at-large/delegate House seats. */
  district: string;
  candidates: Candidate[];
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
  has_raised_funds: boolean;
  last_file_date: string | null;
  inactive_election_years: number[] | null;
};

type FecPage = {
  results: FecCandidate[];
  pagination: { pages: number };
};

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

/**
 * Noise filter. FEC lists every Form 2 filer, so we keep a filer when ANY of:
 *  - they have raised money (has_raised_funds), or
 *  - FEC lists them as the incumbent, or
 *  - they filed as a Democrat or Republican.
 * The last rule exists because major-party nominees in safe seats often never
 * report money (OH-03 Republican nominee, 2026). We'd rather show an extra
 * primary loser than omit a nominee.
 * We drop filers whose inactive_election_years includes 2026: FEC sets this
 * for candidates who told it they aren't running (e.g. retiring incumbents).
 */
function keep(c: FecCandidate): boolean {
  if (c.inactive_election_years?.includes(ELECTION_YEAR)) return false;
  return (
    c.has_raised_funds ||
    c.incumbent_challenge === "I" ||
    c.party === "DEM" ||
    c.party === "REP"
  );
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

async function fetchCandidates(state: string, office: "S" | "H", district: string) {
  const rows: FecCandidate[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      api_key: process.env.FEC_API_KEY ?? "DEMO_KEY",
      election_year: String(ELECTION_YEAR),
      state,
      office,
      per_page: "100",
      sort: "name",
      page: String(page),
    });
    if (office === "H") params.set("district", district);
    const res = await fetch(`${ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`FEC returned ${res.status}`);
    const data = (await res.json()) as FecPage;
    rows.push(...data.results);
    if (page >= data.pagination.pages) break;
  }
  // FEC order (sort=name) is by last name.
  return dedupe(rows).filter(keep).map(toCandidate);
}

/**
 * Federal contests for a state and (optional) congressional district.
 * districtNumber: "3" -> district 03; "0" -> at-large / DC delegate ("00");
 * null -> House not requested. Throws on FEC errors (so failures aren't cached).
 */
export async function getFederalContests(
  stateAbbr: string,
  districtNumber: string | null,
): Promise<FederalContests> {
  "use cache";
  cacheLife("hours");

  const state = stateAbbr.toUpperCase();
  const senateKind = SENATE_2026_STATES[state];
  const district = districtNumber === null ? null : districtNumber.padStart(2, "0");

  const [senate, house] = await Promise.all([
    senateKind ? fetchCandidates(state, "S", "00") : null,
    district ? fetchCandidates(state, "H", district) : null,
  ]);

  return {
    senate: senate && {
      office: "S",
      special: senateKind === "special",
      district: "00",
      candidates: senate,
    },
    house:
      house && district ? { office: "H", special: false, district, candidates: house } : null,
  };
}
