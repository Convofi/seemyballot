# BallotHelper — Data Sources Spike

**Date of spike:** 2026-10-31 (general election 2026-11-03). Every "verified" claim below comes from an HTTP call made on this date; responses are trimmed, not edited.

## TL;DR

- **Districts: solved.** The Census Geocoder is free, needs no key, takes about 0.3 s, and already serves **120th Congress** districts and **2026** state legislative districts. These are the post-2025 mid-decade redistricting maps. **Do not use 119th districts.** They are wrong for 2026 in redistricted states (verified for TX).
- **"Who is on the general-election ballot" is NOT solved by any free authoritative API.** FEC lists every Form 2 filer, including primary losers, withdrawn candidates and duplicates. For OH Senate it lists 16 names and for TX-10 it lists 21. It also flags a retiring incumbent as `I`. FEC alone **cannot** meet the VISION success criterion "Federal contests 100% correct".
- Google Civic `representatives` is **dead** (turned down April 2025). `voterinfo` and `elections` still exist but need a key; I could not verify contest coverage without one.
- Ballotpedia, Democracy Works and BallotReady are **paid**, and ballotpedia.org blocks automated fetches with an AWS WAF challenge.
- Ballot measures: there is no free nationwide structured feed. Official per-state pages exist. California's voter guide even states "A YES vote means… / A NO vote means…".

## Summary table

| # | Source | What it gives | Free? | Key? | Verified working today |
|---|---|---|---|---|---|
| 1 | US Census Geocoder | Address → lat/lng, state, county, place, **120th CD**, **2026 SLDU/SLDL** | Yes | No | **Y** (DC, OH, TX, CA addresses) |
| 2 | Google Civic Info API: `representatives` | Officials by address | — | — | **N: shut down April 2025** (doc page 404s) |
| 2b | Google Civic Info API: `elections`, `voterinfo`, `divisions` | Elections list; polling places and contests where VIP has data | Yes | Yes (free GCP key) | Endpoints respond with 403 "needs key". **Contest coverage unverified** |
| 3 | FEC OpenFEC API | Federal candidates registered for a 2026 race, party, incumbent flag, FEC IDs | Yes | DEMO_KEY (10 req/hr) or free api.data.gov key | **Y**, but it is a filer list, **not a ballot** |
| 4 | Open States API v3 | Current state legislators (and US Congress members) by lat/lng | Yes | Yes (free) | Endpoint live (403 without key). **No candidate data** |
| 4b | openstates/people GitHub | Same legislator data as YAML | Yes, CC0 | No | Y (repo pushed 2026-10-30) |
| 5 | Ballotpedia | Everything (contests, candidates, measures, sample ballot) | **No**, paid API | Yes (sales) | Site returns `202` + `x-amzn-waf-action: challenge` to curl/WebFetch. **Link only** |
| 6 | VIP / Democracy Works Elections API | Polling places; some ballot info | VIP: only via Google Civic. DW API: **paid** ("Request Pricing") | Yes | Not testable |
| 7 | NASS "Can I Vote" | Official polling-place lookup URL for 50 states + DC | Yes (scrape a page) | No | **Y** (51 `<option>` URLs extracted) |
| 7b | vote.gov | State registration info, election homepage link | Yes | No | Returns 403 to curl. Content lives in a Drupal DB, not in the repo |
| 8 | State SoS pages (e.g. CA voter guide) | Official measure titles + yes/no meaning | Yes | No | **Y** for CA. Other states vary (OH SoS 403 to curl, CO has a PDF Blue Book) |
| 8b | NCSL Ballot Measures DB | 2026 measures, all states (~140 in 40 states) | Free to view | No | Y (page live, updated 2026-09-23). Power BI only, **no export/API** |
| 9 | Wikipedia (MediaWiki API) | Major-party general-election nominees per House/Senate race (infobox) | Yes, CC BY-SA | No | **Y** (OH-03, OH Senate). Crowd-sourced, minor parties often missing |

---

## 1. US Census Geocoder ✅

Docs: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

