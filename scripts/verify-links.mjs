// Re-checks every URL in src/data/states.json.
// Usage: node scripts/verify-links.mjs [STATE ...]
// A URL passes when it ends in a 2xx after following redirects (GET).
// Bot walls (Cloudflare/Akamai 403, Radware, captcha, Ballotpedia's AWS WAF,
// Imperva block pages and script-only JS challenges served with 200)
// are reported as BLOCKED, not FAIL: the link may be fine but a script can't tell.
// Blocked URLs are retried a few times because some walls (Ballotpedia) pass intermittently.
import { readFile } from "node:fs/promises";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const URL_FIELDS = [
  "electionOfficeUrl",
  "pollingPlaceUrl",
  "sampleBallotUrl",
  "registrationCheckUrl",
  "voterIdUrl",
  "ballotpediaMeasuresUrl",
];
const CONCURRENCY = 8;
const TIMEOUT_MS = 30_000;
const BLOCKED_RETRIES = 4;

async function check(url) {
  const cookies = new Map();
  let current = url;
  for (let hop = 0; hop < 10; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1));
    }
    const body = res.status >= 200 && res.status < 300 ? (await res.text()).slice(0, 5000) : "";
    if (!body) await res.body?.cancel();
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).href;
      if (/perfdrive\.com|captcha/i.test(current)) return { status: "blocked", code: res.status, final: current };
      continue;
    }
    const server = res.headers.get("server") ?? "";
    const waf =
      res.headers.has("x-amzn-waf-action") ||
      /Incapsula incident|_Incapsula_Resource/.test(body) ||
      (/<script/i.test(body) && !/<title/i.test(body)) ||
      ((res.status === 403 || res.status === 429) &&
        (res.headers.has("cf-ray") || /cloudflare|akamai/i.test(server)));
    if (waf) return { status: "blocked", code: res.status, final: current };
    if (res.status >= 200 && res.status < 300) return { status: "ok", code: res.status, final: current };
    return { status: "fail", code: res.status, final: current };
  }
  return { status: "fail", code: "too many redirects", final: current };
}

const states = JSON.parse(await readFile(new URL("../src/data/states.json", import.meta.url), "utf8"));
const only = process.argv.slice(2).map((s) => s.toUpperCase());
const jobs = Object.entries(states)
  .filter(([abbr]) => only.length === 0 || only.includes(abbr))
  .flatMap(([abbr, s]) => URL_FIELDS.filter((f) => s[f] !== null).map((field) => ({ abbr, field, url: s[field] })));

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      let r;
      for (let attempt = 0; attempt <= BLOCKED_RETRIES; attempt++) {
        if (attempt) await new Promise((ok) => setTimeout(ok, 3000));
        try {
          r = await check(job.url);
        } catch (e) {
          r = { status: "fail", code: e.cause?.code ?? e.name, final: job.url };
        }
        if (r.status !== "blocked") break;
      }
      results.push({ ...job, ...r });
    }
  }),
);

results.sort((a, b) => (a.abbr + a.field).localeCompare(b.abbr + b.field));
const by = (s) => results.filter((r) => r.status === s);
for (const label of ["fail", "blocked"]) {
  const rows = by(label);
  if (!rows.length) continue;
  console.log(`\n${label.toUpperCase()} (${rows.length})`);
  for (const r of rows) console.log(`  ${r.abbr} ${r.field}: ${r.code} ${r.url}${r.final !== r.url ? ` -> ${r.final}` : ""}`);
}
console.log(
  `\n${results.length} URLs checked: ${by("ok").length} ok, ${by("blocked").length} blocked by bot protection, ${by("fail").length} failed`,
);
process.exitCode = by("fail").length ? 1 : 0;
