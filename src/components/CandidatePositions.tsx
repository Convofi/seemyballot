import type { CandidatePositions as Data } from "@/lib/positions";
import { ExtLink, hostname } from "@/components/ui";

// Bio plus "where they stand, in their own words" for one candidate. The
// campaign website link lives in the candidate's meta line (Candidate.tsx).

export default function CandidatePositions({ data }: { data: Data }) {
  const found = data.status === "ok" && data.positions.length > 0;
  return (
    <div className="mt-2 text-md">
      {data.bio && <p className="text-ink-2">{data.bio}</p>}
      {found ? (
        <div className="mt-3 border-l-2 border-line pl-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
            Where they stand, in their own words
          </p>
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
      ) : data.status === "website_unreachable" && data.website ? (
        <p className="mt-1 text-sm text-ink-3">
          Campaign site: <ExtLink href={data.website}>{hostname(data.website)}</ExtLink> (we couldn&apos;t read it
          automatically; check it for their positions)
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink-3">No campaign website with an issues page found.</p>
      )}
    </div>
  );
}