**Benchmarks and vintages that work today** (`GET /geocoder/benchmarks`, `GET /geocoder/vintages?benchmark=Public_AR_Current`):
- Benchmarks: `Public_AR_Current` (default), `Public_AR_ACS2026`, `Public_AR_LUCA`, `Public_AR_Census2020`
- Vintages for `Public_AR_Current`: `Current_Current` (default), `ACS2026_Current`, `ACS2025_Current`, … `Census2020_Current`

**Use `benchmark=Public_AR_Current&vintage=Current_Current`.** This returns `120th Congressional Districts` and `2026 State Legislative Districts - Upper/Lower`. `ACS2025_Current` returns `119th` and `2024` districts instead.

**Request (address):**
```
GET https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress
    ?address=123 Main St, Columbus, OH 43215
    &benchmark=Public_AR_Current
    &vintage=Current_Current
    &layers=54,56,58,82,28      # or layers=all
    &format=json
```
Layer IDs (from the TIGERweb `tigerWMS_Current` MapServer): `54` = 120th Congressional Districts, `56` = 2026 SLD Upper, `58` = 2026 SLD Lower, `82` = Counties, `28` = Incorporated Places (`30` = Census Designated Places, `22` = County Subdivisions, for townships). Passing these layers returned exactly `['Incorporated Places','Counties','2026 State Legislative Districts - Upper','120th Congressional Districts','2026 State Legislative Districts - Lower']`.

**Request (coordinates):** `GET /geocoder/geographies/coordinates?x=-83.003144&y=39.955663&benchmark=Public_AR_Current&vintage=Current_Current&layers=54&format=json` returned 200.

**Latency:** 0.27–0.61 s per call (3 samples).

**Sample: 1600 Pennsylvania Ave NW, Washington, DC 20500**
```
matchedAddress: 1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500
coordinates: {x: -77.035189204737, y: 38.898702605245}
States: District of Columbia (11)
Counties: District of Columbia (11001)
Incorporated Places: Washington city (1150000)
120th Congressional Districts: Delegate District (at Large) (1198)
2026 State Legislative Districts - Upper: Ward 2 (11002)      # DC "upper" = council ward
```

**Sample: 123 Main St, Columbus, OH 43215.** This returned **2 matches**: `123 W MAIN ST` and `123 E MAIN ST`. Both are in the same districts here, but the UI must handle ambiguity.
```
matchedAddress: 123 W MAIN ST, COLUMBUS, OH, 43215   coords: {x: -83.003144784045, y: 39.955663292756}
Counties: Franklin County (39049)
Incorporated Places: Columbus city (3918000)
120th Congressional Districts: Congressional District 3 (3903)
2026 State Legislative Districts - Upper: State Senate District 15 (39015)
2026 State Legislative Districts - Lower: State House District 1 (39001)

# raw CD object (trimmed)
{"CD120":"03","GEOID":"3903","CDSESSN":"120","STATE":"39","BASENAME":"3","NAME":"Congressional District 3"}
# raw SLDL object (trimmed)
{"GEOID":"39001","SLDL":"001","STATE":"39","NAME":"State House District 1","LSY":"2026"}
```

**Redistricting check: Texas State Capitol, 1100 Congress Ave, Austin, TX 78701**
- `ACS2025_Current` → `119th Congressional Districts: Congressional District 37` (the 2021 map)
- `Current_Current` → `120th Congressional Districts: Congressional District 10` (the 2025 Texas map, used for the 2026 election)

1315 10th St, Sacramento CA → 120th CD 7, SD 8, AD 6.

**Gaps and caveats**
- PO boxes and nonexistent addresses return `addressMatches: []`. For these, fall back to the `/locations/onelineaddress` endpoint, ask the user to fix the address, or use a third-party geocoder to get lat/lng and then call `/geographies/coordinates`.
- Address ranges are interpolated, so addresses near district lines can be mis-assigned. Show the matched address back to the user.
- There is no school board, city council ward, judicial district, county commission district or precinct. Census does not have them. This is why local contests are out of reach for v0.
- Not every SLD is on the 2026 ballot (VA, NJ, LA and MS hold odd-year legislative elections; half of many state senates are not up). We need a per-state "which chambers/seats are up in 2026" table, and we do not have one yet.
- I did not independently verify the 120th CD layer in every mid-decade-redistricted state (TX, CA, MO, NC, OH, UT, …). I spot-checked TX only. Spot-check one address per redistricted state against the state's official map before launch.

