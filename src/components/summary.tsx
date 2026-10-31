"use client";

import { createContext, useContext, useEffect } from "react";

// Sections report what they loaded so the page can show a one-line ballot
// summary and hide jump-nav links to sections that didn't render.

export type SummaryPart =
  | { kind: "polling"; status: "one" | "many" | "none" | "error"; count: number }
  | { kind: "federal"; races: number | null }
  | {
      kind: "state";
      status: "ok" | "missing" | "error";
      statewide: number;
      legislative: number;
      county: number;
      city: number;
      measures: number;
      /** An element with id="local" was rendered (county/city contests or the local fallback). */
      hasLocal: boolean;
    };

export type Summary = { [K in SummaryPart["kind"]]?: Extract<SummaryPart, { kind: K }> };

export const SummaryContext = createContext<(part: SummaryPart) => void>(() => {});

export function useReportSummary(part: SummaryPart | null) {
  const report = useContext(SummaryContext);
  const key = part ? JSON.stringify(part) : null;
  useEffect(() => {
    if (key) report(JSON.parse(key) as SummaryPart);
  }, [key, report]);
}
