# Team Data — Gallagher Premiership Profiles

This file is the canonical, human-readable reference for each Gallagher Premiership club's identity. Each profile summarises a team's playing style, signature gameplay features, and core DNA in 4–5 lines, with a suggested mapping to the in-game `TeamTactics` dimensions, a hint on which player stats should be biased for that club's character, and the 2025-26 senior first-team squad.

The simulator ships all 10 Premiership clubs. This file is the source of truth for team identity, stars, and rosters — `scripts/generateTeamJsons.mjs` parses it to produce the `src/data/team-*.json` files the engine loads.

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

**Player base stats** (12 fields, 0–100 scale, from `src/data/team-*.json`):
`stamina · strength · pace · agility · handling · tackling · breakdown · kicking · setPiece · discipline · positioning · composure`

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

Premiership ppm has a realistic ceiling of ~5.0 (win + try bonus). The 60/40 blend leans on the current season while still respecting prior-season form. Snapshot inputs and the per-team math are documented in "Rating inputs" at the bottom of this file — refresh after each round.

---

## Gloucester

A historic west-country club with a cherry-and-white forwards-led identity, defined by the close, vocal "Shed" at Kingsholm. Gloucester traditionally make their living from a robust, hard-carrying pack, set-piece confrontation and direct lines through the middle. The backline is functional rather than expansive, leaning on power runners to punch holes that fast support can exploit. At their best they are abrasive, physical and uncompromising at the breakdown; at their worst they over-rely on the forwards when a wider game is needed.

