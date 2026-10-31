import type { NextRequest } from "next/server";
import { getFederalContests, MissingDataError } from "@/lib/fec";

// Reads the static FEC snapshot (src/data/fec2026.json); no network here.
// Browsers/CDN may cache for an hour.
const ONE_HOUR = 60 * 60;

// 50 states + DC. FEC uses the same USPS codes.
const STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);

/**
 * GET /api/contests?state=OH&district=3
 * district: 1-53, or 0 for at-large / DC delegate. Omit for Senate only.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state")?.trim().toUpperCase() ?? "";
  const rawDistrict = params.get("district")?.trim() || null;

  if (!STATES.has(state)) {
    return Response.json({ error: "Invalid ?state= (two-letter code)" }, { status: 400 });
  }
  if (rawDistrict !== null && !/^\d{1,2}$/.test(rawDistrict)) {
    return Response.json({ error: "Invalid ?district= (0-53)" }, { status: 400 });
  }
  const district = rawDistrict === null ? null : String(Number(rawDistrict));
  if (district !== null && Number(district) > 53) {
    return Response.json({ error: "Invalid ?district= (0-53)" }, { status: 400 });
  }

  try {
    const contests = await getFederalContests(state, district);
    return Response.json(contests, {
      headers: { "Cache-Control": `public, max-age=${ONE_HOUR}, s-maxage=${ONE_HOUR}` },
    });
  } catch (e) {
    if (!(e instanceof MissingDataError)) throw e;
    return Response.json(
      { error: "Federal candidate data isn't loaded for this area yet." },
      { status: 503 },
    );
  }
}
