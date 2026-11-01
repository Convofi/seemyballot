import "server-only";
import { Redis } from "@upstash/redis";
import type { LookupResult } from "@/lib/census";

// Aggregate search counters only. Never store addresses or coordinates:
// the finest granularity kept here is a congressional district or county.

const KEY_STATE = "searches:state";
const KEY_CD = "searches:cd";
const KEY_COUNTY = "searches:county";
const KEY_TOTAL = "searches:total";
const KEY_UPDATED = "searches:updatedAt";
const LIST_CAP = 200;

export type DistrictCount = { id: string; state: string; district: string; count: number };
export type CountyCount = { id: string; state: string; county: string; count: number };

export type Stats =
  | { available: false }
  | {
      available: true;
      total: number;
      updatedAt: string | null;
      states: Record<string, number>;
      districts: DistrictCount[];
      counties: CountyCount[];
    };

// Created lazily so `next build` works without the env vars.
function redis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return Redis.fromEnv();
}

let warned = false;

export async function recordSearch(r: LookupResult): Promise<void> {
  const db = redis();
  if (!db) return;
  const st = r.state.abbr;
  try {
    const p = db.pipeline();
    p.hincrby(KEY_STATE, st, 1);
    if (r.congressionalDistrict) {
      const n = r.congressionalDistrict.number;
      p.hincrby(KEY_CD, `${st}-${n ? n.padStart(2, "0") : "AL"}`, 1);
    }
    if (r.county) p.hincrby(KEY_COUNTY, `${st}|${r.county}`, 1);
    p.incr(KEY_TOTAL);
    p.set(KEY_UPDATED, new Date().toISOString());
    await p.exec();
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error("recordSearch failed", err instanceof Error ? err.message : err);
    }
  }
}

function counts(h: Record<string, unknown> | null): [string, number][] {
  return Object.entries(h ?? {})
    .map(([k, v]) => [k, Number(v)] as [string, number])
    .filter(([, n]) => n > 0);
}

function top<T extends { count: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => b.count - a.count).slice(0, LIST_CAP);
}

export async function getStats(): Promise<Stats> {
  const db = redis();
  if (!db) return { available: false };
  const [states, cds, counties, total, updatedAt] = await Promise.all([
    db.hgetall<Record<string, number>>(KEY_STATE),
    db.hgetall<Record<string, number>>(KEY_CD),
    db.hgetall<Record<string, number>>(KEY_COUNTY),
    db.get<number>(KEY_TOTAL),
    db.get<string>(KEY_UPDATED),
  ]);
  return {
    available: true,
    total: Number(total ?? 0),
    updatedAt: updatedAt ?? null,
    states: Object.fromEntries(counts(states)),
    districts: top(
      counts(cds).map(([id, count]) => {
        const [state, district] = id.split("-");
        return { id, state, district, count };
      }),
    ),
    counties: top(
      counts(counties).map(([id, count]) => {
        const i = id.indexOf("|");
        return { id, state: id.slice(0, i), county: id.slice(i + 1), count };
      }),
    ),
  };
}
