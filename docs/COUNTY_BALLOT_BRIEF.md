# County ballots: research agent brief

You are building the local (county and city) ballot for one metro area for
BallotHelper, a strictly nonpartisan voter guide, for the **November 3, 2026
general election**. Voters type an address and see what is on their ballot.
Your job is to record, from official election-office sources, every county and
city contest and measure that **every voter in that county (or city) votes
on**. An honest gap is always better than a guessed contest.

Reference example: `src/data/state/counties/OH/franklin.json` (Franklin County /
Columbus, Ohio). Match its shape exactly.

## Output

One file per county: `src/data/state/counties/{ST}/{slug}.json`, lowercase
slug, e.g. `TX/harris.json`. **Create only that file (or files). Do not edit
any other file. Do not commit.**

```jsonc
{
  "state": "TX",
  "county": "Harris County",          // the Census county NAME, verified (below)
  "verifiedAt": "2026-10-31",
  "sources": ["https://..."],         // official pages/PDFs you used
  "note": "...",                      // optional: what is NOT shown and why
  "contests": [ /* countywide contests */ ],
  "measures": [ /* countywide measures */ ],
  "municipalities": {
    "Houston": { "contests": [...], "measures": [...] }   // Census place BASENAME
  }
}
```

Types are in `src/lib/stateBallot.ts` (`CountyBallotFile`, `BallotContest`,
`BallotCandidate`, `BallotMeasure`). The validator is the gate:

```
node scripts/check-state-ballot.mjs
```

It must print `OK` before you finish.

## Census names (do this first)

The app matches your file by the exact strings the Census Geocoder returns.
Probe a downtown address and copy them verbatim:

```
curl -s 'http://localhost:3000/api/lookup?address=901+Bagby+St%2C+Houston%2C+TX+77002' | python3 -c 'import json,sys;d=json.load(sys.stdin);print(repr(d["county"]),repr(d["place"]))'
```

Examples of surprises: `Baltimore city`, `Virginia Beach city`, `Orleans
Parish`, `Capitol Planning Region` (Hartford), `Indianapolis city (balance)`,
`Nashville-Davidson metropolitan government (balance)`, `New York` for all five
NYC boroughs, and `None` for Honolulu (no incorporated place: put everything at
county level). If the dev server is not running on port 3000, call the geocoder
directly: `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=...&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties,Incorporated+Places&format=json`
and use `Counties[0].NAME` and `Incorporated Places[0].BASENAME`.

## What goes in

- **County `contests`:** offices every voter in the county votes on: county
  executive/judge, commissioners or council **at-large**, sheriff, district or
  state's attorney, clerk, treasurer, assessor, auditor, coroner, judges
  elected countywide (including retention questions, each as its own
  contest with one candidate), countywide boards.
- **County `measures`:** countywide propositions, bonds, charter amendments,
  tax questions.
- **`municipalities[City]`:** city-wide contests (mayor, at-large council,
  city attorney, controller) and city-wide measures for the principal city
  named in your assignment. Add other cities only if you have the official
  list in hand already. Include a city only if it has at least one contest or
  measure.
- **Not shown (put in `note`):** anything that depends on a sub-county or
  sub-city district the address lookup cannot resolve: commission/council
  **districts**, school boards, school district and special-district
  measures, judicial sub-districts, precinct questions. Name the offices you
  left out so the voter knows to check their sample ballot for them.
- Uncontested races stay in (one candidate). Certified write-ins get
  `"writeIn": true`.

## Rules

1. **Sources are official.** The county election office / clerk / board of
   elections certified candidate list, notice of election, or sample ballot;
   the city clerk for city measures; the state election office. `source` on
   every contest and measure must be one of these URLs. Ballotpedia, news, and
   Wikipedia may help you *find* things but are never a `source`.
2. **Names as certified** (ballot spelling, including nicknames in quotes if
   printed that way).
3. **Party:** one of `Democratic`, `Republican`, `Libertarian`, `Green`,
   `Independent`, `Nonpartisan`, `Other`. Nonpartisan office → `Nonpartisan`.
   Fusion ballots (NY): list the candidate once under their main party.
4. **`incumbent`:** `true` only when the official list or the office's own
   roster confirms it; otherwise `false`.
5. **`key`:** `{st}-{countyslug}-2026-{officeslug}-{lastname}-{firstname}`,
   lowercase `a-z0-9-`, globally unique. Add a term or seat token when the
   same office appears more than once (see Franklin's judge keys).
6. **`website`:** only if the official filing or Ballotpedia lists it **and**
   it loads (`curl -sIL -A "Mozilla/5.0" URL` → 200) **and** it clearly belongs
   to this candidate for this race. Do not hunt; positions are a later pass.
7. **Measures:** `id` exactly as printed ("Proposition A", "Measure G",
   "Question 1", "Issue 12"). `title` is the official short title.
   `summary` is 2-3 neutral plain-English sentences describing what it does,
   from the official ballot language or official summary. `yesMeans` /
   `noMeans` one sentence each. No arguments for or against, no adjectives of
   your own, no fiscal spin beyond the official statement. `source` is the
   official ballot language; `moreInfo` may be an official voter guide.
8. **Never infer.** If you cannot find the certified list, do not reconstruct
   the ballot from news or Ballotpedia. Write no file and say so in your report.
9. **Timebox: about 45 minutes.** Ship what is verified; list the rest in
   `note` and your report.

## Tools and tactics

- WebSearch may be out of quota. Go direct: the county election office site
  (often `vote.{county}.gov`, `{county}votes.gov`, `{county}.gov/elections`,
  county clerk). The state election office usually links every county. The
  `electionOfficeUrl` / `sampleBallotUrl` for your state in `src/data/states.json`
  is a good start.
- PDFs: `curl -sL -A "Mozilla/5.0" URL -o /path/in/scratchpad/x.pdf` then
  `python3 -E -P -c 'import pypdf,sys;print("\n".join(p.extract_text() or "" for p in pypdf.PdfReader(sys.argv[1]).pages))' /path/in/scratchpad/x.pdf`
  (`pypdf` is installed; `pdftotext` is not). Save downloads in your
  scratchpad directory, never in the repo.
- Sites behind bot walls: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --virtual-time-budget=20000 --dump-dom URL`.
- Never put a personal name or email in a User-Agent.
- Sample-ballot lookups that require a specific address: use the probe
  address from your assignment, and remember that ballot shows one precinct's
  district races too; keep only the countywide/citywide items.

## Report (≤ 250 words)

Files written; Census names verified (county, place); counts of county
contests / measures / city contests / measures; the official sources; what is
not shown and why; anything you were unsure about.
