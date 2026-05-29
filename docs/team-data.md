# Team Data — League Profiles

This file is the canonical, human-readable reference for each League club's identity. Each profile summarises a team's playing style, signature gameplay features, and core DNA in 4–5 lines, with a suggested mapping to the in-game `TeamTactics` dimensions, a hint on which player stats should be biased for that club's character, and the 2025-26 senior first-team squad.

The simulator ships all 10 League clubs. This file is the source of truth for team identity, stars, and rosters — `scripts/generateTeamJsons.mjs` parses it to produce the `src/data/team-*.json` files the engine loads.

**Squad data note:** Squad lists are compiled from public sources (club websites, Wikipedia, Ultimate Rugby, RugbyPass) as of May 2026. Coverage is best-effort: DOBs and ages are filled where available, blank where not. The data has not been manually validated against current club rosters — see "Data notes" at the bottom of this file for known caveats (likely transfer artifacts, duplicate listings, possible retirees).

Related docs: see `CLAUDE.md` "Tactics system" for tactic-effect mechanics, `docs/match-engine.md` "Carry Phases" for how tactics shape match outcomes, and `src/types/team.ts` for the authoritative `TeamTactics` definition.

---

## Legend

**`TeamTactics` dimensions** (from `src/types/team.ts`):

| Dimension | Values |
|---|---|
| `attackingGamePlan` | `possession` · `balanced` · `kicking` |
| `attackingStyle` | `keep_it_tight` · `balanced` · `wide_wide` |
| `attackingBreakdown` | `commit_numbers` · `balanced` · `minimal_ruck` |
| `defendingBreakdown` | `jackal` · `counter_ruck` · `shadow` |
| `backfieldDefence` | `one_back` · `two_back` · `three_back` |
| `defensiveLine` | `blitz` · `hybrid` · `drift` |
| `offloadStrategy` | `cautious` · `balanced` · `offload_freely` |

**Player base stats** (12 fields, 0–100 scale, from `src/data/team-*.json`):
`stamina · strength · pace · agility · handling · tackling · breakdown · kicking · setPiece · discipline · positioning · composure`
*(Note: These 12 attributes are now authored manually in the right-most columns of the squad tables below. The compiler scripts parse these values exactly as typed).*

**Star-player annotations** — appended to a `### Star players` line. `Marquee: yes.` designates the cap-excluded marquee slot (one per club; the contract seeder reads the flag and the in-game Contracts screen surfaces it). `Wage: £1m.` / `Wage: £550k.` is an optional explicit wage override — used to land hand-tuned marquee figures above what the `WAGE_BY_RATING × POSITION_SCARCITY × WAGE_NOISE` seeder formula would produce. Omitted ⇒ the seeder computes the wage. Both annotations are parsed by `scripts/generateTeamJsons.mjs` into the player's JSON `contract` block; `contractSeeder` honours `annualWage` verbatim when present.

**Squad tiers** — each club's `### Squad (2025-26)` section is split into five sub-tables:

| Sub-table | Contract role | Engine slot |
|---|---|---|
| `**Starting XV — Forwards**` | First Team (forwards) | jerseys 1-8 |
| `**Starting XV — Backs**` | First Team (backs) | jerseys 9-15 |
| `**Bench**` | Matchday subs | jerseys 16-23 |
| `**Wider squad — Forwards**` | Senior squad (forwards) | jersey 24+ |
| `**Wider squad — Backs**` | Senior squad (backs) | jersey 24+ |

The tier a player sits in **is** their authored role. `scripts/generateTeamJsons.mjs` reads these tables directly and assigns jerseys by position within each tier (e.g. the two locks in `Starting XV — Forwards` get jerseys 4 and 5 in row order). Every player named in `### Star players` must appear in the Starting XV tables — the generator hard-errors otherwise. Counts must match exactly (15 Starting XV + 8 Bench); the generator throws on mismatch.

To re-assign a player's tier, move their row between sub-tables. To swap two starters' jerseys within a position group, swap their row order in the table.

**Club colours** — each team carries a primary and secondary hex on the `Club colours:` line in its profile. These are the source of truth for `color` / `secondaryColor` in the generated `team-*.json` files; `scripts/generateTeamJsons.mjs` parses them directly from this file.

**Team rating formula** — each team carries an `Overall rating` derived from real-world league performance:

```
seasonScore   = (leaguePoints / matchesPlayed) / 5.0 × 100
overallRating = round( 0.6 × seasonScore_25_26 + 0.4 × seasonScore_24_25 )
```

League ppm has a realistic ceiling of ~5.0 (win + try bonus). The 60/40 blend leans on the current season while still respecting prior-season form. Snapshot inputs and the per-team math are documented in "Rating inputs" at the bottom of this file.
*(Note: `Overall rating`, `Stat bias`, and star-player `Index high` were previously used to procedurally generate stats. They are now retained purely for flavor and reference, as all stats are manually authored).*

---

## Gloucester

