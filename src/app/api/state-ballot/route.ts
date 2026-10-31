import type { NextRequest } from "next/server";
import { getPositions } from "@/lib/positions";
import {
  getCountyBallot,
  getLegislativeContests,
  getMunicipalBallot,
  readStateBallot,
  type BallotContest,
  type BallotSection,
  type StateBallotContest,
  type StateBallotResponse,
  type StateBallotSection,
} from "@/lib/stateBallot";

// Reads src/data/state/{ST}.json from disk per request (traced into the
// function via outputFileTracingIncludes in next.config.ts). Browsers/CDN may
// cache for an hour.
const ONE_HOUR = 60 * 60;

function withPositions(c: BallotContest): StateBallotContest {
  return {
    ...c,
    // No entry = not looked up yet (e.g. write-ins); the UI shows nothing.
    candidates: c.candidates.map((k) => ({ ...k, positions: k.writeIn ? null : getPositions(k.key) })),
  };
}

function section(s: BallotSection): StateBallotSection {
  return { contests: s.contests.map(withPositions), measures: s.measures };
}

const district = (v: string | null) => (v && /^\d{1,4}$/.test(v) ? v : null);

/**
 * GET /api/state-ballot?state=OH&county=Franklin%20County&place=Columbus&sd=15&hd=1
 * 404 when we have no data file for the state.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state")?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(state)) {
    return Response.json({ error: "Invalid ?state= (two-letter code)" }, { status: 400 });
  }
  const county = params.get("county")?.trim() || null;
  const place = params.get("place")?.trim() || null;

  const ballot = await readStateBallot(state);
  if (!ballot) {
    return Response.json({ error: "No state ballot data for this state yet." }, { status: 404 });
  }

  const legislative = getLegislativeContests(ballot, district(params.get("sd")), district(params.get("hd")));
  const countyBallot = getCountyBallot(ballot, county);
  const municipal = getMunicipalBallot(ballot, county, place);

  const body: StateBallotResponse = {
    notice: ballot.notice,
    statewide: section(ballot.statewide),
    legislative: {
      senate: legislative.senate && withPositions(legislative.senate),
      house: legislative.house && withPositions(legislative.house),
    },
    county: countyBallot && { ...section(countyBallot), note: countyBallot.note },
    municipal: municipal && section(municipal),
    hasCounty: countyBallot !== null,
    gaps: ballot.gaps,
  };
  return Response.json(body, {
    headers: { "Cache-Control": `public, max-age=${ONE_HOUR}, s-maxage=${ONE_HOUR}` },
  });
}
