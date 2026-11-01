import { SENATE_2026_STATES } from "@/data/senate2026";
import fec2026 from "@/data/fec2026.json";
import nominees2026 from "@/data/nominees2026.json";
import { getFinance, type CandidateFinance } from "@/lib/finance";
import { getPositions, type CandidatePositions } from "@/lib/positions";
import { getVotes, type CandidateVotes } from "@/lib/votes";

// Static snapshot of OpenFEC /candidates/ (all 2026 House + Senate filers,
// raw flags kept) written by `npm run fetch-fec`, plus Wikipedia's list of
// general-election nominees written by `npm run fetch-nominees`. No network at runtime.
const ELECTION_YEAR = 2026;

export type Party = "Democratic" | "Republican" | "Libertarian" | "Green" | "Independent" | "Other";

export type Candidate = {
  /** FEC candidate_id, or "wiki:<slug>" for a nominee with no FEC match. */
  candidateId: string;
  /** Display name, e.g. "Ronald E. Kincaid Jr." */
  name: string;
  party: Party;
  /** Raw FEC party code, e.g. "DEM", "NON", "W". */
  partyCode: string;
  /** FEC says this candidate currently holds the seat. */
  incumbent: boolean;
  /** null = nominee we couldn't match to an FEC filing. */
  fecUrl: string | null;
  /** Listed as a write-in candidate on the general-election ballot. */
  writeIn: boolean;
  /** Stated positions from the campaign site; null = not looked up yet. */
  positions: CandidatePositions | null;
  /** FEC money summary; only on `likely` candidates (null = none on file). */
  finance?: CandidateFinance | null;
  /** Roll-call record for sitting members of Congress; only on `likely` candidates. */
  votes?: CandidateVotes | null;
};

export type Contest = {
  office: "S" | "H";
  /** Senate special election (fills the rest of a term). */
  special: boolean;
  /** FEC district code: "00" for Senate and at-large/delegate House seats. */
  district: string;
  /**
   * "nominees": likely = general-election nominees (Wikipedia), other = the
   * remaining FEC filers. "fec_heuristic": no nominee data for this race, so
   * likely = incumbent, raised money, or the only DEM/REP option for their party.
   */
  ballotSource: "nominees" | "fec_heuristic";
  likely: Candidate[];
  /** Every other active FEC filer (may have withdrawn or lost a primary). */
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
  /** A few raw FEC rows have no name (e.g. H6AZ08210); those are skipped. */
  races: Record<string, (Omit<FecCandidate, "name"> & { name: string | null })[]>;
};

const DATA = fec2026 as Snapshot;

type Nominee = { name: string; party: Party; writeIn?: boolean };
type NomineeSnapshot = {
  fetchedAt: string;
  races: Record<string, { source: string; revisionId: number; candidates: Nominee[] }>;
};

const NOMINEES = nominees2026 as NomineeSnapshot;

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

function toCandidate(c: FecCandidate, writeIn = false): Candidate {
  const code = c.party ?? "";
  return {
    candidateId: c.candidate_id,
    name: formatName(c.name),
    party: PARTIES[code] ?? "Other",
    partyCode: code,
    incumbent: c.incumbent_challenge === "I",
    fecUrl: `https://www.fec.gov/data/candidate/${c.candidate_id}/`,
    writeIn,
    positions: getPositions(c.candidate_id),
  };
}

/** A nominee with no FEC filing we could match; shown so no nominee is ever dropped. */
function nomineeOnly(n: Nominee): Candidate {
  const slug = plainLetters(n.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    candidateId: `wiki:${slug}`,
    name: n.name,
    party: n.party,
    partyCode: "",
    incumbent: false,
    fecUrl: null,
    writeIn: n.writeIn ?? false,
    positions: getPositions(`wiki:${slug}`),
  };
}

// ---------- matching Wikipedia nominees to FEC filers ----------

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Common short forms of first names, mapped to the formal name FEC filings tend to use. */
const NICKNAMES: Record<string, string> = {
  jim: "james", jimmy: "james", bob: "robert", bobby: "robert", rob: "robert", robby: "robert",
  bill: "william", billy: "william", will: "william", mike: "michael", nick: "nicholas",
  chuck: "charles", charlie: "charles", dan: "daniel", danny: "daniel", tom: "thomas",
  tommy: "thomas", joe: "joseph", tony: "anthony", dave: "david", steve: "steven",
  ed: "edward", eddie: "edward", rick: "richard", rich: "richard", dick: "richard",
  ted: "theodore", andy: "andrew", drew: "andrew", liz: "elizabeth", beth: "elizabeth",
  kate: "katherine", katie: "katherine", peggy: "margaret", jerry: "gerald", larry: "lawrence",
  hank: "henry", jack: "john", pete: "peter", ron: "ronald", don: "donald", ken: "kenneth",
  sue: "susan", jon: "jonathan",
};

