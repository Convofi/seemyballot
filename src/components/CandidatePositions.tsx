import type { CandidatePositions as Data } from "@/lib/positions";

// "Where they stand (in their own words)" block for one candidate. Same markup as
// the Positions block in FederalContests.tsx, which can switch to this later.

const linkClass = "text-blue-700 underline hover:text-blue-800 dark:text-blue-400";

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function CandidatePositions({ data }: { data: Data }) {
  const found = data.status === "ok" && data.positions.length > 0;
  return (
    <details className="mt-1 text-sm">
      <summary className="cursor-pointer py-1 text-neutral-600 dark:text-neutral-400">
        {found ? "Where they stand" : "About"}
      </summary>
      <div className="mt-1 space-y-2 border-l-2 border-neutral-200 pl-3 dark:border-neutral-800">
        {data.bio && <p className="text-neutral-700 dark:text-neutral-300">{data.bio}</p>}
        {found ? (
          <>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Where they stand (in their own words)
            </h4>
            <ul className="space-y-1.5">
              {data.positions.map((p) => (
                <li key={p.topic}>
                  <span className="font-medium">{p.topic}:</span> {p.stance}{" "}
                  <a
                    href={p.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-xs ${linkClass}`}
                  >
                    source
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-neutral-600 dark:text-neutral-400">
            No campaign website with an issues page found.
          </p>
        )}
        {data.website && (
          <p className="text-xs">
            Campaign website:{" "}
            <a href={data.website} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {hostname(data.website)}
            </a>
          </p>
        )}
      </div>
    </details>
  );
}
