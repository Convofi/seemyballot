"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, Geometry } from "geojson";
import type { CountyCount, DistrictCount, Stats } from "@/lib/stats";
import { Card } from "@/components/ui";

type LiveStats = Extract<Stats, { available: true }>;
type StateShape = { abbr: string; name: string; d: string };

// us-atlas feature ids are state FIPS codes.
const FIPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
  "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA",
  "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
  "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY", "72": "PR",
};

const W = 975;
const H = 610;
const STEPS = [0.2, 0.4, 0.6, 0.8, 1];

const fmt = (n: number) => n.toLocaleString("en-US");
const searches = (n: number) => `${fmt(n)} ${n === 1 ? "search" : "searches"}`;
const districtLabel = (d: DistrictCount) =>
  d.district === "AL" ? `${d.state} at-large` : `${d.state}-${Number(d.district)}`;
const countyLabel = (c: CountyCount) => `${c.county}, ${c.state}`;

/** 5-step log scale so one busy state doesn't wash out the rest. */
function step(count: number, max: number): number {
  if (max <= 1) return STEPS.length - 1;
  return Math.min(STEPS.length - 1, Math.floor((STEPS.length * Math.log(count)) / Math.log(max + 1)));
}

let shapesPromise: Promise<StateShape[]> | null = null;
function loadShapes(): Promise<StateShape[]> {
  shapesPromise ??= fetch("/data/states-10m.json")
    .then((r) => r.json() as Promise<Topology<{ states: GeometryCollection<{ name: string }> }>>)
    .then((topo) => {
      const fc = feature(topo, topo.objects.states);
      const path = geoPath(geoAlbersUsa().fitExtent([[4, 4], [W - 4, H - 4]], fc));
      return fc.features.flatMap((f: Feature<Geometry, { name: string }>) => {
        const abbr = FIPS[String(f.id)];
        const d = path(f);
        return abbr && d ? [{ abbr, name: f.properties.name, d }] : [];
      });
    })
    .catch((err) => {
      shapesPromise = null;
      throw err;
    });
  return shapesPromise;
}

function RankList({ title, rows }: { title: string; rows: { id: string; label: string; count: number }[] }) {
  return (
    <div className="min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">None yet.</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">{r.label}</span>
              <span className="shrink-0 tabular-nums text-ink-2">{fmt(r.count)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function SearchMap({ data }: { data: Stats }) {
  return data.available ? <StatsMap data={data} /> : null;
}

function StatsMap({ data }: { data: LiveStats }) {
  const [shapes, setShapes] = useState<StateShape[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ abbr: string; x: number; y: number; w: number } | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadShapes().then(
      (s) => live && setShapes(s),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const max = useMemo(() => Math.max(0, ...Object.values(data.states)), [data.states]);
  const names = useMemo(() => new Map(shapes?.map((s) => [s.abbr, s.name])), [shapes]);

  function pointAt(e: React.PointerEvent | React.MouseEvent, abbr: string) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ abbr, x: e.clientX - box.left, y: e.clientY - box.top, w: box.width });
  }

  function toggle(abbr: string) {
    setPinned((p) => (p === abbr ? null : abbr));
  }

  const pinnedName = pinned ? (names.get(pinned) ?? pinned) : null;
  const tipCount = hover ? (data.states[hover.abbr] ?? 0) : 0;

  return (
    <>
      <Card>
        <div ref={boxRef} className="relative" onPointerLeave={() => setHover(null)}>
          {shapes ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-labelledby="search-map-title">
              <title id="search-map-title">Map of searches by state</title>
              {shapes.map((s) => {
                const n = data.states[s.abbr] ?? 0;
                const label = `${s.name}, ${searches(n)}`;
                const isPinned = pinned === s.abbr;
                return (
                  <path
                    key={s.abbr}
                    d={s.d}
                    fill={n > 0 ? "var(--accent)" : "var(--surface-2)"}
                    fillOpacity={n > 0 ? STEPS[step(n, max)] : 1}
                    stroke={isPinned ? "var(--ink)" : "var(--surface)"}
                    strokeWidth={isPinned ? 2.5 : 1}
                    strokeLinejoin="round"
                    className="cursor-pointer outline-none focus-visible:stroke-[var(--ink)] focus-visible:[stroke-width:2.5]"
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-pressed={isPinned}
                    onPointerMove={(e) => e.pointerType === "mouse" && pointAt(e, s.abbr)}
                    onClick={(e) => {
                      pointAt(e, s.abbr);
                      toggle(s.abbr);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle(s.abbr);
                      }
                    }}
                  />
                );
              })}
              {/* Redraw the pinned outline on top so neighbors don't cover it. */}
              {pinned && (
                <path
                  d={shapes.find((s) => s.abbr === pinned)?.d}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              )}
            </svg>
          ) : (
            <div className="aspect-[975/610] w-full rounded-lg bg-surface-2 motion-safe:animate-pulse">
              <span className="sr-only">{failed ? "Map unavailable." : "Loading map…"}</span>
            </div>
          )}

          {hover && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-ink shadow-sm"
              style={{
                left: hover.x,
                top: hover.y,
                transform: `translate(${(-100 * hover.x) / hover.w}%, calc(-100% - 10px))`,
              }}
            >
              {names.get(hover.abbr) ?? hover.abbr} · {searches(tipCount)}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-3">
          <span>Tap a state for details.</span>
          <span className="flex items-center gap-1.5" aria-hidden="true">
            Fewer
            {STEPS.map((o) => (
              <span key={o} className="size-3 rounded-sm bg-accent" style={{ opacity: o }} />
            ))}
            More
          </span>
        </div>

        {pinned && (
          <div className="mt-4 border-t border-line pt-4" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-ink">
                {pinnedName} · <span className="font-normal text-ink-2">{searches(data.states[pinned] ?? 0)}</span>
              </p>
              <button
                type="button"
                onClick={() => setPinned(null)}
                className="-mr-2 min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-accent hover:text-accent-hover"
              >
                Clear
              </button>
            </div>
            <div className="mt-1 grid gap-5 sm:grid-cols-2">
              <RankList
                title="Top districts"
                rows={data.districts
                  .filter((d) => d.state === pinned)
                  .slice(0, 5)
                  .map((d) => ({ id: d.id, label: districtLabel(d), count: d.count }))}
              />
              <RankList
                title="Top counties"
                rows={data.counties
                  .filter((c) => c.state === pinned)
                  .slice(0, 5)
                  .map((c) => ({ id: c.id, label: c.county, count: c.count }))}
              />
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="grid gap-5 sm:grid-cols-2">
          <RankList
            title="Most searched districts"
            rows={data.districts.slice(0, 5).map((d) => ({ id: d.id, label: districtLabel(d), count: d.count }))}
          />
          <RankList
            title="Most searched counties"
            rows={data.counties.slice(0, 5).map((c) => ({ id: c.id, label: countyLabel(c), count: c.count }))}
          />
        </div>
      </Card>
    </>
  );
}
