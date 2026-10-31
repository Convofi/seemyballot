import votingData from "@/data/voting2026.json";
import { Card, ExtLink, Footnote, Section, hostname } from "@/components/ui";

export type VotingInfo = {
  name: string;
  pollHours: { open: string; close: string; note?: string };
  earlyVoting: { available: boolean; start?: string; end?: string; note?: string };
  mailBallot: {
    whoCanVote: "any voter" | "excuse required" | "all-mail state";
    requestDeadline?: string;
    returnDeadline: string;
    note?: string;
  };
  sameDayRegistration: boolean;
  sameDayRegistrationNote: string;
  registrationDeadlinePassed: boolean;
  registrationNote: string;
  voterId: string;
  lineRule: string;
  sources: string[];
  sourceNote?: string;
  verifiedAt: string;
};

const states = votingData as Record<string, VotingInfo>;

export function getVotingInfo(state: string): VotingInfo | null {
  return states[state.toUpperCase()] ?? null;
}

/** "2026-10-07" → "Oct 7" (dates are calendar dates, so format in UTC). */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const MAIL_WHO: Record<VotingInfo["mailBallot"]["whoCanVote"], string> = {
  "any voter": "Any voter can vote by mail.",
  "excuse required": "Only voters with an approved excuse can vote by mail.",
  "all-mail state": "Every registered voter is mailed a ballot.",
};

function Note({ children }: { children?: string }) {
  if (!children) return null;
  return <span className="mt-1 block text-sm text-ink-3">{children}</span>;
}

export function VotingLogistics({ state }: { state: string }) {
  const s = getVotingInfo(state);
  if (!s) return null;

  const { pollHours: p, earlyVoting: e, mailBallot: m } = s;

  const rows: [string, React.ReactNode][] = [
    [
      "Polls open",
      <>
        Nov 3: {p.open} – {p.close}
        <Note>{p.note}</Note>
      </>,
    ],
    [
      "Early voting",
      <>
        {!e.available
          ? "No in-person early voting."
          : e.start && e.end
            ? `${shortDate(e.start)} – ${shortDate(e.end)}`
            : "Yes"}
        <Note>{e.note}</Note>
      </>,
    ],
    [
      "Mail ballot",
      <>
        {MAIL_WHO[m.whoCanVote]}
        {m.requestDeadline && <span className="block">Request: {m.requestDeadline}</span>}
        <span className="block">Return: {m.returnDeadline}</span>
        <Note>{m.note}</Note>
      </>,
    ],
    [
      "Same-day registration",
      <>
        {s.sameDayRegistration ? "Yes. " : "No. "}
        {s.sameDayRegistrationNote}
        <Note>{s.registrationNote}</Note>
      </>,
    ],
    ["Voter ID", s.voterId],
  ];

  return (
    <Section id="voting" title={`Voting in ${s.name}`}>
      <Card>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="py-3 first:pt-0 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-sm font-medium text-ink-3">{label}</dt>
              <dd className="mt-0.5 text-md text-ink sm:mt-0">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 rounded-lg border-l-2 border-ink bg-surface-2 px-3 py-2.5 text-md font-medium text-ink">
          {s.lineRule}
        </p>

        <Footnote>
          Sources:{" "}
          {s.sources.map((url, i) => (
            <span key={url}>
              {i > 0 && " · "}
              <ExtLink href={url}>{hostname(url)}</ExtLink>
            </span>
          ))}
          {s.sourceNote && <span className="mt-1 block">{s.sourceNote}</span>}
        </Footnote>
      </Card>
    </Section>
  );
}