---

## 2. Google Civic Information API ⚠️ partially alive

- **`representatives` (`representativeInfoByAddress`, `representativeInfoByDivision`): DEAD.** Google's notice in the google-civicinfo-api group, "Notice of Turndown of the Representatives API" (https://groups.google.com/g/google-civicinfo-api/c/9fwFn-dhktA/m/ftUoL83mAwAJ), says: "Both representativeInfoByAddress and representativeInfoByDivision methods will be turned down next year in April 2025. There is no impact on Elections or Divisions APIs". The reference page https://developers.google.com/civic-information/docs/v2/representatives now returns **HTTP 404**.
- **Still documented** at https://developers.google.com/civic-information/docs/v2 (last updated 2025-04-30): `GET /elections` (electionQuery), `GET /voterinfo?address=` (voterInfoQuery), `GET /divisions` (search), and `divisionsByAddress`.
- **Live probe (no key)**, at `https://www.googleapis.com/civicinfo/v2/{elections|voterinfo|representatives|divisions}`. All four returned:
  ```json
  {"error":{"code":403,"message":"Method doesn't allow unregistered callers (callers without established identity). Please use API Key ...","status":"PERMISSION_DENIED"}}
  ```
  The service is up, but a 403 without a key does not prove that `representatives` still returns data. The 404 doc page and the turndown notice do.
- `voterinfo` is backed by VIP data. VIP's FAQ says the dataset "typically includes voting locations and their respective hours", and "in some cases, it also includes ballot information". **Contest/candidate coverage for 2026-11-03 is UNVERIFIED.** **Action:** create a free GCP key and run `GET /civicinfo/v2/elections?key=…`, then `GET /civicinfo/v2/voterinfo?address=123 W Main St Columbus OH 43215&electionId=<id>&key=…`. Check whether `contests[]` is populated. If it is, this is the best free federal/state contest source and should be cross-checked against FEC IDs. Takes about 5 minutes.

---

## 3. FEC OpenFEC API ✅ (but it is not a ballot)

Base: `https://api.open.fec.gov/v1/`. `api_key=DEMO_KEY` works, but the response header showed `x-ratelimit-limit: 10`. Get a free api.data.gov key for production and cache aggressively, since the data changes slowly.

**House race (OH-03):**
```
GET /v1/candidates/?api_key=DEMO_KEY&state=OH&district=03&office=H&election_year=2026&per_page=50&sort=name
pagination: {count: 4}
H2OH03125 BEATTY, JOYCE        DEM  incumbent_challenge=I  candidate_status=C  has_raised_funds=True
H6OH03183 BIRD, MICHELLE LINDA NON  N  C  False
H6OH03175 DIALS, SANTANA JADE  W    N  C  False
H0OH03137 DULANEY, CLEOPHUS    REP  N  C  False
```
Full record fields (trimmed): `candidate_id, name, party, party_full, office, state, district, incumbent_challenge (I/C/O), incumbent_challenge_full, candidate_status (C=statutory candidate), candidate_inactive, inactive_election_years, election_years[], cycles[], has_raised_funds, first_file_date, last_file_date, active_through`.

**Senate race (OH 2026 special):**
```
GET /v1/candidates/?api_key=DEMO_KEY&state=OH&office=S&election_year=2026&per_page=100&sort=name
count: 16  → includes HUSTED, JON (REP, I), BROWN, SHERROD (DEM, C), ODE, FREDERICK J (DEM), KINCAID (DEM),
             REDPATH (LIB), LEVY (IND), FARIS (IND), two "VOLPE, CHRISTOPHER" records, several $0 filers …
```
`GET /v1/elections/?state=OH&office=senate&cycle=2026&sort=-total_receipts` returns 13 candidates with money totals (Brown $68.4M, Husted $19.9M, Ode $5.0M …). It is useful for ranking but is still not a ballot.

`GET /v1/elections/search/?state=OH&cycle=2026` lists the races: `{office:'S',district:'00'}`, `{office:'H',district:'01'}` … `'15'`.

