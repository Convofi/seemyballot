import { connection } from "next/server";
import { getStats } from "@/lib/stats";

export async function GET() {
  // Always read live counters at request time; never prerender at build.
  await connection();
  return Response.json(await getStats(), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}
