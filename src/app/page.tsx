"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import type { District, LookupResult } from "@/lib/census";
import FederalContests from "@/components/FederalContests";
import { HowToVote, OfficialFallback } from "@/components/HowToVote";
import { PollingPlace } from "@/components/PollingPlace";
import SearchMapSection from "@/components/SearchMapSection";
import StateLocalContests from "@/components/StateLocalContests";
import { VotingLogistics } from "@/components/VotingLogistics";
import { SummaryContext, type Summary, type SummaryPart } from "@/components/summary";
import { Card, ErrorNote, Section, SkeletonCard, SkeletonLine } from "@/components/ui";

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

const noSubscribe = () => () => {};
const readAddressParam = () => new URLSearchParams(window.location.search).get("address")?.trim() || null;

export default function Home() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  // A shared link's lookup is in flight before the effect below resolves; show it as loading.
  const linkedAddress = useSyncExternalStore(noSubscribe, readAddressParam, () => null);
  const loading = status.kind === "loading" || (status.kind === "idle" && !!linkedAddress);

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

  function onChangeAddress() {
    window.history.replaceState(null, "", window.location.pathname);
    setStatus({ kind: "idle" });
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => inputRef.current?.select());
  }

  const done = status.kind === "done";

  return (
    <>
      <main className="mx-auto w-full max-w-[40rem] flex-1 px-4 pb-16">
        {!done && (
          <div className="pt-14 sm:pt-24">
            <p className="text-sm font-semibold tracking-tight text-ink-2">BallotHelper</p>
            <h1 className="mt-10 text-[2rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[2.5rem]">
              See exactly what&apos;s on your ballot.
            </h1>
            <p className="mt-3 text-lg text-ink-2">
              Type your address. Understand every choice in under 60 seconds.
            </p>

            <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <label htmlFor="address" className="sr-only">
                Your home address
              </label>
              <input
                ref={inputRef}
                id="address"
                name="address"
                type="text"
                autoComplete="street-address"
                enterKeyHint="search"
                placeholder="123 Main St, City, ST 12345"
                value={status.kind === "idle" && linkedAddress ? linkedAddress : address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-14 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-4 text-lg text-ink placeholder:text-ink-3 focus:border-accent focus-visible:outline-offset-0 sm:flex-1"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-14 shrink-0 rounded-xl bg-accent-solid px-6 text-lg font-semibold text-on-accent transition-colors hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? "Looking up…" : "See my ballot"}
              </button>
            </form>
            <p className="mt-4 text-sm text-ink-3">We don&apos;t store your address.</p>
            {status.kind === "idle" && !loading && <SearchMapSection />}
          </div>
        )}

        <div aria-live="polite">
          {status.kind === "error" && <ErrorNote className="mt-6">{status.message}</ErrorNote>}
          {loading && (
            <div className="mt-10">
              <SkeletonCard rows={2} label="Looking up your address…" />
              <SkeletonCard rows={3} label="" />
            </div>
          )}
          {done && (
            <Results key={status.result.matchedAddress} result={status.result} onChange={onChangeAddress} />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

const NAV: { id: string; label: string }[] = [
  { id: "where-to-vote", label: "Where to vote" },
  { id: "federal", label: "Federal" },
  { id: "state", label: "State" },
  { id: "local", label: "Local" },
  { id: "how-to-vote", label: "How to vote" },
];

function ResultsHeader({
  address,
  onChange,
  hide,
}: {
  address: string;
  onChange: () => void;
  hide: Set<string>;
}) {
  return (
    <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-paper px-4">
      <div className="flex items-center gap-3 pt-1">
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="text-ink-3">Ballot for </span>
          <span className="font-medium text-ink">{address}</span>
        </p>
        <button
          type="button"
          onClick={onChange}
          className="-mr-2 min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-accent hover:text-accent-hover"
        >
          Change
        </button>
      </div>
      <nav aria-label="Sections">
        <ul className="-mx-2 flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.filter((n) => !hide.has(n.id)).map((n) => (
            <li key={n.id} className="shrink-0">
              <a
                href={`#${n.id}`}
                className="flex min-h-11 items-center rounded-lg px-2 text-sm font-medium whitespace-nowrap text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Your ballot: 2 federal races · 7 statewide races · 1 issue · your polling place" */
function SummaryLine({ summary: s }: { summary: Summary }) {
  const items: string[] = [];
  if (s.federal?.races) items.push(plural(s.federal.races, "federal race"));
  if (s.state?.status === "ok") {
    const st = s.state;
    if (st.statewide) items.push(plural(st.statewide, "statewide race"));
    if (st.legislative) items.push(plural(st.legislative, "legislative race"));
    if (st.county) items.push(plural(st.county, "county race"));
    if (st.city) items.push(plural(st.city, "city race"));
    if (st.measures) items.push(plural(st.measures, "issue"));
  }
  if (s.polling?.status === "one") items.push("your polling place");
  if (s.polling?.status === "many") items.push(plural(s.polling.count, "vote center"));
  const pending = !s.federal || !s.state || !s.polling;

  return (
    <p className="mt-2 text-md text-ink-2">
      {items.length > 0 ? items.join(" · ") : !pending && "See the sections below."}
      {pending && (
        <>
          {items.length > 0 && " · "}
          <SkeletonLine className="w-28" />
          <span className="sr-only">Loading…</span>
        </>
      )}
    </p>
  );
}

function districtText(d: District | null, abbr: string): string {
  if (!d) return "None for this address";
  return d.number ? `${abbr}-${d.number}` : d.name;
}

function Results({ result: r, onChange }: { result: LookupResult; onChange: () => void }) {
  const [summary, setSummary] = useState<Summary>({});
  const report = useCallback(
    (part: SummaryPart) => setSummary((s) => ({ ...s, [part.kind]: part })),
    [],
  );

  const hide = new Set<string>();
  if (summary.polling?.status === "none") hide.add("where-to-vote");
  if (summary.state && !summary.state.hasLocal) hide.add("local");

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
    <SummaryContext.Provider value={report}>
      <ResultsHeader address={r.matchedAddress} onChange={onChange} hide={hide} />

      <h1 className="mt-8 text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">Your ballot</h1>
      <SummaryLine summary={summary} />
      <p className="mt-2 text-sm text-ink-3">
        Candidate and issue summaries were researched with AI and can contain mistakes. Please verify against
        the linked sources and your official sample ballot.
      </p>

      <Card className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">Your ballot area</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-ink-3">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <PollingPlace address={r.matchedAddress} />

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
            id="state"
            state={r.state.abbr}
            title="State and local contests"
            what="state legislature, local race, or ballot measure details"
          />
        }
        localFallback={
          <LocalFallback
            id="local"
            state={r.state.abbr}
            title="Local contests"
            what="county and city race or local issue details"
          />
        }
      />

      <VotingLogistics state={r.state.abbr} />
      <HowToVote state={r.state.abbr} />
    </SummaryContext.Provider>
  );
}

function LocalFallback({ id, state, title, what }: { id: string; state: string; title: string; what: string }) {
  return (
    <Section id={id} title={title}>
      <Card>
        <OfficialFallback state={state} what={what} />
      </Card>
    </Section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-[40rem] px-4 py-6 text-xs leading-5 text-ink-3">
        <p>
          Nonpartisan. Every fact links to its source. Summaries were researched with AI and may contain
          errors, so please verify them yourself. We never store your address; we only count searches by state,
          district, and county.
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4">
          <a
            href="https://convofi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-ink-2 hover:text-ink"
          >
            Built by
            <Image src="/convofi-icon.png" alt="ConvoFi" width={17} height={20} className="h-5 w-auto" />
            <span aria-hidden="true">ConvoFi</span>
          </a>
          <a
            href="https://github.com/Convofi/ballothelper"
            target="_blank"
            rel="noopener noreferrer"
            className="link inline-flex min-h-11 items-center"
          >
            Open source on GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
