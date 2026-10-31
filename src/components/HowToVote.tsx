import statesData from "@/data/states.json";

export type StateLinks = {
  name: string;
  electionOfficeName: string;
  electionOfficeUrl: string;
  pollingPlaceUrl: string;
  sampleBallotUrl: string;
  registrationCheckUrl: string;
  voterIdUrl: string;
  /** null when Ballotpedia has no 2026 statewide measures page for the state. */
  ballotpediaMeasuresUrl: string | null;
  notes: string;
  /** ISO time of the last link check; null if not yet checked. */
  verifiedAt: string | null;
};

const states: Record<string, StateLinks> = statesData;

export function getStateLinks(state: string): StateLinks | null {
  return states[state.toUpperCase()] ?? null;
}

const linkButton =
  "flex min-h-14 items-center justify-between gap-3 rounded-lg border border-neutral-300 px-4 py-3 text-lg font-semibold text-blue-800 hover:bg-neutral-50 dark:border-neutral-700 dark:text-blue-300 dark:hover:bg-neutral-900";

export function HowToVote({ state }: { state: string }) {
  const s = getStateLinks(state);
  if (!s) return null;

  const buttons: [string, string][] = [
    ["See your official sample ballot", s.sampleBallotUrl],
    ["Find your polling place", s.pollingPlaceUrl],
    ["Check your registration", s.registrationCheckUrl],
    ["Voter ID rules", s.voterIdUrl],
  ];

  return (
    <section className="mt-6 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-lg font-semibold">How to vote</h2>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
        Election day: <span className="font-medium text-neutral-900 dark:text-neutral-100">Tuesday, November 3, 2026</span>
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {buttons.map(([label, href]) => (
          <li key={label}>
            <a href={href} target="_blank" rel="noopener noreferrer" className={linkButton}>
              {label}
              <span aria-hidden="true">→</span>
            </a>
          </li>
        ))}
      </ul>

      {s.ballotpediaMeasuresUrl && (
        <p className="mt-4">
          <a
            href={s.ballotpediaMeasuresUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-800 underline underline-offset-2 dark:text-blue-300"
          >
            2026 ballot measures in {s.name} (Ballotpedia)
          </a>
        </p>
      )}

      {s.notes && <p className="mt-4 text-neutral-700 dark:text-neutral-300">{s.notes}</p>}

      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        Source:{" "}
        <a
          href={s.electionOfficeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {s.electionOfficeName}
        </a>
      </p>
    </section>
  );
}

export function OfficialFallback({ state, what }: { state: string; what: string }) {
  const s = getStateLinks(state);
  if (!s) return null;
  return (
    <p className="text-neutral-700 dark:text-neutral-300">
      We don&apos;t have {what} for your area yet.{" "}
      <a
        href={s.sampleBallotUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-blue-800 underline underline-offset-2 dark:text-blue-300"
      >
        See your official sample ballot →
      </a>
    </p>
  );
}
