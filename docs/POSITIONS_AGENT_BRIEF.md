# Candidate positions: research agent brief

You are researching one batch of ~30 candidates for BallotHelper, a strictly
nonpartisan voter guide. For each candidate you record what the candidate says
about themselves on their **own official campaign website**, and nothing else.
An empty answer is always better than a guessed one.

## Your batch

You are given a batch number `NNN` (e.g. `004`).

- Input (read only, do not edit): `src/data/positions/queue/batch-NNN.json`
  Each candidate has `key`, `name`, `party`, `office`, `state`, `knownWebsite`
  (may be null), `fecUrl` (federal candidates only), `status: "pending"`.
- Output (the only file you create or commit): `src/data/positions/batch-NNN.json`

Every key in the queue file must appear in your output, and no other key.

## Rules

1. **Source: the candidate's own official campaign site only.** Its own domain,
   naming this candidate and the office they are running for in 2026. If a
   `knownWebsite` is given, start there but still confirm both. You may use
   Ballotpedia, FEC, Wikipedia or news to *find* the address, but **never** use a
   Ballotpedia, Wikipedia, Vote Smart, news, social-media, link-in-bio, or
   government (`.gov`, official office) URL as `website` or `sourceUrl`.
2. **Find the issues/priorities page** ("Issues", "Priorities", "Platform",
   "Where I Stand", "Our Fight", or an issues section of the home page).
3. **At most 5 positions, in the order the site lists them.** Take the first
   five; do not pick by importance or by what seems newsworthy.
4. **One sentence each, ≤ 30 words** (the check fails above 35). Paraphrase the
   candidate's own stated position; **quote directly** (exact words, in double
   quotes) when the wording is short enough. `topic` is 2-4 plain, neutral
   words ("Health care", "Border security").
5. **Exact page URL per point.** `sourceUrl` is the page that contains that
   text, on the same host as `website`. Never construct, guess, or shorten a URL.
6. **Bio: one neutral sentence** giving current/former job(s), taken from the
   site. `null` if the site doesn't say.
7. **Never infer.** No outside knowledge, voting records, news coverage,
   opponents' claims, adjectives of your own, or comparisons between candidates.
