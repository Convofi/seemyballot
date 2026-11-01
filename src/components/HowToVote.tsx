import statesData from "@/data/states.json";
import { Card, ExtLink, Footnote, Section } from "@/components/ui";

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
  /** Official state campaign-finance disclosure search (SOS, ethics commission, or finance board). */
  campaignFinanceUrl: string;
  campaignFinanceName: string;
  notes: string;
  /** ISO time of the last link check; null if not yet checked. */
  verifiedAt: string | null;
};

const states: Record<string, StateLinks> = statesData;

export function getStateLinks(state: string): StateLinks | null {
  return states[state.toUpperCase()] ?? null;
}

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
    <Section id="how-to-vote" title="How to vote">
      <Card>
        <p className="text-sm text-ink-3">Election day</p>
        <p className="mt-0.5 text-xl font-semibold tracking-tight text-ink">Tuesday, November 3, 2026</p>

        <ul className="mt-4 divide-y divide-line border-y border-line">
          {buttons.map(([label, href]) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="-mx-2 flex min-h-13 items-center justify-between gap-3 rounded-lg px-2 text-base font-medium text-accent hover:bg-surface-2 hover:text-accent-hover"
              >
                {label}
                <span aria-hidden="true" className="text-ink-3">
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>

        {s.ballotpediaMeasuresUrl && (
          <p className="mt-4 text-md">
            <ExtLink href={s.ballotpediaMeasuresUrl}>2026 ballot measures in {s.name} (Ballotpedia)</ExtLink>
          </p>
        )}

        {s.notes && <p className="mt-4 text-md text-ink-2">{s.notes}</p>}

        <Footnote>
          Source: <ExtLink href={s.electionOfficeUrl}>{s.electionOfficeName}</ExtLink>
        </Footnote>
      </Card>
    </Section>
  );
}

export function OfficialFallback({ state, what }: { state: string; what: string }) {
  const s = getStateLinks(state);
  if (!s) return null;
  return (
    <div className="text-md text-ink-2">
      <p>We don&apos;t have {what} for your area yet.</p>
      <a
        href={s.sampleBallotUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold text-accent hover:border-accent hover:text-accent-hover"
      >
        See your official sample ballot <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
