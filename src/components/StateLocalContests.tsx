"use client";

import { useEffect, useState, type ReactNode } from "react";
import type {
  BallotMeasure,
  StateBallotCandidate as BallotCandidate,
  StateBallotContest as BallotContest,
  StateBallotResponse as Data,
} from "@/lib/stateBallot";
import { Candidate } from "@/components/Candidate";
import { getStateLinks } from "@/components/HowToVote";
import { useReportSummary, type SummaryPart } from "@/components/summary";
import {
  Card,
  ErrorNote,
  ExtLink,
  Footnote,
  GroupTitle,
  Section,
  SkeletonCard,
  SourceNote,
  Tag,
  hostname,
} from "@/components/ui";

type Props = {
  /** Two-letter state code, e.g. "OH". */
  state: string;
  /** e.g. "Ohio". */
  stateName: string;
  /** Census county name, e.g. "Franklin County". */
  county: string | null;
  /** Census place name, e.g. "Columbus"; null when unincorporated. */
  place: string | null;
  /** District numbers, e.g. "15" / "1". */
  stateSenateDistrict: string | null;
  stateHouseDistrict: string | null;
  /** Shown instead when we have no data for this state (or it fails to load). */
  fallback: ReactNode;
  /** Shown after the state contests when we have no data for this county. */
  localFallback: ReactNode;
};

type Result = { url: string } & ({ data: Data } | { missing: true } | { error: string });

/**
 * State, legislative, county and municipal contests plus ballot measures, in
 * ballot order, fetched from /api/state-ballot. Sections with no data for
 * this voter are omitted.
 */
