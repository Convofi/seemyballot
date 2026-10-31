"use client";

import { useEffect, useState } from "react";
import type { PollingResponse } from "@/app/api/polling/route";
import type { Place } from "@/lib/civic";

type Result = { url: string } & ({ data: PollingResponse } | { none: true } | { error: string });

const SHOWN = 3;

const mapsButton =
  "mt-3 inline-flex min-h-12 items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 font-semibold text-blue-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-blue-300 dark:hover:bg-neutral-900";

/** "2026-10-07" → "Oct 7" (calendar dates, so format in UTC). */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Hours({ hours }: { hours: string }) {
  if (!hours) return null;
  const lines = hours.split("\n").filter(Boolean);
  if (lines.length <= 2) {
    return <p className="mt-1 whitespace-pre-line text-neutral-800 dark:text-neutral-200">{lines.join("\n")}</p>;
  }
  return (
    <details className="mt-1 text-neutral-800 dark:text-neutral-200">
      <summary className="cursor-pointer text-sm text-blue-800 underline underline-offset-2 dark:text-blue-300">
        Hours ({lines.length} days)
      </summary>
      <p className="mt-1 whitespace-pre-line text-sm">{lines.join("\n")}</p>
    </details>
  );
}

function SiteItem({ p }: { p: Place }) {
  return (
    <li className="py-3">
      <a
        href={p.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-blue-800 underline underline-offset-2 dark:text-blue-300"
      >
        {p.name}
      </a>
      {p.name !== p.address && <p className="text-neutral-600 dark:text-neutral-400">{p.address}</p>}
      {p.startDate && p.endDate && (
        <p className="mt-1 text-sm">
          {shortDate(p.startDate)} – {shortDate(p.endDate)}
        </p>
      )}
      <Hours hours={p.hours} />
      {p.notes && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{p.notes}</p>}
    </li>
  );
}

function SiteList({ title, places, total }: { title: string; places: Place[]; total: number }) {
  if (!places.length) return null;
  const more = total - Math.min(places.length, SHOWN);
  return (
    <div className="mt-5">
      <h3 className="font-semibold">{title}</h3>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {places.slice(0, SHOWN).map((p, i) => (
          <SiteItem key={`${p.address}-${i}`} p={p} />
        ))}
      </ul>
      {more > 0 && <p className="text-sm text-neutral-600 dark:text-neutral-400">and {more} more</p>}
    </div>
  );
}

export function PollingPlace({ address }: { address: string }) {
  const url = `/api/polling?address=${encodeURIComponent(address)}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (res.status === 404) return { url, none: true as const };
        if (!res.ok) throw new Error();
        return { url, data: (await res.json()) as PollingResponse };
      })
      .catch(() => ({ url, error: "Polling place lookup is unavailable right now." }))
      .then((r) => {
        if (!cancelled) setResult(r);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const current = result?.url === url ? result : null;
  // No data: VotingLogistics and HowToVote below already link to the official lookup.
  if (current && "none" in current) return null;

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800" aria-busy={!current}>
      <h2 className="text-lg font-semibold">Where to vote</h2>

      {!current && <p className="mt-2 text-neutral-600 dark:text-neutral-400">Finding your polling place…</p>}
      {current && "error" in current && (
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">{current.error}</p>
      )}
      {current && "data" in current && <Body data={current.data} />}
    </section>
  );
}

function Body({ data: d }: { data: PollingResponse }) {
  const polls = d.pollingLocations;
  const hero = d.counts.pollingLocations === 1 ? polls[0] : null;

  return (
    <>
      {hero && (
        <div className="mt-3">
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Election day polling place</p>
          <p className="mt-1 text-xl font-bold">{hero.name}</p>
          {hero.name !== hero.address && <p className="text-neutral-800 dark:text-neutral-200">{hero.address}</p>}
          <Hours hours={hero.hours} />
          {hero.notes && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{hero.notes}</p>}
          <a href={hero.mapsUrl} target="_blank" rel="noopener noreferrer" className={mapsButton}>
            Open in Maps <span aria-hidden="true">→</span>
          </a>
        </div>
      )}
      {d.counts.pollingLocations > 1 && (
        <SiteList title="Vote centers near you — any of these works" places={polls} total={d.counts.pollingLocations} />
      )}

      <SiteList title="Early voting" places={d.earlyVoteSites} total={d.counts.earlyVoteSites} />
      <SiteList title="Ballot drop boxes" places={d.dropOffLocations} total={d.counts.dropOffLocations} />

      <p className="mt-5 text-xs text-neutral-600 dark:text-neutral-400">
        Source: your state&apos;s election office via the Voting Information Project (Google Civic
        Information API). Confirm hours before you go.
        {d.electionOffice?.locationFinderUrl && (
          <>
            {" "}
            <a
              href={d.electionOffice.locationFinderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Official lookup
            </a>
          </>
        )}
      </p>
    </>
  );
}
