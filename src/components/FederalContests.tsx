"use client";

import { useEffect, useState } from "react";
import type { Candidate as CandidateData, Contest, FederalContests as Data } from "@/lib/fec";
import { Candidate } from "@/components/Candidate";
import { useReportSummary } from "@/components/summary";
import { Card, ErrorNote, Section, SkeletonCard, Tag } from "@/components/ui";

type Props = {
  /** Two-letter state code, e.g. "OH". */
  state: string;
  /** e.g. "Ohio". */
  stateName: string;
  /** Congressional district number ("3"); null for at-large seats and DC. */
  district: string | null;
  /** Shown after the state name, e.g. "District 3" or "At-Large". */
  districtLabel: string;
};

type Result = { url: string } & ({ data: Data } | { error: string });

export default function FederalContests({ state, stateName, district, districtLabel }: Props) {
  const url = `/api/contests?state=${encodeURIComponent(state)}&district=${encodeURIComponent(district ?? "0")}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error);
        }
        const data = (await res.json()) as Data;
        if (!cancelled) setResult({ url, data });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const message = e instanceof Error && e.message ? e.message : null;
          setResult({ url, error: message ?? "Federal candidate data is unavailable right now. Please try again." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const current = result?.url === url ? result : null;
  const shown = current && "data" in current ? [current.data.senate, current.data.house].filter((c) => c !== null) : [];
  // Only claim "on the general-election ballot" when every contest shown has nominee data.
  const fromNominees = shown.length > 0 && shown.every((c) => c.ballotSource === "nominees");
  const houseTitle =
    state === "DC"
      ? "Delegate to the U.S. House — District of Columbia"
      : `U.S. House — ${stateName} ${districtLabel}`;

  useReportSummary(current ? { kind: "federal", races: shown.length } : null);

  return (
    <Section
      id="federal"
      title="Federal contests"
      busy={!current}
      intro={
        fromNominees ? (
          <>
            Sources: FEC filings and Wikipedia&apos;s 2026 election pages. Confirm on your official
            sample ballot below.
          </>
        ) : (
          <>
            Source: FEC filings. Candidates who filed for this seat; some may have withdrawn or
            lost a primary. Confirm on your official sample ballot below.
          </>
        )
      }
    >
      <div aria-live="polite">
        {!current && (
          <>
            <SkeletonCard label="Loading federal candidates…" />
            <SkeletonCard label="" />
          </>
        )}
        {current && "error" in current && <ErrorNote>{current.error}</ErrorNote>}
        {current && "data" in current && (
          <>
            {current.data.senate && (
              <ContestCard
                title={`U.S. Senate${current.data.senate.special ? " (special election)" : ""} — ${stateName}`}
                contest={current.data.senate}
              />
            )}
            {current.data.house && <ContestCard title={houseTitle} contest={current.data.house} />}
          </>
        )}
      </div>
    </Section>
  );
}

function ContestCard({ title, contest }: { title: string; contest: Contest }) {
  const nominees = contest.ballotSource === "nominees";
  const filers = `${contest.other.length} other FEC ${contest.other.length === 1 ? "filer" : "filers"}`;
  return (
    <Card>
      <h3 className="text-lg font-semibold leading-snug tracking-tight text-ink">{title}</h3>
      {contest.likely.length === 0 && contest.other.length === 0 ? (
        <p className="mt-2 text-md text-ink-2">No FEC filings found for this seat.</p>
      ) : (
        <>
          {nominees && <p className="mt-1 text-sm text-ink-3">On the general-election ballot</p>}
          <CandidateList candidates={contest.likely} />
        </>
      )}
      {contest.other.length > 0 && (
        <details className="group mt-3 border-t border-line">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 pt-2 text-xs leading-5 text-ink-3 hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
              ›
            </span>
            <span>
              {nominees
                ? `Show ${filers} (not on the general ballot: lost a primary, withdrew, or write-in)`
                : `Show ${filers} (may have withdrawn or lost a primary)`}
            </span>
          </summary>
          <CandidateList candidates={contest.other} />
        </details>
      )}
    </Card>
  );
}

function CandidateList({ candidates }: { candidates: CandidateData[] }) {
  return (
    <ul className="divide-y divide-line">
      {candidates.map((c) => (
        <Candidate
          key={c.candidateId}
          name={c.name}
          party={c.party}
          partyTitle={c.fecUrl ? `FEC party code: ${c.partyCode || "none"}` : "Party per Wikipedia"}
          tags={[
            c.incumbent && <Tag key="inc">Incumbent</Tag>,
            c.writeIn && <Tag key="wi">Write-in</Tag>,
          ]}
          fecUrl={c.fecUrl}
          positions={c.positions}
          finance={c.finance}
        />
      ))}
    </ul>
  );
}
