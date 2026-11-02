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
const KEY_FAILED = "searches:failed";
// Hourly buckets (UTC) so stats can show the last 24 hours.
const PREFIX_OK_HOUR = "searches:ok";
const PREFIX_FAILED_HOUR = "searches:failed";
const HOUR_TTL = 60 * 60 * 48;
const LIST_CAP = 200;

export type DistrictCount = { id: string; state: string; district: string; count: number };
export type CountyCount = { id: string; state: string; county: string; count: number };

export type FailureReason = "no_match" | "unavailable";
type FailureCounts = { noMatch: number; unavailable: number };

export type Stats =
  | { available: false }
  | {
      available: true;
      total: number;
      updatedAt: string | null;
      states: Record<string, number>;
      districts: DistrictCount[];
      counties: CountyCount[];
      successes: { total: number; last24h: number };
      failures: { total: FailureCounts; last24h: FailureCounts };
    };

// Created lazily so `next build` works without the env vars.
// Vercel's Upstash integration names the vars KV_REST_API_*; Upstash's own are UPSTASH_REDIS_REST_*.
export function redis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// e.g. "searches:ok:2026-11-01T03"
function hourKey(prefix: string, d = new Date()): string {
  return `${prefix}:${d.toISOString().slice(0, 13)}`;
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
    const hour = hourKey(PREFIX_OK_HOUR);
    p.incr(hour);
    p.expire(hour, HOUR_TTL);
    await p.exec();
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error("recordSearch failed", err instanceof Error ? err.message : err);
    }
  }
}

// Failed lookups by reason only; nothing about the request is kept.
export async function recordFailure(reason: FailureReason): Promise<void> {
  const db = redis();
  if (!db) return;
  try {
    const p = db.pipeline();
    p.hincrby(KEY_FAILED, reason, 1);
    const hour = hourKey(PREFIX_FAILED_HOUR);
    p.hincrby(hour, reason, 1);
    p.expire(hour, HOUR_TTL);
    await p.exec();
  } catch (err) {
    if (!warned) {
      warned = true;
      console.error("recordFailure failed", err instanceof Error ? err.message : err);
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

function failureCounts(h: Record<string, unknown> | null): FailureCounts {
  return { noMatch: Number(h?.no_match ?? 0), unavailable: Number(h?.unavailable ?? 0) };
}

// The current UTC hour plus the 23 before it, read in one pipeline.
async function last24h(db: Redis): Promise<{ ok: number; failed: FailureCounts }> {
  const p = db.pipeline();
  const now = Date.now();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now - i * 3600_000);
    p.get(hourKey(PREFIX_OK_HOUR, d));
    p.hgetall(hourKey(PREFIX_FAILED_HOUR, d));
  }
  const rows = await p.exec();
  let ok = 0;
  const failed = { noMatch: 0, unavailable: 0 };
  for (let i = 0; i < rows.length; i += 2) {
    ok += Number(rows[i] ?? 0);
    const f = failureCounts(rows[i + 1] as Record<string, unknown> | null);
    failed.noMatch += f.noMatch;
    failed.unavailable += f.unavailable;
  }
  return { ok, failed };
}

export async function getStats(): Promise<Stats> {
  const db = redis();
  if (!db) return { available: false };
  const [states, cds, counties, total, updatedAt, failed, recent] = await Promise.all([
    db.hgetall<Record<string, number>>(KEY_STATE),
    db.hgetall<Record<string, number>>(KEY_CD),
    db.hgetall<Record<string, number>>(KEY_COUNTY),
    db.get<number>(KEY_TOTAL),
    db.get<string>(KEY_UPDATED),
    db.hgetall<Record<string, number>>(KEY_FAILED),
    last24h(db),
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
    successes: { total: Number(total ?? 0), last24h: recent.ok },
    failures: { total: failureCounts(failed), last24h: recent.failed },
  };
}