**TX-10 (redistricted):** count 21, including duplicate `ECKHARDT, SARAH` and `BROWN, ROBERT` records, and `MCCAUL, MICHAEL REP I`.

**How to tell…**
- *Party:* `party` / `party_full`. These are as filed and can be `NON`, `W` or `IND`.
- *Incumbent:* `incumbent_challenge == "I"`. Caveat: this means "currently holds the seat", **not** "is running in the general election". A retiring incumbent still shows `I`, so verify each case (for example McCaul in TX-10).
- *On the general ballot / lost a primary:* **The FEC has no field for this.** `candidate_status`, `candidate_inactive` and `election_years` do not reflect primary results or ballot qualification. Every OH Senate filer shows `candidate_inactive=False`. Primary losers stay listed indefinitely.

**Verdict:** use FEC for candidate IDs, party, finance links (`https://www.fec.gov/data/candidate/{candidate_id}/`) and as a cross-check. **Do not render the FEC list as the ballot.**

---

## 4. Open States API v3 ✅ (incumbents only)

- OpenAPI: https://v3.openstates.org/openapi.json. Paths: `/jurisdictions, /people, /people.geo, /bills, /committees, /events, /metrics`. **There is no candidates or elections endpoint.**
- `GET https://v3.openstates.org/people.geo?lat=39.9557&lng=-83.0031&apikey=KEY` takes params `lat, lng, include, apikey`. Its description: "Get list of people currently representing a given location. Note: Currently limited to state legislators and US Congress."
- Without a key: `403 {"detail":"Must provide API Key as ?apikey or X-API-KEY. Login and visit https://openstates.org/account/profile/ for your API key."}`. The key is free (sign up at openstates.org). The docs don't state rate limits.
- Bulk alternative: GitHub `openstates/people` (license **CC0-1.0**, last push 2026-10-30) has YAML for all legislators and governors.
- **Use:** an "incumbent" badge for state legislative races. It cannot tell us who is running.

---

## 5. Ballotpedia ❌ for automation, ✅ as a link target

- **API is paid.** The docs at https://developer.ballotpedia.org say to contact "your Ballotpedia sales contact". The Geographic API uses base `https://api4.ballotpedia.org/data/…` with the `x-api-key` header. CORS only works for whitelisted origins (contact tech@ballotpedia.org). Pricing is not public ("Ballotpedia:Buy Political Data").
- **ballotpedia.org blocks bots.** Every URL returned `HTTP 202`, `content-length: 0`, `x-amzn-waf-action: challenge` to curl, and WebFetch got empty content. We cannot scrape it or even health-check links server-side.
- **License:** I could not fetch the Ballotpedia:Copyrights page because of the WAF. Secondary sources say the encyclopedia text is GNU FDL 1.2 and that a link back satisfies attribution. Ballotpedia News has its own CC republication terms that ban editing and resale. **Treat as unverified; do not copy text. Linking is fine.**
- **URL patterns to link to.** These are standard Ballotpedia patterns. The WAF prevented me from confirming a 200 response.
  - Sample ballot tool: `https://ballotpedia.org/Sample_Ballot_Lookup`
  - State measures: `https://ballotpedia.org/{State}_2026_ballot_measures` (e.g. `Ohio_2026_ballot_measures`)
  - All measures: `https://ballotpedia.org/2026_ballot_measures`
  - State elections hub: `https://ballotpedia.org/{State}_elections,_2026`
  - House race: `https://ballotpedia.org/{State}%27s_{N}{st|nd|rd|th}_Congressional_District_election,_2026`
  - Senate race: `https://ballotpedia.org/United_States_Senate_election_in_{State},_2026`. Ohio's 2026 race is a *special* election: `United_States_Senate_special_election_in_Ohio,_2026`.

---

## 6. Voting Information Project / Democracy Works ❌ (no free bulk data)