/** Lowercase ASCII letters/digits/spaces: "Sánchez" -> "sanchez", "O'Leary" -> "oleary". */
function plainLetters(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words of a name, minus suffixes and honorifics; hyphenated names split into both halves. */
function nameWords(s: string): string[] {
  return plainLetters(s.replace(/-/g, " "))
    .split(" ")
    .filter((w) => w && !NAME_SUFFIXES.has(w) && !HONORIFICS.has(w.toUpperCase()));
}

type FecName = { last: string[]; first: string[] };
type WikiName = { last: string; first: string[]; middle: string[]; all: string[] };

/** FEC "LAST, FIRST MIDDLE (NICK)" -> surname words and given-name words. */
function fecName(raw: string): FecName {
  const [last = "", first = ""] = raw.split(",", 2);
  return { last: nameWords(last), first: nameWords(first.replace(/["“”()]/g, " ")) };
}

/** Wikipedia 'James C. "Jim" McDermott Jr.' -> last "mcdermott", first ["james", "jim"], middle ["c"]. */
function wikiName(raw: string): WikiName {
  const nicks = [...raw.matchAll(/["“(]([^"”)]+)["”)]/g)].flatMap((m) => nameWords(m[1]));
  const all = nameWords(raw.replace(/["“][^"”]*["”]|\([^)]*\)/g, " "));
  return { last: all[all.length - 1] ?? "", first: [...all.slice(0, 1), ...nicks], middle: all.slice(1, -1), all };
}

/** How well two given names agree: 3 same (or nickname), 2 one a prefix of the other ("mitch"/"mitchell"), 1 initial, 0 no. */
function givenScore(a: string, b: string): number {
  if (a === b || (NICKNAMES[a] ?? a) === (NICKNAMES[b] ?? b)) return 3;
  if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return 2;
  return (a.length === 1 || b.length === 1) && a[0] === b[0] ? 1 : 0;
}

/**
 * Best agreement between the nominee's first name/nicknames and the filer's
 * given names; +1 for a shared middle initial, -1 when both give middle
 * names and none share an initial ("Dan S. Sullivan" vs "SULLIVAN, DANIEL J").
 */
function firstScore(n: WikiName, given: string[]): number {
  const best = Math.max(0, ...n.first.flatMap((a) => given.map((b) => givenScore(a, b))));
  const fecMiddle = given.slice(1);
  if (best === 0 || !n.middle.length || !fecMiddle.length) return best;
  return n.middle.some((m) => fecMiddle.some((g) => g[0] === m[0])) ? best + 1 : best - 1;
}

/** Same surname: the nominee's last word is one of the FEC surname words, or vice versa (compound names). */
function lastMatches(n: WikiName, f: FecName): boolean {
  const fecFinal = f.last[f.last.length - 1];
  return f.last.includes(n.last) || (fecFinal !== undefined && n.all.slice(1).includes(fecFinal));
}

/** Edit distance, for spelling slips between sources ("Krichner"/"KIRCHNER", "Duffe"/"DUFFIE"). */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

type PartyGroup = "D" | "R" | "other";
const fecGroup = (code: string | null): PartyGroup =>
  code === "DEM" || code === "DFL" ? "D" : code === "REP" || code === "GOP" ? "R" : "other";
const nomineeGroup = (p: Party): PartyGroup =>
  p === "Democratic" ? "D" : p === "Republican" ? "R" : "other";

/** Prefer the record that raised money, then the latest filing (same order as dedupe). */
const better = (a: FecCandidate, b: FecCandidate) =>
  Number(b.has_raised_funds) - Number(a.has_raised_funds) ||
  (b.last_file_date ?? "").localeCompare(a.last_file_date ?? "");

/**
 * likely = each nominee's FEC filing (or a "wiki:" entry when there is none),
 * other = the remaining FEC filers. Matching, in passes, each taking the
 * best-scoring unused filer:
 *   1. same surname and party group (D / R / everyone else); if more than one
 *      filer fits, the first name must agree (nickname, prefix or initial).
 *   2. same surname and first name, any party (FEC party labels can differ
 *      from the ballot, e.g. "UNK", or an incumbent now running as independent).
 *   3. the nominee's surname and first name anywhere in the FEC name, any
 *      order (FEC typos like "NICK, LALOTA"; married names like
 *      "ARENHOLZ, ASHLEY HINSON").
 *   4. same party and first name (or nickname), surname within 2 edits
 *      (5+ letters): spelling slips like "Krichner" vs "KIRCHNER, MIKE".
 * Ties between equally good records are re-filings by one person: the better
 * record is kept and the others dropped, as are any other unused records
 * with the same surname, party and first name (or nickname) as a matched nominee.
 */
function splitByNominees(rows: FecCandidate[], nominees: Nominee[]) {
  const pool = rows.map((row) => ({ row, name: fecName(row.name) }));
  const used = new Set<FecCandidate>();
  const matched = new Map<Nominee, FecCandidate>();
  const people = nominees.map((n) => ({ n, name: wikiName(n.name) }));
  const sameParty = (n: Nominee, r: FecCandidate) => fecGroup(r.party) === nomineeGroup(n.party);

  const passes: ((n: Nominee, w: WikiName, f: FecName, r: FecCandidate) => number)[] = [
    (n, w, f, r) => (lastMatches(w, f) && sameParty(n, r) ? 1 + firstScore(w, f.first) : 0),
    (n, w, f) => (lastMatches(w, f) ? firstScore(w, f.first) : 0),
    (n, w, f) => {
      const words = [...f.last, ...f.first];
      if (!words.includes(w.last)) return 0;
      return firstScore(w, words.filter((x) => x !== w.last));
    },
    (n, w, f, r) => {
      const close = w.last.length >= 5 && f.last.some((x) => editDistance(x, w.last) <= 2);
      return close && sameParty(n, r) && firstScore(w, f.first) >= 3 ? 2 : 0;
    },
  ];
  for (const [i, score] of passes.entries()) {
    for (const { n, name } of people) {
      if (matched.has(n)) continue;
      const scored = pool
        .filter((p) => !used.has(p.row))
        .map((p) => ({ row: p.row, s: score(n, name, p.name, p.row) }))
        .filter((x) => x.s > 0);
      // Pass 1 with a single surname+party fit needs no first-name check.
      const top = Math.max(...scored.map((x) => x.s));
      if (!scored.length || (top < 2 && !(i === 0 && scored.length === 1))) continue;
      const best = scored.filter((x) => x.s === top).map((x) => x.row).sort(better);
      matched.set(n, best[0]);
      best.forEach((r) => used.add(r));
    }
  }
  for (const { n, name } of people) {
    if (!matched.has(n)) continue;
    for (const p of pool) {
      if (lastMatches(name, p.name) && sameParty(n, p.row) && firstScore(name, p.name.first) >= 3) used.add(p.row);
    }
  }

  // Matched nominees keep their ballot name and party from Wikipedia (FEC has
  // "NICK, LALOTA", party "UNK", ...); the FEC id, link and incumbent flag stay.
  const likely = nominees.map((n) => {
    const row = matched.get(n);
    return row ? { ...toCandidate(row, n.writeIn ?? false), name: n.name, party: n.party } : nomineeOnly(n);
  });
  const rank = (c: Candidate) => (c.incumbent ? 0 : c.party === "Democratic" || c.party === "Republican" ? 1 : 2);
  const surname = (c: Candidate) => c.name.split(" ").filter((w) => !/^(Jr\.|Sr\.|I{1,3}|IV)$/.test(w)).pop() ?? "";
  likely.sort((a, b) => rank(a) - rank(b) || surname(a).localeCompare(surname(b)));
  return { likely, other: rows.filter((r) => !used.has(r)).map((r) => toCandidate(r)) };
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

/** Attach FEC money data and voting records to the likely tier only; other filers stay lean. */
function withFinance<T extends { likely: Candidate[] }>(contest: T): T {
  return {
    ...contest,
    likely: contest.likely.map((c) => ({
      ...c,
      finance: c.candidateId.startsWith("wiki:") ? null : getFinance(c.candidateId),
      votes: c.candidateId.startsWith("wiki:") ? null : getVotes(c.candidateId),
    })),
  };
}

function candidatesFor(state: string, office: "S" | "H", district: string) {
  const key = `${state}-${office}-${district}`;
  const rows = DATA.races[key];
  const nominees = NOMINEES.races[key]?.candidates;
  if (!rows) {
    // No rows: either nobody filed, or this unit hasn't been fetched yet.
    const unit = office === "S" ? "S" : `H-${state}`;
    if (!DATA.progress[unit]?.done) {
      throw new MissingDataError(`FEC snapshot does not include ${key} yet`);
    }
  }
  // FEC names are "LAST, FIRST", so this is last-name order; split's sort is stable.
  const named = (rows ?? []).filter((r): r is FecCandidate => r.name !== null);
  const filers = dedupe(named.sort((a, b) => a.name.localeCompare(b.name))).filter(active);
  if (nominees?.length) {
    return { ballotSource: "nominees" as const, ...splitByNominees(filers, nominees) };
  }
  const { likely, other } = split(filers);
  return {
    ballotSource: "fec_heuristic" as const,
    likely: likely.map((c) => toCandidate(c)),
    other: other.map((c) => toCandidate(c)),
  };
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
          ...withFinance(candidatesFor(state, "S", "00")),
        }
      : null,
    house: district
      ? { office: "H", special: false, district, ...withFinance(candidatesFor(state, "H", district)) }
      : null,
  };
}
