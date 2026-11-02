import { readdirSync } from "node:fs";
import path from "node:path";
import Home from "@/components/HomeClient";

// Counted at build time (the page prerenders static); each deploy picks up new county files.
function countCounties(): number {
  const dir = path.join(process.cwd(), "src/data/state/counties");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .reduce((n, d) => n + readdirSync(path.join(dir, d.name)).filter((f) => f.endsWith(".json")).length, 0);
}

export default function Page() {
  return <Home countyCount={countCounties()} />;
}
