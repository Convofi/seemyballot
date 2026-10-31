import type { ReactNode } from "react";

// Shared building blocks so every section reads as one system. Colors come
// only from the tokens in globals.css.

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A top-level page section with an anchor for the jump-nav. */
export function Section({
  id,
  title,
  intro,
  children,
  busy,
}: {
  id?: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <section id={id} aria-busy={busy || undefined} className="mt-12 scroll-mt-28">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      {intro && <p className="mt-1.5 text-sm text-ink-3">{intro}</p>}
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mt-3 rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</div>
  );
}

/** Subsection label inside a section, e.g. "Statewide" or "Franklin County". */
export function GroupTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mt-8 scroll-mt-28 text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
      {children}
    </h3>
  );
}

export function ExtLink({
  href,
  children,
  className = "",
  label,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={`link ${className}`}>
      {children}
    </a>
  );
}

/** Small print: sources, caveats. */
export function Footnote({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`mt-4 text-xs leading-5 text-ink-3 ${className}`}>{children}</p>;
}

/** "Source: host" footnote for a single URL. */
export function SourceNote({ href, label }: { href: string; label?: string }) {
  return (
    <span>
      {label ? `${label}: ` : "Source: "}
      <ExtLink href={href}>{hostname(href)}</ExtLink>
    </span>
  );
}

const PARTY_DOT: Record<string, string> = {
  Democratic: "bg-party-dem",
  Republican: "bg-party-rep",
  Libertarian: "bg-party-lib",
  Green: "bg-party-grn",
};

/** Party as a small dot plus the word; the word carries the meaning, the dot is a hint. */
export function PartyMarker({ party, title }: { party: string; title?: string }) {
  const dot = PARTY_DOT[party];
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${dot ?? "border border-party-other bg-transparent"}`}
      />
      {party}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-line px-1.5 py-px text-xs font-medium text-ink-2">{children}</span>
  );
}

/** Plain-language error. */
export function ErrorNote({ children, className = "mt-3" }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="status"
      className={`rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-md text-danger ${className}`}
    >
      {children}
    </p>
  );
}

function Bar({ className }: { className: string }) {
  return <span className={`block rounded bg-surface-2 motion-safe:animate-pulse ${className}`} />;
}

/** Loading placeholder shaped like a contest card. */
export function SkeletonCard({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <span className="sr-only">{label}</span>
      <Bar className="h-5 w-3/5" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-4 w-2/5" />
            <Bar className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonLine({ className = "w-24" }: { className?: string }) {
  return <Bar className={`inline-block h-3.5 align-middle ${className}`} />;
}
