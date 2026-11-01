import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Who funds each federal nominee: FEC figures for the 2025-26 two-year period,
// written by `npm run fetch-finance` to src/data/finance2026.json (keyed by FEC
// candidate_id). Read from disk at request time (traced into /api/contests via
// outputFileTracingIncludes) and re-read when the file changes, so a pull in
// progress shows up without a restart. Names and amounts only; donors are
// never classified.

export type FinanceDonor = { name: string; committeeId: string; amount: number };
export type FinanceSpender = { spender: string; committeeId: string; amount: number };

export type CandidateFinance = {
  committeeIds: string[];
  /** Last day covered by the filings, "YYYY-MM-DD". */
  coverageEnd: string | null;
  receipts: number;
  individualItemized: number;
  individualUnitemized: number;
  /** Contributions from PACs and other non-party political committees. */
  pacContributions: number;
  /** Candidate's own contributions plus loans from the candidate. */
  selfFunding: number;
  /** Share (0-1) of individual contributions in amounts under $200; null = no data. */
  smallDonorShare: number | null;
  /** pacContributions / receipts (0-1); null = no receipts. */
  pacShare: number | null;
  /** From FEC bulk committee-to-candidate data, largest first. */
  topPacs: FinanceDonor[];
  /** Self-reported employers of individual donors (not corporate donations). */
  topEmployers: { employer: string; amount: number }[];
  /** Independent expenditures supporting / opposing the candidate. */
  outsideSupport: FinanceSpender[];
  outsideOppose: FinanceSpender[];
  fecUrl: string;
};

type Snapshot = {
  generatedAt: string | null;
  cycle: number;
  /** null = FEC has no 2025-26 financial report for this candidate. */
  candidates: Record<string, CandidateFinance | null>;
};

const FILE = path.join(process.cwd(), "src", "data", "finance2026.json");

let cache: { mtime: number; data: Snapshot["candidates"] } | null = null;

function load(): Snapshot["candidates"] {
  if (!existsSync(FILE)) return {};
  const mtime = statSync(FILE).mtimeMs;
  if (cache?.mtime === mtime) return cache.data;
  try {
    const data = (JSON.parse(readFileSync(FILE, "utf8")) as Snapshot).candidates;
    cache = { mtime, data };
    return data;
  } catch {
    // Caught mid-write by the fetch script; use the last good read.
    return cache?.data ?? {};
  }
}

/** null = not pulled yet, or no 2025-26 FEC financial report. */
export function getFinance(candidateId: string): CandidateFinance | null {
  return load()[candidateId] ?? null;
}
