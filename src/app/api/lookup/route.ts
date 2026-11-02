import { after, type NextRequest } from "next/server";
import { lookupAddress } from "@/lib/census";
import { recordFailure, recordSearch } from "@/lib/stats";

// Districts for an address are stable, so let the browser cache for a day.
// Not the CDN: a CDN hit skips this function and the search goes uncounted.
// (Route segment `revalidate` is not allowed with cacheComponents; the server
// side cache lives in lookupAddress via `use cache` + cacheLife("days").)
const ONE_DAY = 60 * 60 * 24;

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
    result = await lookupAddress(address);
  } catch {
    after(() => recordFailure("unavailable"));
    return Response.json(
      { error: "Address lookup is unavailable. Please try again." },
      { status: 502 },
    );
  }

  if (!result) {
    after(() => recordFailure("no_match"));
    return Response.json(
      { error: "No match for that address" },
      { status: 404, headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }

  // Count the search by state/district/county only, after the response is sent.
  const found = result;
  after(() => recordSearch(found));

  return Response.json(result, {
    headers: { "Cache-Control": `private, max-age=${ONE_DAY}` },
  });
}
