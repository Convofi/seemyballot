import type { CandidateVotes as Data } from "@/lib/votes";
import { ExtLink } from "@/components/ui";

// "Voting record": the member's own roll-call votes under one uniform rule
// (data.rule), plus how often they missed roll calls. Strictly neutral: the
// bill, their vote as recorded, a link. No colors, scores or characterization.
// Collapsed by default, styled like CandidateFinance.

function date(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

function percent(pct: number): string {
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

/**
 * Congressional Review Act titles open with ~90 characters of boilerplate that
 * would fill the clamped line; shorten it so the agency and rule show. The full
 * official title stays in the tooltip.
 */
function shortTitle(title: string): string {
  return title
    .replace(
      /^(?:A joint resolution )?providing (?:for )?congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by/i,
      "Disapproving the rule submitted by",
    )
    .replace(/^A joint resolution (\w)/, (_, c: string) => c.toUpperCase());
}

export default function CandidateVotes({ data }: { data: Data }) {
  const { missed, total, pct, through } = data.missedVotes;
  const n = data.votes.length;
  const chamber = data.chamber === "senate" ? "Senate" : "House";
  // Congress N spans the calendar years 2N+1787 and 2N+1788.
  const congress = `${ordinal(data.congress)} Congress (${2 * data.congress + 1787}–${2 * data.congress + 1788})`;
  return (
    <details className="group mt-2 text-md">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
        <span>
          Voting record{data.former && <> · last term, {congress}</>} · {n} {n === 1 ? "vote" : "votes"} on enacted laws · missed{" "}
          {percent(pct)} of votes
        </span>
      </summary>
      <div className="mb-1 border-l-2 border-line pl-3">
        {data.former && (
          <p className="mb-1 text-sm font-medium text-ink">
            From the {congress}, their last term in the {chamber}.
          </p>
        )}
        <p className="text-sm text-ink-2">
          Missed <span className="font-medium tabular-nums text-ink">{missed.toLocaleString("en-US")}</span> of{" "}
          <span className="tabular-nums">{total.toLocaleString("en-US")}</span> {chamber}{" "}
          roll-call votes ({pct}%){data.former && <> in the {ordinal(data.congress)} Congress</>} through {date(through)}.
        </p>

        {n > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {data.votes.map((v) => (
              <li key={v.measure} className="py-2 first:pt-0">
                <p className="line-clamp-2 break-words text-sm text-ink-2" title={`${v.measure}: ${v.title}`}>
                  <span className="font-medium text-ink">{v.measure}</span> {shortTitle(v.title)}
                </p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-ink-3">
                  <span className="font-medium text-ink">{v.vote}</span>
                  <span aria-hidden="true">·</span>
                  <span>{date(v.date)}</span>
                  <span aria-hidden="true">·</span>
                  <abbr title={v.law} className="no-underline">
                    {v.law.replace("Public Law", "P.L.")}
                  </abbr>
                  <span aria-hidden="true">·</span>
                  <ExtLink href={v.rollUrl} label={`Roll call for ${v.measure}`}>
                    Roll call
                  </ExtLink>
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-ink-3">
          {data.rule} Measures enacted by voice vote or unanimous consent have no roll call and are therefore absent.
        </p>
        <p className="mt-2 text-xs text-ink-3">Source: House Clerk roll-call records; Senate positions from Voteview (UCLA), a mirror of the official Senate roll calls, with links to senate.gov.</p>
      </div>
    </details>
  );
}
