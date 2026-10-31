import type { NextRequest } from "next/server";
import { getVoterInfo, type VoterInfo } from "@/lib/civic";

// Polling places can change close to the election, so cache for 6 hours.
// (The server-side cache lives in getVoterInfo via `use cache` + cacheLife.)
const SIX_HOURS = 60 * 60 * 6;

// The page shows the first few of each list plus a count. Vote-center states can
// return hundreds of drop boxes (Denver: 451, ~640 KB), so don't ship them all.
const MAX_PER_LIST = 3;

export type PollingResponse = VoterInfo & {
  counts: { pollingLocations: number; earlyVoteSites: number; dropOffLocations: number };
};

/** GET /api/polling?address=... */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams
    .get("address")
    ?.trim()
    .replace(/\s+/g, " ");
  if (!address) {
    return Response.json({ error: "Missing ?address=" }, { status: 400 });
  }

  let result;
  try {
    result = await getVoterInfo(address);
  } catch {
    return Response.json(
      { error: "Polling place lookup is unavailable. Please try again." },
      { status: 502 },
    );
  }

  if (!result) {
    return Response.json(
      { error: "No polling place data for this address" },
      { status: 404, headers: { "Cache-Control": `public, max-age=${SIX_HOURS}, s-maxage=${SIX_HOURS}` } },
    );
  }

  const body: PollingResponse = {
    ...result,
    pollingLocations: result.pollingLocations.slice(0, MAX_PER_LIST),
    earlyVoteSites: result.earlyVoteSites.slice(0, MAX_PER_LIST),
    dropOffLocations: result.dropOffLocations.slice(0, MAX_PER_LIST),
    counts: {
      pollingLocations: result.pollingLocations.length,
      earlyVoteSites: result.earlyVoteSites.length,
      dropOffLocations: result.dropOffLocations.length,
    },
  };
  return Response.json(body, {
    headers: { "Cache-Control": `public, max-age=${SIX_HOURS}, s-maxage=${SIX_HOURS}` },
  });
}