export default function StateLocalContests({
  state,
  stateName,
  county,
  place,
  stateSenateDistrict,
  stateHouseDistrict,
  fallback,
  localFallback,
}: Props) {
  const qs = new URLSearchParams({ state });
  if (county) qs.set("county", county);
  if (place) qs.set("place", place);
  if (stateSenateDistrict) qs.set("sd", stateSenateDistrict);
  if (stateHouseDistrict) qs.set("hd", stateHouseDistrict);
  const url = `/api/state-ballot?${qs}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setResult({ url, missing: true });
          return;
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as Data;
        if (!cancelled) setResult({ url, data });
      })
      .catch(() => {
        if (!cancelled) setResult({ url, error: "State and local ballot data is unavailable right now. Please try again." });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const current = result?.url === url ? result : null;
  const links = getStateLinks(state);

  const ballot = current && "data" in current ? current.data : null;
  const countyBallot = ballot?.county ?? null;
  const municipal = ballot?.municipal ?? null;
  const legislativeContests = ballot
    ? [ballot.legislative.senate, ballot.legislative.house].filter((c): c is BallotContest => c !== null)
    : [];
  const measures = ballot
    ? [...ballot.statewide.measures, ...(countyBallot?.measures ?? []), ...(municipal?.measures ?? [])]
    : [];
  const countyContests = countyBallot?.contests ?? [];
  const cityContests = municipal?.contests ?? [];

  let summary: SummaryPart | null = null;
  if (current) {
    summary = {
      kind: "state",
      status: ballot ? "ok" : "missing" in current ? "missing" : "error",
      statewide: ballot?.statewide.contests.length ?? 0,
      legislative: legislativeContests.length,
      county: countyContests.length,
      city: cityContests.length,
      measures: measures.length,
      hasLocal: !!ballot && (countyContests.length + cityContests.length > 0 || !ballot.hasCounty),
    };
  }
  useReportSummary(summary);

  if (!current) {
    return (
      <Section id="state" title={`${stateName} and local contests`} busy>
        <SkeletonCard label="Loading state and local contests…" rows={3} />
        <SkeletonCard label="" rows={2} />
      </Section>
    );
  }
  if ("missing" in current) return fallback;
  if (!ballot) {
    return (
      <>
        <ErrorNote className="mt-12">{"error" in current ? current.error : null}</ErrorNote>
        {fallback}
      </>
    );
  }

  return (
    <>
      <Section id="state" title={`${stateName} and local contests`} intro={ballot.notice}>
        {links && (
          <p className="mt-1.5 text-xs text-ink-3">
            Campaign finance filings for {stateName} candidates:{" "}
            <ExtLink href={links.campaignFinanceUrl}>{links.campaignFinanceName}</ExtLink>
          </p>
        )}
        <ContestGroup title="Statewide" contests={ballot.statewide.contests} />
        <ContestGroup title="State legislature" contests={legislativeContests} />
        <ContestGroup title={county ?? "County"} contests={countyContests} id="local" />
        <ContestGroup
          title={place ?? "City"}
          contests={cityContests}
          id={countyContests.length === 0 ? "local" : undefined}
        />

        {measures.length > 0 && (
          <>
            <GroupTitle>Issues and measures</GroupTitle>
            {measures.map((m) => (
              <MeasureCard key={m.id + m.title} measure={m} />
            ))}
          </>
        )}

        {countyBallot?.note && <Footnote>{countyBallot.note}</Footnote>}
      </Section>
      {!ballot.hasCounty && localFallback}
    </>
  );
}

function ContestGroup({ title, contests, id }: { title: string; contests: BallotContest[]; id?: string }) {
  if (contests.length === 0) return null;
  return (
    <>
      <GroupTitle id={id}>{title}</GroupTitle>
      {contests.map((c) => (
        <ContestCard key={c.office} contest={c} />
      ))}
    </>
  );
}

function ContestCard({ contest }: { contest: BallotContest }) {
  // Write-ins aren't printed on the ballot, so list them last.
  const candidates = [...contest.candidates].sort((a, b) => Number(!!a.writeIn) - Number(!!b.writeIn));
  const meta = [
    contest.seats && contest.seats > 1 ? `Vote for up to ${contest.seats}` : null,
    candidates.length === 1 ? "Unopposed" : null,
  ].filter(Boolean);
  return (
    <Card>
      <h4 className="text-lg font-semibold leading-snug tracking-tight text-ink">{contest.office}</h4>
      {meta.length > 0 && <p className="mt-1 text-sm text-ink-3">{meta.join(" · ")}</p>}
      <ul className="divide-y divide-line">
        {candidates.map((c) => (
          <CandidateRow key={c.key} candidate={c} />
        ))}
      </ul>
      <Footnote className="border-t border-line pt-3">
        <SourceNote href={contest.source} />
      </Footnote>
    </Card>
  );
}

function CandidateRow({ candidate: c }: { candidate: BallotCandidate }) {
  return (
    <Candidate
      name={c.name}
      runningMate={c.runningMate}
      party={c.writeIn ? undefined : c.party}
      tags={[
        c.writeIn && <Tag key="wi">Write-in (not printed on ballot)</Tag>,
        c.incumbent && <Tag key="inc">Incumbent</Tag>,
      ]}
      website={c.website}
      positions={c.positions}
    />
  );
}

function MeasureCard({ measure: m }: { measure: BallotMeasure }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{m.id}</p>
      <h4 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-ink">{m.title}</h4>
      <p className="mt-2 text-md text-ink-2">{m.summary}</p>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-yes-soft p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-yes">Yes means</dt>
          <dd className="mt-1 text-md text-ink">{m.yesMeans}</dd>
        </div>
        <div className="rounded-lg bg-no-soft p-3">
          <dt className="text-xs font-bold uppercase tracking-[0.08em] text-no">No means</dt>
          <dd className="mt-1 text-md text-ink">{m.noMeans}</dd>
        </div>
      </dl>
      <Footnote className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          Official ballot language: <ExtLink href={m.source}>{hostname(m.source)}</ExtLink>
        </span>
        {m.moreInfo && (
          <span>
            More info: <ExtLink href={m.moreInfo}>{hostname(m.moreInfo)}</ExtLink>
          </span>
        )}
      </Footnote>
    </Card>
  );
}
