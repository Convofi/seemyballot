import { cacheLife } from "next/cache";

// US Census Geocoder: one-line address -> matched address + geographies.
// Docs: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
const ENDPOINT =
  "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";

export type District = {
  /** Census display name, e.g. "Congressional District 3", "Ward 2". */
  name: string;
  /** District number without leading zeros; null for at-large / delegate seats. */
  number: string | null;
};

export type LookupResult = {
  matchedAddress: string;
  lat: number;
  lng: number;
  state: { name: string; abbr: string; fips: string };
  county: string | null;
  place: string | null;
  congressionalDistrict: District | null;
  /** Upper chamber. In DC this is the council ward. */
  stateSenateDistrict: District | null;
  /** Lower chamber. Null in Nebraska (unicameral) and DC. */
  stateHouseDistrict: District | null;
};

type Feature = Record<string, string | number | undefined>;
type Geographies = Record<string, Feature[]>;

type CensusResponse = {
  result?: {
    addressMatches?: {
      matchedAddress: string;
      coordinates: { x: number; y: number };
      geographies: Geographies;
    }[];
  };
};

// Layer keys carry a year/session ("119th Congressional Districts",
// "2026 State Legislative Districts - Upper"), so match by substring.
function layer(geos: Geographies, match: (key: string) => boolean): Feature | null {
  const key = Object.keys(geos).find(match);
  return (key && geos[key]?.[0]) || null;
}

function str(f: Feature | null, field: string): string | null {
  const v = f?.[field];
  return v === undefined || v === "" ? null : String(v);
}

function stripZeros(code: string | null): string | null {
  return code ? code.replace(/^0+(?=.)/, "") : null;
}

function congressional(f: Feature | null): District | null {
  if (!f) return null;
  // Field is named after the session (CD119, CD120, ...).
  const cdKey = Object.keys(f).find((k) => /^CD\d+$/.test(k));
  const code = cdKey ? str(f, cdKey) : null;
  // "00" = at-large state, "98" = non-voting delegate (DC, territories).
  const atLarge = code === "00" || code === "98" || code === "ZZ";
  return {
    name: str(f, "NAME") ?? "",
    number: atLarge ? null : stripZeros(code ?? str(f, "BASENAME")),
  };
}

function legislative(f: Feature | null, codeField: string): District | null {
  if (!f) return null;
  const code = str(f, codeField);
  // "ZZZ" = area not assigned to a district (e.g. water).
  if (code && /^Z+$/.test(code)) return null;
  return {
    name: str(f, "NAME") ?? "",
    number: str(f, "BASENAME") ?? stripZeros(code),
  };
}

/**
 * Geocode a one-line US address and return its districts.
 * Returns null if the Census Geocoder finds no match. Throws on upstream errors
 * (so failures are not cached).
 */
export async function lookupAddress(oneLine: string): Promise<LookupResult | null> {
  "use cache";
  cacheLife("days");

  const params = new URLSearchParams({
    address: oneLine,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "all",
    format: "json",
  });
  const res = await fetch(`${ENDPOINT}?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Census geocoder returned ${res.status}`);

  const data = (await res.json()) as CensusResponse;
  const match = data.result?.addressMatches?.[0];
  if (!match) return null;

  const g = match.geographies;
  const state = layer(g, (k) => k === "States");

  return {
    matchedAddress: match.matchedAddress,
    lat: match.coordinates.y,
    lng: match.coordinates.x,
    state: {
      name: str(state, "NAME") ?? "",
      abbr: str(state, "STUSAB") ?? "",
      fips: str(state, "STATE") ?? "",
    },
    county: str(layer(g, (k) => k === "Counties"), "NAME"),
    place: str(layer(g, (k) => k === "Incorporated Places"), "BASENAME"),
    congressionalDistrict: congressional(layer(g, (k) => k.includes("Congressional"))),
    stateSenateDistrict: legislative(layer(g, (k) => k.includes("Upper")), "SLDU"),
    stateHouseDistrict: legislative(layer(g, (k) => k.includes("Lower")), "SLDL"),
  };
}
