import positions from "@/data/positions.json";

// Candidates' own stated positions, taken from their official campaign sites.
// Written by `npm run fetch-positions` (method "claude") or by hand ("manual").
// Keyed by FEC candidate_id for federal candidates, else a slug like
// "oh-gov-2026-lastname-firstname".

export type Position = {
  /** 2-4 words, e.g. "Health care". */
  topic: string;
  /** One sentence, ≤ 30 words, in the candidate's own words where possible. */
  stance: string;
  /** The exact campaign-site page the stance comes from. */
  sourceUrl: string;
};

export type PositionsStatus = "ok" | "no_website_found" | "website_no_issues_page" | "error";

export type CandidatePositions = {
  name: string;
  website: string | null;
  /** At most 5, in the order the campaign site lists them. */
  positions: Position[];
  /** One neutral sentence (current/former job), from the campaign site or FEC. */
  bio: string | null;
  status: PositionsStatus;
  generatedAt: string;
  method: "manual" | "claude";
};

const DATA = positions as Record<string, CandidatePositions>;

/** null = we haven't looked this candidate up yet (not the same as "nothing found"). */
export function getPositions(key: string): CandidatePositions | null {
  return DATA[key] ?? null;
}
