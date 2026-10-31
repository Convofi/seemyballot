import {
  getCountyBallot,
  getLegislativeContests,
  getMunicipalBallot,
  getStateBallot,
  type BallotCandidate,
  type BallotContest,
  type BallotMeasure,
} from "@/lib/stateBallot";

export { hasStateBallot, hasCountyBallot } from "@/lib/stateBallot";

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
};

/**
 * State, legislative, county and municipal contests plus ballot measures, in
 * ballot order. Renders nothing when we have no data for this state; sections
 * with no data for this voter are omitted.
 */
export default function StateLocalContests({
  state,
  stateName,
  county,
  place,
  stateSenateDistrict,
  stateHouseDistrict,
}: Props) {
  const ballot = getStateBallot(state);
  if (!ballot) return null;

  const legislative = getLegislativeContests(ballot, stateSenateDistrict, stateHouseDistrict);
  const countyBallot = getCountyBallot(ballot, county);
  const municipal = getMunicipalBallot(ballot, county, place);

  const legislativeContests = [legislative.senate, legislative.house].filter(
    (c): c is BallotContest => c !== null,
  );
  const measures = [
    ...ballot.statewide.measures,
    ...(countyBallot?.measures ?? []),
    ...(municipal?.measures ?? []),
  ];

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">{stateName} and local contests</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{ballot.notice}</p>

      <ContestGroup title="Statewide" contests={ballot.statewide.contests} />
      <ContestGroup title="State legislature" contests={legislativeContests} />
      <ContestGroup title={county ?? "County"} contests={countyBallot?.contests ?? []} />
      <ContestGroup title={place ?? "City"} contests={municipal?.contests ?? []} />

      {measures.length > 0 && (
        <>
          <h3 className="mt-8 text-base font-semibold">Issues and measures</h3>
          {measures.map((m) => (
            <MeasureCard key={m.id + m.title} measure={m} />
          ))}
        </>
      )}

      {countyBallot?.note && (
        <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">{countyBallot.note}</p>
      )}
    </section>
  );
}

function ContestGroup({ title, contests }: { title: string; contests: BallotContest[] }) {
  if (contests.length === 0) return null;
  return (
    <>
      <h3 className="mt-8 text-base font-semibold">{title}</h3>
      {contests.map((c) => (
        <ContestCard key={c.office} contest={c} />
      ))}
    </>
  );
}

function ContestCard({ contest }: { contest: BallotContest }) {
  // Write-ins aren't printed on the ballot, so list them last.
  const candidates = [...contest.candidates].sort((a, b) => Number(!!a.writeIn) - Number(!!b.writeIn));
  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h4 className="font-semibold">{contest.office}</h4>
      {contest.seats && contest.seats > 1 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Vote for up to {contest.seats}</p>
      )}
      {candidates.length === 1 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Unopposed</p>
      )}
      <ul className="mt-2 divide-y divide-neutral-200 dark:divide-neutral-800">
        {candidates.map((c) => (
          <CandidateRow key={c.key} candidate={c} />
        ))}
      </ul>
      <SourceLink href={contest.source} />
    </div>
  );
}

const pill =
  "rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";

function CandidateRow({ candidate: c }: { candidate: BallotCandidate }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
      <span className="font-medium">
        {c.name}
        {c.runningMate && (
          <span className="font-normal text-neutral-600 dark:text-neutral-400"> and {c.runningMate}</span>
        )}
      </span>
      {c.writeIn ? (
        <span className={pill}>Write-in (not printed on ballot)</span>
      ) : (
        <span className={pill}>{c.party}</span>
      )}
      {c.incumbent && (
        <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs font-medium dark:border-neutral-700">
          Incumbent
        </span>
      )}
      {c.website && (
        <a
          href={c.website}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs text-blue-700 underline hover:text-blue-800 dark:text-blue-400"
        >
          Campaign website
        </a>
      )}
    </li>
  );
}

function MeasureCard({ measure: m }: { measure: BallotMeasure }) {
  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h4 className="font-semibold">
        {m.id}: {m.title}
      </h4>
      <p className="mt-2">{m.summary}</p>
      <dl className="mt-3 space-y-2">
        <div>
          <dt className="inline font-semibold">A YES vote means </dt>
          <dd className="inline">{lowerFirst(m.yesMeans)}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">A NO vote means </dt>
          <dd className="inline">{lowerFirst(m.noMeans)}</dd>
        </div>
      </dl>
      <p className="mt-3 flex flex-wrap gap-x-4">
        <SourceLink href={m.source} label="Official ballot language" />
        {m.moreInfo && <SourceLink href={m.moreInfo} label="More info" />}
      </p>
    </div>
  );
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function SourceLink({ href, label }: { href: string; label?: string }) {
  const host = new URL(href).hostname.replace(/^www\./, "");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-block text-xs text-blue-700 underline hover:text-blue-800 dark:text-blue-400"
    >
      Source: {label ? `${label} (${host})` : host}
    </a>
  );
}
