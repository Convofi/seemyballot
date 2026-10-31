"use client";

import { useEffect, useState } from "react";
import type { District, LookupResult } from "@/lib/census";
import FederalContests from "@/components/FederalContests";
import { HowToVote, OfficialFallback } from "@/components/HowToVote";
import { PollingPlace } from "@/components/PollingPlace";
import StateLocalContests from "@/components/StateLocalContests";
import { VotingLogistics } from "@/components/VotingLogistics";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: LookupResult };

const NOT_FOUND = "We couldn't find that address — try adding your city and ZIP.";

async function fetchLookup(q: string): Promise<Status> {
  try {
    const res = await fetch(`/api/lookup?address=${encodeURIComponent(q)}`);
    if (res.status === 404) return { kind: "error", message: NOT_FOUND };
    if (!res.ok) {
      return { kind: "error", message: "Address lookup is unavailable right now. Please try again." };
    }
    return { kind: "done", result: await res.json() };
  } catch {
    return { kind: "error", message: "Network error. Please try again." };
  }
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Shareable links: /?address=... runs the lookup on load.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("address")?.trim();
    if (!q) return;
    let cancelled = false;
    fetchLookup(q).then((s) => {
      if (cancelled) return;
      setAddress(q);
      setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = address.trim();
    if (!q) return;
    window.history.replaceState(null, "", `?address=${encodeURIComponent(q)}`);
    setStatus({ kind: "loading" });
    setStatus(await fetchLookup(q));
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
      <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
        Type your address. See exactly what&apos;s on your ballot. Understand
        every choice in under 60 seconds.
      </h1>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <label htmlFor="address" className="sr-only">
          Your home address
        </label>
        <input
          id="address"
          name="address"
          type="text"
          autoComplete="street-address"
          placeholder="123 Main St, City, ST 12345"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="h-14 w-full rounded-lg border border-neutral-300 bg-transparent px-4 text-lg outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/30 dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={status.kind === "loading" || !address.trim()}
          className="h-14 w-full rounded-lg bg-blue-700 text-lg font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {status.kind === "loading" ? "Looking up…" : "See my ballot"}
        </button>
      </form>

      <div aria-live="polite">
        {status.kind === "error" && (
          <p className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
            {status.message}
          </p>
        )}
        {status.kind === "done" && <Results result={status.result} />}
      </div>
    </main>
  );
}

function districtText(d: District | null, abbr: string): string {
  if (!d) return "None for this address";
  return d.number ? `${abbr}-${d.number}` : d.name;
}

function Results({ result: r }: { result: LookupResult }) {
  const isDC = r.state.abbr === "DC";
  const rows: [string, string][] = [
    ["State", r.state.name],
    ["County", r.county ?? "—"],
    ["City", r.place ?? "Unincorporated area"],
    ["US House", districtText(r.congressionalDistrict, r.state.abbr)],
    [isDC ? "Council ward" : "State senate", r.stateSenateDistrict?.name ?? "None for this address"],
    ["State house", r.stateHouseDistrict?.name ?? "None for this address"],
  ];

  return (
    <>
      <section className="mt-8 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">Your ballot area</h2>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">{r.matchedAddress}</p>
        <dl className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-3">
              <dt className="text-neutral-600 dark:text-neutral-400">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <FederalContests
        state={r.state.abbr}
        stateName={r.state.name}
        district={r.congressionalDistrict?.number ?? null}
        districtLabel={
          r.congressionalDistrict?.number ? `District ${r.congressionalDistrict.number}` : "At-Large"
        }
      />

      <StateLocalContests
        state={r.state.abbr}
        stateName={r.state.name}
        county={r.county}
        place={r.place}
        stateSenateDistrict={r.stateSenateDistrict?.number ?? null}
        stateHouseDistrict={r.stateHouseDistrict?.number ?? null}
        fallback={
          <LocalFallback
            state={r.state.abbr}
            title="State and local contests"
            what="state legislature, local race, or ballot measure details"
          />
        }
        localFallback={
          <LocalFallback
            state={r.state.abbr}
            title="Local contests"
            what="county and city race or local issue details"
          />
        }
      />

      <PollingPlace address={r.matchedAddress} />
      <VotingLogistics state={r.state.abbr} />
      <HowToVote state={r.state.abbr} />
    </>
  );
}

function LocalFallback({ state, title, what }: { state: string; title: string; what: string }) {
  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-lg font-semibold">{title}</h2>
      <OfficialFallback state={state} what={what} />
    </section>
  );
}
