import type { CandidatePositions as Data } from "@/lib/positions";
import { ExtLink } from "@/components/ui";

// Bio plus "where they stand, in their own words" for one candidate. The
// positions list is collapsed by default so long ballots stay scannable; the
// campaign website link lives in the candidate's meta line (Candidate.tsx).

export default function CandidatePositions({ data }: { data: Data }) {
  const found = data.status === "ok" && data.positions.length > 0;
  return (
    <div className="mt-2 text-md">
      {data.bio && <p className="text-ink-2">{data.bio}</p>}
      {found ? (
        <details className="group mt-2">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
              ›
            </span>
            <span>
              Where they stand · {data.positions.length} {data.positions.length === 1 ? "position" : "positions"}
            </span>
          </summary>
          <div className="mb-1 border-l-2 border-line pl-3">
            <p className="text-xs text-ink-3">In their own words, from their campaign site.</p>
            <ul className="mt-2 space-y-3">
              {data.positions.map((p) => (
                <li key={p.topic}>
                  <p className="font-medium text-ink">{p.topic}</p>
                  <p className="text-ink-2">
                    {p.stance}{" "}
                    <ExtLink href={p.sourceUrl} className="text-xs whitespace-nowrap" label={`Source for ${p.topic}`}>
                      Source
                    </ExtLink>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : data.status === "website_unreachable" && data.website ? (
        <p className="mt-1 text-sm text-ink-3">
          We couldn&apos;t read their campaign site automatically; check it below for their positions.
        </p>
      ) : data.status === "website_no_issues_page" ? (
        <p className="mt-1 text-sm text-ink-3">Their campaign site doesn&apos;t state positions on issues.</p>
      ) : (
        <p className="mt-1 text-sm text-ink-3">No campaign website found.</p>
      )}
    </div>
  );
}