- VIP (https://votinginfoproject.org/faq) is run by Democracy Works. The footer reads "©2026 Voting Information Project". The FAQ steers developers to **Google Civic `voterinfo`** ("We encourage you to use the Google Civic Information API, powered by VIP data"). I found **no public bulk download** of 2026 feeds. The spec is open (VIP 6.0, github.com/votinginfoproject/vip-specification), but the data is not.
- The Democracy Works Elections API has no published price, only "Request Pricing". The org is a 501(c)(3) but publishes no nonprofit or free tier. Not usable for v0 on a 3-day timeline.

---

## 7. Polling place / sample ballot lookup URLs

- **NASS "Can I Vote"** at https://www.nass.org/can-i-vote/find-your-polling-place returns 200. The page contains a `<select>` with **51 options** (50 states + DC), each an official state lookup URL. Examples I extracted:
  - Ohio → `https://www.ohiosos.gov/directories/find-my-polling-location`
  - California → `http://www.sos.ca.gov/elections/polling-place/` (redirects to https, 200)
  - Texas → `https://teamrv-mvp.sos.texas.gov/MVP/mvp.do` (redirects to `goelect.txelections.civixapps.com/...`, 200)
  - Others: `https://myvote.wi.gov/en-us/FindMyPollingPlace`, `https://vt.ncsbe.gov/PPLkup/`, `https://www.pavoterservices.pa.gov/Pages/PollingPlaceInfo.aspx`, …
  - Some entries are stale `http://` or registration-check pages rather than polling-place pages (e.g. CO, FL).
  - **Plan:** scrape once into a checked-in `stateLinks.json` and hand-review all 51.
- **vote.gov** returns 403 to curl even with a browser user agent. Source: `usagov/vote-gov-drupal`. The `state_territory` content type has `field_election_homepage_link`, `field_check_registration`, `field_registration_link`, `field_more_info_link` and similar fields, but **no polling-place or sample-ballot field**. The content lives in the Drupal DB, not in the repo, so there is no open dataset to pull.
- **USA.gov** at https://www.usa.gov/state-election-office (200) lists state election offices. **EAC** at https://www.eac.gov/voters/register-and-vote-in-your-state (200) gives per-state links.
- **Sample ballots:** I found **no** maintained dataset of state sample-ballot lookup URLs. Many states fold sample ballots into the same voter-portal tool as polling places (e.g. GA MVP, TX MVP, MI, WI MyVote). In others it is county-level (OH, CA, NY). For v0 the fallback link should be the NASS polling-place URL, which usually leads to the sample ballot too. A small hand-built `sampleBallotUrl` override can cover states where that is wrong.
- **Bot blocking:** ohiosos.gov returned 403 to curl, so automated link-checking will produce false failures. Check those links manually.

---

## 8. Statewide ballot measures

- **NCSL Statewide Ballot Measures Database** at https://www.ncsl.org/elections-and-campaigns/statewide-ballot-measures-database was "Updated September 23, 2026" and reports "Voters in 40 states will deliver verdicts on over 140 ballot measures in the November 2026 election". It is a **Power BI embed only, with no CSV or API**. Use it as a human checklist for curation.
- **California SoS (verified, best-in-class).**
  - List: https://www.sos.ca.gov/elections/ballot-measures/qualified-ballot-measures. Props 1–5 and 37–45 are on the 2026-11-03 ballot.
  - Per-measure page: `https://voterguide.sos.ca.gov/propositions/{n}/` (200). It contains official "WHAT YOUR VOTE MEANS" text. Prop 1, verbatim:
    > "A YES vote on this measure means: The state could borrow $11.25 billion to support veterans and affordable housing. NO A NO vote on this measure means: The state could not borrow $11.25 billion to support veterans and affordable housing."
  - Also `https://voterguide.sos.ca.gov/quick-reference-guide/{n}.htm` (200).
  - HTML only, no JSON. Scrapable.
- **Colorado:** 14 statewide measures. The official yes/no explanations are in the Legislative Council "Blue Book" PDF (https://content.leg.colorado.gov/sites/default/files/2026-bluebook-english-accessible_1.pdf). There is no JSON feed. The guessed URL `sos.state.co.us/pubs/elections/Initiatives/ballot/2026.html` returned 404.
- **Ohio:** ohiosos.gov returns 403 to scripted requests, so it must be fetched by hand.
- **Reality:** there is no free structured nationwide measures feed. Measures require **hand curation from official state voter guides**, which is about 140 measures across 40 states. With 3 days left, curate the largest states first and link to the official guide for the rest.

## 9. Wikipedia (found during spike) ⚠️ useful, but not authoritative

`GET https://en.wikipedia.org/w/api.php?action=parse&page=2026_United_States_House_of_Representatives_elections_in_Ohio&prop=wikitext&format=json&formatversion=2` returns wikitext with a per-district infobox:
```
== District 3 ==
{{Infobox election | election_name = 2026 Ohio's 3rd congressional district election
| nominee1 = [[Joyce Beatty]] | party1 = Democratic Party (United States)
| nominee2 = Cleophus Dulaney | party2 = Republican Party (United States) ...
[[File:Ohio's 3rd congressional district (since 2027) (new version).svg|...boundary from the 2026 elections]]
```
For the Senate, `2026_United_States_Senate_special_election_in_Ohio` gives `nominee1=[[Jon Husted]]` (Republican) and `nominee2=[[Sherrod Brown]]` (Democratic).

The infobox nominees for OH-03 match the R/D subset of the 4 FEC filers. Wikipedia is CC BY-SA, so attribution is required. It is crowd-edited and infoboxes usually omit minor-party and independent candidates who *are* on the ballot (e.g. whether Libertarian Redpath made the OH ballot is unknown). It is a candidate *hint* to reconcile against FEC IDs and the state certified list. It is **not** a source of truth under VISION principle #1.

---

## Recommended v0 data architecture

| Layer | Source | Notes |
|---|---|---|
| **Address → districts** | **Census Geocoder**, `Public_AR_Current` / `Current_Current`, layers `54,56,58,82,28` | Free, no key, ~0.3 s. Handle 0 and multiple matches. Cache by normalized address. |
| **Federal contests (which races)** | Census CD + state → US House race. A static `senateRaces2026.json` (which states have a Senate race, including specials such as OH and FL) | Small, static, hand-checked list. |
| **Federal candidates (who's on the ballot)** | **Hand-curated `federalBallot2026.json`** keyed by FEC `candidate_id`, built from state **certified general-election candidate lists**. Seed from Wikipedia nominee infoboxes plus FEC, then reconcile. If the Google Civic `voterinfo` key test shows populated `contests[]`, use it as the primary source and cross-check against FEC. | Without curation, FEC shows primary losers and the "100% correct" criterion is impossible. ~470 races in 3 days is a lot of work. Ship only verified states and show the fallback elsewhere. |
| **Candidate metadata** | FEC (party, IDs, finance link). Incumbent = current officeholder, verified (not FEC's `I` flag alone). | |
| **State legislative contests** | Census SLDU/SLDL district + **Open States `people.geo`** for the incumbent | **There is no free source for 2026 state legislative candidates.** Show the district number, the current officeholder, and the fallback "see your official sample ballot". Also need a per-state "chambers up in 2026" table. |
| **Ballot measures** | Hand-curated from official state voter guides (CA `voterguide.sos.ca.gov/propositions/{n}/`, CO Blue Book, …), using NCSL as the checklist | Official yes/no text where the state publishes it. Elsewhere, title plus link only (no AI-written summaries without a source). |
| **Local contests** | **None.** Fallback only. | Census has no wards, school boards or judicial districts. |
| **Fallback / How to vote** | NASS Can-I-Vote state URLs, scraped once into `stateLinks.json` and hand-reviewed, plus a Ballotpedia `Sample_Ballot_Lookup` and Vote411 (`https://www.vote411.org/ballot`, 200) as secondary links | Label official (state) links as such. Ballotpedia and Vote411 are third-party. |

**Blunt gaps**
1. No free, authoritative, machine-readable source of "who is on my general-election ballot" exists today. Google Civic `voterinfo` is the only candidate and I could not verify it without a key. Test it first; it decides the federal architecture.
2. The VISION success criterion "Federal contests 100% correct (verified against FEC)" is not achievable from FEC data alone. FEC has no ballot-qualification or primary-result data and mislabels retiring incumbents as `I`.
3. State legislative candidates, local contests, and measure summaries outside a handful of states require paid data (Ballotpedia / BallotReady / Democracy Works) or manual curation.
4. Several official sources (ohiosos.gov, vote.gov, ballotpedia.org) block scripted requests, which limits automated freshness checks.
