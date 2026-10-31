"use client";

import { useEffect, useState } from "react";
import type { PollingResponse } from "@/app/api/polling/route";
import type { Place } from "@/lib/civic";

import { useReportSummary } from "@/components/summary";
import { Card, ExtLink, Footnote, Section, SkeletonCard } from "@/components/ui";

type Result = { url: string } & ({ data: PollingResponse } | { none: true } | { error: string });

const SHOWN = 3;

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
    return <p className="mt-1 whitespace-pre-line text-md text-ink-2">{lines.join("\n")}</p>;
  }
  return (
    <details className="group mt-1 text-ink-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
        Hours ({lines.length} days)
      </summary>
      <p className="whitespace-pre-line text-sm leading-6">{lines.join("\n")}</p>
    </details>
  );
}

function SiteItem({ p }: { p: Place }) {
  return (
    <li className="py-3">
      <ExtLink href={p.mapsUrl} className="font-medium">
        {p.name}
      </ExtLink>
      {p.name !== p.address && <p className="text-md text-ink-2">{p.address}</p>}
      {p.startDate && p.endDate && (
        <p className="mt-1 text-sm text-ink">
          {shortDate(p.startDate)} – {shortDate(p.endDate)}
        </p>
      )}
      <Hours hours={p.hours} />
      {p.notes && <p className="mt-1 text-sm text-ink-3">{p.notes}</p>}
    </li>
  );
}

function SiteList({ title, places, total }: { title: string; places: Place[]; total: number }) {
  if (!places.length) return null;
  const more = total - Math.min(places.length, SHOWN);
  return (
    <div className="mt-6 first:mt-0">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <ul className="mt-1 divide-y divide-line">
        {places.slice(0, SHOWN).map((p, i) => (
          <SiteItem key={`${p.address}-${i}`} p={p} />
        ))}
      </ul>
      {more > 0 && <p className="text-sm text-ink-3">and {more} more</p>}
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
  useReportSummary(
    current
      ? "none" in current
        ? { kind: "polling", status: "none", count: 0 }
        : "error" in current
          ? { kind: "polling", status: "error", count: 0 }
          : {
              kind: "polling",
              status: current.data.counts.pollingLocations === 1 ? "one" : "many",
              count: current.data.counts.pollingLocations,
            }
      : null,
  );
  // No data: VotingLogistics and HowToVote below already link to the official lookup.
  if (current && "none" in current) return null;

  return (
    <Section id="where-to-vote" title="Where to vote" busy={!current}>
      {!current && <SkeletonCard label="Finding your polling place…" rows={2} />}
      {current && "error" in current && (
        <Card>
          <p className="text-md text-ink-2">{current.error}</p>
        </Card>
      )}
      {current && "data" in current && <Body data={current.data} />}
    </Section>
  );
}

function Body({ data: d }: { data: PollingResponse }) {
  const polls = d.pollingLocations;
  const hero = d.counts.pollingLocations === 1 ? polls[0] : null;

  return (
    <Card>
      {hero && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Election day polling place</p>
          <p className="mt-1.5 text-xl font-semibold leading-snug tracking-tight text-ink">{hero.name}</p>
          {hero.name !== hero.address && <p className="mt-0.5 text-md text-ink-2">{hero.address}</p>}
          <Hours hours={hero.hours} />
          {hero.notes && <p className="mt-1 text-sm text-ink-3">{hero.notes}</p>}
          <a
            href={hero.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-accent hover:border-accent hover:text-accent-hover"
          >
            Open in Maps <span aria-hidden="true">→</span>
          </a>
        </div>
      )}
      {hero && (d.earlyVoteSites.length > 0 || d.dropOffLocations.length > 0) && (
        <hr className="my-5 border-line" />
      )}
      {d.counts.pollingLocations > 1 && (
        <SiteList title="Vote centers near you — any of these works" places={polls} total={d.counts.pollingLocations} />
      )}

      <SiteList title="Early voting" places={d.earlyVoteSites} total={d.counts.earlyVoteSites} />
      <SiteList title="Ballot drop boxes" places={d.dropOffLocations} total={d.counts.dropOffLocations} />

      <Footnote className="border-t border-line pt-3">
        Source: your state&apos;s election office via the Voting Information Project (Google Civic
        Information API). Confirm hours before you go.
        {d.electionOffice?.locationFinderUrl && (
          <>
            {" "}
            <ExtLink href={d.electionOffice.locationFinderUrl}>Official lookup</ExtLink>
          </>
        )}
      </Footnote>
    </Card>
  );
}
