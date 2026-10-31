"use client";

import { useEffect, useState } from "react";
import type { Candidate, Contest, FederalContests as Data } from "@/lib/fec";

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
  const houseTitle =
    state === "DC"
      ? "Delegate to the U.S. House — District of Columbia"
      : `U.S. House — ${stateName} ${districtLabel}`;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">Federal contests</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Source: FEC filings. Candidates who filed for this seat; some may have withdrawn or
        lost a primary. Confirm on your official sample ballot below.
      </p>

      <div aria-live="polite" aria-busy={!current}>
        {!current && (
          <p className="mt-4 rounded-lg border border-neutral-200 p-5 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
            Loading federal candidates…
          </p>
        )}
        {current && "error" in current && (
          <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
            {current.error}
          </p>
        )}
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
    </section>
  );
}

function ContestCard({ title, contest }: { title: string; contest: Contest }) {
  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h3 className="font-semibold">{title}</h3>
      {contest.likely.length === 0 && contest.other.length === 0 ? (
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          No FEC filings found for this seat.
        </p>
      ) : (
        <CandidateList candidates={contest.likely} />
      )}
      {contest.other.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer py-2 text-sm text-neutral-600 dark:text-neutral-400">
            Show {contest.other.length} other FEC {contest.other.length === 1 ? "filer" : "filers"} (may
            have withdrawn or lost a primary)
          </summary>
          <CandidateList candidates={contest.other} />
        </details>
      )}
    </div>
  );
}

function CandidateList({ candidates }: { candidates: Candidate[] }) {
  return (
    <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
      {candidates.map((c) => (
        <li key={c.candidateId} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
          <span className="font-medium">{c.name}</span>
          <span
            className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            title={`FEC party code: ${c.partyCode || "none"}`}
          >
            {c.party}
          </span>
          {c.incumbent && (
            <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium dark:border-neutral-700">
              Incumbent
            </span>
          )}
          <a
            href={c.fecUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-blue-700 underline hover:text-blue-800 dark:text-blue-400"
          >
            FEC filing
          </a>
        </li>
      ))}
    </ul>
  );
}
