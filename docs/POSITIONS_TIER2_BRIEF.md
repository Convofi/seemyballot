# Candidate positions, tier 2: research agent brief

Tier 1 (`docs/POSITIONS_AGENT_BRIEF.md`) recorded what each candidate says on
their **own campaign site**. For candidates whose campaign site gave nothing
(`no_website_found`, `website_no_issues_page`, `website_unreachable`; judges
excluded), you look for the **candidate's own words hosted somewhere else**:
their official office site, their own questionnaire answers, their press
releases, or an op-ed they wrote. The app tells voters where each one came from,
so the source must be exactly what `source.label` says it is. See My Ballot is
strictly nonpartisan: an empty answer is always better than a guessed one.

## Your batch

You are given a batch number `NNN` (e.g. `004`).

- Input (read only, do not edit): `src/data/positions/queue/tier2-NNN.json`
  Each candidate has `key`, `name`, `party`, `office`, `state`, `incumbent`
  (true / false / null = unknown), `knownWebsite` (the campaign site tier 1
  found, may be null), `fecUrl` (federal only), `priorStatus` (tier 1's result),
  `status: "pending"`.
- Output (the only file you create or commit): `src/data/positions/tier2-NNN.json`

Every key in the queue file must appear in your output, and no other key.

## Sources, in priority order

Use the **first** of these that states positions; do not mix kinds within one
candidate (one `source` per candidate).

| kind | What qualifies | Allowed hosts |
| --- | --- | --- |
| `official_office` | Incumbents only. The office's own issues / priorities / "Legislation and issues" page: `*.house.gov`, `*.senate.gov`, a governor's or state legislator's own page on the state's `.gov` site. | `.gov` (not `fec.gov`) |
| `questionnaire` | The candidate's **own answers** to a Vote411 / League of Women Voters guide, or to Ballotpedia's Candidate Connection survey. Only the text the candidate wrote, never Ballotpedia's editorial summary or a newspaper's write-up. | `vote411.org`, local LWV sites, `ballotpedia.org` (only the Candidate Connection section of the candidate's own page; the URL must contain their surname) |
| `press_release` | Press releases or statements by the candidate on their campaign site or official site. | campaign site, `.gov` office site only via `official_office` |
| `statement` | An op-ed or signed statement **authored by the candidate** in a news outlet. The byline must be the candidate. | the outlet's page |

**Never:** news coverage or interviews written by reporters, opponents' claims,
voting-record or scorecard sites (Vote Smart, GovTrack, interest-group ratings),
party or PAC pages, Wikipedia, social media, link-in-bio pages, FEC, AI summaries.

## Rules

1. **Own words only.** Each point must be the candidate's own stated position on
   the page you cite. No outside knowledge, votes, sponsored-bill lists you
   interpret yourself, adjectives of your own, or comparisons.
2. **At most 5 positions, in the order the source lists them.** Take the first
   five; do not pick by importance or newsworthiness.
3. **One sentence each, ≤ 30 words** (the check fails above 35). Neutral
   paraphrase, or a short **direct quote** in double quotes. `topic` is 2-4
   plain, neutral words ("Health care", "Border security").
4. **Exact page URL per point.** `sourceUrl` is the page that contains that
   text. Never construct, guess or shorten a URL.
5. **`source`** on every `ok` entry: `{ "kind": ..., "label": ... }`. `label`
   completes the sentence "In their own words, from {label}." Keep it short and
   literal, e.g.:
   - `"their U.S. Senate office website"`
   - `"their U.S. House office website"`
   - `"their Ohio Senate office page"`
   - `"their Vote411 voter-guide answers"`
   - `"their Ballotpedia Candidate Connection survey"`
   - `"press releases on their campaign site"`
   - `"an op-ed they wrote in the Columbus Dispatch"`
6. **`website`** is the candidate's **campaign** site, never the office site.
   If `knownWebsite` is a real campaign site, keep it as `website` (otherwise the
   app loses its link); else `null`. A `.gov` URL is never a `website`.
7. **Bio: one neutral sentence** (current/former job), from the source you used
   or the campaign site. `null` if neither says.
8. **Status** (exactly one):
   - `ok`: 1-5 positions recorded, `source` set.
   - `no_source_found`: nothing qualifies. `positions: []`, no `source`,
     `website` = `knownWebsite` if it is a real campaign site else `null`, `bio`
     may be null. The app keeps showing tier 1's result for this candidate.
9. **Verify every URL loads** (2xx or 3xx) with curl; if curl gets 403/429, try
   headless Chrome (below). If a page won't load, don't use it.
10. **Run the gate** and fix everything it reports until it prints `PASS`.
11. **Commit only your file.** Do not edit the queue file, other files, or code.

## Output schema

```jsonc
{
  "<key from queue>": {
    "name": "<name exactly as in the queue file>",
    "website": "https://campaign-home-page/" | null,
    "bio": "One neutral sentence." | null,
    "positions": [ { "topic": "...", "stance": "...", "sourceUrl": "https://..." } ],  // 0-5
    "status": "ok" | "no_source_found",
    "source": { "kind": "official_office" | "questionnaire" | "press_release" | "statement", "label": "..." },  // ok only
    "generatedAt": "2026-11-01",
    "method": "agent"
  }
}
```

Example (illustrative shape only, not real data):

```json
{
 "S0XX00000": {
  "name": "Jane Example",
  "website": "https://janeexample.com/",
  "bio": "U.S. Senator since 2021 and former state attorney general.",
  "positions": [
   {
    "topic": "Agriculture",
    "stance": "Working to expand rural broadband and protect crop insurance for family farms.",
    "sourceUrl": "https://www.example.senate.gov/issues/agriculture"
   }
  ],
  "status": "ok",
  "source": { "kind": "official_office", "label": "their U.S. Senate office website" },
  "generatedAt": "2026-11-01",
  "method": "agent"
 },
 "xx-2026-treasurer-doe-john": {
  "name": "John Doe",
  "website": null,
  "bio": null,
  "positions": [],
  "status": "no_source_found",
  "generatedAt": "2026-11-01",
  "method": "agent"
 }
}
```

## Exact commands

```sh
# 1. Read your assignment
cat src/data/positions/queue/tier2-NNN.json

# 2. Research; check every URL; write src/data/positions/tier2-NNN.json

# 3. Gate: schema, source rules per kind, ≤5 positions, stance ≤35 words,
#    every key in the queue file, every URL loads. Must print PASS.
NODE_EXTRA_CA_CERTS=/private/tmp/claude-501/-Users-sadaqatali-dev-active-ballothelper/48644b1a-fc54-4dfc-a662-6cda7464dc1f/scratchpad/b056/ca/rootyr.pem node scripts/positions-merge-check.mjs src/data/positions/tier2-NNN.json

# 4. Commit only your file
git add src/data/positions/tier2-NNN.json
git commit -m "positions: tier2 NNN" -- src/data/positions/tier2-NNN.json
```

## Finding sources without web search

Web search quota is shared and may be exhausted. Try, in order:

1. **Official office site (incumbents).** House: `https://<lastname>.house.gov/issues`
   (also `/legislative-issues`, `/issues/<topic>`); Senate:
   `https://www.<lastname>.senate.gov/issues/` or `/priorities/`. Verify with
   `curl -sIL`. State legislators: the chamber's member page on the state `.gov` site.
2. **Vote411**: the state's guide on `vote411.org` lists candidates by race; record
   only the candidate's own answers.
3. **Ballotpedia**: `https://ballotpedia.org/<First_Last>`; use it only if the page
   has a Candidate Connection section with the candidate's own survey answers.
4. **Press releases**: `/news`, `/press`, `/media` on `knownWebsite` or the office site.
5. **Op-eds**: the FEC committee's website or the campaign site often links them;
   confirm the byline is the candidate.

`curl` check:

```sh
curl -sSL -o /dev/null -w "%{http_code} %{url_effective}\n" \
  -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" \
  "https://example.senate.gov/issues/"
```

## Sites that answer 403 to curl but render in headless Chrome

Many `.gov` and news sites block curl. The gate accepts a URL that returns 403
(or 429) to a plain fetch **if headless Chrome renders real page content** (not
a "Just a moment" / "Checking your browser" challenge). Read such pages with:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --dump-dom URL
```

Note: `*.senate.gov` may reject both curl and headless Chrome ("Sorry, a
potential security risk was detected"). The gate cannot verify such a page, so
it cannot be a `sourceUrl`; fall through to the next source kind.

## For the dispatcher

```sh
node scripts/positions-queue.mjs tier2 status             # done / pending per tier2 batch
node scripts/positions-queue.mjs tier2 list               # universe not yet covered or queued
node scripts/positions-queue.mjs tier2 batch 12 --size 30 # next 12 non-overlapping tier2 queue files
```

`tier2-*.json` files sort after `batch-*.json`, so a tier-2 `ok` entry replaces
the tier-1 non-`ok` entry; a `no_source_found` entry is ignored when a tier-1
entry exists.
