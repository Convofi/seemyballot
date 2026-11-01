import type { ReactNode } from "react";
import type { CandidateFinance as Data } from "@/lib/finance";
import { ExtLink } from "@/components/ui";

// "Who funds them": FEC figures only (names, amounts, shares, dates). Strictly
// neutral: donors are shown as filed, never grouped into industries or labeled.
// Collapsed by default, styled like the positions toggle (CandidatePositions.tsx).

const compact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function percent(share: number): string {
  if (share > 0 && share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
}

function date(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="font-medium tabular-nums text-ink">
        {value}
        {note && <span className="block text-xs font-normal text-ink-3">{note}</span>}
      </dd>
    </div>
  );
}

function AmountList({ rows }: { rows: { key: string; name: string; amount: number }[] }) {
  return (
    <ul className="mt-1 space-y-1">
      {rows.map((r) => (
        <li key={r.key} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 break-words text-ink-2">{r.name}</span>
          <span className="shrink-0 tabular-nums text-ink">{dollars.format(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="font-medium text-ink">{title}</p>
      {note && <p className="text-xs text-ink-3">{note}</p>}
      {children}
    </div>
  );
}

export default function CandidateFinance({ data }: { data: Data }) {
  const pacs = data.topPacs.slice(0, 5);
  const employers = data.topEmployers.slice(0, 5);
  const support = data.outsideSupport.slice(0, 5);
  const oppose = data.outsideOppose.slice(0, 5);
  return (
    <details className="group mt-2 text-md">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-accent hover:text-accent-hover [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
          ›
        </span>
        <span>Who funds them · {compact.format(data.receipts)} raised</span>
      </summary>
      <div className="mb-1 border-l-2 border-line pl-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Stat label="Raised" value={dollars.format(data.receipts)} />
          {data.smallDonorShare !== null && (
            <Stat label="Small donors (<$200)" value={percent(data.smallDonorShare)} note="of individual giving" />
          )}
          {data.pacShare !== null && (
            <Stat label="From PACs" value={percent(data.pacShare)} note={dollars.format(data.pacContributions)} />
          )}
          {data.selfFunding > 0 && <Stat label="Self-funded" value={dollars.format(data.selfFunding)} note="incl. loans" />}
        </dl>

        {pacs.length > 0 && (
          <Group title="Top PAC donors">
            <AmountList rows={pacs.map((p) => ({ key: p.committeeId, name: p.name, amount: p.amount }))} />
          </Group>
        )}

        {employers.length > 0 && (
          <Group
            title="Top employers of individual donors"
            note="Employers that individual donors listed on their contributions; not donations from the companies."
          >
            <AmountList rows={employers.map((e) => ({ key: e.employer, name: e.employer, amount: e.amount }))} />
          </Group>
        )}

        {(support.length > 0 || oppose.length > 0) && (
          <Group title="Outside spending" note="Independent expenditures by groups not controlled by the campaign.">
            {support.length > 0 && (
              <>
                <p className="mt-2 text-xs font-medium text-ink-3">Supporting</p>
                <AmountList rows={support.map((s) => ({ key: s.committeeId, name: s.spender, amount: s.amount }))} />
              </>
            )}
            {oppose.length > 0 && (
              <>
                <p className="mt-2 text-xs font-medium text-ink-3">Opposing</p>
                <AmountList rows={oppose.map((s) => ({ key: s.committeeId, name: s.spender, amount: s.amount }))} />
              </>
            )}
          </Group>
        )}

        <p className="mt-4 text-xs text-ink-3">
          Source: FEC filings{data.coverageEnd ? ` through ${date(data.coverageEnd)}` : ""}. Figures are as reported;
          amounts in dollars. Compiled from FEC data; verify at the{" "}
          <ExtLink href={data.fecUrl}>source</ExtLink>.
        </p>
      </div>
    </details>
  );
}
