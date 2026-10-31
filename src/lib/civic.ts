import "server-only";
import { cacheLife } from "next/cache";

// Google Civic Information API, voterinfo endpoint (data from the Voting Information Project).
const ENDPOINT = "https://www.googleapis.com/civicinfo/v2/voterinfo";
// 2026 General Midterm Election.
const ELECTION_ID = "12000";

export type Place = {
  name: string;
  /** One line: "501 E Broad St, Columbus, OH 43215". */
  address: string;
  hours: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  lat?: number;
  lng?: number;
  /** Google Maps search link for the address. */
  mapsUrl: string;
};

export type CivicCandidate = { name: string; party?: string; candidateUrl?: string };

export type CivicContest = {
  type?: string;
  office?: string;
  level?: string[];
  district?: string;
  candidates: CivicCandidate[];
  referendumTitle?: string;
  referendumSubtitle?: string;
  referendumUrl?: string;
  referendumText?: string;
};

export type ElectionOffice = {
  name?: string;
  infoUrl?: string;
  locationFinderUrl?: string;
  ballotInfoUrl?: string;
};

export type VoterInfo = {
  pollingLocations: Place[];
  earlyVoteSites: Place[];
  dropOffLocations: Place[];
  electionOffice: ElectionOffice | null;
  contests: CivicContest[];
};

type RawAddress = {
  locationName?: string;
  line1?: string;
  line2?: string;
  line3?: string;
  city?: string;
  state?: string;
  zip?: string;
};

type RawPlace = {
  address?: RawAddress;
  pollingHours?: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  latitude?: number;
  longitude?: number;
};

type RawContest = {
  type?: string;
  office?: string;
  level?: string[];
  district?: { name?: string };
  candidates?: { name?: string; party?: string; candidateUrl?: string }[];
  referendumTitle?: string;
  referendumSubtitle?: string;
  referendumUrl?: string;
  referendumText?: string;
};

type RawResponse = {
  pollingLocations?: RawPlace[];
  earlyVoteSites?: RawPlace[];
  dropOffLocations?: RawPlace[];
  contests?: RawContest[];
  state?: {
    electionAdministrationBody?: {
      name?: string;
      electionInfoUrl?: string;
      votingLocationFinderUrl?: string;
      ballotInfoUrl?: string;
    };
  }[];
  error?: { code?: number; message?: string };
};

function oneLine(a: RawAddress): string {
  const street = [a.line1, a.line2, a.line3].filter(Boolean).join(", ");
  const stateZip = [a.state, a.zip].filter(Boolean).join(" ");
  return [street, a.city, stateZip].filter(Boolean).join(", ");
}

function toPlace(p: RawPlace): Place {
  const a = p.address ?? {};
  const address = oneLine(a);
  const name = a.locationName?.trim() || address;
  return {
    name,
    address,
    hours: p.pollingHours?.trim() ?? "",
    ...(p.notes ? { notes: p.notes } : {}),
    ...(p.startDate ? { startDate: p.startDate } : {}),
    ...(p.endDate ? { endDate: p.endDate } : {}),
    ...(typeof p.latitude === "number" ? { lat: p.latitude } : {}),
    ...(typeof p.longitude === "number" ? { lng: p.longitude } : {}),
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [a.locationName, address].filter(Boolean).join(", "),
    )}`,
  };
}

function toContest(c: RawContest): CivicContest {
  return {
    type: c.type,
    office: c.office,
    level: c.level,
    district: c.district?.name,
    candidates: (c.candidates ?? [])
      .filter((x) => x.name)
      .map((x) => ({ name: x.name!, party: x.party, candidateUrl: x.candidateUrl })),
    referendumTitle: c.referendumTitle,
    referendumSubtitle: c.referendumSubtitle,
    referendumUrl: c.referendumUrl,
    referendumText: c.referendumText,
  };
}

/**
 * Polling place, early voting, drop boxes (and contests, if any) for an address.
 * Returns null when the API has no data for the address ("Election unknown" or
 * empty). Throws on other upstream failures so they are not cached.
 */
export async function getVoterInfo(address: string): Promise<VoterInfo | null> {
  "use cache";
  cacheLife({ stale: 60 * 5, revalidate: 60 * 60 * 6, expire: 60 * 60 * 24 });

  const key = process.env.GOOGLE_CIVIC_API_KEY;
  if (!key) throw new Error("GOOGLE_CIVIC_API_KEY is not set");

  const params = new URLSearchParams({
    key,
    address,
    electionId: ELECTION_ID,
    returnAllAvailableData: "true",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(10_000) });
  const data = (await res.json().catch(() => null)) as RawResponse | null;

  if (!res.ok) {
    // Unknown election / unparseable address for this election: no data, not a failure.
    if (res.status === 400 || res.status === 404) return null;
    // Never include the request URL (it carries the key).
    throw new Error(`Civic API returned ${res.status}${data?.error?.message ? `: ${data.error.message}` : ""}`);
  }
  if (!data) throw new Error("Civic API returned invalid JSON");

  const result: VoterInfo = {
    pollingLocations: (data.pollingLocations ?? []).map(toPlace),
    earlyVoteSites: (data.earlyVoteSites ?? []).map(toPlace),
    dropOffLocations: (data.dropOffLocations ?? []).map(toPlace),
    contests: (data.contests ?? []).map(toContest),
    electionOffice: null,
  };
  if (
    !result.pollingLocations.length &&
    !result.earlyVoteSites.length &&
    !result.dropOffLocations.length &&
    !result.contests.length
  ) {
    return null;
  }

  const body = data.state?.[0]?.electionAdministrationBody;
  if (body) {
    result.electionOffice = {
      name: body.name,
      infoUrl: body.electionInfoUrl,
      locationFinderUrl: body.votingLocationFinderUrl,
      ballotInfoUrl: body.ballotInfoUrl,
    };
  }
  return result;
}
