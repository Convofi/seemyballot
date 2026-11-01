"use client";

import { useEffect, useState } from "react";
import type { Stats } from "@/lib/stats";
import SearchMap from "@/components/SearchMap";
import { Section, SkeletonLine } from "@/components/ui";

export default function SearchMapSection() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/stats")
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : { available: false as const }))
      .catch(() => ({ available: false as const }))
      .then((s) => live && setStats(s));
    return () => {
      live = false;
    };
  }, []);

  if (!stats) {
    return (
      <p className="mt-12">
        <SkeletonLine className="w-48" />
        <span className="sr-only">Loading search activity…</span>
      </p>
    );
  }
  if (!stats.available || stats.total === 0) return null;

  return (
    <Section
      id="where-people-are-looking"
      title="Where people are looking"
      intro="Searches on this site by state, district, and county. No addresses are stored."
    >
      <SearchMap data={stats} />
    </Section>
  );
}