- **Home ground:** Kingsholm Stadium (the famous "Shed" terrace).
- **Club colours:** `#c8102e` / `#ffffff`
- **Nickname:** Cherry & Whites.
- **Founded:** 1873.
- **Stadium capacity:** 16,115.
- **Head coach:** George Skivington (Head Coach; returned to the role March 2026 after serving as Director of Rugby from September 2023, having previously been Head Coach from 2020).
- **Captain:** Tomos Williams (2025-26; confirmed in December 2025 to be joining Saracens at season's end).
- **Honours:** RFU Cup × 4 (1971-72, 1977-78, 1981-82, 2002-03); European Challenge Cup 2005-06, 2014-15.
- **Overall rating:** **67/100**
- **Suggested tactics:** `balanced` · `keep_it_tight` · `commit_numbers` · `counter_ruck` · `one_back` · `drift`
- **Stat bias:** high `strength`, `breakdown`, `setPiece`.

### Star players

- **Ross Byrne** (Fly-half, Ireland) — Headline signing from Leinster and the province's third all-time top points scorer (1,156 pts), bringing four URC titles and a Champions Cup pedigree to Kingsholm as the new tactical conductor. Index high: `kicking`, `composure`, `positioning`, `discipline`, `handling`. Suggested rating: **86/100**.
- **Tomos Williams** (Scrum-half, Wales) — Gloucester's 2025-26 club captain and reigning Premiership Rugby Player of the Season; 69-cap Wales 9 and 2025 Lions tourist who scored twice against the Western Force in Perth before a hamstring injury cut his tour short. A sniping running threat, sharp service and tempo control from the base — confirmed in December 2025 to be joining Saracens at season's end. Index high: `pace`, `agility`, `handling`, `composure`, `positioning`. Suggested rating: **87/100**. Marquee: yes. Wage: £550k.
- **Max Llewellyn** (Centre, Wales) — Big-bodied 13 who broke into the Wales midfield during the 2025 Six Nations (scored his first Test try vs Scotland) and gives Gloucester a power-runner gainline option through the middle channel. Index high: `strength`, `tackling`, `handling`, `pace`. Suggested rating: **82/100**.
- **Lewis Ludlow** (Flanker, England) — Former long-serving Gloucester captain and England A skipper; relentless openside whose breakdown work-rate and tackle volume have anchored the cherry-and-whites' defensive identity for years. Index high: `breakdown`, `tackling`, `stamina`, `discipline`, `positioning`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Val Rapava-Ruskin | Prop | 1992-12-12 | 33 | Georgia |
| Seb Blake | Hooker | 2002-06-23 | 23 | England |
| Afolabi Fasogbon | Prop | 2003-12-17 | 22 | Ireland |
| Hugh Bokenham | Lock | 2001-07-20 | 24 | England |
| Arthur Clark | Lock | 1999-09-24 | 26 | England |
| Lewis Ludlow | Flanker | 1994-12-19 | 31 | England |
| Josh Basham | Flanker | 1999-08-08 | 26 | England |
| Jack Mann | Back Row | 1999-01-30 | 27 | England |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Tomos Williams | Scrum-half | 1994-10-25 | 31 | Wales |
| Ross Byrne | Fly-half | 1995-03-29 | 31 | Ireland |
| Will Joseph | Wing | 2003-02-04 | 23 | England |
| Max Llewellyn | Centre | 1997-09-04 | 28 | Wales |
| Seb Atkinson | Centre | 2001-08-27 | 24 | England |
| Ben Loader | Wing | 1999-01-24 | 27 | England |
| George Barton | Utility Back | 1999-09-04 | 26 | England |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Jack Innard | Hooker | 2001-04-13 | 25 | England |
| Jamal Ford-Robinson | Prop | 1993-04-23 | 33 | England |
| Kirill Gotovtsev | Prop | 1987-07-17 | 38 | Russia |
| Danny Eite | Lock | 2003-06-28 | 22 | England |
| James Venter | Flanker | 1995-12-28 | 30 | South Africa |
| Mike Austin | Scrum-half | 2000-11-30 | 25 | England |
| Charlie Atkinson | Fly-half | 2001-04-08 | 25 | England |
| Ben Redshaw | Full-back | 2005-01-10 | 21 | England |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Archie McArthur | Prop | 2003-06-11 | 22 | Scotland |
| Cameron Jordan | Lock | 1996-05-23 | 30 | England |
| Ciaran Knight | Prop | 1995-08-30 | 30 | England |
| Freddie Thomas | Lock | 1999-07-22 | 26 | England |
| Harry Taylor | Back Row | 2002-01-15 | 24 | England |
| Jack Clement | Back Row | 2001-04-04 | 25 | England |
| Jack Singleton | Hooker | 1996-08-07 | 29 | England |
| Nepo Laulala | Prop | 1991-10-29 | 34 | New Zealand |
| Jono Benz-Salomon | Prop | 2001-03-17 | 25 | England |
| Will Trenholm | Back Row | 2001-01-06 | 25 | England |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Caolan Englefield | Scrum-half | 2000-04-15 | 26 | England |
| Jake Morris | Wing | 2002-05-10 | 24 | England |
| Ollie Thorley | Wing | 1996-08-23 | 29 | England |
| Rob Russell | Wing | 1998-12-04 | 27 | Ireland |
| Will Butler | Centre | 1998-04-17 | 28 | England |
| Josh Hathaway | Wing | 2003-09-04 | 22 | England |

---

## Bristol Bears

Shaped by the Pat Lam era's "Bristol-Bilbao" expansive ambition, the Bears are the league's most ball-in-hand, high-tempo side, willing to attack from anywhere on the pitch. They prize width, offloads and pace over territorial caution, and will gladly trade penalties for tempo. Their forwards are built for carrying and linking rather than maul dominance, and they often outscore opponents in shootouts. The flip side is risk: turnovers and defensive lapses come with the style.

- **Home ground:** Ashton Gate.
- **Club colours:** `#003087` / `#c8102e`
- **Nickname:** The Bears (rebranded from Bristol in 2018).
- **Founded:** 1888.
- **Stadium capacity:** 27,000 (shared with Bristol City FC).
- **Head coach:** Pat Lam (Director of Rugby since 2017).
- **Captain:** Fitz Harding (long-term extension signed 2023-24).
- **Honours:** European Challenge Cup 2019-20; RFU Knockout Cup 1982-83; Championship title 2017-18.
- **Overall rating:** **73/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `two_back` · `drift`
- **Stat bias:** high `pace`, `handling`, `agility`.

### Star players

- **Ellis Genge** (Prop, England) — Lions Test starter on the 2025 tour to Australia and dubbed the "form player in the world" by Ben Youngs; world-class loosehead scrummager and Bristol's vice-captain whose ball-carrying sets the tempo. Index high: `strength`, `setPiece`, `breakdown`, `tackling`, `stamina`. Suggested rating: **91/100**.
- **Louis Rees-Zammit** (Wing, Wales) — Returned from the NFL in summer 2025 and lit up the PREM with six tries in eight, clocking 23.57mph against Leicester; 32-cap Wales finisher with elite top-end pace and a 2021 Lions tourist's pedigree. Index high: `pace`, `agility`, `handling`, `positioning`. Suggested rating: **88/100**. Marquee: yes. Wage: £550k.
- **Viliame Mata** (Number 8, Fiji) — Long-time Edinburgh enforcer turned Bristol No.8; offloading, ball-playing back-rower whose footwork and tip-on game perfectly fit Pat Lam's wide-wide system. Index high: `strength`, `handling`, `breakdown`, `agility`, `stamina`. Suggested rating: **85/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Ellis Genge | Prop | 1995-02-22 | 31 | England |
| Gabriel Oghre | Hooker | 1998-11-21 | 27 | England |
| George Kloska | Prop | 2002-02-11 | 24 | England |
| Joe Owen | Lock | 2003-01-23 | 23 | England |
| Joe Batley | Lock | 1996-09-06 | 29 | England |
| Fitz Harding | Flanker | 1997-11-29 | 28 | England |
| Luka Ivanishvili | Flanker | 1999-12-12 | 26 | Georgia |
| Viliame Mata | Number 8 | 1991-04-15 | 35 | Fiji |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Harry Randall | Scrum-half | 1997-10-29 | 28 | England |
| Tom Jordan | Fly-half | 1998-08-19 | 27 | Scotland |
| Gabriel Ibitoye | Wing | 1998-04-26 | 28 | England |
| Sam Bedlow | Centre | 1995-08-08 | 30 | England |
| Benhard Janse van Rensburg | Centre | 1994-02-09 | 32 | South Africa |
| Kalaveti Ravouvou | Wing | 1996-03-30 | 30 | Fiji |
| Louis Rees-Zammit | Wing / Full Back | 2001-02-02 | 25 | Wales |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Harry Thacker | Hooker | 1994-04-22 | 32 | England |
| Max Lahiff | Prop | 1989-09-24 | 36 | England |
| Sam Grahamslaw | Prop | 1999-08-04 | 26 | Scotland |
| Steele Barker | Lock | 2001-01-12 | 25 | England |
| Santiago Grondona | Number 8 | 1999-04-15 | 27 | Argentina |
| Kieran Marmion | Scrum-half | 1992-05-29 | 33 | Ireland |
| AJ MacGinty | Fly-half | 1989-12-07 | 36 | USA |
| Josh Carrington | Wing | 2002-04-25 | 24 | England |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Will Capon | Hooker | 1997-09-01 | 28 | England |
| Lovejoy Chawatama | Prop | 1991-12-30 | 34 | England |
| Tomas Gwilliam | Hooker | 2002-11-19 | 23 | Wales |
| Jimmy Halliwell | Prop | 2004-03-31 | 22 | England |
| Paddy Pearce | Flanker | 2004-05-07 | 22 | England |
| Pedro Rubiolo | Lock | 2002-03-15 | 24 | Argentina |
| Jake Heenan | Flanker | 1992-04-09 | 34 | Ireland |
| Steven Luatua | Flanker | 1991-06-10 | 34 | New Zealand |
| Will Ramply | Lock | 2004-05-25 | 22 | England |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| James Williams | Centre | 1998-08-04 | 27 | England |
| Joe Jenkins | Centre | 2003-10-13 | 22 | England |
| Jack Bates | Wing | 2001-09-21 | 24 | England |
| Rich Lane | Full-back | 1994-12-22 | 31 | England |
| Sam Wolstenholme | Scrum-half | 2001-04-19 | 25 | England |
| Max Pepper | Scrum-half | 2001-01-09 | 25 | England |
| Noah Heward | Full-back | 2002-03-30 | 24 | England |

---

## Leicester Tigers

The Welford Road tradition is set-piece power, structured forward-led play, and hard-nosed defence built on discipline. Tigers historically squeeze the game through scrum and maul dominance, accurate exit kicking, and a defensive line that gives nothing cheap. Their attack is built off forward platform first, with the backs called on to finish rather than create from scratch. Recent rebuilds have softened the edges, but the identity remains: territory, set piece, pressure.

- **Home ground:** Mattioli Woods Welford Road (commonly "Welford Road").
- **Club colours:** `#1c5e3f` / `#ffffff`
- **Nickname:** Tigers.
- **Founded:** 1880.
- **Stadium capacity:** 25,849 (the largest club-owned rugby ground in England).
- **Head coach:** Geoff Parling (Head Coach since August 2025, succeeding Michael Cheika).
- **Captain:** Ollie Chessum (appointed September 2025).
- **Honours:** 11 × English league title (latest 2021-22, most in the modern era); 2 × European Champions Cup (2000-01, 2001-02); Anglo-Welsh Cup × 6.
- **Overall rating:** **77/100**
- **Suggested tactics:** `kicking` · `keep_it_tight` · `commit_numbers` · `jackal` · `two_back` · `hybrid`
- **Stat bias:** high `setPiece`, `tackling`, `discipline`.

### Star players

- **Freddie Steward** (Full-back, England) — England's first-choice 15 and the Premiership's most dominant aerial operator; reads kick-chase lanes better than anyone and rarely spills under the high ball. Index high: `positioning`, `handling`, `tackling`, `composure`, `kicking`. Suggested rating: **82/100**.
- **Ollie Chessum** (Lock, England) — 2025 Lions Test 2 starter (off the bench in Tests 1 and 3) and the league's most athletic lock-cum-blindside; carries hard, hits rucks at pace, and is a genuine lineout option in both pods. Index high: `strength`, `setPiece`, `stamina`, `tackling`, `breakdown`. Suggested rating: **87/100**. Marquee: yes. Wage: £550k.
- **Tommy Reffell** (Flanker, Wales) — Wales' premier openside and arguably the Premiership's purest jackal; averaged 6-7 turnovers a game in patches and topped the July Tests for forced turnovers. Index high: `breakdown`, `tackling`, `stamina`, `discipline`, `positioning`. Suggested rating: **84/100**.
- **Jack van Poortvliet** (Scrum-half, England) — England-capped 9 whose box-kick accuracy and pass speed fit Welford Road's territory-first identity; a sharp tactical kicker who controls the tempo from the base. Index high: `kicking`, `handling`, `positioning`, `composure`, `agility`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Nicky Smith | Prop | 1994-04-07 | 32 | Wales |
| Jamie Blamire | Hooker | 1997-12-22 | 28 | England |
| Joe Heyes | Prop | 1999-04-13 | 27 | England |
| Ollie Chessum | Lock | 2000-09-06 | 25 | England |
| George Martin | Lock | 2001-06-18 | 24 | England |
| Tommy Reffell | Flanker | 1999-04-27 | 27 | Wales |
| Hanro Liebenberg | Back Row | 1995-10-10 | 30 | South Africa |
| Emeka Ilione | Back Row | 2002-03-20 | 24 | England |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Jack van Poortvliet | Scrum-half | 2001-05-15 | 25 | England |
| Billy Searle | Fly-half | 1996-03-25 | 30 | England |
| Adam Radwan | Wing | 1997-12-30 | 28 | England |
| Orlando Bailey | Centre | 2001-09-30 | 24 | England |
| Solomone Kata | Centre | 1994-12-03 | 31 | Tonga |
| Ollie Hassell-Collins | Wing | 1999-01-17 | 27 | England |
| Freddie Steward | Full-back | 2000-12-05 | 25 | England |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Charlie Clare | Hooker | 1991-12-16 | 34 | England |
| Tarek Haffar | Prop | 2001-09-13 | 24 | England |
| Will Hurd | Prop | 1999-06-29 | 26 | Scotland |
| Cam Henderson | Lock | 2000-01-13 | 26 | Scotland |
| Olly Cracknell | Flanker | 1994-05-26 | 31 | Wales |
| Ollie Allan | Scrum-half | 2004-02-04 | 22 | England |
| James O'Connor | Fly-half | 1990-07-05 | 35 | Australia |
| Izaia Perese | Centre | 1997-05-17 | 28 | Australia |


**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Ale Loman | Prop | 2000-05-15 | 26 | Sweden |
| Archie van der Flier | Prop | 2002-04-25 | 24 | England |
| Cameron Miell | Prop | 2004-05-09 | 22 | South Africa |
| Finn Carnduff | Flanker | 2004-03-10 | 22 | England |
| George Marsh | Back Row |  | 19 | England |
| Lewis Chessum | Lock | 2003-02-27 | 23 | England |
| Harry Palmer | Lock | 2005-10-28 | 20 | England |
| Harry Wells | Lock | 1993-09-29 | 32 | England |
| James Thompson | Lock | 1999-07-13 | 26 | New Zealand |
| Joaquin Moro | Flanker | 2001-01-24 | 25 | Argentina |
| John Stewart | Hooker | 2002-03-08 | 24 | England |
| Joshua Manz | Back Row | 2004-03-22 | 22 | England |
| Diamond Ayiehfor | Prop |  | 19 | England |
| Osian Thomas | Lock | 2004-11-30 | 21 | Wales |
| Tom Manz | Lock | 2001-07-09 | 24 | England |
| Tonga Kofe | Prop |  | 29 | USA |
| Tubuna Maka | Prop | 2005-11-18 | 20 | Fiji |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Wilf McCarthy | Centre | 2002-10-08 | 23 | England |
| Charlie Titcombe | Fly-half | 2001-12-28 | 24 | England |
| Joseph Woodward | Centre | 2003-09-17 | 22 | England |
| Tom Whiteley | Scrum-half | 1995-12-17 | 30 | England |
| Will Wand | Centre | 2001-12-31 | 24 | England |
| Gabriel Hamer-Webb | Wing | 2000-11-07 | 25 | England |

---

## Saracens

Under Mark McCall, Saracens have been the league's clinical operator — structure, precision and physical dominance executed to a finer tolerance than anyone else. The "Wolfpack" defence with its aggressive line-speed and choke tackles is the signature, paired with a smart kicking game that turns territory into points. They are ruthless game managers: ahead late, they will close a match out with possession and field position rather than tries. Calm under pressure, brutal in the collision.

- **Home ground:** StoneX Stadium (formerly Allianz Park).
- **Club colours:** `#000000` / `#ed1c24`
- **Nickname:** Sarries (the "Wolfpack" defensive identity).
- **Founded:** 1876.
- **Stadium capacity:** 10,500.
- **Head coach:** Mark McCall (Director of Rugby since 2010; stepping down end of 2025-26, with Brendan Venter to take over for 2026-27).
- **Captain:** Maro Itoje.
- **Honours:** 6 × Premiership title (latest 2022-23); 3 × European Champions Cup (2015-16, 2016-17, 2018-19).
- **Overall rating:** **74/100**
- **Suggested tactics:** `kicking` · `balanced` · `balanced` · `shadow` · `two_back` · `blitz`
- **Stat bias:** high `tackling`, `positioning`, `composure`.

### Star players

- **Maro Itoje** (Lock, England) — 2025 Lions captain and the first Black skipper in the tour's 137-year history; ran a lineout "clinic" in the series win and remains the gold standard for a modern second row — enforcer, jumper, leader. Index high: `setPiece`, `tackling`, `strength`, `breakdown`, `composure`. Suggested rating: **92/100**. Marquee: yes. Wage: £800k.
- **Owen Farrell** (Fly-half, England) — Returned from Racing 92 on a two-year playing deal; over 1,200 Test points, five Premiership titles with Sarries, and still the league's most ruthless game-manager off the tee. Index high: `kicking`, `composure`, `positioning`, `discipline`, `tackling`. Suggested rating: **84/100**.
- **Ben Earl** (Number 8, England) — 2025 Lions Test back-rower and 2024 England Player of the Year; 73 carries for 419 metres across that Six Nations made him the explosive go-to ball-carrier from the base. Index high: `pace`, `strength`, `stamina`, `handling`, `tackling`. Suggested rating: **88/100**.
- **Jamie George** (Hooker, England) — Long-time England hooker and former captain; elite throwing accuracy underpins the Sarries lineout and his work rate around the park is a benchmark for the position. Index high: `setPiece`, `tackling`, `breakdown`, `composure`, `discipline`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Rhys Carre | Prop | 1998-02-08 | 28 | Wales |
| Jamie George | Hooker | 1990-10-20 | 35 | England |
| Marco Riccioni | Prop | 1997-10-19 | 28 | Italy |
| Maro Itoje | Lock | 1994-10-28 | 31 | England |
| Nick Isiekwe | Lock | 1998-04-20 | 28 | England |
| Juan Martin Gonzalez | Flanker | 2000-11-14 | 25 | Argentina |
| Ben Earl | Back Row | 1998-01-07 | 28 | England |
| Tom Willis | Number 8 | 1999-01-18 | 27 | England |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Charlie Bracken | Scrum-half | 2003-12-09 | 22 | England |
| Owen Farrell | Fly-half | 1991-09-24 | 34 | England |
| Rotimi Segun | Wing | 1996-12-28 | 29 | England |
| Lucio Cinti | Centre | 2000-02-23 | 26 | Argentina |
| Nick Tompkins | Centre | 1995-02-16 | 31 | Wales |
| Noah Caluori | Wing | 2006-09-22 | 19 | England |
| Elliot Daly | Utility Back | 1992-10-08 | 33 | England |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Theo Dan | Hooker | 2000-12-26 | 25 | England |
| Eroni Mawi | Prop | 1996-02-06 | 30 | Fiji |
| Marcus Street | Prop | 1999-02-06 | 27 | England |
| Hugh Tizard | Lock | 2000-03-31 | 26 | England |
| Andy Onyeama-Christie | Flanker | 1999-03-22 | 27 | Scotland |
| Ivan van Zyl | Scrum-half | 1995-06-30 | 30 | South Africa |
| Fergus Burke | Fly-half | 1999-09-03 | 26 | Scotland |
| Jack Bracken | Wing | 2005-10-15 | 20 | England |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Barnaby Merrett | Back Row | 2004-11-22 | 21 | England |
| Harvey Beaton | Prop | 2001-03-15 | 25 | England |
| Alec Clarey | Prop | 1994-02-08 | 32 | England |
| Phil Brantingham | Prop | 2001-10-02 | 24 | England |
| James Hadfield | Hooker | 1997-11-27 | 28 | England |
| James Isaacs | Hooker | 2004-03-28 | 22 | England |
| Mak Eke | Back Row | 2003-12-04 | 22 | England |
| Toby Knight | Flanker | 2002-01-05 | 24 | England |
| Nathan Michelow | Back Row | 2004-05-16 | 22 | England |
| Eoghan Clarke | Hooker | 1998-06-12 | 27 | Ireland |
| Theo McFarland | Back Row | 1995-10-16 | 30 | Samoa |
| Vilikesa Nairau | Prop | 2002-06-03 | 23 | Fiji |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Alex Lozowski | Centre | 1993-06-30 | 32 | England |
| Louie Johnson | Fly-half | 2003-06-13 | 22 | England |
| Max Malins | Wing | 1997-01-07 | 29 | England |
| Olly Hartley | Centre | 2002-02-19 | 24 | England |
| Sam Spink | Centre | 1999-10-06 | 26 | England |
| Tobias Elliott | Wing | 2003-09-16 | 22 | England |
| Angus Hall | Centre | 2005-09-17 | 20 | England |
| Gareth Simpson | Scrum-half | 1997-11-02 | 28 | England |

---

## Bath Rugby

The 2024-25 champions, built around a dual-playmaker backline of Finn Russell at 10 and Santi Carreras at 15, with strong ball-playing centres giving Bath multiple distributors at the line. Their best rugby blends forward dominance and territory with a backline that can shift the point of attack at will. Russell's growing pragmatism has added game management to the flair, though some 2025-26 criticism has pointed to conservative five-metre pick-and-drive over their expansive instincts. At full song, they balance heft up front with the league's most creative half-back axis.

- **Home ground:** The Recreation Ground (commonly "The Rec").
- **Club colours:** `#0033a0` / `#ffffff`
- **Nickname:** The Blue, Black and Whites.
- **Founded:** 1865 — one of the oldest rugby clubs in England.
- **Stadium capacity:** 14,500 (18,000-seat rebuild approved September 2025).
- **Head coach:** Johann van Graan (Head of Rugby since 2022, contracted to 2030).
- **Captain:** Ben Spencer.
- **Honours:** 7 × English league title (latest 2024-25); 10 × RFU Cup (1984–1996 dynasty); European Challenge Cup 2007-08.
- **Overall rating:** **79/100**
- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `two_back` · `hybrid`
- **Stat bias:** high `handling`, `kicking`, `composure`.

### Star players

- **Thomas du Toit** (Prop, South Africa) — 2025 World Rugby Dream Team prop and the Springboks' first-choice loosehead; a destructive scrum technician whose mobility, abrasive breakdown work and high-volume ball-carrying set him apart from any other prop in the world game. Springbok pillar in the 2023 Rugby World Cup defence; signed for Bath from Sale ahead of 2024-25 and became the cornerstone of the championship-winning pack. Index high: `setPiece`, `strength`, `breakdown`, `tackling`, `stamina`. Suggested rating: **93/100**.
- **Finn Russell** (Fly-half, Scotland) — Scotland captain and three-time Lion; the creative fulcrum of Bath's title defence with audacious passing range, sublime kicking from the tee and in play, and a newly mature game-management edge. Not a pure speed merchant but his footwork, body angles and step in the line are world-class. Index high: `handling`, `kicking`, `composure`, `positioning`, `agility`. Suggested rating: **92/100**. Marquee: yes. Wage: £1m.
- **Ben Spencer** (Scrum-half, England) — Bath club captain and the experienced general at the base who lifted the 2024-25 Premiership trophy. Spent a decade at Saracens winning multiple Premiership and Champions Cup titles before joining Bath in 2020; capped by England across two World Cup cycles and a late call-up to the 2021 Lions tour of South Africa. An elite box-kicker with a metronomic service and sharp tactical brain, his territorial control and tempo management are the perfect foil for Russell's creativity. Index high: `kicking`, `composure`, `positioning`, `discipline`, `handling`. Suggested rating: **85/100**.
- **Sam Underhill** (Flanker, England) — One of the Premiership's most feared defensive forwards: timing, technique and ferocity on the chop tackle, with a relentless work-rate around the breakdown. Index high: `tackling`, `breakdown`, `strength`, `stamina`. Suggested rating: **86/100**.
- **Santi Carreras** (Full-back, Argentina) — Pumas' starting fly-half slotting in at 15 to give Bath a second playmaker; aerial security, a beautiful left boot and the footwork to step into the line as a second-receiver. Index high: `handling`, `kicking`, `agility`, `positioning`. Suggested rating: **84/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Thomas du Toit | Prop | 1995-05-05 | 31 | South Africa |
| Tom Dunn | Hooker | 1992-11-12 | 33 | England |
| Beno Obano | Prop | 1994-10-25 | 31 | England |
| Charlie Ewels | Lock | 1995-06-29 | 30 | England |
| Ted Hill | Lock / Flanker | 1999-03-26 | 27 | England |
| Sam Underhill | Flanker | 1996-07-22 | 29 | England |
| Josh Bayliss | Flanker | 1997-09-18 | 28 | Scotland |
| Alfie Barbeary | Number 8 | 2000-10-05 | 25 | England |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Ben Spencer | Scrum-half | 1992-07-31 | 33 | England |
| Finn Russell | Fly-half | 1992-09-23 | 33 | Scotland |
| Henry Arundell | Wing | 2002-11-08 | 23 | England |
| Max Ojomoh | Centre | 2000-09-14 | 25 | England |
| Ollie Lawrence | Centre | 1999-09-18 | 26 | England |
| Joe Cokanasiga | Wing | 1997-11-15 | 28 | England |
| Santi Carreras | Full-back | 1998-03-30 | 28 | Argentina |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Dan Frost | Hooker | 1997-04-24 | 29 | England |
| Archie Griffin | Prop | 2001-07-24 | 24 | Wales |
| Will Stuart | Prop | 1996-07-12 | 29 | England |
| Quinn Roux | Lock | 1990-10-30 | 35 | Ireland |
| Guy Pepper | Flanker | 2003-04-15 | 23 | England |
| Tom Carr-Smith | Scrum-half | 2002-02-28 | 24 | England |
| Cameron Redpath | Centre | 1999-12-23 | 26 | Scotland |
| Will Muir | Wing | 1995-10-30 | 30 | England |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Ethan Staddon | Flanker | 2002-07-03 | 23 | England |
| Ewan Richards | Flanker | 2002-04-06 | 24 | England |
| Francois van Wyk | Prop | 1991-07-30 | 34 | South Africa |
| Thompson Cowan | Flanker | 2002-08-02 | 23 | Wales |
| Ross Molony | Lock | 1994-05-11 | 32 | Ireland |
| Jaco Coetzee | Number 8 | 1996-06-10 | 29 | South Africa |
| Jasper Spandler | Hooker | 2003-05-21 | 23 | England |
| Kieran Verden | Prop | 1998-11-06 | 27 | England |
| Mikey Summerfield | Prop | 2002-10-30 | 23 | England |
| Miles Reid | Flanker | 1998-09-05 | 27 | England |


**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Austin Emens | Full-back | 2002-10-09 | 23 | England |
| Bernard van der Linde | Scrum-half | 2000-11-30 | 25 | South Africa |
| Ciaran Donoghue | Fly-half | 2003-01-07 | 23 | Ireland |
| Louie Hennessey | Centre | 2004-03-29 | 22 | Wales |
| Will Butt | Centre | 2000-01-15 | 26 | England |
| Neil le Roux | Scrum-half | 2003-04-16 | 23 | South Africa |
| Sam Harris | Fly-half | 2003-09-03 | 22 | England |
| Tom de Glanville | Full-back | 1999-12-10 | 26 | England |
| Chris Harris | Centre | 1990-12-28 | 35 | Scotland |

---

## Exeter Chiefs

The Rob Baxter long-build identity is phase-heavy possession rugby — pressure and patience, suffocating teams with multiple phases and field position before striking. The driving maul is a signature weapon and the forwards are built for relentless go-forward over flashy carries. Chiefs cede little territory, kick smartly and trust their fitness to wear opponents down. They are mid-rebuild after the peak title-winning era, but the DNA — disciplined, methodical, set-piece confident — is intact.

- **Home ground:** Sandy Park.
- **Club colours:** `#000000` / `#ffffff`
- **Nickname:** Chiefs.
- **Founded:** 1871.
- **Stadium capacity:** 15,600.
- **Head coach:** Rob Baxter (Director of Rugby since 2009 — the league's longest-serving head coach).
- **Captain:** Dafydd Jenkins.
- **Honours:** 2 × Premiership title (2016-17, 2019-20); European Champions Cup 2019-20; Anglo-Welsh Cup 2013-14.
- **Overall rating:** **70/100**
- **Suggested tactics:** `possession` · `keep_it_tight` · `commit_numbers` · `counter_ruck` · `one_back` · `blitz`
- **Stat bias:** high `stamina`, `breakdown`, `setPiece`.

### Star players

- **Henry Slade** (Centre, England) — 74-cap England 13, the Chiefs' on-field metronome: long passing, pinpoint kicking from hand and elite defensive reads that shut down opposition channels. Said to be in one of his best club seasons. Index high: `handling`, `kicking`, `tackling`, `positioning`, `composure`. Suggested rating: **82/100**.
- **Len Ikitau** (Centre, Australia) — Marquee Wallaby signing from the Brumbies: 39-cap Test 13 with bone-jarring defence, sharp spatial awareness and the carrying power to break gainlines. Already producing standout Premiership performances. Index high: `tackling`, `strength`, `pace`, `positioning`. Suggested rating: **85/100**.
- **Immanuel Feyi-Waboso** (Wing, England) — Explosive England finisher; a hat-trick on return announced him as one of the league's most dangerous strike runners off both wings, with raw acceleration and aerial bravery. Index high: `pace`, `agility`, `handling`, `strength`. Suggested rating: **86/100**. Marquee: yes. Wage: £500k.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Scott Sio | Prop | 1991-10-16 | 34 | Australia |
| Joseph Dweba | Hooker | 1995-10-25 | 30 | South Africa |
| Josh Iosefa-Scott | Prop | 1996-07-16 | 29 | New Zealand |
| Dafydd Jenkins | Lock | 2002-12-05 | 23 | Wales |
| Andrea Zambonin | Lock | 2000-09-03 | 25 | Italy |
| Ethan Roots | Flanker | 1997-11-10 | 28 | England |
| Christ Tshiunza | Flanker| 2002-01-09 | 24 | Wales |
| Greg Fisilau | Number 8 | 2003-07-09 | 22 | England |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Stephen Varney | Scrum-half | 2001-05-16 | 25 | Italy |
| Harvey Skinner | Fly-half | 1997-12-31 | 28 | England |
| Immanuel Feyi-Waboso | Wing | 2002-12-20 | 23 | England |
| Len Ikitau | Centre | 1998-10-01 | 27 | Australia |
| Henry Slade | Centre | 1993-03-19 | 33 | England |
| Paul Brown-Bampoe | Wing | 2002-05-15 | 24 | England |
| Olly Woodburn | Wing / Full Back | 1991-11-18 | 34 | England |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Max Norey | Hooker | 1999-08-05 | 26 | England |
| Will Goodrick-Clarke | Prop | 1996-12-29 | 29 | England |
| Ethan Burger | Prop | 2000-05-23 | 25 | South Africa |
| Alfie Bell | Lock | 2003-04-12 | 23 | England |
| Rusi Tuima | Flanker | 2000-05-21 | 26 | Fiji |
| Tom Cairns | Scrum-half | 2002-06-19 | 23 | England |
| Will Haydon-Wood | Fly-half | 2000-10-27 | 25 | England |
| Dan John | Wing | 2001-10-04 | 24 | Wales |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Kwenzo Blose | Prop | 1997-05-12 | 29 | South Africa |
| Bachuki Tchumbadze | Prop | 2001-11-30 | 24 | Georgia |
| Tom Hooper | Flanker | 2001-01-29 | 25 | Australia |
| Joe Bailey | Lock | 2004-07-06 | 21 | England |
| Oscar Beckerleg | Lock | 2005-05-11 | 21 | England |
| Ehren Painter | Prop | 1998-03-21 | 28 | England |
| Richard Capstick | Flanker | 2000-02-13 | 26 | England |
| Jack Yeandle | Hooker | 1989-12-22 | 36 | England |
| Jimmy Roots | Prop | 2000-01-31 | 26 | England |
| Julian Heaven | Hooker | 2000-10-01 | 25 | Australia |
| Khwezi Mona | Prop | 1992-10-08 | 33 | South Africa |
| Lewis Pearson | Lock | 1999-10-26 | 26 | England |
| Martin Moloney | Flanker | 1999-10-19 | 26 | Ireland |
| Louie Gulley | Hooker | 2005-08-04 | 20 | England |
| Ross Vintcent | Number 8 | 2002-06-05 | 23 | Italy |
| Kane James | Flanker | 2005-03-26 | 21 | England |
| Sol Moody | Hooker | 2005-04-16 | 21 | England |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Charlie Chapman | Scrum-half | 1998-12-01 | 27 | England |
| Ben Coen | Fly-half | 2005-01-11 | 21 | England |
| Iwan Jenkins | Fly-half | 2003-03-13 | 23 | Wales |
| Will Becconsall | Scrum-half | 2002-12-20 | 23 | England |
| Tamati Tua | Centre | 1997-11-26 | 28 | New Zealand |
| Tommy Wyatt | Wing | 1999-12-14 | 26 | England |
| Will Rigg | Centre | 2000-03-22 | 26 | England |
| Zack Wimbush | Centre | 2003-10-24 | 22 | England |
| Ben Hammersley | Wing | 2003-05-20 | 23 | England |

---

## Harlequins

The Twickenham Stoop entertainers and the league's most committed expansive, attacking side. Built around Marcus Smith's creative range — cross-field kicks, late drop-goal nous, footwork at first receiver — Quins play fast-paced running rugby and back themselves to outscore anyone. Their forwards are mobile and carry-friendly rather than maul-monsters, and they thrive on broken-field rugby and counter-attack. The trade-off is defensive vulnerability when the tempo turns against them.

- **Home ground:** Twickenham Stoop (commonly "The Stoop").
- **Club colours:** `#73144a` / `#23bcad`
- **Nickname:** Quins.
- **Founded:** 1866 — one of the league's oldest clubs.
- **Stadium capacity:** 14,800.
- **Head coach:** Jason Gilmore (Head Coach since September 2025, promoted from defence coach after Danny Wilson's late departure to Wales).
- **Captain:** Alex Dombrandt (since 2024-25).
- **Honours:** 2 × Premiership title (2011-12, 2020-21); European Challenge Cup 2010-11; Anglo-Welsh Cup 1987-88, 2012-13.
- **Overall rating:** **66/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `one_back` · `drift`
- **Stat bias:** high `pace`, `agility`, `handling`.

### Star players

- **Marcus Smith** (Fly-half, England) — England fly-half and British & Irish Lion; the creative fulcrum of the Quins attack with electric footwork at first receiver, cross-field-kick threat, and late drop-goal nous. The heartbeat of the league's most expansive side. Index high: `handling`, `agility`, `kicking`, `composure`, `pace`. Suggested rating: **90/100**. Marquee: yes. Wage: £525k.
- **Alex Dombrandt** (Number 8, England) — England No.8 and Quins captain; a powerful one-out ball-carrier with soft hands in tight space who anchors the back row both as a link-man in the wide channels and as a defensive presence over the ball. Index high: `strength`, `handling`, `breakdown`, `tackling`, `stamina`. Suggested rating: **84/100**.
- **Chandler Cunningham-South** (Flanker, England) — Destructive 6ft 5in England back-rower built for collisions; ferocious ball-carrying and tackling, with an improving lineout-steal game adding a third string to a profile already feared at the breakdown. Index high: `strength`, `tackling`, `breakdown`, `setPiece`, `stamina`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Fin Baxter | Prop | 2002-02-12 | 24 | England |
| Sam Riley | Hooker | 2001-04-23 | 25 | England |
| Pedro Delgado | Prop | 1997-09-01 | 28 | Argentina |
| Guido Petti | Lock | 1994-11-17 | 31 | Argentina |
| Joe Launchbury | Lock | 1991-04-12 | 35 | England |
| Chandler Cunningham-South | Flanker | 2003-03-18 | 23 | England |
| Jack Kenningham | Flanker | 1999-11-19 | 26 | England |
| Alex Dombrandt | Number 8 | 1997-04-29 | 29 | England |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Will Porter | Scrum-half | 1998-12-14 | 27 | England |
| Marcus Smith | Fly-half | 1999-02-14 | 27 | England |
| Cadan Murley | Wing | 1999-07-31 | 26 | England |
| Oscar Beard | Centre | 2001-11-20 | 24 | England |
| Luke Northmore | Centre | 1997-03-16 | 29 | England |
| Rodrigo Isgró | Wing | 1999-03-24 | 27 | Argentina |
| Tyrone Green | Full-back | 1998-03-05 | 28 | South Africa |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Jack Musk | Hooker | 2000-03-04 | 26 | England |
| Harry Williams | Prop | 1991-10-01 | 34 | England |
| Will Hobson | Prop | 2002-11-09 | 23 | England |
| Stephan Lewies | Lock | 1992-01-27 | 34 | South Africa |
| Will Evans | Flanker | 1997-01-28 | 29 | England |
| Lucas Friday | Scrum-half | 2006-07-13 | 19 | South Africa |
| Jarrod Evans | Fly-half | 1996-07-25 | 29 | Wales |
| Cassius Cleaves | Wing | 2003-03-15 | 23 | England |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Boris Wenger | Prop | 2002-07-01 | 23 | Argentina |
| Jonny Green | Lock | 2004-03-16 | 22 | England |
| George Turner | Hooker | 1992-10-08 | 33 | Scotland |
| Jordan Els | Prop | 1997-06-11 | 28 | South Africa |
| James Chisholm | Back Row | 1995-08-11 | 30 | England |
| Jack Walker | Hooker | 1996-05-06 | 30 | England |
| Kieran Treadwell | Lock | 1995-11-06 | 30 | Ireland |
| Simon Kerrod | Prop | 1992-08-25 | 33 | England |
| Titi Lamositele | Prop | 1995-02-11 | 31 | USA |
| Tom Lawday | Number 8 | 1993-11-11 | 32 | England |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Ben Waghorn | Centre | 2004-04-02 | 22 | England |
| Conor Byrne | Full-back | 2005-07-07 | 20 | England |
| Hayden Hyde | Centre | 2000-09-15 | 25 | England |
| Jamie Benson | Fly-half | 2002-09-23 | 23 | England |
| Bryn Bradley | Centre | 2003-04-17 | 23 | Wales |
| Nick David | Full-back | 1998-11-04 | 27 | England |
| Sean Kerr | Centre | 2004-11-08 | 21 | England |
| Stu Townsend | Scrum-half | 1995-10-11 | 30 | England |
| Max Green | Scrum-half | 1996-02-13 | 30 | England |
| Cameron Anderson | Full-back | 1999-09-16 | 26 | England |

---

## Newcastle Red Bulls

Newly rebranded from the Falcons after Red Bull's August 2025 takeover, Newcastle are mid-transformation: heavy investment, aggressive recruitment, and a search for a clearer identity after three straight bottom-of-the-table finishes. Historically a developmental, lower-budget side that fought hard but lacked depth, the Red Bulls era is rebuilding from the ground up. Kingston Park remains home, but the playing identity is still being written — expect them to start the simulator era as the league's weakest squad, with room to grow.

- **Home ground:** Kingston Park.
- **Club colours:** `#000000` / `#dc1e25`
- **Nickname:** Red Bulls (rebranded from "Falcons" after Red Bull's August 2025 takeover).
- **Founded:** 1877 (as Gosforth FC).
- **Stadium capacity:** 10,200.
- **Head coach:** Stephen Jones (interim Head Coach from March 2026 after Alan Dickens departed; Dan McFarland publicly linked with the role from 2026-27).
- **Captain:** George McGuigan.
- **Honours:** Premiership title 1997-98; Anglo-Welsh Cup 2000-01, 2003-04.
- **Overall rating:** **55/100**
- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `one_back` · `hybrid`
- **Stat bias:** modest across the board (rebuild status); slight lean toward `stamina` and `discipline`.

### Star players

- **Liam Williams** (Full-back, Wales) — 93-cap Wales legend and two-tour Lion; the marquee Red-Bull-era signing whose world-class aerial work and broken-field counter-attack give Newcastle their first genuine back-three threat in years. Index high: `positioning`, `handling`, `composure`, `agility`, `pace`. Suggested rating: **84/100**. Marquee: yes.
- **Amanaki Mafi** (Number 8, Japan) — 29-cap Brave Blossom and 2015 World Cup hero against South Africa; powerful go-forward ball-carrier with footwork and an offloading game built to get a struggling pack over the gainline. Index high: `strength`, `handling`, `breakdown`, `stamina`, `tackling`. Suggested rating: **80/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Eduardo Bello | Prop | 1995-09-14 | 30 | Argentina |
| Samson Adejimi | Hooker | 2002-02-15 | 24 | England |
| Adam Brocklebank | Prop | 1995-09-06 | 30 | England |
| Finn Baker | Lock | 2004-10-17 | 21 | England |
| Tim Cardall | Lock | 1997-01-13 | 29 | England |
| Tom Christie | Flanker | 1998-03-04 | 28 | New Zealand |
| Tom Gordon | Flanker | 1997-01-30 | 29 | Scotland |
| Amanaki Mafi | Number 8 | 1990-01-11 | 36 | Japan |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Simon Benitez Cruz | Scrum-half | 1999-09-06 | 26 | Argentina |
| Boeta Chamberlain | Fly-half | 1999-02-22 | 27 | South Africa |
| Joel Grayson | Wing | 2002-04-15 | 24 | England |
| Sammy Arnold | Centre | 1996-04-08 | 30 | Ireland |
| Max Clark | Centre | 1995-10-03 | 30 | England |
| Liam Williams | Wing | 1991-04-09 | 35 | Wales |
| Josh Hodge | Full-back | 2000-05-23 | 26 | England |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Hame Faiva | Hooker | 1994-05-09 | 32 | Italy |
| Lou de Bruin | Prop | 1993-02-13 | 33 | South Africa |
| Connor Hancock | Prop | 2000-11-10 | 25 | England |
| Freddie Clarke | Lock/Back row | 1992-10-10 | 33 | England |
| Cameron Neild | Flanker | 1996-09-06 | 29 | England |
| Joe Davis | Scrum-half | 2005-12-31 | 20 | England |
| Brett Connon | Fly-half | 1996-08-29 | 29 | Ireland |
| Harrison Obatoyinbo | Wing | 2000-07-15 | 25 | England |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Adam Scott | Lock | 2001-11-27 | 24 | England |
| Bryce Gordon | Hooker | 2001-08-06 | 24 | New Zealand |
| Cam Jordan | Lock | 1999-11-17 | 26 | England |
| Charlie Turnbull | Back Row | 2005-10-02  | 20 | England |
| Fergus Lee-Warner | Lock | 1994-02-03 | 32 | Australia |
| Freddie Lockwood | Back Row | 2000-12-31 | 25 | England |
| George McGuigan | Hooker | 1993-03-30 | 33 | England |
| Jamie Hodgson | Lock | 1998-03-19 | 28 | Scotland |
| John Hawkins | Lock | 1996-11-11 | 29 | Wales |
| Micky Rewcastle | Prop | 2004-05-17 | 21 | England |
| Murray McCallum | Prop | 1996-03-16 | 30 | Scotland |
| Ollie Fletcher | Hooker | 2002-09-09 | 23 | England |
| Ollie Leatherbarrow | Back Row | 2002-04-08 | 24 | England |
| Oscar Usher | Lock | 2004-06-12 | 21 | England |
| Rob Palframan | Prop | 1993-12-20 | 32 | England |
| Sebastian De Chaves | Lock | 1990-10-30 | 35 | South Africa |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Alex Hearle | Centre | 1998-11-08 | 27 | England |
| Cameron Hutchison | Centre | 1998-06-01 | 27 | Scotland |
| Christian Wade | Wing | 1991-05-15 | 35 | England |
| Connor Doherty | Centre | 2000-07-18 | 25 | England |
| Elliott Obatoyinbo | Wing/Full-back | 1998-10-09 | 27 | England |
| Ethan Grayson | Fly-half | 2004-04-15 | 22 | England |
| James Elliott | Scrum-half | 1998-08-29 | 27 | England |
| Nathan Greenwood | Wing | 2003-11-20 | 22 | England |
| Oliver Spencer | Centre | 2004-02-22 | 22 | England |
| Sam Stuart | Scrum-half | 1991-09-27 | 34 | England |
| Sam Waugh | Centre | 2005-07-16 | 20 | England |

---

## Northampton Saints

The 2023-24 champions under Phil Dowson, Saints are the league's electric attacking outfit — willing to play from anywhere on the pitch and devastating in transition. Fin Smith conducts a heads-up backline that scores tries from deep, off turnover ball and from set-piece strike plays in equal measure. Their forwards are mobile and link-friendly rather than collision-first, designed to win quick ball and feed the runners. When they get rolling they put 40+ on teams; when the platform wobbles, the structure shows cracks.

- **Home ground:** cinch Stadium at Franklin's Gardens (commonly "Franklin's Gardens").
- **Club colours:** `#00563f` / `#000000`
- **Nickname:** Saints.
- **Founded:** 1880.
- **Stadium capacity:** 15,249.
- **Head coach:** Phil Dowson (Director of Rugby since 2022).
- **Captain:** Fraser Dingwall.
- **Honours:** 2 × Premiership title (2013-14, 2023-24); European Cup 1999-2000; European Challenge Cup 2008-09, 2014.
- **Overall rating:** **76/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `one_back` · `hybrid`
- **Stat bias:** high `pace`, `handling`, `agility`.

### Star players

- **Fin Smith** (Fly-half, England) — England's first-choice fly-half and marquee playmaker; ice-cold game manager with a clutch boot (opened the scoring with an early drop goal in the 2024 Premiership Final win over Bath) who runs Saints' high-tempo, wide-wide attack from a flat alignment. Index high: `kicking`, `composure`, `handling`, `positioning`, `discipline`. Suggested rating: **92/100**. Marquee: yes. Wage: £600k.
- **Tommy Freeman** (Wing, England) — England wing and 2025 Lions Test starter; serial hat-trick scorer (four vs Saracens, hat-tricks vs Bath, Clermont, Leinster) and the first Englishman to score in every round of a Six Nations. Aerial dominance, finishing instinct, and centre-grade footwork. Index high: `pace`, `handling`, `positioning`, `agility`, `composure`. Suggested rating: **91/100**.
- **Alex Mitchell** (Scrum-half, England) — England's sniping starting 9; razor-sharp service, constant running threat around the fringes, and the tempo-setter that lets Saints play heads-up rugby from anywhere. Index high: `pace`, `agility`, `handling`, `positioning`, `stamina`. Suggested rating: **86/100**.
- **Henry Pollock** (Flanker, England) — Twenty-one-year-old breakthrough sensation; youngest player on the 2025 Lions tour, World Rugby Breakthrough Player nominee. Relentless engine, jackal threat over the ball, and a try-scoring flanker with genuine pace in the wide channels. Index high: `breakdown`, `stamina`, `pace`, `tackling`, `agility`. Suggested rating: **85/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Trevor Davison | Prop | 1992-08-20 | 33 | England |
| Curtis Langdon | Hooker | 1997-08-03 | 28 | England |
| Danilo Fischetti | Prop | 1998-01-26 | 28 | Italy |
| Alex Coles | Lock | 1999-09-21 | 26 | England |
| JJ van der Mescht | Lock | 1999-05-04 | 27 | South Africa |
| Henry Pollock | Flanker | 2005-01-14 | 21 | England |
| Tom Pearson | Flanker | 1999-10-26 | 26 | England |
| Callum Chick | Number 8 | 1996-11-25 | 29 | England |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Alex Mitchell | Scrum-half | 1997-05-25 | 28 | England |
| Fin Smith | Fly-half | 2002-05-11 | 24 | England |
| Tommy Freeman | Wing | 2001-03-05 | 25 | England |
| Fraser Dingwall | Centre | 1999-04-07 | 27 | England |
| Rory Hutchinson | Centre | 1995-01-29 | 31 | Scotland |
| George Hendy | Wing | 2002-10-15 | 23 | England |
| George Furbank | Full-back | 1996-10-17 | 29 | England |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Robbie Smith | Hooker | 1998-09-26 | 27 | Scotland |
| Elliot Millar-Mills | Prop | 1992-07-08 | 33 | Scotland |
| Emmanuel Iyogun | Prop | 2000-11-24 | 25 | England |
| Aiden Ainsworth-Cave | Lock | 2006-07-21 | 19 | England |
| Josh Kemeny | Flanker | 1998-11-29 | 27 | Australia |
| Archie McParland | Scrum-half | 2005-02-17 | 21 | England |
| Anthony Belleau | Fly-half | 1996-04-08 | 30 | France |
| Ollie Sleightholme | Wing | 2000-04-13 | 26 | England |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Angus Scott-Young | Back Row | 1997-04-23 | 29 | Australia |
| Archie Appleby | Back Row | 2007-01-13 | 19 | England |
| Archie Benson | Lock | 2001-08-18 | 24 | England |
| Charlie Ulcoq | Back Row | 2006-05-02 | 20 | England |
| Chunya Munga | Lock | 2000-09-02 | 25 | England |
| Cleopas Kundiona | Prop | 1998-12-15 | 27 | Zimbabwe |
| Craig Wright | Hooker | 2004-05-31 | 21 | England |
| Ed Prowse | Lock | 2000-10-27 | 25 | England |
| Luke Green | Prop | 2001-05-06 | 25 | England |
| Emeka Atuanya | Lock | 2003-03-17 | 23 | England |
| Fyn Brown | Back Row | 2002-10-11 | 23 | England |
| Henry Walker | Hooker | 1998-03-10 | 28 | England |
| Jack Lawrence | Back Row | 2007-02-02 | 19 | England |
| Sam Graham | Flanker | 1997-07-06 | 28 | England |
| Ollie Scola | Prop | 2006-02-03 | 20 | England |
| Siep Walta | Back Row | 2006-09-21 | 20 | Netherlands |
| Sonny Tonga'uiha | Prop | 2006-08-01 | 19 | England |
| Tom Lockett | Lock | 2002-10-06 | 23 | England |
| Tom West | Prop | 1996-02-11 | 30 | England |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Aiden Pugh | Scrum-half | 2006-09-18 | 19 | England |
| Tom James | Scrum-half | 1993-10-12 | 32 | England |
| Billy Pasco | Centre | 2005-10-02 | 20 | England |
| Edoardo Todaro | Wing | 2006-09-24 | 19 | Italy |
| Freddie St John | Centre | 2007-11-07 | 19 | England |
| Henry Lumley | Centre | 2007-07-18 | 18 | England |
| James Martin | Wing | 1999-07-31 | 26 | England |
| James Pater | Wing | 2007-07-02 | 18 | England |
| James Ramm | Wing | 1998-04-30 | 28 | Australia |
| Jonny Weimann | Scrum-half | 2006-03-28 | 20 | England |
| Toby Thame | Centre | 2003-11-08 | 22 | England |
| Tom Litchfield | Centre | 2002-04-20 | 24 | England |
| Amena Caqusau | Wing | 2004-07-17 | 21 | Scotland |
| Will Glister | Wing | 2005-05-05 | 21 | England |

---

## Sale Sharks

The Manchester defence-first side: line-speed, collision-dominant loose forwards and a physical inside-centre channel, all built to choke teams into errors. Sale are happy to cede possession because they back their defence to win the field-position battle, and George Ford's tempo control gives them clinical execution when they do attack. Tackles, turnovers and territory underpin everything; they are the league's least flashy and most resilient team. Box-kick, chase, tackle, repeat.

- **Home ground:** CorpAcq Stadium (renamed from Salford Community Stadium / AJ Bell Stadium in September 2025).
- **Club colours:** `#0a1b40` / `#ffffff`
- **Nickname:** Sharks.
- **Founded:** 1861 — one of the world's oldest surviving rugby clubs.
- **Stadium capacity:** 11,404 (shared with Salford Red Devils RL).
- **Head coach:** Alex Sanderson (Director of Rugby since 2021).
- **Captain:** Ernst van Rhyn (2025-26; succeeded Ben Curry, who stepped down with his England-contract availability reduced).
- **Honours:** Premiership title 2005-06; European Challenge Cup 2001-02, 2004-05.
- **Overall rating:** **68/100**
- **Suggested tactics:** `kicking` · `keep_it_tight` · `balanced` · `shadow` · `one_back` · `blitz`
- **Stat bias:** high `tackling`, `strength`, `kicking`.

### Star players

- **Tom Curry** (Flanker, England) — Lions Test starter at openside on the 2025 Australia tour; relentless jackal threat and the "engine" of England's back row, with brutal tackle work-rate even after wrist surgery. Index high: `tackling`, `breakdown`, `stamina`, `strength`, `positioning`. Suggested rating: **91/100**.
- **George Ford** (Fly-half, England) — England's first-choice 10 through the 10-Test winning run; ice-cold game manager with a stunning 50-22 kicking game and tempo control that underpins Sale's territory-first identity. Index high: `kicking`, `composure`, `positioning`, `handling`, `discipline`. Suggested rating: **90/100**. Marquee: yes. Wage: £750k.
- **Ben Curry** (Flanker, England) — Breakdown menace and former Sale captain (stepped down ahead of 2025-26 with his England-contract availability reduced); started England's Six Nations opener alongside his twin and brings the same chop-tackle, jackal-heavy profile that defines Sale's defensive identity. Index high: `tackling`, `breakdown`, `stamina`, `strength`, `discipline`. Suggested rating: **86/100**.
- **Tom Roebuck** (Wing, England) — England wing in red-hot form (three tries in the 57-5 win over Newcastle); silky footwork, deceptive power in the carry and a genuine aerial threat that turns Sale's kick-chase into points. Index high: `pace`, `handling`, `agility`, `strength`, `positioning`. Suggested rating: **84/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Bevan Rodd | Prop | 2000-08-26 | 25 | England |
| Luke Cowan-Dickie | Hooker | 1993-06-20 | 32 | England |
| Asher Opoku-Fordjour | Prop | 2004-07-16 | 21 | England |
| Ernst van Rhyn | Lock | 1997-09-19 | 28 | South Africa |
| Ben Bamber | Lock | 2001-01-24 | 25 | England |
| Ben Curry | Flanker | 1998-06-15 | 27 | England |
| Tom Curry | Flanker | 1998-06-15 | 27 | England |
| Dan du Preez | Number 8 | 1995-08-05 | 30 | South Africa |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Gus Warr | Scrum-half | 1999-09-24 | 26 | England |
| George Ford | Fly-half | 1993-03-16 | 33 | England |
| Tom Roebuck | Wing | 2001-01-07 | 25 | England |
| Rob du Preez | Centre | 1993-07-30 | 32 | South Africa |
| Rekeiti Ma'asi-White | Centre | 2003-02-03 | 23 | England |
| Arron Reed | Wing | 1999-07-10 | 26 | Scotland |
| Joe Carpenter | Full-back | 2001-08-19 | 24 | England |

**Bench**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Nathan Jibulu | Hooker | 2003-01-26 | 23 | England |
| Si McIntyre | Prop | 1991-03-19 | 35 | England |
| WillGriff John | Prop | 1992-12-04 | 33 | Wales |
| Tom Burrow | Lock | 2005-07-27 | 20 | England |
| Rouban Birch | Flanker | 1999-09-20 | 26 | England |
| Raffi Quirke | Scrum-half | 2001-08-18 | 24 | England |
| Tom Curtis | Fly-half | 2001-07-01 | 24 | England |
| Tom O'Flaherty | Wing | 1994-07-21 | 31 | England |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| James Harper | Prop | 2000-10-16 | 25 | England |
| Hyron Andrews | Lock | 1995-07-06 | 30 | South Africa |
| Huw Davies | Back Row | 2003-11-12 | 22 | Wales |
| Jacques Vermeulen | Flanker | 1995-02-08 | 31 | South Africa |
| Jos Gilmore | Back Row | 2005-11-25 | 20 | England |
| Ethan Caine | Hooker | 2001-09-20 | 24 | England |
| Reuben Logan | Back Row | 2005-07-28 | 20 | Scotland |
| Sam Dugdale | Back Row | 1999-09-30 | 26 | England |
| Tadgh McElroy | Hooker | 1997-06-16  | 28 | Ireland |
| Tristan Woodman | Back Row | 2004-02-12 | 22 | England |
| Tye Raymont | Prop | 2005-07-19 | 20 | England |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Alex Wills | Wing | 2004-02-11 | 22 | England |
| Dom Hanson | Scrum-half | 2005-12-17 | 20 | England |
| Luke James | Full-back | 1999-03-18 | 27 | England |
| Nye Thomas | Scrum-half | 2003-03-24 | 23 | Wales |
| Ollie Davies | Fly-half | 2006-12-01 | 19 | England |
| Joe Bedlow | Centre | 2002-03-29 | 24 | England |
| Marius Louw | Centre | 1995-10-24 | 30 | South Africa |
| Obi Ene | Wing | 2003-06-25 | 22 | England |

---

## Rating inputs

Snapshot date: **May 2026**, after round 16 of the 25-26 regular season (10 of 18 rounds yet to fall away from the 18-game 24-25 baseline). Refresh after each round to keep `Overall rating` current.

**2024-25 final regular-season table** (P = played, PD = points difference, B = bonus points, Pts = league points). Bath beat Leicester 23-21 in the play-off final.

| Pos | Team | P | PD | B | Pts |
|---|---|---|---|---|---|
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
|---|---|---|---|---|---|
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
|---|---|---|---|---|---|---|
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
- **Newcastle Red Bulls:** Post-takeover (Aug 2025) recruitment has been heavy and the squad is in flux; expect this list to be the least stable of the ten.
- **Gloucester / Newcastle name clash:** Cameron Jordan (Lock, Gloucester, b. 1996-05-23) and Cam Jordan (Lock, Newcastle, b. 1999-11-17) are distinct players — different DOBs, both English locks.
