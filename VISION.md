# BallotHelper — Vision & v0 Spec

## The one sentence
Type your address. See exactly what's on your ballot. Understand every choice in under 60 seconds.

## First principles
1. **Truth over coverage.** Never show a contest or candidate we can't source. Show "we don't have this yet, here's your county's official sample ballot" instead. A wrong ballot is worse than no ballot.
2. **Zero friction.** No accounts. No app install. No email capture. One text box. Works on a phone in a parking lot.
3. **Neutral by construction.** Facts, sources, and the candidates' own words. No endorsements, no scoring, no "lean". Every claim links to its source.
4. **Delete everything else.** No feed, no social, no gamification, no reminders, no chat. If it doesn't help someone fill in a bubble, it's out.

## v0 scope (ship this, nothing more)
1. Address input → geocode → districts (state, congressional, state senate, state house, county, place).
2. Contests for those districts, in ballot order where possible:
   - Federal: US Senate, US House (FEC data — real, free, authoritative for who's running).
   - State / local / measures: best available verified source per state (see data spike). If none, show the official county sample-ballot link.
3. Per candidate: name, party, incumbent flag, official campaign site, 2-3 sentence neutral summary **with a source link** on every sentence.
4. Per measure: official title, "A YES vote means…", "A NO vote means…", source link.
5. "How to vote" footer: polling place lookup link (state election site), election date, ID requirements link.
6. Honest gaps: every section renders a clear "not available for your area yet" state with the official fallback link.

## Non-goals for v0
Voter registration, reminders, candidate comparison matrices, user accounts, saving ballots, sharing, i18n, dark patterns of any kind.

## Stack
Next.js (App Router, TypeScript), Tailwind, deployed on Vercel. No database in v0 — cache API responses with the Vercel runtime cache or in-memory. Add storage only when a real need appears.

## Success criteria
- A real address in any of the 50 states returns correct districts in < 2s.
- Federal contests show every active FEC-registered 2026 candidate for the voter's seat, clearly labeled as "filed with the FEC, confirm on your official ballot". Never a guessed or omitted major candidate.
- Any contest we can't source shows the fallback, never a guess.
- Lighthouse mobile performance > 90.
