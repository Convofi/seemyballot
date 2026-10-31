// States with a U.S. Senate election on 2026-11-03.
// 33 Class 2 seats (regular) + 2 Class 3 special elections (OH: Vance seat,
// FL: Rubio seat). No state has both a regular and a special race in 2026.
// Verified 2026-10-31 against Wikipedia "2026 United States Senate elections"
// (35 seats). Oklahoma's Mullin seat is Class 2, so the regular race covers it.
export type SenateRaceKind = "regular" | "special";

export const SENATE_2026_STATES: Readonly<Record<string, SenateRaceKind>> = {
  AL: "regular",
  AK: "regular",
  AR: "regular",
  CO: "regular",
  DE: "regular",
  FL: "special",
  GA: "regular",
  ID: "regular",
  IL: "regular",
  IA: "regular",
  KS: "regular",
  KY: "regular",
  LA: "regular",
  ME: "regular",
  MA: "regular",
  MI: "regular",
  MN: "regular",
  MS: "regular",
  MT: "regular",
  NE: "regular",
  NH: "regular",
  NJ: "regular",
  NM: "regular",
  NC: "regular",
  OH: "special",
  OK: "regular",
  OR: "regular",
  RI: "regular",
  SC: "regular",
  SD: "regular",
  TN: "regular",
  TX: "regular",
  VA: "regular",
  WV: "regular",
  WY: "regular",
};