8. **Judges and justices (incl. retention questions):** the code of judicial
   conduct bars promises about rulings. Record a position **only** from an
   explicit judicial-philosophy statement on the site (e.g. "My judicial
   philosophy"), quoted closely. Biography, experience, ratings, endorsements
   and slogans are not positions: use `website_no_issues_page`.
9. **Status** (exactly one):
   - `ok`: website found and 1-5 positions recorded.
   - `website_no_issues_page`: official site exists but states no issue
     positions. `positions: []`, `website` set.
   - `no_website_found`: no official campaign site you could confirm.
     `website: null`, `bio: null`, `positions: []`.
10. **Verify every URL loads with curl** before writing it down (2xx or 3xx):

    ```sh
    curl -sSL -o /dev/null -w "%{http_code} %{url_effective}\n" \
      -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" \
      "https://example-campaign.com/issues/"
    ```

    If a page won't load, don't use it.
11. **Run the gate** and fix everything it reports until it prints `PASS`.
12. **Commit only your batch file.** Do not edit the queue file, other batch
    files, the seed, or any code.

## Output schema

`src/data/positions/batch-NNN.json` is one JSON object keyed by candidate key
(same schema as `src/data/positions/000-ohio-seed.json` and `CandidatePositions`
in `src/lib/positions.ts`):

```jsonc
{
  "<key from queue>": {
    "name": "<name exactly as in the queue file>",
    "website": "https://campaign-home-page/" | null,
    "bio": "One neutral sentence." | null,
    "positions": [ { "topic": "...", "stance": "...", "sourceUrl": "https://..." } ],  // 0-5
    "status": "ok" | "website_no_issues_page" | "no_website_found",
    "generatedAt": "2026-11-01",   // ISO date you did the research
    "method": "agent"
  }
}
```

### Worked example (from the Ohio seed; yours says `"method": "agent"`)

```json
{
 "H2OH03125": {
  "name": "Joyce Beatty",
  "website": "https://beattyforcongress.com/",
  "bio": "U.S. Representative for Ohio's 3rd District since 2013; former Ohio House Democratic leader and Ohio State University senior vice president.",
  "positions": [
   {
    "topic": "Jobs and economy",
    "stance": "Supports legislation ensuring every Central Ohioan can earn a livable wage, equal pay for equal work, and more investment in workforce training and education.",
    "sourceUrl": "https://beattyforcongress.com/issues-page/"
   },
   {
    "topic": "Education",
    "stance": "Fighting to reduce the cost of college, increase investment in public schools, address the student loan debt crisis, and expand access to STEM fields.",
    "sourceUrl": "https://beattyforcongress.com/issues-page/"
   },
   {
    "topic": "Health care",
    "stance": "\"Healthcare is a right, not just a privilege for the financially fortunate\"; supports expanding and strengthening the Affordable Care Act.",
    "sourceUrl": "https://beattyforcongress.com/issues-page/"
   },
   {
    "topic": "Seniors",
    "stance": "Supports expanding Social Security, Medicare, and Medicaid, and strengthening these programs to ensure their long-term solvency.",
    "sourceUrl": "https://beattyforcongress.com/issues-page/"
   },
   {
    "topic": "Women's equality",
    "stance": "Working to address unequal pay, sexual harassment, and threats to \"a woman's right to choose and access to birth control.\"",
    "sourceUrl": "https://beattyforcongress.com/issues-page/"
   }
  ],
  "status": "ok",
  "generatedAt": "2026-10-31",
  "method": "manual"
 }
}
```

A candidate with no confirmable site:

```json
{
 "oh-franklin-2026-commissioner-0101-terford-eric": {
  "name": "Eric Terford",
  "website": null,
  "bio": null,
  "positions": [],
  "status": "no_website_found",
  "generatedAt": "2026-10-31",
  "method": "agent"
 }
}
```

## Exact commands

Run from the repo root, with `NNN` = your batch number.

```sh
# 1. Read your assignment
cat src/data/positions/queue/batch-NNN.json

# 2. Research each candidate; check every URL with the curl command above;
#    write src/data/positions/batch-NNN.json

# 3. Gate: schema, ≤5 positions, stance ≤35 words, sourceUrl host == website host,
#    every key in the queue file, every website/sourceUrl loads. Must print PASS.
node scripts/positions-merge-check.mjs src/data/positions/batch-NNN.json

# 4. Commit only your file (the pathspec keeps other agents' staged files out)
git add src/data/positions/batch-NNN.json
git commit -m "positions: batch NNN" -- src/data/positions/batch-NNN.json
```

## For the dispatcher

```sh
node scripts/positions-queue.mjs status             # done / pending / total, per batch and priority group
node scripts/positions-queue.mjs list               # prioritized keys with no positions entry yet
node scripts/positions-queue.mjs batch 12 --size 30 # next 12 non-overlapping batch files
```

The app reads every `src/data/positions/*.json` at request time, so a committed
batch shows up without a rebuild of the data. Files merge in name order; an
`ok` entry is never replaced by a non-`ok` one.

## Finding the official site without web search

Web search quota is shared across agents and may be exhausted. Use these, in order:

1. **FEC committee record** (federal candidates). The principal campaign committee usually lists the website:
   `curl -s "https://api.open.fec.gov/v1/candidate/<FEC_ID>/committees/?api_key=$FEC_API_KEY&designation=P" | python3 -c "import json,sys;print([c.get('website') for c in json.load(sys.stdin)['results']])"`
   (`FEC_API_KEY` is in `.env.local`: `export $(grep FEC_API_KEY .env.local)`.) Treat it as a hint; still verify the page names the candidate and the office.
2. **Wikipedia election page** for the race: the "External links" / "Official campaign websites" section lists sites for nominees.
3. **`knownWebsite`** in the queue file (from state certified lists), when present.
4. **Guess-and-verify** common patterns (`firstlast.com`, `lastforcongress.com`, `lastforgovernor.com`, `votelast.com`) with `curl -sIL`; accept only if the page clearly names the candidate and office.
Never use a party's page, a PAC page, or a social profile as the website.
