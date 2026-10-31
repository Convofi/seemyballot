import type { ReactNode } from "react";
import type { CandidatePositions as PositionsData } from "@/lib/positions";
import CandidatePositions from "@/components/CandidatePositions";
import { ExtLink, PartyMarker, hostname } from "@/components/ui";

type Props = {
  name: string;
  runningMate?: string;
  /** Party word; omitted for write-ins whose party isn't on the ballot. */
  party?: string;
  partyTitle?: string;
  tags: ReactNode[];
  /** Campaign website from the ballot data, if any. */
  website?: string | null;
  fecUrl?: string | null;
  /** null = not looked up yet; show nothing rather than imply absence. */
  positions: PositionsData | null;
};

/** One candidate row: name, party marker and tags, positions, then a quiet links line. */
export function Candidate({ name, runningMate, party, partyTitle, tags, website, fecUrl, positions }: Props) {
  const sites = [website, positions?.website].filter((u): u is string => !!u);
  const uniqueSites = sites.filter((u, i) => sites.findIndex((v) => hostname(v) === hostname(u)) === i);
  const links: ReactNode[] = [
    ...uniqueSites.map((u) => (
      <span key={u}>
        Campaign site: <ExtLink href={u}>{hostname(u)}</ExtLink>
      </span>
    )),
    ...(fecUrl
      ? [
          <ExtLink key="fec" href={fecUrl}>
            FEC filing
          </ExtLink>,
        ]
      : []),
  ];

  return (
    <li className="py-4 first:pt-3 last:pb-1">
      <p className="text-base font-semibold text-ink">
        {name}
        {runningMate && <span className="font-normal text-ink-2"> and {runningMate}</span>}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-2">
        {party && <PartyMarker party={party} title={partyTitle} />}
        {tags}
      </div>
      {positions && <CandidatePositions data={positions} />}
      {links.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">{links}</p>
      )}
    </li>
  );
}