- **Home ground:** Kingsholm Stadium (the famous "Shed" terrace).
- **Club colours:** `#c8102e` / `#ffffff`
- **Nickname:** Cherry & Whites.
- **Founded:** 1873.
- **Stadium capacity:** 16,115.
- **Head coach:** George Skivington (Head Coach; returned to the role March 2026 after serving as Director of Rugby from September 2023, having previously been Head Coach from 2020).
- **Captain:** Tomos Williams (2025-26; confirmed in December 2025 to be joining Saracens at season's end).
- **Honours:** RFU Cup × 4 (1971-72, 1977-78, 1981-82, 2002-03); European Challenge Cup 2005-06, 2014-15.
- **Overall rating:** **67/100**
- **Suggested tactics:** `balanced` · `keep_it_tight` · `commit_numbers` · `counter_ruck` · `one_back` · `drift` · `cautious`
- **Stat bias:** high `strength`, `breakdown`, `setPiece`.

### Star players

- **Ross Byrne** (Fly-half, Ireland) — Headline signing from Leinster and the province's third all-time top points scorer (1,156 pts), bringing four URC titles and a Champions Cup pedigree to Kingsholm as the new tactical conductor. Index high: `kicking`, `composure`, `positioning`, `discipline`, `handling`. Suggested rating: **86/100**.
- **Tomos Williams** (Scrum-half, Wales) — Gloucester's 2025-26 club captain and reigning Rugby Player of the Season; 69-cap Wales 9 and 2025 Lions tourist who scored twice against the Western Force in Perth before a hamstring injury cut his tour short. A sniping running threat, sharp service and tempo control from the base — confirmed in December 2025 to be joining Saracens at season's end. Index high: `pace`, `agility`, `handling`, `composure`, `positioning`. Suggested rating: **87/100**. Marquee: yes. Wage: £550k.
- **Max Llewellyn** (Centre, Wales) — Big-bodied 13 who broke into the Wales midfield during the 2025 Six Nations (scored his first Test try vs Scotland) and gives Gloucester a power-runner gainline option through the middle channel. Index high: `strength`, `tackling`, `handling`, `pace`. Suggested rating: **82/100**.
- **Lewis Ludlow** (Flanker, England) — Former long-serving Gloucester captain and England A skipper; relentless openside whose breakdown work-rate and tackle volume have anchored the cherry-and-whites' defensive identity for years. Index high: `breakdown`, `tackling`, `stamina`, `discipline`, `positioning`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Val Rapava-Ruskin | Prop | 1992-12-12 | 33 | Georgia | 70 | 81 | 52 | 57 | 59 | 79 | 75 | 43 | 92 | 70 | 70 | 65 |
| Seb Blake | Hooker | 2002-06-23 | 23 | England | 67 | 76 | 57 | 65 | 64 | 72 | 75 | 52 | 85 | 70 | 70 | 70 |
| Afolabi Fasogbon | Prop | 2003-12-17 | 22 | Ireland | 66 | 79 | 53 | 60 | 60 | 74 | 75 | 49 | 92 | 65 | 63 | 70 |
| Hugh Bokenham | Lock | 2001-07-20 | 24 | England | 66 | 77 | 56 | 61 | 60 | 76 | 74 | 45 | 90 | 67 | 68 | 65 |
| Arthur Clark | Lock | 1999-09-24 | 26 | England | 66 | 77 | 60 | 60 | 61 | 75 | 74 | 46 | 91 | 68 | 70 | 70 |
| Lewis Ludlow | Flanker | 1994-12-19 | 31 | England | 82 | 74 | 67 | 71 | 69 | 82 | 84 | 57 | 72 | 83 | 83 | 67 |
| Josh Basham | Flanker | 1999-08-08 | 26 | England | 72 | 78 | 69 | 71 | 68 | 79 | 83 | 55 | 78 | 71 | 74 | 69 |
| Jack Mann | Back Row | 1999-01-30 | 27 | England | 71 | 76 | 64 | 73 | 65 | 72 | 79 | 57 | 71 | 67 | 68 | 64 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tomos Williams | Scrum-half | 1994-10-25 | 31 | Wales | 67 | 63 | 86 | 86 | 89 | 69 | 66 | 72 | 56 | 69 | 87 | 86 |
| Ross Byrne | Fly-half | 1995-03-29 | 31 | Ireland | 68 | 62 | 69 | 73 | 87 | 63 | 64 | 84 | 59 | 86 | 88 | 85 |
| Will Joseph | Wing | 2003-02-04 | 23 | England | 69 | 64 | 79 | 79 | 71 | 66 | 63 | 63 | 60 | 64 | 66 | 67 |
| Max Llewellyn | Centre | 1997-09-04 | 28 | Wales | 68 | 83 | 81 | 71 | 83 | 84 | 67 | 67 | 61 | 68 | 68 | 71 |
| Seb Atkinson | Centre | 2001-08-27 | 24 | England | 67 | 78 | 71 | 68 | 76 | 75 | 73 | 67 | 59 | 67 | 73 | 65 |
| Ben Loader | Wing | 1999-01-24 | 27 | England | 65 | 64 | 84 | 78 | 75 | 62 | 64 | 68 | 54 | 69 | 68 | 65 |
| George Barton | Utility Back | 1999-09-04 | 26 | England | 70 | 71 | 67 | 68 | 72 | 68 | 71 | 69 | 69 | 64 | 71 | 72 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jack Innard | Hooker | 2001-04-13 | 25 | England | 68 | 75 | 58 | 62 | 75 | 75 | 76 | 51 | 87 | 67 | 68 | 68 |
| Jamal Ford-Robinson | Prop | 1993-04-23 | 33 | England | 75 | 85 | 52 | 60 | 61 | 75 | 75 | 45 | 87 | 63 | 69 | 67 |
| Kirill Gotovtsev | Prop | 1987-07-17 | 38 | Russia | 75 | 81 | 49 | 54 | 62 | 75 | 75 | 43 | 92 | 66 | 64 | 68 |
| Danny Eite | Lock | 2003-06-28 | 22 | England | 75 | 82 | 58 | 61 | 63 | 77 | 75 | 46 | 88 | 69 | 66 | 64 |
| James Venter | Flanker | 1995-12-28 | 30 | South Africa | 75 | 77 | 68 | 65 | 69 | 75 | 81 | 57 | 74 | 65 | 75 | 66 |
| Mike Austin | Scrum-half | 2000-11-30 | 25 | England | 68 | 69 | 75 | 75 | 75 | 70 | 68 | 75 | 61 | 69 | 75 | 75 |
| Charlie Atkinson | Fly-half | 2001-04-08 | 25 | England | 65 | 61 | 73 | 71 | 75 | 63 | 64 | 88 | 64 | 75 | 75 | 75 |
| Ben Redshaw | Full-back | 2005-01-10 | 21 | England | 68 | 66 | 77 | 72 | 75 | 69 | 70 | 75 | 60 | 67 | 76 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Archie McArthur | Prop | 2003-06-11 | 22 | Scotland | 77 | 81 | 49 | 53 | 57 | 77 | 77 | 44 | 89 | 71 | 68 | 69 |
| Cameron Jordan | Lock | 1996-05-23 | 30 | England | 77 | 82 | 56 | 59 | 58 | 77 | 77 | 47 | 86 | 65 | 66 | 71 |
| Ciaran Knight | Prop | 1995-08-30 | 30 | England | 77 | 83 | 52 | 57 | 56 | 77 | 77 | 47 | 92 | 65 | 67 | 71 |
| Freddie Thomas | Lock | 1999-07-22 | 26 | England | 77 | 82 | 59 | 59 | 61 | 77 | 77 | 48 | 91 | 71 | 66 | 65 |
| Harry Taylor | Back Row | 2002-01-15 | 24 | England | 77 | 77 | 67 | 66 | 69 | 77 | 80 | 61 | 76 | 67 | 77 | 67 |
| Jack Clement | Back Row | 2001-04-04 | 25 | England | 77 | 79 | 68 | 67 | 71 | 77 | 80 | 59 | 75 | 65 | 77 | 68 |
| Jack Singleton | Hooker | 1996-08-07 | 29 | England | 71 | 77 | 60 | 66 | 77 | 77 | 78 | 50 | 82 | 68 | 72 | 65 |
| Nepo Laulala | Prop | 1991-10-29 | 34 | New Zealand | 77 | 86 | 49 | 58 | 58 | 78 | 77 | 45 | 87 | 70 | 69 | 69 |
| Jono Benz-Salomon | Prop | 2001-03-17 | 25 | England | 77 | 85 | 51 | 58 | 62 | 77 | 77 | 48 | 88 | 68 | 71 | 70 |
| Will Trenholm | Back Row | 2001-01-06 | 25 | England | 77 | 77 | 64 | 68 | 65 | 77 | 80 | 57 | 74 | 65 | 77 | 65 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Caolan Englefield | Scrum-half | 2000-04-15 | 26 | England | 68 | 63 | 79 | 77 | 77 | 66 | 73 | 77 | 57 | 72 | 77 | 77 |
| Jake Morris | Wing | 2002-05-10 | 24 | England | 68 | 66 | 81 | 81 | 77 | 65 | 61 | 66 | 58 | 66 | 77 | 77 |
| Ollie Thorley | Wing | 1996-08-23 | 29 | England | 65 | 68 | 79 | 83 | 77 | 67 | 62 | 63 | 56 | 68 | 77 | 77 |
| Rob Russell | Wing | 1998-12-04 | 27 | Ireland | 71 | 63 | 83 | 81 | 77 | 68 | 62 | 63 | 58 | 65 | 77 | 77 |
| Will Butler | Centre | 1998-04-17 | 28 | England | 71 | 78 | 77 | 77 | 77 | 77 | 69 | 66 | 63 | 71 | 77 | 71 |
| Josh Hathaway | Wing | 2003-09-04 | 22 | England | 69 | 65 | 83 | 77 | 77 | 67 | 65 | 67 | 59 | 65 | 77 | 77 |

---

## Bristol Bears

- **Home ground:** Ashton Gate.
- **Club colours:** `#003087` / `#c8102e`
- **Nickname:** The Bears (rebranded from Bristol in 2018).
- **Founded:** 1888.
- **Stadium capacity:** 27,000 (shared with Bristol City FC).
- **Head coach:** Pat Lam (Director of Rugby since 2017).
- **Captain:** Fitz Harding (long-term extension signed 2023-24).
- **Honours:** European Challenge Cup 2019-20; RFU Knockout Cup 1982-83; Championship title 2017-18.
- **Overall rating:** **73/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `two_back` · `drift` · `offload_freely`
- **Stat bias:** high `pace`, `handling`, `agility`.

### Star players

- **Ellis Genge** (Prop, England) — Lions Test starter on the 2025 tour to Australia and dubbed the "form player in the world" by Ben Youngs; world-class loosehead scrummager and Bristol's vice-captain whose ball-carrying sets the tempo. Index high: `strength`, `setPiece`, `breakdown`, `tackling`, `stamina`. Suggested rating: **91/100**.
- **Louis Rees-Zammit** (Wing, Wales) — Returned from the NFL in summer 2025 and lit up the PREM with six tries in eight, clocking 23.57mph against Leicester; 32-cap Wales finisher with elite top-end pace and a 2021 Lions tourist's pedigree. Index high: `pace`, `agility`, `handling`, `positioning`. Suggested rating: **88/100**. Marquee: yes. Wage: £550k.
- **Viliame Mata** (Number 8, Fiji) — Long-time Edinburgh enforcer turned Bristol No.8; offloading, ball-playing back-rower whose footwork and tip-on game perfectly fit Pat Lam's wide-wide system. Index high: `strength`, `handling`, `breakdown`, `agility`, `stamina`. Suggested rating: **85/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ellis Genge | Prop | 1995-02-22 | 31 | England | 93 | 92 | 55 | 56 | 60 | 92 | 91 | 50 | 90 | 67 | 70 | 66 |
| Gabriel Oghre | Hooker | 1998-11-21 | 27 | England | 70 | 75 | 63 | 65 | 66 | 79 | 74 | 50 | 83 | 70 | 71 | 65 |
| George Kloska | Prop | 2002-02-11 | 24 | England | 72 | 82 | 57 | 62 | 64 | 76 | 72 | 52 | 90 | 69 | 65 | 73 |
| Joe Owen | Lock | 2003-01-23 | 23 | England | 69 | 76 | 59 | 65 | 68 | 76 | 73 | 54 | 83 | 68 | 69 | 70 |
| Joe Batley | Lock | 1996-09-06 | 29 | England | 67 | 80 | 62 | 64 | 71 | 75 | 71 | 55 | 86 | 73 | 72 | 73 |
| Fitz Harding | Flanker | 1997-11-29 | 28 | England | 71 | 74 | 72 | 71 | 69 | 78 | 85 | 57 | 76 | 71 | 70 | 72 |
| Luka Ivanishvili | Flanker | 1999-12-12 | 26 | Georgia | 72 | 78 | 74 | 74 | 72 | 75 | 78 | 59 | 76 | 68 | 73 | 70 |
| Viliame Mata | Number 8 | 1991-04-15 | 35 | Fiji | 85 | 85 | 70 | 84 | 83 | 75 | 84 | 60 | 72 | 67 | 70 | 71 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Harry Randall | Scrum-half | 1997-10-29 | 28 | England | 69 | 61 | 79 | 77 | 76 | 68 | 71 | 77 | 59 | 74 | 76 | 73 |
| Tom Jordan | Fly-half | 1998-08-19 | 27 | Scotland | 65 | 64 | 79 | 72 | 84 | 68 | 67 | 84 | 58 | 75 | 74 | 79 |
| Gabriel Ibitoye | Wing | 1998-04-26 | 28 | England | 72 | 63 | 86 | 87 | 78 | 64 | 64 | 65 | 59 | 66 | 70 | 65 |
| Sam Bedlow | Centre | 1995-08-08 | 30 | England | 71 | 73 | 82 | 74 | 74 | 70 | 66 | 71 | 60 | 65 | 70 | 70 |
| Benhard Janse van Rensburg | Centre | 1994-02-09 | 32 | South Africa | 72 | 73 | 79 | 81 | 76 | 71 | 67 | 64 | 63 | 67 | 71 | 75 |
| Kalaveti Ravouvou | Wing | 1996-03-30 | 30 | Fiji | 65 | 68 | 88 | 81 | 80 | 69 | 66 | 69 | 53 | 65 | 72 | 66 |
| Louis Rees-Zammit | Wing / Full Back | 2001-02-02 | 25 | Wales | 67 | 65 | 90 | 88 | 87 | 74 | 67 | 74 | 58 | 71 | 86 | 74 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Harry Thacker | Hooker | 1994-04-22 | 32 | England | 67 | 75 | 65 | 67 | 75 | 75 | 76 | 57 | 83 | 67 | 68 | 65 |
| Max Lahiff | Prop | 1989-09-24 | 36 | England | 75 | 80 | 54 | 65 | 65 | 75 | 75 | 50 | 89 | 72 | 68 | 70 |
| Sam Grahamslaw | Prop | 1999-08-04 | 26 | Scotland | 75 | 81 | 61 | 65 | 62 | 77 | 75 | 48 | 85 | 67 | 67 | 67 |
| Steele Barker | Lock | 2001-01-12 | 25 | England | 75 | 77 | 64 | 67 | 71 | 78 | 75 | 51 | 83 | 72 | 75 | 70 |
| Santiago Grondona | Number 8 | 1999-04-15 | 27 | Argentina | 75 | 81 | 76 | 73 | 77 | 75 | 81 | 60 | 75 | 68 | 70 | 68 |
| Kieran Marmion | Scrum-half | 1992-05-29 | 33 | Ireland | 67 | 66 | 83 | 78 | 79 | 65 | 68 | 75 | 59 | 67 | 75 | 77 |
| AJ MacGinty | Fly-half | 1989-12-07 | 36 | USA | 71 | 68 | 75 | 72 | 78 | 65 | 63 | 83 | 59 | 75 | 75 | 75 |
| Josh Carrington | Wing | 2002-04-25 | 24 | England | 72 | 64 | 85 | 81 | 78 | 71 | 66 | 66 | 56 | 71 | 75 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Will Capon | Hooker | 1997-09-01 | 28 | England | 66 | 77 | 63 | 66 | 77 | 77 | 77 | 50 | 81 | 66 | 72 | 71 |
| Lovejoy Chawatama | Prop | 1991-12-30 | 34 | England | 77 | 77 | 54 | 63 | 63 | 77 | 77 | 48 | 84 | 69 | 71 | 66 |
| Tomas Gwilliam | Hooker | 2002-11-19 | 23 | Wales | 70 | 77 | 63 | 69 | 77 | 77 | 77 | 51 | 86 | 72 | 74 | 70 |
| Jimmy Halliwell | Prop | 2004-03-31 | 22 | England | 77 | 85 | 57 | 66 | 66 | 78 | 77 | 47 | 87 | 69 | 70 | 66 |
| Paddy Pearce | Flanker | 2004-05-07 | 22 | England | 77 | 77 | 68 | 77 | 71 | 77 | 79 | 60 | 70 | 72 | 77 | 73 |
| Pedro Rubiolo | Lock | 2002-03-15 | 24 | Argentina | 77 | 78 | 62 | 60 | 65 | 77 | 77 | 49 | 89 | 70 | 70 | 70 |
| Jake Heenan | Flanker | 1992-04-09 | 34 | Ireland | 77 | 77 | 73 | 77 | 69 | 78 | 81 | 62 | 73 | 68 | 77 | 73 |
| Steven Luatua | Flanker | 1991-06-10 | 34 | New Zealand | 77 | 77 | 67 | 76 | 69 | 83 | 82 | 61 | 77 | 68 | 77 | 70 |
| Will Ramply | Lock | 2004-05-25 | 22 | England | 77 | 77 | 64 | 68 | 63 | 77 | 77 | 49 | 87 | 66 | 73 | 68 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| James Williams | Centre | 1998-08-04 | 27 | England | 68 | 77 | 78 | 79 | 77 | 78 | 69 | 63 | 65 | 72 | 77 | 73 |
| Joe Jenkins | Centre | 2003-10-13 | 22 | England | 72 | 77 | 77 | 77 | 77 | 77 | 72 | 71 | 60 | 67 | 77 | 74 |
| Jack Bates | Wing | 2001-09-21 | 24 | England | 70 | 69 | 86 | 84 | 77 | 65 | 63 | 64 | 60 | 72 | 77 | 77 |
| Rich Lane | Full-back | 1994-12-22 | 31 | England | 65 | 70 | 83 | 84 | 79 | 69 | 65 | 77 | 56 | 68 | 80 | 77 |
| Sam Wolstenholme | Scrum-half | 2001-04-19 | 25 | England | 68 | 61 | 83 | 77 | 78 | 67 | 68 | 78 | 55 | 75 | 77 | 77 |
| Max Pepper | Scrum-half | 2001-01-09 | 25 | England | 65 | 67 | 77 | 79 | 77 | 67 | 71 | 77 | 62 | 72 | 77 | 77 |
| Noah Heward | Full-back | 2002-03-30 | 24 | England | 70 | 67 | 79 | 79 | 81 | 76 | 65 | 77 | 59 | 72 | 77 | 77 |

---

## Leicester Tigers

- **Home ground:** Welford Road.
- **Club colours:** `#1c5e3f` / `#ffffff`
- **Nickname:** Tigers.
- **Founded:** 1880.
- **Stadium capacity:** 25,849 (the largest club-owned rugby ground in England).
- **Head coach:** Geoff Parling (Head Coach since August 2025, succeeding Michael Cheika).
- **Captain:** Ollie Chessum (appointed September 2025).
- **Honours:** 11 × English league title (latest 2021-22, most in the modern era); 2 × European Champions Cup (2000-01, 2001-02); Anglo-Welsh Cup × 6.
- **Overall rating:** **77/100**
- **Suggested tactics:** `kicking` · `keep_it_tight` · `commit_numbers` · `jackal` · `two_back` · `hybrid` · `cautious`
- **Stat bias:** high `setPiece`, `tackling`, `discipline`.

### Star players

- **Freddie Steward** (Full-back, England) — England's first-choice 15 and the league's most dominant aerial operator; reads kick-chase lanes better than anyone and rarely spills under the high ball. Index high: `positioning`, `handling`, `tackling`, `composure`, `kicking`. Suggested rating: **82/100**.
- **Ollie Chessum** (Lock, England) — 2025 Lions Test 2 starter (off the bench in Tests 1 and 3) and the league's most athletic lock-cum-blindside; carries hard, hits rucks at pace, and is a genuine lineout option in both pods. Index high: `strength`, `setPiece`, `stamina`, `tackling`, `breakdown`. Suggested rating: **87/100**. Marquee: yes. Wage: £550k.
- **Tommy Reffell** (Flanker, Wales) — Wales' premier openside and arguably the league's purest jackal; averaged 6-7 turnovers a game in patches and topped the July Tests for forced turnovers. Index high: `breakdown`, `tackling`, `stamina`, `discipline`, `positioning`. Suggested rating: **84/100**.
- **Jack van Poortvliet** (Scrum-half, England) — England-capped 9 whose box-kick accuracy and pass speed fit Welford Road's territory-first identity; a sharp tactical kicker who controls the tempo from the base. Index high: `kicking`, `handling`, `positioning`, `composure`, `agility`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nicky Smith | Prop | 1994-04-07 | 32 | Wales | 72 | 86 | 55 | 58 | 62 | 85 | 75 | 54 | 89 | 70 | 74 | 75 |
| Jamie Blamire | Hooker | 1997-12-22 | 28 | England | 70 | 73 | 59 | 65 | 68 | 79 | 80 | 55 | 85 | 74 | 74 | 73 |
| Joe Heyes | Prop | 1999-04-13 | 27 | England | 68 | 82 | 59 | 60 | 59 | 82 | 74 | 51 | 90 | 74 | 73 | 75 |
| Ollie Chessum | Lock | 2000-09-06 | 25 | England | 85 | 87 | 59 | 65 | 67 | 87 | 87 | 52 | 87 | 70 | 74 | 71 |
| George Martin | Lock | 2001-06-18 | 24 | England | 71 | 80 | 57 | 65 | 69 | 80 | 76 | 51 | 94 | 74 | 72 | 75 |
| Tommy Reffell | Flanker | 1999-04-27 | 27 | Wales | 84 | 77 | 67 | 76 | 67 | 83 | 85 | 64 | 77 | 85 | 83 | 71 |
| Hanro Liebenberg | Back Row | 1995-10-10 | 30 | South Africa | 77 | 80 | 71 | 76 | 73 | 82 | 79 | 63 | 75 | 73 | 76 | 74 |
| Emeka Ilione | Back Row | 2002-03-20 | 24 | England | 73 | 78 | 68 | 69 | 69 | 80 | 81 | 61 | 75 | 76 | 77 | 73 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jack van Poortvliet | Scrum-half | 2001-05-15 | 25 | England | 70 | 64 | 80 | 85 | 82 | 70 | 72 | 82 | 60 | 75 | 85 | 82 |
| Billy Searle | Fly-half | 1996-03-25 | 30 | England | 73 | 67 | 77 | 71 | 78 | 74 | 66 | 87 | 60 | 80 | 79 | 82 |
| Adam Radwan | Wing | 1997-12-30 | 28 | England | 74 | 69 | 89 | 84 | 73 | 71 | 66 | 66 | 62 | 73 | 76 | 71 |
| Orlando Bailey | Centre | 2001-09-30 | 24 | England | 74 | 76 | 78 | 75 | 74 | 78 | 75 | 66 | 63 | 70 | 75 | 75 |
| Solomone Kata | Centre | 1994-12-03 | 31 | Tonga | 70 | 72 | 79 | 78 | 73 | 79 | 72 | 66 | 63 | 75 | 75 | 69 |
| Ollie Hassell-Collins | Wing | 1999-01-17 | 27 | England | 73 | 69 | 87 | 86 | 78 | 73 | 64 | 69 | 64 | 75 | 76 | 68 |
| Freddie Steward | Full-back | 2000-12-05 | 25 | England | 71 | 71 | 76 | 77 | 84 | 83 | 66 | 83 | 60 | 72 | 82 | 81 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Charlie Clare | Hooker | 1991-12-16 | 34 | England | 72 | 75 | 60 | 66 | 75 | 79 | 81 | 52 | 93 | 72 | 72 | 74 |
| Tarek Haffar | Prop | 2001-09-13 | 24 | England | 75 | 84 | 58 | 59 | 63 | 86 | 75 | 49 | 89 | 75 | 71 | 74 |
| Will Hurd | Prop | 1999-06-29 | 26 | Scotland | 75 | 82 | 56 | 64 | 66 | 80 | 76 | 51 | 89 | 70 | 72 | 70 |
| Cam Henderson | Lock | 2000-01-13 | 26 | Scotland | 75 | 80 | 63 | 63 | 65 | 76 | 75 | 53 | 89 | 76 | 75 | 69 |
| Olly Cracknell | Flanker | 1994-05-26 | 31 | Wales | 75 | 77 | 73 | 72 | 73 | 81 | 80 | 59 | 81 | 75 | 78 | 73 |
| Ollie Allan | Scrum-half | 2004-02-04 | 22 | England | 67 | 68 | 78 | 80 | 80 | 72 | 71 | 78 | 63 | 74 | 79 | 76 |
| James O'Connor | Fly-half | 1990-07-05 | 35 | Australia | 68 | 68 | 73 | 74 | 80 | 75 | 64 | 86 | 65 | 78 | 75 | 81 |
| Izaia Perese | Centre | 1997-05-17 | 28 | Australia | 69 | 78 | 77 | 79 | 78 | 77 | 67 | 72 | 66 | 74 | 75 | 69 |


**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ale Loman | Prop | 2000-05-15 | 26 | Sweden | 77 | 85 | 55 | 64 | 61 | 85 | 78 | 47 | 94 | 78 | 67 | 67 |
| Archie van der Flier | Prop | 2002-04-25 | 24 | England | 77 | 81 | 56 | 65 | 59 | 81 | 78 | 48 | 89 | 77 | 70 | 67 |
| Cameron Miell | Prop | 2004-05-09 | 22 | South Africa | 77 | 79 | 57 | 58 | 62 | 83 | 80 | 54 | 95 | 71 | 68 | 69 |
| Finn Carnduff | Flanker | 2004-03-10 | 22 | England | 77 | 77 | 68 | 76 | 73 | 85 | 83 | 59 | 80 | 72 | 77 | 70 |
| George Marsh | Back Row |  | 19 | England | 79 | 78 | 73 | 71 | 72 | 81 | 78 | 59 | 77 | 72 | 77 | 68 |
| Lewis Chessum | Lock | 2003-02-27 | 23 | England | 77 | 83 | 61 | 62 | 69 | 80 | 77 | 56 | 89 | 77 | 76 | 71 |
| Harry Palmer | Lock | 2005-10-28 | 20 | England | 77 | 81 | 64 | 65 | 62 | 79 | 77 | 54 | 88 | 75 | 76 | 69 |
| Harry Wells | Lock | 1993-09-29 | 32 | England | 77 | 77 | 58 | 61 | 68 | 77 | 77 | 50 | 91 | 73 | 75 | 72 |
| James Thompson | Lock | 1999-07-13 | 26 | New Zealand | 77 | 77 | 64 | 62 | 64 | 77 | 77 | 54 | 94 | 76 | 73 | 73 |
| Joaquin Moro | Flanker | 2001-01-24 | 25 | Argentina | 77 | 81 | 72 | 71 | 72 | 83 | 86 | 59 | 74 | 74 | 78 | 71 |
| John Stewart | Hooker | 2002-03-08 | 24 | England | 69 | 80 | 62 | 65 | 77 | 79 | 77 | 52 | 93 | 72 | 77 | 67 |
| Joshua Manz | Back Row | 2004-03-22 | 22 | England | 77 | 77 | 68 | 70 | 69 | 85 | 84 | 60 | 81 | 71 | 77 | 71 |
| Diamond Ayiehfor | Prop |  | 19 | England | 77 | 80 | 55 | 62 | 59 | 80 | 77 | 53 | 94 | 74 | 70 | 73 |
| Osian Thomas | Lock | 2004-11-30 | 21 | Wales | 77 | 78 | 58 | 65 | 68 | 77 | 77 | 50 | 94 | 76 | 70 | 72 |
| Tom Manz | Lock | 2001-07-09 | 24 | England | 77 | 83 | 57 | 65 | 63 | 83 | 77 | 54 | 95 | 74 | 74 | 72 |
| Tonga Kofe | Prop |  | 29 | USA | 77 | 85 | 52 | 59 | 61 | 86 | 77 | 53 | 89 | 74 | 71 | 72 |
| Tubuna Maka | Prop | 2005-11-18 | 20 | Fiji | 77 | 85 | 60 | 63 | 61 | 79 | 77 | 50 | 94 | 70 | 74 | 74 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Wilf McCarthy | Centre | 2002-10-08 | 23 | England | 77 | 77 | 78 | 77 | 77 | 79 | 75 | 67 | 69 | 73 | 77 | 71 |
| Charlie Titcombe | Fly-half | 2001-12-28 | 24 | England | 74 | 70 | 70 | 71 | 77 | 74 | 71 | 89 | 60 | 77 | 77 | 77 |
| Joseph Woodward | Centre | 2003-09-17 | 22 | England | 69 | 77 | 77 | 77 | 77 | 78 | 72 | 65 | 65 | 78 | 77 | 76 |
| Tom Whiteley | Scrum-half | 1995-12-17 | 30 | England | 67 | 63 | 81 | 78 | 77 | 73 | 76 | 77 | 61 | 76 | 77 | 77 |
| Will Wand | Centre | 2001-12-31 | 24 | England | 74 | 77 | 77 | 77 | 78 | 82 | 72 | 66 | 64 | 74 | 77 | 76 |
| Gabriel Hamer-Webb | Wing | 2000-11-07 | 25 | England | 67 | 67 | 89 | 82 | 77 | 72 | 67 | 67 | 62 | 76 | 77 | 77 |

---

## Saracens

- **Home ground:** Barnet Copthall Stadium.
- **Club colours:** `#000000` / `#a01018`
- **Nickname:** Sarries (the "Wolfpack" defensive identity).
- **Founded:** 1876.
- **Stadium capacity:** 10,500.
- **Head coach:** Mark McCall (Director of Rugby since 2010; stepping down end of 2025-26, with Brendan Venter to take over for 2026-27).
- **Captain:** Maro Itoje.
- **Honours:** 6 × league title (latest 2022-23); 3 × European Champions Cup (2015-16, 2016-17, 2018-19).
- **Overall rating:** **74/100**
- **Suggested tactics:** `kicking` · `balanced` · `balanced` · `jackal` · `two_back` · `blitz` · `cautious`
- **Stat bias:** high `tackling`, `positioning`, `composure`.

### Star players

- **Maro Itoje** (Lock, England) — 2025 Lions captain and the first Black skipper in the tour's 137-year history; ran a lineout "clinic" in the series win and remains the gold standard for a modern second row — enforcer, jumper, leader. Index high: `setPiece`, `tackling`, `strength`, `breakdown`, `composure`. Suggested rating: **92/100**. Marquee: yes. Wage: £800k.
- **Owen Farrell** (Fly-half, England) — Returned from Racing 92 on a two-year playing deal; over 1,200 Test points, five league titles with Sarries, and still the league's most ruthless game-manager off the tee. Index high: `kicking`, `composure`, `positioning`, `discipline`, `tackling`. Suggested rating: **84/100**.
- **Ben Earl** (Number 8, England) — 2025 Lions Test back-rower and 2024 England Player of the Year; 73 carries for 419 metres across that Six Nations made him the explosive go-to ball-carrier from the base. Index high: `pace`, `strength`, `stamina`, `handling`, `tackling`. Suggested rating: **88/100**.
- **Jamie George** (Hooker, England) — Long-time England hooker and former captain; elite throwing accuracy underpins the Sarries lineout and his work rate around the park is a benchmark for the position. Index high: `setPiece`, `tackling`, `breakdown`, `composure`, `discipline`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rhys Carre | Prop | 1998-02-08 | 28 | Wales | 72 | 84 | 55 | 59 | 64 | 78 | 76 | 51 | 92 | 67 | 73 | 71 |
| Jamie George | Hooker | 1990-10-20 | 35 | England | 68 | 75 | 59 | 64 | 66 | 81 | 82 | 52 | 83 | 84 | 74 | 83 |
| Marco Riccioni | Prop | 1997-10-19 | 28 | Italy | 70 | 85 | 59 | 60 | 65 | 78 | 79 | 47 | 90 | 70 | 74 | 76 |
| Maro Itoje | Lock | 1994-10-28 | 31 | England | 69 | 91 | 60 | 61 | 66 | 93 | 93 | 53 | 94 | 68 | 71 | 92 |
| Nick Isiekwe | Lock | 1998-04-20 | 28 | England | 71 | 82 | 63 | 62 | 64 | 82 | 77 | 53 | 89 | 69 | 78 | 69 |
| Juan Martin Gonzalez | Flanker | 2000-11-14 | 25 | Argentina | 75 | 80 | 73 | 72 | 71 | 86 | 81 | 61 | 77 | 73 | 77 | 71 |
| Ben Earl | Back Row | 1998-01-07 | 28 | England | 90 | 87 | 87 | 72 | 87 | 88 | 81 | 58 | 76 | 73 | 76 | 71 |
| Tom Willis | Number 8 | 1999-01-18 | 27 | England | 76 | 81 | 74 | 75 | 70 | 79 | 75 | 64 | 71 | 69 | 73 | 72 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Charlie Bracken | Scrum-half | 2003-12-09 | 22 | England | 70 | 68 | 75 | 77 | 72 | 69 | 71 | 72 | 60 | 71 | 78 | 76 |
| Owen Farrell | Fly-half | 1991-09-24 | 34 | England | 69 | 64 | 74 | 76 | 76 | 84 | 66 | 83 | 58 | 83 | 82 | 86 |
| Rotimi Segun | Wing | 1996-12-28 | 29 | England | 68 | 68 | 84 | 84 | 73 | 72 | 67 | 67 | 60 | 73 | 74 | 73 |
| Lucio Cinti | Centre | 2000-02-23 | 26 | Argentina | 75 | 75 | 80 | 72 | 76 | 74 | 73 | 67 | 65 | 73 | 79 | 77 |
| Nick Tompkins | Centre | 1995-02-16 | 31 | Wales | 75 | 77 | 75 | 79 | 74 | 75 | 71 | 65 | 58 | 73 | 73 | 79 |
| Noah Caluori | Wing | 2006-09-22 | 19 | England | 70 | 64 | 84 | 80 | 77 | 74 | 66 | 65 | 59 | 67 | 79 | 72 |
| Elliot Daly | Utility Back | 1992-10-08 | 33 | England | 68 | 67 | 77 | 71 | 76 | 75 | 69 | 69 | 66 | 67 | 73 | 74 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Theo Dan | Hooker | 2000-12-26 | 25 | England | 71 | 78 | 64 | 62 | 75 | 79 | 75 | 58 | 83 | 69 | 72 | 74 |
| Eroni Mawi | Prop | 1996-02-06 | 30 | Fiji | 75 | 84 | 59 | 61 | 66 | 82 | 78 | 48 | 85 | 72 | 74 | 75 |
| Marcus Street | Prop | 1999-02-06 | 27 | England | 75 | 79 | 57 | 64 | 60 | 80 | 75 | 51 | 88 | 71 | 75 | 72 |
| Hugh Tizard | Lock | 2000-03-31 | 26 | England | 75 | 80 | 60 | 59 | 65 | 83 | 76 | 55 | 89 | 66 | 72 | 74 |
| Andy Onyeama-Christie | Flanker | 1999-03-22 | 27 | Scotland | 75 | 75 | 73 | 69 | 69 | 80 | 79 | 59 | 73 | 70 | 75 | 70 |
| Ivan van Zyl | Scrum-half | 1995-06-30 | 30 | South Africa | 74 | 65 | 79 | 78 | 75 | 69 | 73 | 75 | 61 | 73 | 82 | 78 |
| Fergus Burke | Fly-half | 1999-09-03 | 26 | Scotland | 68 | 66 | 71 | 75 | 79 | 68 | 70 | 90 | 58 | 75 | 79 | 77 |
| Jack Bracken | Wing | 2005-10-15 | 20 | England | 73 | 64 | 88 | 82 | 75 | 72 | 67 | 64 | 57 | 71 | 79 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Barnaby Merrett | Back Row | 2004-11-22 | 21 | England | 77 | 77 | 73 | 76 | 71 | 86 | 84 | 57 | 72 | 67 | 77 | 70 |
| Harvey Beaton | Prop | 2001-03-15 | 25 | England | 77 | 83 | 56 | 60 | 63 | 80 | 78 | 50 | 86 | 73 | 72 | 76 |
| Alec Clarey | Prop | 1994-02-08 | 32 | England | 77 | 85 | 57 | 62 | 61 | 79 | 77 | 48 | 84 | 72 | 73 | 75 |
| Phil Brantingham | Prop | 2001-10-02 | 24 | England | 77 | 83 | 57 | 62 | 59 | 78 | 78 | 48 | 87 | 67 | 71 | 76 |
| James Hadfield | Hooker | 1997-11-27 | 28 | England | 67 | 77 | 56 | 67 | 77 | 83 | 77 | 52 | 82 | 71 | 72 | 71 |
| James Isaacs | Hooker | 2004-03-28 | 22 | England | 73 | 77 | 62 | 66 | 77 | 80 | 78 | 58 | 89 | 72 | 72 | 72 |
| Mak Eke | Back Row | 2003-12-04 | 22 | England | 77 | 77 | 72 | 69 | 71 | 78 | 79 | 60 | 78 | 74 | 78 | 70 |
| Toby Knight | Flanker | 2002-01-05 | 24 | England | 77 | 78 | 71 | 74 | 67 | 87 | 83 | 59 | 75 | 70 | 79 | 75 |
| Nathan Michelow | Back Row | 2004-05-16 | 22 | England | 77 | 79 | 68 | 69 | 73 | 81 | 81 | 59 | 72 | 73 | 77 | 70 |
| Eoghan Clarke | Hooker | 1998-06-12 | 27 | Ireland | 74 | 77 | 61 | 68 | 77 | 79 | 78 | 58 | 84 | 67 | 76 | 75 |
| Theo McFarland | Back Row | 1995-10-16 | 30 | Samoa | 78 | 81 | 71 | 71 | 72 | 85 | 77 | 63 | 76 | 73 | 78 | 74 |
| Vilikesa Nairau | Prop | 2002-06-03 | 23 | Fiji | 77 | 83 | 55 | 60 | 66 | 81 | 77 | 48 | 85 | 71 | 69 | 74 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alex Lozowski | Centre | 1993-06-30 | 32 | England | 68 | 79 | 80 | 79 | 77 | 77 | 69 | 66 | 64 | 69 | 77 | 72 |
| Louie Johnson | Fly-half | 2003-06-13 | 22 | England | 71 | 65 | 70 | 73 | 81 | 74 | 64 | 88 | 64 | 77 | 77 | 77 |
| Max Malins | Wing | 1997-01-07 | 29 | England | 67 | 64 | 85 | 81 | 77 | 70 | 67 | 71 | 59 | 68 | 77 | 77 |
| Olly Hartley | Centre | 2002-02-19 | 24 | England | 68 | 77 | 77 | 78 | 79 | 77 | 71 | 66 | 64 | 71 | 77 | 75 |
| Sam Spink | Centre | 1999-10-06 | 26 | England | 74 | 77 | 77 | 77 | 79 | 78 | 68 | 71 | 60 | 69 | 78 | 75 |
| Tobias Elliott | Wing | 2003-09-16 | 22 | England | 73 | 70 | 87 | 80 | 78 | 72 | 62 | 68 | 58 | 70 | 77 | 77 |
| Angus Hall | Centre | 2005-09-17 | 20 | England | 68 | 78 | 77 | 77 | 79 | 77 | 71 | 66 | 62 | 67 | 77 | 76 |
| Gareth Simpson | Scrum-half | 1997-11-02 | 28 | England | 71 | 69 | 77 | 77 | 78 | 75 | 69 | 77 | 63 | 73 | 79 | 79 |

---

## Bath

- **Home ground:** The Recreation Ground (commonly "The Rec").
- **Club colours:** `#0033a0` / `#ffffff`
- **Nickname:** The Blue, Black and Whites.
- **Founded:** 1865 — one of the oldest rugby clubs in England.
- **Stadium capacity:** 14,500 (18,000-seat rebuild approved September 2025).
- **Head coach:** Johann van Graan (Head of Rugby since 2022, contracted to 2030).
- **Captain:** Ben Spencer.
- **Honours:** 7 × English league title (latest 2024-25); 10 × RFU Cup (1984–1996 dynasty); European Challenge Cup 2007-08.
- **Overall rating:** **79/100**
- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `two_back` · `hybrid` · `cautious`
- **Stat bias:** high `handling`, `kicking`, `composure`.

### Star players

- **Thomas du Toit** (Prop, South Africa) — 2025 World Rugby Dream Team prop and the Springboks' first-choice loosehead; a destructive scrum technician whose mobility, abrasive breakdown work and high-volume ball-carrying set him apart from any other prop in the world game. Springbok pillar in the 2023 Rugby World Cup defence; signed for Bath from Sale ahead of 2024-25 and became the cornerstone of the championship-winning pack. Index high: `setPiece`, `strength`, `breakdown`, `tackling`, `stamina`. Suggested rating: **93/100**.
- **Finn Russell** (Fly-half, Scotland) — Scotland captain and three-time Lion; the creative fulcrum of Bath's title defence with audacious passing range, sublime kicking from the tee and in play, and a newly mature game-management edge. Not a pure speed merchant but his footwork, body angles and step in the line are world-class. Index high: `handling`, `kicking`, `composure`, `positioning`, `agility`. Suggested rating: **92/100**. Marquee: yes. Wage: £1m.
- **Ben Spencer** (Scrum-half, England) — Bath club captain and the experienced general at the base who lifted the 2024-25 season trophy. Spent a decade at Saracens winning multiple league and Champions Cup titles before joining Bath in 2020; capped by England across two World Cup cycles and a late call-up to the 2021 Lions tour of South Africa. An elite box-kicker with a metronomic service and sharp tactical brain, his territorial control and tempo management are the perfect foil for Russell's creativity. Index high: `kicking`, `composure`, `positioning`, `discipline`, `handling`. Suggested rating: **85/100**.
- **Sam Underhill** (Flanker, England) — One of the league's most feared defensive forwards: timing, technique and ferocity on the chop tackle, with a relentless work-rate around the breakdown. Index high: `tackling`, `breakdown`, `strength`, `stamina`. Suggested rating: **86/100**.
- **Santi Carreras** (Full-back, Argentina) — Pumas' starting fly-half slotting in at 15 to give Bath a second playmaker; aerial security, a beautiful left boot and the footwork to step into the line as a second-receiver. Index high: `handling`, `kicking`, `agility`, `positioning`. Suggested rating: **84/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Thomas du Toit | Prop | 1995-05-05 | 31 | South Africa | 92 | 91 | 57 | 62 | 64 | 94 | 91 | 54 | 94 | 71 | 72 | 74 |
| Tom Dunn | Hooker | 1992-11-12 | 33 | England | 75 | 79 | 61 | 65 | 76 | 76 | 75 | 62 | 88 | 76 | 74 | 78 |
| Beno Obano | Prop | 1994-10-25 | 31 | England | 71 | 87 | 59 | 61 | 70 | 77 | 75 | 59 | 94 | 69 | 69 | 75 |
| Charlie Ewels | Lock | 1995-06-29 | 30 | England | 75 | 78 | 63 | 64 | 67 | 75 | 75 | 55 | 86 | 71 | 73 | 71 |
| Ted Hill | Lock / Flanker | 1999-03-26 | 27 | England | 72 | 86 | 63 | 62 | 73 | 75 | 74 | 56 | 88 | 69 | 72 | 75 |
| Sam Underhill | Flanker | 1996-07-22 | 29 | England | 84 | 88 | 72 | 74 | 70 | 88 | 86 | 63 | 78 | 70 | 75 | 73 |
| Josh Bayliss | Flanker | 1997-09-18 | 28 | Scotland | 78 | 79 | 73 | 74 | 78 | 80 | 85 | 65 | 77 | 75 | 72 | 75 |
| Alfie Barbeary | Number 8 | 2000-10-05 | 25 | England | 77 | 84 | 69 | 77 | 77 | 82 | 79 | 65 | 79 | 70 | 74 | 74 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ben Spencer | Scrum-half | 1992-07-31 | 33 | England | 69 | 64 | 81 | 75 | 86 | 73 | 75 | 86 | 62 | 85 | 86 | 84 |
| Finn Russell | Fly-half | 1992-09-23 | 33 | Scotland | 71 | 66 | 73 | 93 | 94 | 68 | 69 | 92 | 63 | 76 | 92 | 92 |
| Henry Arundell | Wing | 2002-11-08 | 23 | England | 74 | 66 | 85 | 83 | 83 | 68 | 68 | 77 | 57 | 75 | 78 | 79 |
| Max Ojomoh | Centre | 2000-09-14 | 25 | England | 72 | 77 | 75 | 74 | 80 | 76 | 73 | 71 | 61 | 74 | 78 | 76 |
| Ollie Lawrence | Centre | 1999-09-18 | 26 | England | 74 | 73 | 80 | 77 | 81 | 80 | 75 | 72 | 64 | 74 | 76 | 81 |
| Joe Cokanasiga | Wing | 1997-11-15 | 28 | England | 74 | 66 | 84 | 87 | 78 | 71 | 64 | 77 | 58 | 74 | 74 | 77 |
| Santi Carreras | Full-back | 1998-03-30 | 28 | Argentina | 74 | 71 | 80 | 85 | 83 | 74 | 66 | 85 | 63 | 77 | 83 | 75 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dan Frost | Hooker | 1997-04-24 | 29 | England | 74 | 81 | 64 | 67 | 75 | 81 | 78 | 62 | 89 | 71 | 75 | 73 |
| Archie Griffin | Prop | 2001-07-24 | 24 | Wales | 75 | 85 | 59 | 64 | 70 | 80 | 80 | 58 | 89 | 70 | 68 | 73 |
| Will Stuart | Prop | 1996-07-12 | 29 | England | 75 | 82 | 59 | 63 | 65 | 84 | 75 | 54 | 86 | 69 | 73 | 71 |
| Quinn Roux | Lock | 1990-10-30 | 35 | Ireland | 75 | 85 | 60 | 64 | 70 | 78 | 75 | 57 | 90 | 70 | 70 | 75 |
| Guy Pepper | Flanker | 2003-04-15 | 23 | England | 75 | 75 | 67 | 77 | 71 | 85 | 87 | 67 | 79 | 72 | 77 | 74 |
| Tom Carr-Smith | Scrum-half | 2002-02-28 | 24 | England | 75 | 64 | 80 | 75 | 78 | 76 | 76 | 83 | 63 | 77 | 80 | 83 |
| Cameron Redpath | Centre | 1999-12-23 | 26 | Scotland | 75 | 77 | 78 | 77 | 77 | 78 | 73 | 73 | 66 | 68 | 77 | 80 |
| Will Muir | Wing | 1995-10-30 | 30 | England | 72 | 72 | 86 | 86 | 78 | 71 | 69 | 69 | 56 | 73 | 76 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ethan Staddon | Flanker | 2002-07-03 | 23 | England | 80 | 81 | 72 | 75 | 75 | 85 | 80 | 63 | 79 | 72 | 77 | 77 |
| Ewan Richards | Flanker | 2002-04-06 | 24 | England | 77 | 82 | 69 | 72 | 71 | 86 | 82 | 63 | 74 | 76 | 77 | 74 |
| Francois van Wyk | Prop | 1991-07-30 | 34 | South Africa | 77 | 85 | 59 | 62 | 68 | 79 | 77 | 55 | 88 | 74 | 75 | 74 |
| Thompson Cowan | Flanker | 2002-08-02 | 23 | Wales | 80 | 83 | 72 | 72 | 73 | 80 | 82 | 62 | 78 | 68 | 77 | 75 |
| Ross Molony | Lock | 1994-05-11 | 32 | Ireland | 77 | 85 | 66 | 67 | 73 | 80 | 77 | 55 | 87 | 70 | 78 | 77 |
| Jaco Coetzee | Number 8 | 1996-06-10 | 29 | South Africa | 77 | 85 | 74 | 75 | 77 | 83 | 83 | 69 | 76 | 73 | 71 | 72 |
| Jasper Spandler | Hooker | 2003-05-21 | 23 | England | 75 | 77 | 60 | 69 | 77 | 79 | 77 | 59 | 86 | 68 | 77 | 74 |
| Kieran Verden | Prop | 1998-11-06 | 27 | England | 77 | 85 | 55 | 60 | 64 | 78 | 77 | 54 | 90 | 69 | 70 | 77 |
| Mikey Summerfield | Prop | 2002-10-30 | 23 | England | 77 | 84 | 53 | 64 | 66 | 78 | 80 | 53 | 92 | 71 | 75 | 78 |
| Miles Reid | Flanker | 1998-09-05 | 27 | England | 81 | 79 | 68 | 73 | 75 | 79 | 80 | 69 | 72 | 74 | 77 | 75 |


**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Austin Emens | Full-back | 2002-10-09 | 23 | England | 73 | 71 | 84 | 79 | 80 | 75 | 72 | 77 | 59 | 75 | 78 | 82 |
| Bernard van der Linde | Scrum-half | 2000-11-30 | 25 | South Africa | 75 | 67 | 80 | 80 | 81 | 72 | 74 | 81 | 64 | 71 | 78 | 84 |
| Ciaran Donoghue | Fly-half | 2003-01-07 | 23 | Ireland | 71 | 64 | 72 | 72 | 86 | 71 | 72 | 95 | 62 | 77 | 79 | 85 |
| Louie Hennessey | Centre | 2004-03-29 | 22 | Wales | 73 | 77 | 77 | 80 | 77 | 77 | 75 | 73 | 61 | 72 | 79 | 74 |
| Will Butt | Centre | 2000-01-15 | 26 | England | 77 | 77 | 77 | 77 | 80 | 77 | 70 | 70 | 63 | 75 | 78 | 80 |
| Neil le Roux | Scrum-half | 2003-04-16 | 23 | South Africa | 73 | 68 | 77 | 77 | 83 | 71 | 74 | 79 | 66 | 76 | 77 | 83 |
| Sam Harris | Fly-half | 2003-09-03 | 22 | England | 69 | 65 | 74 | 71 | 85 | 71 | 66 | 92 | 59 | 77 | 78 | 80 |
| Tom de Glanville | Full-back | 1999-12-10 | 26 | England | 73 | 69 | 80 | 83 | 83 | 72 | 70 | 77 | 65 | 75 | 79 | 80 |
| Chris Harris | Centre | 1990-12-28 | 35 | Scotland | 75 | 77 | 79 | 79 | 78 | 78 | 74 | 76 | 60 | 72 | 77 | 80 |

---

## Exeter Chiefs

- **Home ground:** Sandy Park.
- **Club colours:** `#000000` / `#ffffff`
- **Nickname:** Chiefs.
- **Founded:** 1871.
- **Stadium capacity:** 15,600.
- **Head coach:** Rob Baxter (Director of Rugby since 2009 — the league's longest-serving head coach).
- **Captain:** Dafydd Jenkins.
- **Honours:** 2 × league title (2016-17, 2019-20); European Champions Cup 2019-20; Anglo-Welsh Cup 2013-14.
- **Overall rating:** **70/100**
- **Suggested tactics:** `possession` · `keep_it_tight` · `commit_numbers` · `counter_ruck` · `one_back` · `blitz` · `cautious`
- **Stat bias:** high `stamina`, `breakdown`, `setPiece`.

### Star players

- **Henry Slade** (Centre, England) — 74-cap England 13, the Chiefs' on-field metronome: long passing, pinpoint kicking from hand and elite defensive reads that shut down opposition channels. Said to be in one of his best club seasons. Index high: `handling`, `kicking`, `tackling`, `positioning`, `composure`. Suggested rating: **82/100**.
- **Len Ikitau** (Centre, Australia) — Marquee Wallaby signing from the Brumbies: 39-cap Test 13 with bone-jarring defence, sharp spatial awareness and the carrying power to break gainlines. Already producing standout league performances. Index high: `tackling`, `strength`, `pace`, `positioning`. Suggested rating: **85/100**.
- **Immanuel Feyi-Waboso** (Wing, England) — Explosive England finisher; a hat-trick on return announced him as one of the league's most dangerous strike runners off both wings, with raw acceleration and aerial bravery. Index high: `pace`, `agility`, `handling`, `strength`. Suggested rating: **86/100**. Marquee: yes. Wage: £500k.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Scott Sio | Prop | 1991-10-16 | 34 | Australia | 69 | 79 | 55 | 54 | 58 | 78 | 77 | 49 | 89 | 65 | 68 | 68 |
| Joseph Dweba | Hooker | 1995-10-25 | 30 | South Africa | 68 | 74 | 60 | 59 | 64 | 72 | 79 | 49 | 90 | 71 | 70 | 69 |
| Josh Iosefa-Scott | Prop | 1996-07-16 | 29 | New Zealand | 70 | 80 | 54 | 55 | 56 | 80 | 73 | 48 | 89 | 70 | 70 | 71 |
| Dafydd Jenkins | Lock | 2002-12-05 | 23 | Wales | 69 | 81 | 59 | 57 | 65 | 75 | 76 | 50 | 91 | 66 | 68 | 65 |
| Andrea Zambonin | Lock | 2000-09-03 | 25 | Italy | 71 | 75 | 54 | 61 | 60 | 77 | 74 | 52 | 93 | 66 | 66 | 70 |
| Ethan Roots | Flanker | 1997-11-10 | 28 | England | 76 | 77 | 69 | 74 | 68 | 82 | 83 | 57 | 78 | 70 | 69 | 66 |
| Christ Tshiunza | Flanker| 2002-01-09 | 24 | Wales | 75 | 76 | 68 | 69 | 64 | 78 | 79 | 55 | 72 | 64 | 69 | 66 |
| Greg Fisilau | Number 8 | 2003-07-09 | 22 | England | 74 | 75 | 66 | 73 | 68 | 73 | 75 | 62 | 80 | 68 | 73 | 66 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Stephen Varney | Scrum-half | 2001-05-16 | 25 | Italy | 71 | 59 | 72 | 74 | 74 | 69 | 69 | 73 | 64 | 73 | 76 | 74 |
| Harvey Skinner | Fly-half | 1997-12-31 | 28 | England | 69 | 60 | 75 | 73 | 73 | 66 | 66 | 84 | 64 | 73 | 73 | 75 |
| Immanuel Feyi-Waboso | Wing | 2002-12-20 | 23 | England | 67 | 85 | 86 | 85 | 88 | 65 | 62 | 63 | 57 | 65 | 69 | 69 |
| Len Ikitau | Centre | 1998-10-01 | 27 | Australia | 72 | 87 | 86 | 75 | 73 | 84 | 67 | 68 | 58 | 70 | 85 | 73 |
| Henry Slade | Centre | 1993-03-19 | 33 | England | 71 | 75 | 76 | 71 | 81 | 81 | 67 | 83 | 62 | 70 | 83 | 81 |
| Paul Brown-Bampoe | Wing | 2002-05-15 | 24 | England | 75 | 66 | 82 | 82 | 76 | 65 | 63 | 70 | 63 | 67 | 73 | 65 |
| Olly Woodburn | Wing / Full Back | 1991-11-18 | 34 | England | 70 | 68 | 72 | 78 | 77 | 70 | 65 | 76 | 57 | 68 | 79 | 70 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Max Norey | Hooker | 1999-08-05 | 26 | England | 68 | 76 | 60 | 63 | 75 | 78 | 80 | 54 | 86 | 66 | 66 | 66 |
| Will Goodrick-Clarke | Prop | 1996-12-29 | 29 | England | 75 | 80 | 50 | 54 | 63 | 78 | 76 | 50 | 90 | 67 | 65 | 65 |
| Ethan Burger | Prop | 2000-05-23 | 25 | South Africa | 75 | 78 | 54 | 57 | 64 | 75 | 76 | 51 | 92 | 66 | 68 | 66 |
| Alfie Bell | Lock | 2003-04-12 | 23 | England | 76 | 75 | 60 | 58 | 66 | 78 | 78 | 54 | 89 | 71 | 66 | 66 |
| Rusi Tuima | Flanker | 2000-05-21 | 26 | Fiji | 77 | 79 | 68 | 74 | 63 | 81 | 84 | 57 | 78 | 66 | 75 | 70 |
| Tom Cairns | Scrum-half | 2002-06-19 | 23 | England | 74 | 62 | 75 | 75 | 75 | 66 | 74 | 75 | 61 | 72 | 75 | 76 |
| Will Haydon-Wood | Fly-half | 2000-10-27 | 25 | England | 70 | 61 | 69 | 68 | 76 | 65 | 71 | 84 | 63 | 75 | 75 | 75 |
| Dan John | Wing | 2001-10-04 | 24 | Wales | 67 | 64 | 80 | 79 | 75 | 70 | 64 | 67 | 57 | 72 | 75 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Kwenzo Blose | Prop | 1997-05-12 | 29 | South Africa | 77 | 77 | 49 | 61 | 58 | 78 | 79 | 49 | 92 | 70 | 65 | 68 |
| Bachuki Tchumbadze | Prop | 2001-11-30 | 24 | Georgia | 77 | 83 | 54 | 59 | 58 | 77 | 77 | 46 | 85 | 70 | 69 | 67 |
| Tom Hooper | Flanker | 2001-01-29 | 25 | Australia | 80 | 79 | 69 | 72 | 65 | 81 | 83 | 58 | 76 | 67 | 77 | 65 |
| Joe Bailey | Lock | 2004-07-06 | 21 | England | 77 | 77 | 61 | 59 | 61 | 77 | 77 | 46 | 92 | 71 | 67 | 70 |
| Oscar Beckerleg | Lock | 2005-05-11 | 21 | England | 77 | 77 | 60 | 61 | 60 | 78 | 77 | 53 | 91 | 67 | 69 | 70 |
| Ehren Painter | Prop | 1998-03-21 | 28 | England | 77 | 80 | 54 | 58 | 60 | 77 | 79 | 50 | 90 | 66 | 70 | 72 |
| Richard Capstick | Flanker | 2000-02-13 | 26 | England | 77 | 77 | 70 | 74 | 67 | 77 | 84 | 56 | 73 | 70 | 77 | 68 |
| Jack Yeandle | Hooker | 1989-12-22 | 36 | England | 67 | 77 | 58 | 65 | 77 | 77 | 77 | 49 | 85 | 70 | 74 | 69 |
| Jimmy Roots | Prop | 2000-01-31 | 26 | England | 77 | 78 | 56 | 58 | 56 | 77 | 77 | 44 | 90 | 72 | 69 | 70 |
| Julian Heaven | Hooker | 2000-10-01 | 25 | Australia | 74 | 77 | 59 | 65 | 77 | 77 | 77 | 51 | 87 | 65 | 69 | 71 |
| Khwezi Mona | Prop | 1992-10-08 | 33 | South Africa | 77 | 81 | 53 | 60 | 60 | 80 | 77 | 45 | 88 | 69 | 68 | 65 |
| Lewis Pearson | Lock | 1999-10-26 | 26 | England | 77 | 81 | 60 | 59 | 65 | 77 | 77 | 53 | 88 | 70 | 67 | 72 |
| Martin Moloney | Flanker | 1999-10-19 | 26 | Ireland | 77 | 77 | 68 | 73 | 65 | 78 | 84 | 58 | 77 | 69 | 77 | 70 |
| Louie Gulley | Hooker | 2005-08-04 | 20 | England | 70 | 77 | 56 | 65 | 77 | 77 | 81 | 53 | 87 | 68 | 68 | 65 |
| Ross Vintcent | Number 8 | 2002-06-05 | 23 | Italy | 77 | 78 | 69 | 73 | 77 | 77 | 81 | 62 | 78 | 67 | 70 | 65 |
| Kane James | Flanker | 2005-03-26 | 21 | England | 77 | 77 | 66 | 73 | 67 | 79 | 81 | 55 | 73 | 67 | 77 | 68 |
| Sol Moody | Hooker | 2005-04-16 | 21 | England | 71 | 77 | 62 | 65 | 77 | 77 | 79 | 52 | 82 | 65 | 68 | 70 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Charlie Chapman | Scrum-half | 1998-12-01 | 27 | England | 71 | 66 | 77 | 77 | 77 | 71 | 70 | 77 | 63 | 69 | 77 | 77 |
| Ben Coen | Fly-half | 2005-01-11 | 21 | England | 70 | 60 | 72 | 75 | 77 | 65 | 68 | 86 | 62 | 77 | 77 | 77 |
| Iwan Jenkins | Fly-half | 2003-03-13 | 23 | Wales | 72 | 60 | 68 | 73 | 77 | 67 | 69 | 88 | 63 | 77 | 77 | 78 |
| Will Becconsall | Scrum-half | 2002-12-20 | 23 | England | 73 | 61 | 77 | 77 | 77 | 69 | 70 | 77 | 58 | 70 | 77 | 77 |
| Tamati Tua | Centre | 1997-11-26 | 28 | New Zealand | 73 | 77 | 77 | 77 | 77 | 77 | 71 | 65 | 61 | 67 | 77 | 73 |
| Tommy Wyatt | Wing | 1999-12-14 | 26 | England | 73 | 62 | 81 | 82 | 77 | 68 | 62 | 65 | 62 | 71 | 77 | 77 |
| Will Rigg | Centre | 2000-03-22 | 26 | England | 70 | 77 | 77 | 77 | 77 | 77 | 68 | 63 | 66 | 72 | 77 | 68 |
| Zack Wimbush | Centre | 2003-10-24 | 22 | England | 69 | 77 | 77 | 77 | 77 | 77 | 70 | 68 | 66 | 65 | 77 | 73 |
| Ben Hammersley | Wing | 2003-05-20 | 23 | England | 68 | 66 | 84 | 82 | 77 | 65 | 66 | 64 | 58 | 65 | 77 | 77 |

---

## Harlequins

- **Home ground:** The Stoop.
- **Club colours:** `#73144a` / `#23bcad`
- **Nickname:** Quins.
- **Founded:** 1866 — one of the league's oldest clubs.
- **Stadium capacity:** 14,800.
- **Head coach:** Jason Gilmore (Head Coach since September 2025, promoted from defence coach after Danny Wilson's late departure to Wales).
- **Captain:** Alex Dombrandt (since 2024-25).
- **Honours:** 2 × league title (2011-12, 2020-21); European Challenge Cup 2010-11; Anglo-Welsh Cup 1987-88, 2012-13.
- **Overall rating:** **66/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `one_back` · `drift` · `offload_freely`
- **Stat bias:** high `pace`, `agility`, `handling`.

### Star players

- **Marcus Smith** (Fly-half, England) — England fly-half and British & Irish Lion; the creative fulcrum of the Quins attack with electric footwork at first receiver, cross-field-kick threat, and late drop-goal nous. The heartbeat of the league's most expansive side. Index high: `handling`, `agility`, `kicking`, `composure`, `pace`. Suggested rating: **90/100**. Marquee: yes. Wage: £525k.
- **Alex Dombrandt** (Number 8, England) — England No.8 and Quins captain; a powerful one-out ball-carrier with soft hands in tight space who anchors the back row both as a link-man in the wide channels and as a defensive presence over the ball. Index high: `strength`, `handling`, `breakdown`, `tackling`, `stamina`. Suggested rating: **84/100**.
- **Chandler Cunningham-South** (Flanker, England) — Destructive 6ft 5in England back-rower built for collisions; ferocious ball-carrying and tackling, with an improving lineout-steal game adding a third string to a profile already feared at the breakdown. Index high: `strength`, `tackling`, `breakdown`, `setPiece`, `stamina`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fin Baxter | Prop | 2002-02-12 | 24 | England | 68 | 82 | 54 | 62 | 65 | 71 | 72 | 45 | 80 | 66 | 62 | 69 |
| Sam Riley | Hooker | 2001-04-23 | 25 | England | 67 | 67 | 60 | 64 | 69 | 72 | 72 | 50 | 81 | 68 | 69 | 66 |
| Pedro Delgado | Prop | 1997-09-01 | 28 | Argentina | 67 | 74 | 53 | 58 | 63 | 77 | 71 | 49 | 83 | 63 | 62 | 67 |
| Guido Petti | Lock | 1994-11-17 | 31 | Argentina | 67 | 76 | 61 | 65 | 66 | 75 | 72 | 51 | 87 | 70 | 72 | 63 |
| Joe Launchbury | Lock | 1991-04-12 | 35 | England | 69 | 77 | 62 | 63 | 67 | 69 | 72 | 44 | 87 | 67 | 66 | 68 |
| Chandler Cunningham-South | Flanker | 2003-03-18 | 23 | England | 82 | 82 | 67 | 66 | 63 | 85 | 85 | 55 | 82 | 64 | 73 | 63 |
| Jack Kenningham | Flanker | 1999-11-19 | 26 | England | 73 | 69 | 67 | 73 | 70 | 74 | 79 | 58 | 66 | 63 | 71 | 67 |
| Alex Dombrandt | Number 8 | 1997-04-29 | 29 | England | 85 | 84 | 67 | 67 | 82 | 82 | 85 | 56 | 73 | 63 | 67 | 67 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Will Porter | Scrum-half | 1998-12-14 | 27 | England | 65 | 64 | 80 | 75 | 77 | 68 | 71 | 72 | 57 | 72 | 75 | 68 |
| Marcus Smith | Fly-half | 1999-02-14 | 27 | England | 67 | 63 | 90 | 89 | 92 | 62 | 62 | 90 | 55 | 69 | 68 | 91 |
| Cadan Murley | Wing | 1999-07-31 | 26 | England | 70 | 60 | 87 | 84 | 77 | 64 | 59 | 66 | 54 | 62 | 67 | 66 |
| Oscar Beard | Centre | 2001-11-20 | 24 | England | 70 | 75 | 71 | 77 | 75 | 68 | 67 | 61 | 56 | 66 | 66 | 71 |
| Luke Northmore | Centre | 1997-03-16 | 29 | England | 72 | 72 | 75 | 75 | 76 | 70 | 64 | 66 | 56 | 64 | 73 | 67 |
| Rodrigo Isgró | Wing | 1999-03-24 | 27 | Argentina | 64 | 60 | 83 | 81 | 72 | 60 | 63 | 67 | 55 | 64 | 66 | 70 |
| Tyrone Green | Full-back | 1998-03-05 | 28 | South Africa | 70 | 65 | 74 | 80 | 75 | 72 | 65 | 68 | 58 | 67 | 73 | 69 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jack Musk | Hooker | 2000-03-04 | 26 | England | 63 | 75 | 61 | 64 | 75 | 75 | 75 | 51 | 84 | 68 | 70 | 70 |
| Harry Williams | Prop | 1991-10-01 | 34 | England | 75 | 80 | 51 | 58 | 57 | 75 | 75 | 43 | 84 | 66 | 65 | 65 |
| Will Hobson | Prop | 2002-11-09 | 23 | England | 75 | 79 | 56 | 61 | 64 | 75 | 75 | 44 | 88 | 63 | 67 | 67 |
| Stephan Lewies | Lock | 1992-01-27 | 34 | South Africa | 75 | 76 | 60 | 64 | 65 | 75 | 75 | 48 | 85 | 66 | 67 | 69 |
| Will Evans | Flanker | 1997-01-28 | 29 | England | 75 | 75 | 67 | 75 | 69 | 77 | 75 | 56 | 68 | 69 | 75 | 63 |
| Lucas Friday | Scrum-half | 2006-07-13 | 19 | South Africa | 68 | 60 | 76 | 75 | 75 | 64 | 71 | 75 | 56 | 65 | 75 | 75 |
| Jarrod Evans | Fly-half | 1996-07-25 | 29 | Wales | 69 | 57 | 69 | 69 | 75 | 68 | 61 | 85 | 55 | 75 | 75 | 75 |
| Cassius Cleaves | Wing | 2003-03-15 | 23 | England | 65 | 65 | 83 | 80 | 75 | 65 | 64 | 65 | 54 | 66 | 75 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Boris Wenger | Prop | 2002-07-01 | 23 | Argentina | 77 | 81 | 52 | 58 | 65 | 77 | 77 | 49 | 83 | 66 | 68 | 65 |
| Jonny Green | Lock | 2004-03-16 | 22 | England | 77 | 77 | 58 | 64 | 62 | 77 | 77 | 48 | 88 | 70 | 69 | 65 |
| George Turner | Hooker | 1992-10-08 | 33 | Scotland | 67 | 77 | 61 | 65 | 77 | 77 | 77 | 49 | 79 | 65 | 65 | 68 |
| Jordan Els | Prop | 1997-06-11 | 28 | South Africa | 77 | 80 | 53 | 58 | 57 | 77 | 77 | 43 | 83 | 65 | 65 | 68 |
| James Chisholm | Back Row | 1995-08-11 | 30 | England | 77 | 77 | 73 | 69 | 70 | 78 | 77 | 55 | 68 | 67 | 77 | 67 |
| Jack Walker | Hooker | 1996-05-06 | 30 | England | 65 | 77 | 60 | 65 | 77 | 77 | 77 | 52 | 78 | 65 | 68 | 69 |
| Kieran Treadwell | Lock | 1995-11-06 | 30 | Ireland | 77 | 78 | 60 | 62 | 64 | 77 | 77 | 45 | 87 | 68 | 68 | 66 |
| Simon Kerrod | Prop | 1992-08-25 | 33 | England | 77 | 77 | 58 | 57 | 63 | 77 | 77 | 44 | 83 | 65 | 65 | 67 |
| Titi Lamositele | Prop | 1995-02-11 | 31 | USA | 77 | 77 | 56 | 58 | 58 | 77 | 77 | 50 | 81 | 69 | 65 | 66 |
| Tom Lawday | Number 8 | 1993-11-11 | 32 | England | 77 | 77 | 68 | 73 | 77 | 77 | 77 | 57 | 73 | 65 | 69 | 70 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ben Waghorn | Centre | 2004-04-02 | 22 | England | 65 | 77 | 77 | 77 | 77 | 77 | 64 | 63 | 61 | 68 | 77 | 65 |
| Conor Byrne | Full-back | 2005-07-07 | 20 | England | 66 | 62 | 77 | 73 | 77 | 69 | 64 | 77 | 53 | 71 | 77 | 77 |
| Hayden Hyde | Centre | 2000-09-15 | 25 | England | 69 | 77 | 77 | 77 | 77 | 77 | 64 | 68 | 61 | 67 | 77 | 72 |
| Jamie Benson | Fly-half | 2002-09-23 | 23 | England | 70 | 65 | 73 | 70 | 77 | 65 | 61 | 84 | 57 | 77 | 77 | 77 |
| Bryn Bradley | Centre | 2003-04-17 | 23 | Wales | 65 | 77 | 77 | 77 | 77 | 77 | 64 | 63 | 58 | 66 | 77 | 69 |
| Nick David | Full-back | 1998-11-04 | 27 | England | 65 | 61 | 81 | 79 | 77 | 66 | 66 | 77 | 54 | 67 | 77 | 77 |
| Sean Kerr | Centre | 2004-11-08 | 21 | England | 67 | 77 | 77 | 77 | 77 | 77 | 69 | 63 | 58 | 65 | 77 | 65 |
| Stu Townsend | Scrum-half | 1995-10-11 | 30 | England | 68 | 60 | 77 | 77 | 77 | 65 | 67 | 77 | 56 | 66 | 77 | 77 |
| Max Green | Scrum-half | 1996-02-13 | 30 | England | 65 | 58 | 77 | 78 | 77 | 69 | 69 | 77 | 53 | 67 | 77 | 77 |
| Cameron Anderson | Full-back | 1999-09-16 | 26 | England | 66 | 63 | 81 | 76 | 77 | 69 | 66 | 77 | 59 | 65 | 77 | 77 |

---

## Newcastle Falcons

- **Home ground:** Kingston Park.
- **Club colours:** `#000000` / `#c8a84b`
- **Nickname:** Falcons.
- **Founded:** 1877 (as Gosforth FC).
- **Stadium capacity:** 10,200.
- **Head coach:** Stephen Jones (interim Head Coach from March 2026 after Alan Dickens departed; Dan McFarland publicly linked with the role from 2026-27).
- **Captain:** George McGuigan.
- **Honours:** League title 1997-98; Anglo-Welsh Cup 2000-01, 2003-04.
- **Overall rating:** **55/100**
- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `three_back` · `hybrid` · `cautious`
- **Stat bias:** modest across the board (rebuild status); slight lean toward `stamina` and `discipline`.

### Star players

- **Liam Williams** (Full-back, Wales) — 93-cap Wales legend and two-tour Lion; a marquee signing whose world-class aerial work and broken-field counter-attack give Newcastle their first genuine back-three threat in years. Index high: `positioning`, `handling`, `composure`, `agility`, `pace`. Suggested rating: **84/100**. Marquee: yes.
- **Amanaki Mafi** (Number 8, Japan) — 29-cap Brave Blossom and 2015 World Cup hero against South Africa; powerful go-forward ball-carrier with footwork and an offloading game built to get a struggling pack over the gainline. Index high: `strength`, `handling`, `breakdown`, `stamina`, `tackling`. Suggested rating: **80/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Eduardo Bello | Prop | 1995-09-14 | 30 | Argentina | 69 | 74 | 45 | 51 | 51 | 72 | 64 | 44 | 76 | 63 | 60 | 62 |
| Samson Adejimi | Hooker | 2002-02-15 | 24 | England | 63 | 66 | 48 | 58 | 58 | 64 | 69 | 44 | 75 | 67 | 61 | 60 |
| Adam Brocklebank | Prop | 1995-09-06 | 30 | England | 69 | 73 | 47 | 55 | 52 | 73 | 64 | 39 | 83 | 67 | 65 | 63 |
| Finn Baker | Lock | 2004-10-17 | 21 | England | 71 | 72 | 55 | 55 | 58 | 65 | 70 | 41 | 77 | 65 | 60 | 64 |
| Tim Cardall | Lock | 1997-01-13 | 29 | England | 70 | 71 | 55 | 52 | 59 | 70 | 63 | 43 | 79 | 67 | 65 | 64 |
| Tom Christie | Flanker | 1998-03-04 | 28 | New Zealand | 68 | 73 | 58 | 62 | 60 | 70 | 75 | 51 | 68 | 61 | 68 | 61 |
| Tom Gordon | Flanker | 1997-01-30 | 29 | Scotland | 73 | 68 | 64 | 65 | 61 | 71 | 72 | 49 | 69 | 66 | 67 | 58 |
| Amanaki Mafi | Number 8 | 1990-01-11 | 36 | Japan | 80 | 80 | 61 | 66 | 81 | 82 | 80 | 52 | 67 | 61 | 67 | 61 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Simon Benitez Cruz | Scrum-half | 1999-09-06 | 26 | Argentina | 68 | 60 | 71 | 64 | 65 | 62 | 62 | 66 | 53 | 64 | 65 | 66 |
| Boeta Chamberlain | Fly-half | 1999-02-22 | 27 | South Africa | 65 | 59 | 62 | 62 | 72 | 58 | 55 | 81 | 50 | 67 | 68 | 72 |
| Joel Grayson | Wing | 2002-04-15 | 24 | England | 63 | 55 | 78 | 71 | 67 | 60 | 57 | 62 | 49 | 65 | 68 | 60 |
| Sammy Arnold | Centre | 1996-04-08 | 30 | Ireland | 65 | 64 | 68 | 64 | 70 | 64 | 62 | 58 | 56 | 65 | 68 | 66 |
| Max Clark | Centre | 1995-10-03 | 30 | England | 68 | 67 | 69 | 70 | 67 | 64 | 59 | 60 | 51 | 69 | 65 | 61 |
| Liam Williams | Wing | 1991-04-09 | 35 | Wales | 62 | 61 | 84 | 84 | 83 | 62 | 60 | 58 | 48 | 61 | 84 | 86 |
| Josh Hodge | Full-back | 2000-05-23 | 26 | England | 68 | 57 | 73 | 69 | 69 | 62 | 60 | 64 | 54 | 71 | 74 | 65 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hame Faiva | Hooker | 1994-05-09 | 32 | Italy | 68 | 75 | 49 | 62 | 75 | 75 | 75 | 49 | 79 | 69 | 62 | 65 |
| Lou de Bruin | Prop | 1993-02-13 | 33 | South Africa | 75 | 75 | 49 | 52 | 51 | 75 | 75 | 42 | 84 | 67 | 64 | 64 |
| Connor Hancock | Prop | 2000-11-10 | 25 | England | 75 | 77 | 43 | 56 | 51 | 75 | 75 | 39 | 80 | 64 | 62 | 62 |
| Freddie Clarke | Lock/Back row | 1992-10-10 | 33 | England | 75 | 75 | 54 | 53 | 57 | 75 | 75 | 42 | 82 | 64 | 66 | 64 |
| Cameron Neild | Flanker | 1996-09-06 | 29 | England | 75 | 75 | 60 | 62 | 63 | 75 | 76 | 54 | 64 | 69 | 75 | 62 |
| Joe Davis | Scrum-half | 2005-12-31 | 20 | England | 62 | 58 | 75 | 75 | 75 | 63 | 66 | 75 | 53 | 64 | 75 | 75 |
| Brett Connon | Fly-half | 1996-08-29 | 29 | Ireland | 62 | 56 | 62 | 66 | 75 | 62 | 57 | 81 | 48 | 75 | 75 | 75 |
| Harrison Obatoyinbo | Wing | 2000-07-15 | 25 | England | 64 | 55 | 80 | 75 | 75 | 62 | 53 | 63 | 48 | 63 | 75 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Adam Scott | Lock | 2001-11-27 | 24 | England | 77 | 77 | 54 | 57 | 59 | 77 | 77 | 46 | 80 | 68 | 66 | 65 |
| Bryce Gordon | Hooker | 2001-08-06 | 24 | New Zealand | 65 | 77 | 51 | 65 | 77 | 77 | 77 | 47 | 77 | 65 | 65 | 65 |
| Cam Jordan | Lock | 1999-11-17 | 26 | England | 77 | 77 | 54 | 56 | 60 | 77 | 77 | 41 | 78 | 65 | 68 | 65 |
| Charlie Turnbull | Back Row | 2005-10-02 | 20 | England | 77 | 77 | 63 | 65 | 65 | 77 | 77 | 53 | 64 | 65 | 77 | 65 |
| Fergus Lee-Warner | Lock | 1994-02-03 | 32 | Australia | 77 | 77 | 50 | 58 | 55 | 77 | 77 | 48 | 83 | 65 | 67 | 65 |
| Freddie Lockwood | Back Row | 2000-12-31 | 25 | England | 77 | 77 | 65 | 65 | 65 | 77 | 77 | 55 | 63 | 66 | 77 | 65 |
| George McGuigan | Hooker | 1993-03-30 | 33 | England | 65 | 77 | 54 | 65 | 77 | 77 | 77 | 48 | 81 | 67 | 65 | 65 |
| Jamie Hodgson | Lock | 1998-03-19 | 28 | Scotland | 77 | 77 | 50 | 51 | 54 | 77 | 77 | 41 | 81 | 65 | 68 | 66 |
| John Hawkins | Lock | 1996-11-11 | 29 | Wales | 77 | 77 | 54 | 56 | 57 | 77 | 77 | 40 | 83 | 65 | 66 | 65 |
| Micky Rewcastle | Prop | 2004-05-17 | 21 | England | 77 | 77 | 46 | 55 | 51 | 77 | 77 | 39 | 79 | 65 | 65 | 65 |
| Murray McCallum | Prop | 1996-03-16 | 30 | Scotland | 77 | 77 | 46 | 55 | 56 | 77 | 77 | 41 | 77 | 66 | 65 | 65 |
| Ollie Fletcher | Hooker | 2002-09-09 | 23 | England | 65 | 77 | 52 | 65 | 77 | 77 | 77 | 45 | 77 | 68 | 65 | 65 |
| Ollie Leatherbarrow | Back Row | 2002-04-08 | 24 | England | 77 | 77 | 58 | 66 | 65 | 77 | 77 | 53 | 69 | 65 | 77 | 65 |
| Oscar Usher | Lock | 2004-06-12 | 21 | England | 77 | 77 | 53 | 56 | 56 | 77 | 77 | 46 | 80 | 65 | 67 | 65 |
| Rob Palframan | Prop | 1993-12-20 | 32 | England | 77 | 77 | 48 | 52 | 54 | 77 | 77 | 41 | 77 | 65 | 65 | 65 |
| Sebastian De Chaves | Lock | 1990-10-30 | 35 | South Africa | 77 | 77 | 51 | 57 | 60 | 77 | 77 | 46 | 83 | 66 | 65 | 65 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alex Hearle | Centre | 1998-11-08 | 27 | England | 67 | 77 | 77 | 77 | 77 | 77 | 62 | 63 | 50 | 65 | 77 | 65 |
| Cameron Hutchison | Centre | 1998-06-01 | 27 | Scotland | 65 | 77 | 77 | 77 | 77 | 77 | 61 | 62 | 53 | 65 | 77 | 65 |
| Christian Wade | Wing | 1991-05-15 | 35 | England | 65 | 59 | 78 | 77 | 77 | 65 | 59 | 60 | 49 | 67 | 77 | 77 |
| Connor Doherty | Centre | 2000-07-18 | 25 | England | 71 | 77 | 77 | 77 | 77 | 77 | 59 | 59 | 54 | 65 | 77 | 65 |
| Elliott Obatoyinbo | Wing/Full-back | 1998-10-09 | 27 | England | 65 | 63 | 77 | 77 | 77 | 65 | 60 | 63 | 53 | 65 | 77 | 77 |
| Ethan Grayson | Fly-half | 2004-04-15 | 22 | England | 65 | 60 | 63 | 65 | 77 | 65 | 62 | 83 | 49 | 77 | 77 | 77 |
| James Elliott | Scrum-half | 1998-08-29 | 27 | England | 65 | 58 | 77 | 77 | 77 | 65 | 62 | 77 | 52 | 66 | 77 | 77 |
| Nathan Greenwood | Wing | 2003-11-20 | 22 | England | 65 | 58 | 77 | 77 | 77 | 65 | 60 | 63 | 46 | 65 | 77 | 77 |
| Oliver Spencer | Centre | 2004-02-22 | 22 | England | 70 | 77 | 77 | 77 | 77 | 77 | 61 | 58 | 54 | 65 | 77 | 65 |
| Sam Stuart | Scrum-half | 1991-09-27 | 34 | England | 67 | 57 | 77 | 77 | 77 | 65 | 67 | 77 | 50 | 67 | 77 | 77 |
| Sam Waugh | Centre | 2005-07-16 | 20 | England | 69 | 77 | 77 | 77 | 77 | 77 | 63 | 58 | 51 | 68 | 77 | 65 |

---

## Northampton Saints

- **Home ground:** Franklin's Gardens.
- **Club colours:** `#00563f` / `#000000`
- **Nickname:** Saints.
- **Founded:** 1880.
- **Stadium capacity:** 15,249.
- **Head coach:** Phil Dowson (Director of Rugby since 2022).
- **Captain:** Fraser Dingwall.
- **Honours:** 2 × league title (2013-14, 2023-24); European Cup 1999-2000; European Challenge Cup 2008-09, 2014.
- **Overall rating:** **76/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `one_back` · `hybrid` · `balanced`
- **Stat bias:** high `pace`, `handling`, `agility`.

### Star players

- **Fin Smith** (Fly-half, England) — England's first-choice fly-half and marquee playmaker; ice-cold game manager with a clutch boot (opened the scoring with an early drop goal in the 2024 season final win over Bath) who runs Saints' high-tempo, wide-wide attack from a flat alignment. Index high: `kicking`, `composure`, `handling`, `positioning`, `discipline`. Suggested rating: **92/100**. Marquee: yes. Wage: £600k.
- **Tommy Freeman** (Wing, England) — England wing and 2025 Lions Test starter; serial hat-trick scorer (four vs Saracens, hat-tricks vs Bath, Clermont, Leinster) and the first Englishman to score in every round of a Six Nations. Aerial dominance, finishing instinct, and centre-grade footwork. Index high: `pace`, `handling`, `positioning`, `agility`, `composure`. Suggested rating: **91/100**.
- **Alex Mitchell** (Scrum-half, England) — England's sniping starting 9; razor-sharp service, constant running threat around the fringes, and the tempo-setter that lets Saints play heads-up rugby from anywhere. Index high: `pace`, `agility`, `handling`, `positioning`, `stamina`. Suggested rating: **86/100**.
- **Henry Pollock** (Flanker, England) — Twenty-one-year-old breakthrough sensation; youngest player on the 2025 Lions tour, World Rugby Breakthrough Player nominee. Relentless engine, jackal threat over the ball, and a try-scoring flanker with genuine pace in the wide channels. Index high: `breakdown`, `stamina`, `pace`, `tackling`, `agility`. Suggested rating: **85/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Trevor Davison | Prop | 1992-08-20 | 33 | England | 70 | 79 | 61 | 63 | 62 | 79 | 73 | 48 | 89 | 69 | 70 | 71 |
| Curtis Langdon | Hooker | 1997-08-03 | 28 | England | 67 | 76 | 64 | 69 | 71 | 77 | 74 | 53 | 88 | 68 | 70 | 72 |
| Danilo Fischetti | Prop | 1998-01-26 | 28 | Italy | 70 | 84 | 59 | 64 | 64 | 76 | 76 | 53 | 90 | 68 | 69 | 69 |
| Alex Coles | Lock | 1999-09-21 | 26 | England | 75 | 80 | 66 | 61 | 70 | 74 | 74 | 51 | 88 | 73 | 72 | 69 |
| JJ van der Mescht | Lock | 1999-05-04 | 27 | South Africa | 74 | 79 | 61 | 69 | 68 | 73 | 72 | 55 | 91 | 67 | 72 | 72 |
| Henry Pollock | Flanker | 2005-01-14 | 21 | England | 83 | 77 | 85 | 84 | 68 | 85 | 84 | 62 | 72 | 72 | 72 | 67 |
| Tom Pearson | Flanker | 1999-10-26 | 26 | England | 72 | 81 | 71 | 77 | 72 | 77 | 78 | 58 | 76 | 72 | 73 | 71 |
| Callum Chick | Number 8 | 1996-11-25 | 29 | England | 77 | 80 | 70 | 76 | 77 | 76 | 79 | 60 | 78 | 70 | 73 | 70 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alex Mitchell | Scrum-half | 1997-05-25 | 28 | England | 84 | 66 | 87 | 85 | 87 | 71 | 73 | 72 | 60 | 71 | 87 | 75 |
| Fin Smith | Fly-half | 2002-05-11 | 24 | England | 71 | 67 | 72 | 72 | 90 | 69 | 65 | 93 | 59 | 92 | 92 | 94 |
| Tommy Freeman | Wing | 2001-03-05 | 25 | England | 73 | 67 | 93 | 93 | 89 | 68 | 63 | 67 | 58 | 71 | 91 | 92 |
| Fraser Dingwall | Centre | 1999-04-07 | 27 | England | 75 | 73 | 81 | 79 | 78 | 76 | 69 | 72 | 65 | 71 | 71 | 70 |
| Rory Hutchinson | Centre | 1995-01-29 | 31 | Scotland | 72 | 72 | 79 | 81 | 78 | 73 | 69 | 68 | 62 | 70 | 77 | 73 |
| George Hendy | Wing | 2002-10-15 | 23 | England | 70 | 68 | 91 | 88 | 76 | 70 | 68 | 71 | 59 | 68 | 73 | 68 |
| George Furbank | Full-back | 1996-10-17 | 29 | England | 66 | 65 | 80 | 78 | 78 | 73 | 68 | 77 | 64 | 71 | 76 | 73 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Robbie Smith | Hooker | 1998-09-26 | 27 | Scotland | 69 | 78 | 65 | 71 | 75 | 77 | 77 | 56 | 86 | 67 | 75 | 69 |
| Elliot Millar-Mills | Prop | 1992-07-08 | 33 | Scotland | 75 | 79 | 59 | 65 | 68 | 75 | 79 | 52 | 91 | 72 | 74 | 68 |
| Emmanuel Iyogun | Prop | 2000-11-24 | 25 | England | 75 | 86 | 61 | 59 | 65 | 79 | 75 | 51 | 86 | 73 | 74 | 66 |
| Aiden Ainsworth-Cave | Lock | 2006-07-21 | 19 | England | 75 | 77 | 64 | 67 | 70 | 77 | 75 | 51 | 87 | 73 | 69 | 70 |
| Josh Kemeny | Flanker | 1998-11-29 | 27 | Australia | 77 | 75 | 72 | 73 | 70 | 83 | 81 | 62 | 72 | 66 | 75 | 73 |
| Archie McParland | Scrum-half | 2005-02-17 | 21 | England | 73 | 67 | 84 | 75 | 79 | 71 | 73 | 75 | 58 | 72 | 78 | 79 |
| Anthony Belleau | Fly-half | 1996-04-08 | 30 | France | 73 | 61 | 73 | 79 | 83 | 68 | 63 | 90 | 64 | 75 | 78 | 76 |
| Ollie Sleightholme | Wing | 2000-04-13 | 26 | England | 71 | 67 | 86 | 85 | 75 | 68 | 66 | 70 | 59 | 74 | 76 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Angus Scott-Young | Back Row | 1997-04-23 | 29 | Australia | 77 | 80 | 69 | 72 | 72 | 77 | 82 | 60 | 78 | 71 | 77 | 69 |
| Archie Appleby | Back Row | 2007-01-13 | 19 | England | 77 | 82 | 75 | 76 | 73 | 77 | 79 | 63 | 74 | 67 | 77 | 68 |
| Archie Benson | Lock | 2001-08-18 | 24 | England | 77 | 78 | 59 | 67 | 66 | 77 | 77 | 50 | 88 | 70 | 74 | 74 |
| Charlie Ulcoq | Back Row | 2006-05-02 | 20 | England | 77 | 77 | 72 | 75 | 71 | 77 | 78 | 59 | 77 | 72 | 77 | 69 |
| Chunya Munga | Lock | 2000-09-02 | 25 | England | 77 | 80 | 64 | 67 | 71 | 79 | 77 | 53 | 88 | 73 | 74 | 72 |
| Cleopas Kundiona | Prop | 1998-12-15 | 27 | Zimbabwe | 77 | 83 | 61 | 66 | 63 | 78 | 77 | 47 | 85 | 68 | 73 | 69 |
| Craig Wright | Hooker | 2004-05-31 | 21 | England | 69 | 77 | 60 | 69 | 77 | 78 | 77 | 55 | 86 | 71 | 73 | 68 |
| Ed Prowse | Lock | 2000-10-27 | 25 | England | 77 | 81 | 62 | 69 | 70 | 77 | 77 | 51 | 88 | 73 | 71 | 73 |
| Luke Green | Prop | 2001-05-06 | 25 | England | 77 | 79 | 55 | 65 | 65 | 77 | 77 | 51 | 89 | 70 | 67 | 68 |
| Emeka Atuanya | Lock | 2003-03-17 | 23 | England | 77 | 80 | 64 | 64 | 71 | 79 | 77 | 49 | 87 | 69 | 71 | 69 |
| Fyn Brown | Back Row | 2002-10-11 | 23 | England | 78 | 80 | 73 | 71 | 73 | 77 | 77 | 57 | 74 | 68 | 77 | 74 |
| Henry Walker | Hooker | 1998-03-10 | 28 | England | 67 | 77 | 59 | 68 | 77 | 78 | 77 | 56 | 82 | 73 | 75 | 66 |
| Jack Lawrence | Back Row | 2007-02-02 | 19 | England | 77 | 78 | 73 | 75 | 75 | 77 | 81 | 60 | 78 | 69 | 77 | 67 |
| Sam Graham | Flanker | 1997-07-06 | 28 | England | 77 | 81 | 74 | 75 | 71 | 82 | 78 | 58 | 73 | 70 | 77 | 68 |
| Ollie Scola | Prop | 2006-02-03 | 20 | England | 77 | 81 | 59 | 65 | 67 | 78 | 77 | 53 | 86 | 72 | 70 | 70 |
| Siep Walta | Back Row | 2006-09-21 | 20 | Netherlands | 78 | 81 | 71 | 77 | 76 | 78 | 77 | 64 | 78 | 67 | 77 | 74 |
| Sonny Tonga'uiha | Prop | 2006-08-01 | 19 | England | 77 | 80 | 55 | 60 | 66 | 77 | 77 | 46 | 88 | 71 | 74 | 70 |
| Tom Lockett | Lock | 2002-10-06 | 23 | England | 77 | 82 | 61 | 64 | 68 | 77 | 77 | 52 | 92 | 68 | 68 | 67 |
| Tom West | Prop | 1996-02-11 | 30 | England | 77 | 85 | 61 | 66 | 68 | 81 | 78 | 47 | 89 | 70 | 67 | 71 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Aiden Pugh | Scrum-half | 2006-09-18 | 19 | England | 72 | 64 | 79 | 81 | 79 | 69 | 75 | 77 | 59 | 75 | 77 | 77 |
| Tom James | Scrum-half | 1993-10-12 | 32 | England | 66 | 63 | 80 | 82 | 79 | 69 | 74 | 78 | 62 | 72 | 77 | 77 |
| Billy Pasco | Centre | 2005-10-02 | 20 | England | 76 | 77 | 81 | 82 | 81 | 77 | 73 | 69 | 62 | 73 | 77 | 71 |
| Edoardo Todaro | Wing | 2006-09-24 | 19 | Italy | 68 | 67 | 91 | 84 | 77 | 68 | 63 | 72 | 59 | 69 | 77 | 77 |
| Freddie St John | Centre | 2007-11-07 | 19 | England | 72 | 77 | 77 | 81 | 77 | 77 | 71 | 70 | 60 | 68 | 77 | 71 |
| Henry Lumley | Centre | 2007-07-18 | 18 | England | 68 | 78 | 83 | 80 | 77 | 78 | 68 | 71 | 62 | 68 | 77 | 69 |
| James Martin | Wing | 1999-07-31 | 26 | England | 68 | 63 | 84 | 83 | 79 | 67 | 68 | 72 | 54 | 67 | 77 | 77 |
| James Pater | Wing | 2007-07-02 | 18 | England | 70 | 66 | 87 | 88 | 77 | 70 | 67 | 67 | 61 | 69 | 77 | 77 |
| James Ramm | Wing | 1998-04-30 | 28 | Australia | 67 | 70 | 91 | 87 | 77 | 67 | 66 | 66 | 56 | 70 | 77 | 77 |
| Jonny Weimann | Scrum-half | 2006-03-28 | 20 | England | 66 | 67 | 79 | 77 | 77 | 69 | 70 | 77 | 57 | 74 | 78 | 77 |
| Toby Thame | Centre | 2003-11-08 | 22 | England | 68 | 77 | 78 | 80 | 80 | 77 | 70 | 68 | 61 | 69 | 77 | 75 |
| Tom Litchfield | Centre | 2002-04-20 | 24 | England | 75 | 78 | 77 | 80 | 80 | 77 | 68 | 65 | 61 | 70 | 77 | 69 |
| Amena Caqusau | Wing | 2004-07-17 | 21 | Scotland | 67 | 67 | 87 | 87 | 81 | 69 | 61 | 72 | 56 | 73 | 77 | 77 |
| Will Glister | Wing | 2005-05-05 | 21 | England | 73 | 66 | 87 | 83 | 78 | 68 | 62 | 68 | 56 | 68 | 77 | 77 |

---

## Sale Sharks

- **Home ground:** Salford Community Stadium.
- **Club colours:** `#0a1b40` / `#ffffff`
- **Nickname:** Sharks.
- **Founded:** 1861 — one of the world's oldest surviving rugby clubs.
- **Stadium capacity:** 11,404 (shared with Salford Red Devils RL).
- **Head coach:** Alex Sanderson (Director of Rugby since 2021).
- **Captain:** Ernst van Rhyn (2025-26; succeeded Ben Curry, who stepped down with his England-contract availability reduced).
- **Honours:** League title 2005-06; European Challenge Cup 2001-02, 2004-05.
- **Overall rating:** **68/100**
- **Suggested tactics:** `kicking` · `keep_it_tight` · `balanced` · `jackal` · `one_back` · `blitz` · `cautious`
- **Stat bias:** high `tackling`, `strength`, `kicking`.

### Star players

- **Tom Curry** (Flanker, England) — Lions Test starter at openside on the 2025 Australia tour; relentless jackal threat and the "engine" of England's back row, with brutal tackle work-rate even after wrist surgery. Index high: `tackling`, `breakdown`, `stamina`, `strength`, `positioning`. Suggested rating: **91/100**.
- **George Ford** (Fly-half, England) — England's first-choice 10 through the 10-Test winning run; ice-cold game manager with a stunning 50-22 kicking game and tempo control that underpins Sale's territory-first identity. Index high: `kicking`, `composure`, `positioning`, `handling`, `discipline`. Suggested rating: **90/100**. Marquee: yes. Wage: £750k.
- **Ben Curry** (Flanker, England) — Breakdown menace and former Sale captain (stepped down ahead of 2025-26 with his England-contract availability reduced); started England's Six Nations opener alongside his twin and brings the same chop-tackle, jackal-heavy profile that defines Sale's defensive identity. Index high: `tackling`, `breakdown`, `stamina`, `strength`, `discipline`. Suggested rating: **86/100**.
- **Tom Roebuck** (Wing, England) — England wing in red-hot form (three tries in the 57-5 win over Newcastle); silky footwork, deceptive power in the carry and a genuine aerial threat that turns Sale's kick-chase into points. Index high: `pace`, `handling`, `agility`, `strength`, `positioning`. Suggested rating: **84/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bevan Rodd | Prop | 2000-08-26 | 25 | England | 63 | 83 | 54 | 54 | 61 | 77 | 70 | 49 | 87 | 63 | 70 | 66 |
| Luke Cowan-Dickie | Hooker | 1993-06-20 | 32 | England | 67 | 74 | 58 | 58 | 65 | 78 | 72 | 56 | 85 | 70 | 69 | 69 |
| Asher Opoku-Fordjour | Prop | 2004-07-16 | 21 | England | 70 | 79 | 51 | 54 | 57 | 76 | 70 | 48 | 82 | 65 | 64 | 68 |
| Ernst van Rhyn | Lock | 1997-09-19 | 28 | South Africa | 69 | 76 | 58 | 60 | 62 | 76 | 68 | 52 | 87 | 67 | 68 | 70 |
| Ben Bamber | Lock | 2001-01-24 | 25 | England | 71 | 83 | 58 | 62 | 65 | 77 | 74 | 53 | 82 | 68 | 72 | 68 |
| Ben Curry | Flanker | 1998-06-15 | 27 | England | 86 | 85 | 67 | 70 | 69 | 88 | 85 | 59 | 70 | 87 | 69 | 68 |
| Tom Curry | Flanker | 1998-06-15 | 27 | England | 90 | 92 | 66 | 70 | 63 | 91 | 89 | 57 | 73 | 66 | 90 | 65 |
| Dan du Preez | Number 8 | 1995-08-05 | 30 | South Africa | 70 | 78 | 65 | 68 | 71 | 81 | 77 | 58 | 70 | 68 | 70 | 64 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Gus Warr | Scrum-half | 1999-09-24 | 26 | England | 69 | 65 | 78 | 72 | 72 | 68 | 68 | 74 | 55 | 66 | 71 | 70 |
| George Ford | Fly-half | 1993-03-16 | 33 | England | 70 | 64 | 68 | 72 | 92 | 65 | 64 | 89 | 59 | 92 | 90 | 88 |
| Tom Roebuck | Wing | 2001-01-07 | 25 | England | 70 | 83 | 86 | 85 | 85 | 64 | 61 | 62 | 53 | 70 | 86 | 66 |
| Rob du Preez | Centre | 1993-07-30 | 32 | South Africa | 66 | 75 | 71 | 72 | 74 | 78 | 64 | 67 | 59 | 65 | 74 | 69 |
| Rekeiti Ma'asi-White | Centre | 2003-02-03 | 23 | England | 67 | 73 | 75 | 74 | 72 | 72 | 64 | 71 | 60 | 67 | 71 | 67 |
| Arron Reed | Wing | 1999-07-10 | 26 | Scotland | 65 | 70 | 79 | 81 | 71 | 65 | 61 | 71 | 52 | 67 | 71 | 64 |
| Joe Carpenter | Full-back | 2001-08-19 | 24 | England | 64 | 68 | 78 | 72 | 75 | 70 | 63 | 74 | 58 | 68 | 72 | 74 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nathan Jibulu | Hooker | 2003-01-26 | 23 | England | 66 | 75 | 54 | 62 | 75 | 76 | 75 | 58 | 85 | 68 | 73 | 68 |
| Si McIntyre | Prop | 1991-03-19 | 35 | England | 75 | 82 | 49 | 58 | 63 | 78 | 75 | 46 | 87 | 67 | 70 | 67 |
| WillGriff John | Prop | 1992-12-04 | 33 | Wales | 75 | 82 | 55 | 56 | 56 | 75 | 75 | 51 | 82 | 65 | 64 | 65 |
| Tom Burrow | Lock | 2005-07-27 | 20 | England | 75 | 77 | 60 | 55 | 62 | 76 | 75 | 55 | 88 | 68 | 66 | 66 |
| Rouban Birch | Flanker | 1999-09-20 | 26 | England | 75 | 75 | 68 | 72 | 66 | 79 | 81 | 59 | 70 | 68 | 75 | 70 |
| Raffi Quirke | Scrum-half | 2001-08-18 | 24 | England | 69 | 61 | 75 | 75 | 75 | 72 | 67 | 78 | 60 | 67 | 75 | 75 |
| Tom Curtis | Fly-half | 2001-07-01 | 24 | England | 71 | 64 | 68 | 72 | 75 | 64 | 66 | 90 | 58 | 75 | 75 | 78 |
| Tom O'Flaherty | Wing | 1994-07-21 | 31 | England | 71 | 69 | 86 | 80 | 75 | 67 | 61 | 70 | 53 | 67 | 75 | 75 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| James Harper | Prop | 2000-10-16 | 25 | England | 77 | 79 | 55 | 60 | 56 | 82 | 77 | 51 | 84 | 71 | 67 | 70 |
| Hyron Andrews | Lock | 1995-07-06 | 30 | South Africa | 77 | 77 | 54 | 61 | 59 | 77 | 77 | 50 | 83 | 70 | 67 | 67 |
| Huw Davies | Back Row | 2003-11-12 | 22 | Wales | 77 | 77 | 69 | 71 | 71 | 79 | 77 | 59 | 73 | 67 | 77 | 69 |
| Jacques Vermeulen | Flanker | 1995-02-08 | 31 | South Africa | 77 | 77 | 64 | 71 | 65 | 80 | 78 | 60 | 73 | 67 | 77 | 69 |
| Jos Gilmore | Back Row | 2005-11-25 | 20 | England | 77 | 81 | 66 | 67 | 65 | 80 | 77 | 60 | 73 | 69 | 77 | 70 |
| Ethan Caine | Hooker | 2001-09-20 | 24 | England | 66 | 77 | 55 | 65 | 77 | 78 | 77 | 57 | 86 | 70 | 67 | 65 |
| Reuben Logan | Back Row | 2005-07-28 | 20 | Scotland | 77 | 79 | 68 | 70 | 67 | 80 | 79 | 56 | 75 | 67 | 77 | 68 |
| Sam Dugdale | Back Row | 1999-09-30 | 26 | England | 77 | 80 | 67 | 67 | 69 | 77 | 78 | 58 | 75 | 69 | 77 | 70 |
| Tadgh McElroy | Hooker | 1997-06-16 | 28 | Ireland | 69 | 79 | 54 | 65 | 77 | 77 | 77 | 56 | 86 | 65 | 70 | 70 |
| Tristan Woodman | Back Row | 2004-02-12 | 22 | England | 77 | 77 | 65 | 70 | 71 | 77 | 77 | 57 | 72 | 68 | 77 | 65 |
| Tye Raymont | Prop | 2005-07-19 | 20 | England | 77 | 80 | 55 | 56 | 61 | 81 | 77 | 51 | 85 | 70 | 66 | 65 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alex Wills | Wing | 2004-02-11 | 22 | England | 65 | 66 | 84 | 77 | 77 | 70 | 59 | 66 | 59 | 66 | 77 | 77 |
| Dom Hanson | Scrum-half | 2005-12-17 | 20 | England | 66 | 64 | 77 | 77 | 77 | 70 | 72 | 77 | 54 | 72 | 77 | 77 |
| Luke James | Full-back | 1999-03-18 | 27 | England | 67 | 67 | 78 | 79 | 77 | 72 | 62 | 77 | 57 | 66 | 78 | 77 |
| Nye Thomas | Scrum-half | 2003-03-24 | 23 | Wales | 65 | 68 | 77 | 77 | 77 | 71 | 68 | 77 | 57 | 68 | 77 | 77 |
| Ollie Davies | Fly-half | 2006-12-01 | 19 | England | 66 | 68 | 73 | 71 | 77 | 70 | 67 | 84 | 60 | 77 | 77 | 77 |
| Joe Bedlow | Centre | 2002-03-29 | 24 | England | 67 | 79 | 77 | 77 | 77 | 77 | 66 | 72 | 56 | 70 | 77 | 72 |
| Marius Louw | Centre | 1995-10-24 | 30 | South Africa | 66 | 77 | 77 | 77 | 77 | 77 | 65 | 70 | 60 | 70 | 77 | 65 |
| Obi Ene | Wing | 2003-06-25 | 22 | England | 69 | 67 | 83 | 78 | 77 | 72 | 59 | 71 | 52 | 66 | 77 | 77 |

---

## Rating inputs

Snapshot date: **May 2026**, after round 16 of the 25-26 regular season (10 of 18 rounds yet to fall away from the 18-game 24-25 baseline). Refresh after each round to keep `Overall rating` current.

**2024-25 final regular-season table** (P = played, PD = points difference, B = bonus points, Pts = league points). Bath beat Leicester 23-21 in the play-off final.

| Pos | Team | P | PD | B | Pts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Bath | 18 | +234 | 16 | 72 |
| 2 | Leicester | 18 | +94 | 15 | 61 |
| 3 | Sale | 18 | +74 | 10 | 58 |
| 4 | Bristol | 18 | +55 | 18 | 58 |
| 5 | Gloucester | 18 | +89 | 16 | 56 |
| 6 | Saracens | 18 | +40 | 16 | 56 |
| 7 | Harlequins | 18 | -40 | 14 | 48 |
| 8 | Northampton | 18 | -27 | 12 | 44 |
| 9 | Exeter | 18 | -125 | 13 | 29 |
| 10 | Newcastle | 18 | -394 | 5 | 13 |

**2025-26 current table** (after round 16):

| Pos | Team | P | PD | B | Pts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Northampton | 16 | +160 | 13 | 67 |
| 2 | Bath | 16 | +222 | 15 | 63 |
| 3 | Leicester | 16 | +189 | 14 | 62 |
| 4 | Exeter | 16 | +125 | 17 | 55 |
| 5 | Saracens | 16 | +185 | 16 | 52 |
| 6 | Bristol | 16 | +35 | 10 | 50 |
| 7 | Sale | 16 | -96 | 13 | 29 |
| 8 | Harlequins | 16 | -134 | 6 | 26 |
| 9 | Gloucester | 16 | -181 | 9 | 25 |
| 10 | Newcastle | 16 | -505 | 3 | 7 |

**Published ratings** (the **Overall** column reflects the canonical per-club profile rating used by the simulator; the raw-formula value is shown alongside for reference. The formula compresses too hard at the bottom of the league — Newcastle 11/100 leaves no headroom for a struggling AI side to break out — so the profile values are deliberately hand-lifted, especially for the chasing pack and the cellar-dweller. The seasonScore columns remain the unmodified inputs):

| Team | 24-25 ppm | 24-25 score | 25-26 ppm | 25-26 score | Raw formula | **Overall** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bath | 4.00 | 80.0 | 3.94 | 78.8 | 79 | **79** |
| Leicester | 3.39 | 67.8 | 3.88 | 77.5 | 74 | **77** |
| Northampton | 2.44 | 48.9 | 4.19 | 83.8 | 70 | **76** |
| Saracens | 3.11 | 62.2 | 3.25 | 65.0 | 64 | **74** |
| Bristol | 3.22 | 64.4 | 3.13 | 62.5 | 63 | **73** |
| Exeter | 1.61 | 32.2 | 3.44 | 68.8 | 54 | **70** |
| Sale | 3.22 | 64.4 | 1.81 | 36.3 | 48 | **68** |
| Gloucester | 3.11 | 62.2 | 1.56 | 31.3 | 44 | **67** |
| Harlequins | 2.67 | 53.3 | 1.63 | 32.5 | 41 | **66** |
| Newcastle | 0.72 | 14.4 | 0.44 | 8.8 | 11 | **55** |

---

## Telemetry interpretation

The simulator is calibrated against the real-world standings above — telemetry reviews should compare against these, not against an idealised "every team should be competitive" baseline.

- **Newcastle bottom of the table is the correct outcome.** Overall rating 11/100, real-world finishes of 13 pts (24-25) and 7 pts after R16 of 25-26 (PD −505). Telemetry showing NEW with 7-11 wins out of 90 fixtures and ~25 pts conceded per match is **realistic**, not a balance bug. Their player stats are intentionally the league's weakest pending squad rebuild. Don't flag NEW's poor record as an issue, don't propose tactic/stat lifts to "fix" it.
- **The real balance question lives at the top.** Real-world top of the table (R16 of 25-26): Northampton 67 / Bath 63 / Leicester 62 — a three-team race within 5 points. Bath the defending champions, Saints currently leading, Tigers in close contention. If the simulator has Bath running 20+ league points clear of the other two, the dominance has gone past realistic, and that's the balance issue to look at. The expected shape is roughly **NOR ≈ BAT ≈ LEI at the top, ~10 pts ahead of a competitive 4-6 chasing pack (EXE / SAR / BRI), with SAL / HAR / GLO mid-low and NEW comfortably bottom**.
- **Other teams' positions can wobble round-to-round.** SAL was 3rd in 24-25, 7th in 25-26 after R16. Single-season-style variance in the simulator (BRI / SAR / EXE / GLO trading mid-table places) is expected and not by itself a calibration problem.

---

## Data notes

Squad data was compiled in parallel from multiple public sources and has been spot-validated in May 2026. Known caveats for a future cleanup pass:

- **Position normalisation:** Some entries use `Back Row` / `Back row` / specific (`Flanker`, `Number 8`) interchangeably; Newcastle's Freddie Clarke (`Lock/Back row`) and Elliott Obatoyinbo (`Wing/Full-back`) carry a slash for versatility. When this file is wired into the engine, normalise to the position literals used in `src/data/team-*.json`.
- **Nationality / position discrepancies to verify** (May 2026 audit pass surfaced these — public sources disagreed with the current doc; not auto-changed, worth a manual call):
  - Archie McArthur (Gloucester) — Wikipedia lists English; doc has Scotland.
  - Tomas Gwilliam (Bristol) — All.Rugby lists English; doc has Wales.
  - Nye Thomas (Sale) — Wikipedia / England U20 records list English; doc has Wales.
  - Jono Benz-Salomon (Gloucester) — public sources suggest Spanish-French background; doc has England.
  - Hugh Bokenham (Gloucester) — public sources list Australian; doc has England.
  - Josh Carrington (Bristol) — public sources list Welsh; doc has England.
  - Paddy Pearce (Bristol) — primary position Lock per public sources; doc has Flanker.
  - Sam Waugh (Newcastle) — public sources list full-back; doc has Centre.
  - James Pater (Northampton) — primary position full-back per public sources; doc has Wing.
- **Newcastle Falcons:** The squad has been in flux with heavy recruitment in recent seasons; expect this list to be the least stable of the ten.
- **Gloucester / Newcastle name clash:** Cameron Jordan (Lock, Gloucester, b. 1996-05-23) and Cam Jordan (Lock, Newcastle, b. 1999-11-17) are distinct players — different DOBs, both English locks.
