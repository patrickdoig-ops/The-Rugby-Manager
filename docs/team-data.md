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
| `intensity` | `high` · `balanced` · `light` |
| `discipline` | `risky` · `balanced` · `cautious` |

The per-club "Suggested tactics" lines below omit `intensity` and `discipline`; both default to `balanced` (the generator fills any missing trailing slot from `DEFAULT_TACTICS`).

**Player base stats** (12 fields, 0–100 scale, from `src/data/team-*.json`):
`stamina · strength · pace · agility · handling · tackling · breakdown · kicking · setPiece · discipline · positioning · composure`
*(These 12 attributes are the final, play-ready values — authored manually in the right-most columns of the squad tables below. `scripts/generateTeamJsons.mjs` parses them exactly as typed and writes them verbatim into `src/data/team-*.json`. There is **no** runtime stat transform: edit a number here, run the generator, and it flows straight to the game. Off-position "inert" stats — forwards' `kicking`, backs' `setPiece` — carry weight 0 in the overall-rating formula but are still read by the engine in rare fallback cases, e.g. a forward taking an emergency drop-out, so author them as plausible low values rather than zeros.)*

**Star-player annotations** — appended to a `### Star players` line. `Marquee: yes.` designates the cap-excluded marquee slot (one per club; the contract seeder reads the flag and the in-game Contracts screen surfaces it). `Wage: £1m.` / `Wage: £550k.` is an optional explicit wage override — used to land hand-tuned marquee figures above what the `WAGE_BY_RATING × POSITION_SCARCITY × WAGE_NOISE` seeder formula would produce. Omitted ⇒ the seeder computes the wage. Both annotations are parsed by `scripts/generateTeamJsons.mjs` into the player's JSON `contract` block; `contractSeeder` honours `annualWage` verbatim when present. The `Index high` + `Suggested rating` fields on each star line are **display/reference metadata only** (surfaced by the in-game TeamInfo screen) — they no longer drive any stat computation.

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
- **Overall rating:** **67/100**
- **Suggested tactics:** `balanced` · `keep_it_tight` · `commit_numbers` · `counter_ruck` · `one_back` · `drift` · `cautious`
- **Stat bias:** high `strength`, `breakdown`, `setPiece`.
- **Board ambition:** `playoffs`

### Star players

- **Ross Byrne** (Fly-half, Ireland) Index high: `kicking`, `composure`, `positioning`, `discipline`, `handling`. Suggested rating: **86/100**.
- **Tomos Williams** (Scrum-half, Wales) Index high: `pace`, `agility`, `handling`, `composure`, `positioning`. Suggested rating: **87/100**. Marquee: yes. Wage: £550k.
- **Max Llewellyn** (Centre, Wales) Index high: `strength`, `tackling`, `handling`, `pace`. Suggested rating: **82/100**.
- **Lewis Ludlow** (Flanker, England) Index high: `breakdown`, `tackling`, `stamina`, `discipline`, `positioning`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Val Rapava-Ruskin | Prop | 1992-12-12 | 33 | Georgia | 80 | 91 | 62 | 67 | 69 | 89 | 85 | 43 | 90 | 85 | 85 | 90 |
| Seb Blake | Hooker | 2002-06-23 | 23 | England | 77 | 86 | 67 | 75 | 74 | 82 | 85 | 52 | 85 | 80 | 80 | 80 |
| Afolabi Fasogbon | Prop | 2003-12-17 | 22 | England | 76 | 89 | 63 | 70 | 80 | 84 | 85 | 49 | 88 | 79 | 81 | 85 |
| Hugh Bokenham | Lock | 2001-07-20 | 24 | England | 76 | 87 | 66 | 71 | 70 | 86 | 84 | 45 | 82 | 77 | 78 | 75 |
| Arthur Clark | Lock | 1999-09-24 | 26 | England | 76 | 87 | 70 | 70 | 71 | 85 | 84 | 46 | 85 | 78 | 80 | 80 |
| Lewis Ludlow | Flanker | 1994-12-19 | 31 | England | 95 | 78 | 78 | 78 | 78 | 95 | 95 | 57 | 82 | 95 | 95 | 78 |
| Josh Basham | Flanker | 1999-08-08 | 26 | England | 82 | 88 | 79 | 81 | 78 | 89 | 93 | 55 | 88 | 81 | 84 | 79 |
| Jack Mann | Back Row | 1999-01-30 | 27 | England | 81 | 86 | 74 | 83 | 75 | 82 | 89 | 57 | 81 | 77 | 78 | 74 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tomos Williams | Scrum-half | 1994-10-25 | 31 | Wales | 90 | 78 | 80 | 95 | 96 | 78 | 78 | 90 | 56 | 78 | 92 | 95 |
| Ross Byrne | Fly-half | 1995-03-29 | 31 | Ireland | 88 | 78 | 82 | 78 | 92 | 78 | 78 | 92 | 59 | 93 | 92 | 91 |
| Will Joseph | Wing | 2003-02-04 | 23 | England | 90 | 74 | 89 | 89 | 81 | 76 | 73 | 73 | 60 | 74 | 76 | 77 |
| Max Llewellyn | Centre | 1997-09-04 | 28 | Wales | 88 | 85 | 85 | 78 | 90 | 95 | 78 | 78 | 61 | 79 | 78 | 77 |
| Seb Atkinson | Centre | 2001-08-27 | 24 | England | 89 | 88 | 82 | 80 | 86 | 85 | 83 | 85 | 59 | 84 | 83 | 88 |
| Ben Loader | Wing | 1999-01-24 | 27 | England | 88 | 81 | 92 | 88 | 85 | 72 | 74 | 78 | 54 | 79 | 78 | 75 |
| George Barton | Utility Back | 1999-09-04 | 26 | England | 91 | 81 | 77 | 78 | 82 | 78 | 81 | 79 | 69 | 74 | 81 | 82 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jack Innard | Hooker | 2001-04-13 | 25 | England | 71 | 82 | 61 | 65 | 78 | 78 | 79 | 51 | 86 | 70 | 71 | 71 |
| Jamal Ford-Robinson | Prop | 1993-04-23 | 33 | England | 78 | 88 | 55 | 63 | 64 | 78 | 78 | 83 | 90 | 66 | 72 | 70 |
| Kirill Gotovtsev | Prop | 1987-07-17 | 38 | Russia | 78 | 84 | 52 | 57 | 65 | 78 | 78 | 43 | 84 | 69 | 67 | 71 |
| Danny Eite | Lock | 2003-06-28 | 22 | England | 78 | 85 | 61 | 64 | 66 | 80 | 78 | 46 | 85 | 72 | 69 | 67 |
| James Venter | Flanker | 1995-12-28 | 30 | South Africa | 78 | 80 | 71 | 68 | 72 | 78 | 84 | 57 | 77 | 68 | 78 | 69 |
| Mike Austin | Scrum-half | 2000-11-30 | 25 | England | 90 | 82 | 78 | 78 | 88 | 73 | 71 | 86 | 61 | 72 | 78 | 78 |
| Charlie Atkinson | Fly-half | 2001-04-08 | 25 | England | 90 | 71 | 82 | 82 | 89 | 73 | 67 | 90 | 64 | 90 | 89 | 91 |
| Ben Redshaw | Full-back | 2005-01-10 | 21 | England | 71 | 69 | 80 | 75 | 78 | 72 | 73 | 78 | 60 | 70 | 79 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Archie McArthur | Prop | 2003-06-11 | 22 | Scotland | 72 | 81 | 44 | 48 | 52 | 72 | 72 | 44 | 84 | 66 | 63 | 64 |
| Cameron Jordan | Lock | 1996-05-23 | 30 | England | 72 | 83 | 51 | 54 | 53 | 72 | 72 | 47 | 81 | 60 | 61 | 66 |
| Ciaran Knight | Prop | 1995-08-30 | 30 | England | 72 | 81 | 47 | 52 | 51 | 72 | 72 | 47 | 87 | 60 | 62 | 66 |
| Freddie Thomas | Lock | 1999-07-22 | 26 | England | 80 | 80 | 54 | 54 | 56 | 72 | 72 | 48 | 86 | 66 | 61 | 60 |
| Harry Taylor | Back Row | 2002-01-15 | 24 | England | 85 | 79 | 62 | 61 | 64 | 72 | 75 | 61 | 71 | 62 | 72 | 62 |
| Jack Clement | Back Row | 2001-04-04 | 25 | England | 84 | 77 | 63 | 62 | 66 | 72 | 75 | 59 | 70 | 60 | 72 | 63 |
| Jack Singleton | Hooker | 1996-08-07 | 29 | England | 80 | 80 | 55 | 61 | 72 | 72 | 73 | 50 | 77 | 63 | 67 | 60 |
| Nepo Laulala | Prop | 1991-10-29 | 34 | New Zealand | 72 | 81 | 44 | 53 | 53 | 73 | 72 | 45 | 82 | 65 | 64 | 64 |
| Jono Benz-Salomon | Prop | 2001-03-17 | 25 | England | 72 | 80 | 46 | 53 | 57 | 72 | 72 | 48 | 83 | 63 | 66 | 65 |
| Will Trenholm | Back Row | 2001-01-06 | 25 | England | 86 | 83 | 83 | 76 |77 | 72 | 75 | 57 | 69 | 77 | 72 | 79 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Caolan Englefield | Scrum-half | 2000-04-15 | 26 | England | 88 | 58 | 74 | 72 | 72 | 61 | 68 | 72 | 57 | 67 | 72 | 72 |
| Jake Morris | Wing | 2002-05-10 | 24 | England | 87 | 61 | 76 | 76 | 72 | 60 | 56 | 61 | 58 | 61 | 72 | 72 |
| Ollie Thorley | Wing | 1996-08-23 | 29 | England | 88 | 79 | 89 | 78 | 72 | 62 | 57 | 58 | 56 | 88 | 82 | 83 |
| Rob Russell | Wing | 1998-12-04 | 27 | Ireland | 78 | 58 | 83 | 76 | 72 | 63 | 57 | 58 | 58 | 60 | 72 | 72 |
| Will Butler | Centre | 1998-04-17 | 28 | England | 80 | 73 | 72 | 72 | 72 | 72 | 64 | 61 | 63 | 66 | 72 | 66 |
| Josh Hathaway | Wing | 2003-09-04 | 22 | England | 80 | 60 | 78 | 72 | 72 | 62 | 60 | 62 | 59 | 60 | 72 | 72 |

---

## Bristol

- **Home ground:** Ashton Gate.
- **Club colours:** `#003087` / `#c8102e`
- **Nickname:** The Bears (rebranded from Bristol in 2018).
- **Founded:** 1888.
- **Stadium capacity:** 27,000 (shared with Bristol City FC).
- **Head coach:** Pat Lam (Director of Rugby since 2017).
- **Captain:** Fitz Harding (long-term extension signed 2023-24).
- **Overall rating:** **73/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `two_back` · `drift` · `offload_freely`
- **Stat bias:** high `pace`, `handling`, `agility`.
- **Board ambition:** `playoffs`

### Star players

- **Ellis Genge** (Prop, England) Index high: `strength`, `setPiece`, `breakdown`, `tackling`, `stamina`. Suggested rating: **91/100**.
- **Louis Rees-Zammit** (Wing, Wales) Index high: `pace`, `agility`, `handling`, `positioning`. Suggested rating: **88/100**. Marquee: yes. Wage: £550k.
- **Viliame Mata** (Number 8, Fiji) Index high: `strength`, `handling`, `breakdown`, `agility`, `stamina`. Suggested rating: **85/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ellis Genge | Prop | 1995-02-22 | 31 | England | 92 | 98 | 81 | 80 | 78 | 97 | 90 | 60 | 98 | 82 | 85 | 90 |
| Gabriel Oghre | Hooker | 1998-11-21 | 27 | England | 90 | 82 | 88 | 89 | 88 | 83 | 84 | 78 | 93 | 80 | 81 | 90 |
| George Kloska | Prop | 2002-02-11 | 24 | England | 82 | 94 | 72 | 72 | 74 | 88 | 82 | 52 | 92 | 83 | 90 | 83 |
| Joe Owen | Lock | 2003-01-23 | 23 | England | 88 | 89 | 81 | 75 | 78 | 86 | 83 | 54 | 93 | 78 | 79 | 80 |
| Joe Batley | Lock | 1996-09-06 | 29 | England | 89 | 90 | 72 | 74 | 81 | 85 | 81 | 55 | 96 | 83 | 82 | 83 |
| Fitz Harding | Flanker | 1997-11-29 | 28 | England | 96 | 86 | 82 | 86 | 79 | 88 | 95 | 57 | 88 | 86 | 80 | 82 |
| Luka Ivanishvili | Flanker | 1999-12-12 | 26 | Georgia | 82 | 88 | 84 | 84 | 82 | 85 | 88 | 59 | 86 | 92 | 88 | 91 |
| Viliame Mata | Number 8 | 1991-04-15 | 35 | Fiji | 92 | 96 | 80 | 87 | 90 | 88 | 91 | 60 | 85 | 84 | 83 | 86 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Harry Randall | Scrum-half | 1997-10-29 | 28 | England | 85 | 69 | 90 | 90 | 88 | 78 | 81 | 87 | 35 | 84 | 86 | 83 |
| Tom Jordan | Fly-half | 1998-08-19 | 27 | Scotland | 80 | 74 | 89 | 82 | 90 | 78 | 77 | 91 | 58 | 85 | 84 | 89 |
| Gabriel Ibitoye | Wing | 1998-04-26 | 28 | England | 93 | 87 | 95 | 97 | 91 | 74 | 74 | 75 | 42 | 81 | 88 | 75 |
| Sam Bedlow | Centre | 1995-08-08 | 30 | England | 86 | 83 | 85 | 84 | 84 | 80 | 76 | 81 | 60 | 75 | 80 | 80 |
| Benhard Janse van Rensburg | Centre | 1994-02-09 | 32 | South Africa | 90 | 86 | 85 | 91 | 86 | 81 | 85 | 79 | 52 | 83 | 88 | 89 |
| Kalaveti Ravouvou | Wing | 1996-03-30 | 30 | Fiji | 88 | 88 | 92 | 92 | 90 | 79 | 76 | 79 | 53 | 81 | 82 | 86 |
| Louis Rees-Zammit | Utility Back | 2001-02-02 | 25 | Wales | 85 | 82 | 95 | 90 | 90 | 88 | 78 | 89 | 58 | 88 | 92 | 95 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Harry Thacker | Hooker | 1994-04-22 | 32 | England | 85 | 78 | 81 | 70 | 78 | 78 | 79 | 57 | 86 | 70 | 71 | 68 |
| Max Lahiff | Prop | 1989-09-24 | 36 | England | 78 | 95 | 72 | 68 | 68 | 78 | 78 | 50 | 92 | 75 | 71 | 73 |
| Sam Grahamslaw | Prop | 1999-08-04 | 26 | Scotland | 78 | 84 | 64 | 68 | 65 | 80 | 78 | 48 | 88 | 70 | 70 | 70 |
| Steele Barker | Lock | 2001-01-12 | 25 | England | 78 | 80 | 67 | 70 | 74 | 81 | 78 | 51 | 86 | 75 | 78 | 73 |
| Santiago Grondona | Number 8 | 1999-04-15 | 27 | Argentina | 88 | 84 | 79 | 76 | 80 | 78 | 84 | 60 | 78 | 81 | 83 | 81 |
| Kieran Marmion | Scrum-half | 1992-05-29 | 33 | Ireland | 90 | 69 | 86 | 85 | 82 | 68 | 71 | 80 | 59 | 70 | 78 | 80 |
| AJ MacGinty | Fly-half | 1989-12-07 | 36 | USA | 79 | 71 | 78 | 75 | 81 | 68 | 66 | 86 | 59 | 90 | 91 | 90 |
| Josh Carrington | Wing | 2002-04-25 | 24 | England | 81 | 72 | 88 | 84 | 81 | 74 | 69 | 69 | 56 | 74 | 78 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Will Capon | Hooker | 1997-09-01 | 28 | England | 61 | 82 | 58 | 61 | 72 | 72 | 72 | 50 | 76 | 61 | 67 | 66 |
| Lovejoy Chawatama | Prop | 1991-12-30 | 34 | England | 82 | 72 | 49 | 58 | 58 | 72 | 72 | 48 | 79 | 64 | 66 | 61 |
| Tomas Gwilliam | Hooker | 2002-11-19 | 23 | Wales | 65 | 82 | 58 | 64 | 72 | 72 | 72 | 51 | 81 | 67 | 69 | 65 |
| Jimmy Halliwell | Prop | 2004-03-31 | 22 | England | 72 | 80 | 52 | 61 | 61 | 73 | 72 | 47 | 82 | 64 | 65 | 61 |
| Paddy Pearce | Flanker | 2004-05-07 | 22 | England | 72 | 72 | 63 | 72 | 66 | 72 | 74 | 60 | 65 | 67 | 72 | 68 |
| Pedro Rubiolo | Lock | 2002-03-15 | 24 | Argentina | 72 | 73 | 57 | 55 | 60 | 72 | 72 | 49 | 84 | 65 | 65 | 65 |
| Jake Heenan | Flanker | 1992-04-09 | 34 | Ireland | 72 | 72 | 68 | 72 | 64 | 73 | 76 | 62 | 68 | 63 | 72 | 68 |
| Steven Luatua | Flanker | 1991-06-10 | 34 | New Zealand | 72 | 78 | 62 | 71 | 84 | 78 | 77 | 61 | 72 | 90 | 96 | 95 |
| Will Ramply | Lock | 2004-05-25 | 22 | England | 82 | 72 | 59 | 63 | 58 | 72 | 72 | 49 | 82 | 61 | 68 | 63 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| James Williams | Centre | 1998-08-04 | 27 | England | 83 | 72 | 73 | 74 | 72 | 73 | 64 | 58 | 65 | 67 | 72 | 68 |
| Joe Jenkins | Centre | 2003-10-13 | 22 | England | 87 | 72 | 72 | 72 | 72 | 72 | 67 | 66 | 60 | 62 | 72 | 69 |
| Jack Bates | Wing | 2001-09-21 | 24 | England | 85 | 64 | 81 | 79 | 72 | 60 | 58 | 59 | 60 | 67 | 72 | 72 |
| Rich Lane | Full-back | 1994-12-22 | 31 | England | 80 | 65 | 78 | 79 | 74 | 677 | 60 | 77 | 56 | 63 | 75 | 72 |
| Sam Wolstenholme | Scrum-half | 2001-04-19 | 25 | England | 83 | 56 | 78 | 72 | 73 | 62 | 63 | 73 | 55 | 70 | 72 | 72 |
| Max Pepper | Scrum-half | 2001-01-09 | 25 | England | 80 | 62 | 72 | 74 | 72 | 62 | 66 | 72 | 62 | 67 | 72 | 72 |
| Noah Heward | Full-back | 2002-03-30 | 24 | England | 85 | 62 | 74 | 74 | 76 | 71 | 60 | 72 | 59 | 67 | 72 | 72 |

---

## Leicester

- **Home ground:** Welford Road.
- **Club colours:** `#1c5e3f` / `#ffffff`
- **Nickname:** Tigers.
- **Founded:** 1880.
- **Stadium capacity:** 25,849 (the largest club-owned rugby ground in England).
- **Head coach:** Geoff Parling (Head Coach since August 2025, succeeding Michael Cheika).
- **Captain:** Ollie Chessum (appointed September 2025).
- **Overall rating:** **77/100**
- **Suggested tactics:** `kicking` · `keep_it_tight` · `commit_numbers` · `jackal` · `two_back` · `hybrid` · `cautious`
- **Stat bias:** high `setPiece`, `tackling`, `discipline`.
- **Board ambition:** `title`

### Star players

- **Freddie Steward** (Full-back, England) Index high: `positioning`, `handling`, `tackling`, `composure`, `kicking`. Suggested rating: **82/100**.
- **Ollie Chessum** (Lock, England) Index high: `strength`, `setPiece`, `stamina`, `tackling`, `breakdown`. Suggested rating: **87/100**. Marquee: yes. Wage: £550k.
- **Tommy Reffell** (Flanker, Wales) Index high: `breakdown`, `tackling`, `stamina`, `discipline`, `positioning`. Suggested rating: **84/100**.
- **Jack van Poortvliet** (Scrum-half, England) Index high: `kicking`, `handling`, `positioning`, `composure`, `agility`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nicky Smith | Prop | 1994-04-07 | 32 | Wales | 82 | 96 | 65 | 68 | 72 | 95 | 85 | 54 | 90 | 80 | 84 | 85 |
| Jamie Blamire | Hooker | 1997-12-22 | 28 | England | 80 | 89 | 79 | 75 | 78 | 89 | 90 | 55 | 90 | 84 | 84 | 83 |
| Joe Heyes | Prop | 1999-04-13 | 27 | England | 78 | 94 | 69 | 70 | 69 | 92 | 84 | 51 | 97 | 84 | 83 | 85 |
| Ollie Chessum | Lock | 2000-09-06 | 25 | England | 93 | 95 | 80 | 78 | 78 | 92 | 95 | 52 | 98 | 88 | 88 | 91 |
| George Martin | Lock | 2001-06-18 | 24 | England | 89 | 98 | 79 | 75 | 79 | 93 | 86 | 51 | 98 | 84 | 82 | 85 |
| Tommy Reffell | Flanker | 1999-04-27 | 27 | Wales | 95 | 80 | 79 | 78 | 78 | 95 | 95 | 64 | 78 | 95 | 95 | 78 |
| Hanro Liebenberg | Back Row | 1995-10-10 | 30 | South Africa | 87 | 90 | 81 | 86 | 83 | 92 | 89 | 63 | 85 | 83 | 86 | 84 |
| Emeka Ilione | Back Row | 2002-03-20 | 24 | England | 83 | 88 | 79 | 79 | 79 | 90 | 91 | 61 | 85 | 86 | 87 | 83 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jack van Poortvliet | Scrum-half | 2001-05-15 | 25 | England | 88 | 78 | 85 | 95 | 95 | 78 | 78 | 95 | 30 | 78 | 95 | 95 |
| Billy Searle | Fly-half | 1996-03-25 | 30 | England | 83 | 72 | 84 | 81 | 88 | 84 | 76 | 97 | 20 | 90 | 89 | 92 |
| Adam Radwan | Wing | 1997-12-30 | 28 | England | 84 | 79 | 98 | 94 | 83 | 81 | 76 | 76 | 42 | 83 | 86 | 81 |
| Orlando Bailey | Centre | 2001-09-30 | 24 | England | 84 | 77 | 82 | 85 | 84 | 88 | 85 | 76 | 33 | 80 | 85 | 85 |
| Solomone Kata | Centre | 1994-12-03 | 31 | Tonga | 80 | 84 | 84 | 88 | 83 | 89 | 82 | 76 | 53 | 85 | 85 | 79 |
| Ollie Hassell-Collins | Wing | 1999-01-17 | 27 | England | 83 | 79 | 95 | 96 | 88 | 83 | 74 | 79 | 24 | 85 | 86 | 88 |
| Freddie Steward | Full-back | 2000-12-05 | 25 | England | 88 | 81 | 78 | 70 | 78 | 95 | 78 | 88 | 50 | 90 | 95 | 95 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Charlie Clare | Hooker | 1991-12-16 | 34 | England | 75 | 82 | 63 | 69 | 78 | 82 | 84 | 52 | 96 | 75 | 75 | 77 |
| Tarek Haffar | Prop | 2001-09-13 | 24 | England | 78 | 87 | 61 | 62 | 66 | 89 | 78 | 49 | 92 | 78 | 74 | 77 |
| Will Hurd | Prop | 1999-06-29 | 26 | Scotland | 78 | 85 | 59 | 67 | 69 | 83 | 79 | 51 | 92 | 73 | 75 | 73 |
| Cam Henderson | Lock | 2000-01-13 | 26 | Scotland | 78 | 83 | 66 | 66 | 68 | 79 | 78 | 53 | 92 | 79 | 78 | 72 |
| Olly Cracknell | Flanker | 1994-05-26 | 31 | Wales | 88 | 80 | 76 | 75 | 76 | 84 | 83 | 59 | 84 | 78 | 81 | 76 |
| Ollie Allan | Scrum-half | 2004-02-04 | 22 | England | 70 | 71 | 81 | 83 | 83 | 75 | 74 | 81 | 63 | 77 | 82 | 79 |
| James O'Connor | Fly-half | 1990-07-05 | 35 | Australia | 71 | 71 | 76 | 77 | 83 | 78 | 67 | 89 | 65 | 81 | 78 | 84 |
| Izaia Perese | Centre | 1997-05-17 | 28 | Australia | 82 | 78 | 80 | 82 | 81 | 80 | 70 | 75 | 66 | 77 | 78 | 72 |


**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ale Loman | Prop | 2000-05-15 | 26 | Sweden | 72 | 80 | 50 | 59 | 56 | 80 | 73 | 47 | 89 | 73 | 62 | 62 |
| Archie van der Flier | Prop | 2002-04-25 | 24 | England | 72 | 76 | 51 | 60 | 54 | 76 | 73 | 48 | 84 | 72 | 65 | 62 |
| Cameron Miell | Prop | 2004-05-09 | 22 | South Africa | 72 | 74 | 52 | 53 | 57 | 78 | 75 | 54 | 90 | 66 | 63 | 64 |
| Finn Carnduff | Flanker | 2004-03-10 | 22 | England | 79 | 72 | 63 | 71 | 68 | 80 | 78 | 59 | 75 | 67 | 72 | 65 |
| George Marsh | Back Row | 2007-01-01 | 19 | England | 84 | 73 | 68 | 66 | 67 | 76 | 73 | 59 | 72 | 67 | 72 | 63 |
| Lewis Chessum | Lock | 2003-02-27 | 23 | England | 77 | 78 | 56 | 57 | 64 | 75 | 72 | 56 | 84 | 72 | 71 | 66 |
| Harry Palmer | Lock | 2005-10-28 | 20 | England | 79 | 76 | 59 | 60 | 57 | 74 | 72 | 54 | 83 | 70 | 71 | 64 |
| Harry Wells | Lock | 1993-09-29 | 32 | England | 72 | 72 | 53 | 56 | 63 | 72 | 72 | 50 | 86 | 68 | 70 | 67 |
| James Thompson | Lock | 1999-07-13 | 26 | New Zealand | 72 | 72 | 59 | 57 | 59 | 72 | 72 | 54 | 89 | 71 | 68 | 68 |
| Joaquin Moro | Flanker | 2001-01-24 | 25 | Argentina | 80 | 76 | 67 | 66 | 67 | 78 | 81 | 59 | 69 | 69 | 73 | 66 |
| John Stewart | Hooker | 2002-03-08 | 24 | England | 64 | 75 | 57 | 60 | 72 | 74 | 72 | 52 | 88 | 67 | 72 | 62 |
| Joshua Manz | Back Row | 2004-03-22 | 22 | England | 72 | 72 | 63 | 65 | 64 | 80 | 79 | 60 | 76 | 66 | 72 | 66 |
| Diamond Ayiehfor | Prop | 2007-01-01  | 19 | England | 72 | 75 | 50 | 57 | 54 | 75 | 72 | 53 | 89 | 69 | 65 | 68 |
| Osian Thomas | Lock | 2004-11-30 | 21 | Wales | 72 | 73 | 53 | 60 | 63 | 72 | 72 | 50 | 89 | 71 | 65 | 67 |
| Tom Manz | Lock | 2001-07-09 | 24 | England | 72 | 78 | 52 | 60 | 58 | 78 | 72 | 54 | 90 | 69 | 69 | 67 |
| Tonga Kofe | Prop | 1997-01-01 | 29 | USA | 72 | 80 | 47 | 54 | 56 | 81 | 72 | 53 | 84 | 69 | 66 | 67 |
| Tubuna Maka | Prop | 2005-11-18 | 20 | Fiji | 72 | 80 | 55 | 58 | 56 | 74 | 72 | 50 | 89 | 65 | 69 | 69 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Wilf McCarthy | Centre | 2002-10-08 | 23 | England | 82 | 72 | 73 | 72 | 72 | 74 | 70 | 62 | 39 | 68 | 72 | 66 |
| Charlie Titcombe | Fly-half | 2001-12-28 | 24 | England | 79 | 65 | 65 | 66 | 72 | 69 | 66 | 84 | 30 | 72 | 72 | 72 |
| Joseph Woodward | Centre | 2003-09-17 | 22 | England | 80 | 72 | 72 | 72 | 72 | 73 | 67 | 60 | 35 | 73 | 72 | 71 |
| Tom Whiteley | Scrum-half | 1995-12-17 | 30 | England | 82 | 58 | 76 | 73 | 72 | 68 | 71 | 72 | 61 | 31 | 72 | 72 |
| Will Wand | Centre | 2001-12-31 | 24 | England | 85 | 76 | 77 | 72 | 73 | 77 | 67 | 71 | 34 | 89 | 82 | 77 |
| Gabriel Hamer-Webb | Wing | 2000-11-07 | 25 | England | 82 | 62 | 84 | 77 | 72 | 67 | 62 | 62 | 22 | 71 | 72 | 72 |

---

## Saracens

- **Home ground:** Barnet Copthall Stadium.
- **Club colours:** `#000000` / `#a01018`
- **Nickname:** Sarries (the "Wolfpack" defensive identity).
- **Founded:** 1876.
- **Stadium capacity:** 10,500.
- **Head coach:** Mark McCall (Director of Rugby since 2010; stepping down end of 2025-26, with Brendan Venter to take over for 2026-27).
- **Captain:** Maro Itoje.
- **Overall rating:** **74/100**
- **Suggested tactics:** `kicking` · `balanced` · `balanced` · `jackal` · `two_back` · `blitz` · `cautious`
- **Stat bias:** high `tackling`, `positioning`, `composure`.
- **Board ambition:** `title`

### Star players

- **Maro Itoje** (Lock, England) Index high: `setPiece`, `tackling`, `strength`, `breakdown`, `composure`. Suggested rating: **92/100**. Marquee: yes. Wage: £800k.
- **Owen Farrell** (Fly-half, England) Index high: `kicking`, `composure`, `positioning`, `discipline`, `tackling`. Suggested rating: **84/100**.
- **Ben Earl** (Number 8, England) Index high: `pace`, `strength`, `stamina`, `handling`, `tackling`. Suggested rating: **88/100**.
- **Jamie George** (Hooker, England) Index high: `setPiece`, `tackling`, `breakdown`, `composure`, `discipline`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Rhys Carre | Prop | 1998-02-08 | 28 | Wales | 82 | 94 | 65 | 69 | 74 | 88 | 86 | 51 | 99 | 77 | 83 | 81 |
| Jamie George | Hooker | 1990-10-20 | 35 | England | 78 | 88 | 75 | 75 | 78 | 95 | 95 | 52 | 95 | 95 | 78 | 95 |
| Marco Riccioni | Prop | 1997-10-19 | 28 | Italy | 80 | 95 | 69 | 70 | 75 | 88 | 89 | 47 | 99 | 80 | 84 | 86 |
| Maro Itoje | Lock | 1994-10-28 | 31 | England | 99 | 90 | 80 | 88 | 78 | 95 | 95 | 53 | 99 | 95 | 95 | 97 |
| Nick Isiekwe | Lock | 1998-04-20 | 28 | England | 81 | 92 | 73 | 72 | 74 | 92 | 87 | 53 | 99 | 79 | 88 | 79 |
| Juan Martin Gonzalez | Flanker | 2000-11-14 | 25 | Argentina | 85 | 90 | 83 | 82 | 81 | 96 | 91 | 61 | 87 | 83 | 87 | 81 |
| Ben Earl | Back Row | 1998-01-07 | 28 | England | 99 | 92 | 89 | 78 | 90 | 99 | 99 | 78 | 88 | 88 | 92 | 92 |
| Tom Willis | Number 8 | 1999-01-18 | 27 | England | 86 | 95 | 84 | 85 | 80 | 89 | 85 | 64 | 81 | 89 | 93 | 92 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Charlie Bracken | Scrum-half | 2003-12-09 | 22 | England | 90 | 73 | 85 | 87 | 88 | 76 | 81 | 82 | 20 | 81 | 88 | 86 |
| Owen Farrell | Fly-half | 1991-09-24 | 34 | England | 78 | 78 | 78 | 78 | 78 | 90 | 78 | 97 | 58 | 85 | 95 | 85 |
| Rotimi Segun | Wing | 1996-12-28 | 29 | England | 78 | 78 | 94 | 94 | 83 | 82 | 77 | 77 | 60 | 83 | 84 | 83 |
| Lucio Cinti | Centre | 2000-02-23 | 26 | Argentina | 85 | 85 | 85 | 82 | 86 | 84 | 83 | 77 | 65 | 83 | 89 | 87 |
| Nick Tompkins | Centre | 1995-02-16 | 31 | Wales | 85 | 87 | 85 | 89 | 84 | 85 | 81 | 75 | 58 | 83 | 83 | 89 |
| Noah Caluori | Wing | 2006-09-22 | 19 | England | 87 | 79 | 94 | 90 | 87 | 84 | 76 | 75 | 59 | 77 | 89 | 82 |
| Elliot Daly | Utility Back | 1992-10-08 | 33 | England | 88 | 77 | 85 | 81 | 86 | 85 | 79 | 79 | 66 | 77 | 83 | 84 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Theo Dan | Hooker | 2000-12-26 | 25 | England | 84 | 81 | 84 | 72 | 78 | 82 | 78 | 58 | 83 | 72 | 75 | 77 |
| Eroni Mawi | Prop | 1996-02-06 | 30 | Fiji | 78 | 92 | 62 | 64 | 69 | 85 | 81 | 48 | 88 | 75 | 77 | 78 |
| Marcus Street | Prop | 1999-02-06 | 27 | England | 78 | 82 | 60 | 67 | 63 | 83 | 78 | 51 | 91 | 74 | 78 | 75 |
| Hugh Tizard | Lock | 2000-03-31 | 26 | England | 88 | 83 | 63 | 62 | 68 | 86 | 79 | 55 | 92 | 69 | 75 | 77 |
| Andy Onyeama-Christie | Flanker | 1999-03-22 | 27 | Scotland | 88 | 78 | 76 | 72 | 72 | 83 | 82 | 59 | 76 | 73 | 78 | 73 |
| Ivan van Zyl | Scrum-half | 1995-06-30 | 30 | South Africa | 77 | 68 | 80 | 81 | 78 | 72 | 76 | 85 | 61 | 76 | 85 | 81 |
| Fergus Burke | Fly-half | 1999-09-03 | 26 | Scotland | 89 | 69 | 74 | 78 | 82 | 71 | 73 | 90 | 58 | 78 | 82 | 80 |
| Jack Bracken | Wing | 2005-10-15 | 20 | England | 76 | 67 | 91 | 85 | 78 | 75 | 70 | 67 | 57 | 74 | 82 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Barnaby Merrett | Back Row | 2004-11-22 | 21 | England | 72 | 72 | 68 | 71 | 66 | 81 | 79 | 57 | 67 | 62 | 72 | 65 |
| Harvey Beaton | Prop | 2001-03-15 | 25 | England | 72 | 78 | 51 | 55 | 58 | 75 | 73 | 50 | 81 | 68 | 67 | 71 |
| Alec Clarey | Prop | 1994-02-08 | 32 | England | 72 | 80 | 52 | 57 | 56 | 74 | 72 | 48 | 79 | 67 | 68 | 70 |
| Phil Brantingham | Prop | 2001-10-02 | 24 | England | 72 | 78 | 52 | 57 | 54 | 73 | 73 | 48 | 82 | 62 | 66 | 71 |
| James Hadfield | Hooker | 1997-11-27 | 28 | England | 62 | 72 | 51 | 62 | 72 | 78 | 72 | 52 | 77 | 66 | 67 | 66 |
| James Isaacs | Hooker | 2004-03-28 | 22 | England | 68 | 72 | 57 | 61 | 72 | 75 | 73 | 58 | 84 | 67 | 67 | 67 |
| Mak Eke | Back Row | 2003-12-04 | 22 | England | 72 | 72 | 67 | 64 | 66 | 73 | 74 | 60 | 73 | 69 | 73 | 65 |
| Toby Knight | Flanker | 2002-01-05 | 24 | England | 72 | 73 | 66 | 69 | 62 | 82 | 78 | 59 | 70 | 65 | 74 | 70 |
| Nathan Michelow | Back Row | 2004-05-16 | 22 | England | 72 | 74 | 63 | 64 | 68 | 76 | 76 | 59 | 67 | 68 | 72 | 65 |
| Eoghan Clarke | Hooker | 1998-06-12 | 27 | Ireland | 69 | 72 | 56 | 63 | 72 | 74 | 73 | 58 | 79 | 62 | 71 | 70 |
| Theo McFarland | Back Row | 1995-10-16 | 30 | Samoa | 83 | 82 | 77 | 66 | 67 | 80 | 72 | 63 | 71 | 88 | 83 | 89 |
| Vilikesa Nairau | Prop | 2002-06-03 | 23 | Fiji | 72 | 78 | 50 | 55 | 61 | 76 | 72 | 48 | 80 | 66 | 64 | 69 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alex Lozowski | Centre | 1993-06-30 | 32 | England | 83 | 71 | 75 | 74 | 72 | 72 | 64 | 61 | 64 | 64 | 72 | 67 |
| Louie Johnson | Fly-half | 2003-06-13 | 22 | England | 86 | 60 | 65 | 68 | 76 | 69 | 59 | 83 | 64 | 72 | 72 | 72 |
| Max Malins | Wing | 1997-01-07 | 29 | England | 82 | 72 | 80 | 76 | 82 | 65 | 62 | 66 | 59 | 83 | 82 | 82 |
| Olly Hartley | Centre | 2002-02-19 | 24 | England | 83 | 79 | 72 | 73 | 74 | 72 | 66 | 61 | 64 | 86 | 82 | 80 |
| Sam Spink | Centre | 1999-10-06 | 26 | England | 89 | 72 | 72 | 72 | 74 | 73 | 63 | 66 | 60 | 64 | 73 | 70 |
| Tobias Elliott | Wing | 2003-09-16 | 22 | England | 88 | 75 | 82 | 75 | 73 | 67 | 57 | 63 | 58 | 65 | 72 | 72 |
| Angus Hall | Centre | 2005-09-17 | 20 | England | 79 | 73 | 72 | 72 | 74 | 72 | 66 | 61 | 62 | 62 | 72 | 71 |
| Gareth Simpson | Scrum-half | 1997-11-02 | 28 | England | 76 | 64 | 72 | 72 | 73 | 70 | 64 | 72 | 63 | 68 | 74 | 74 |

---

## Bath

- **Home ground:** The Rec.
- **Club colours:** `#0033a0` / `#ffffff`
- **Nickname:** The Blue, Black and Whites.
- **Founded:** 1865 — one of the oldest rugby clubs in England.
- **Stadium capacity:** 14,500 (18,000-seat rebuild approved September 2025).
- **Head coach:** Johann van Graan (Head of Rugby since 2022, contracted to 2030).
- **Captain:** Ben Spencer.
- **Overall rating:** **79/100**
- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `two_back` · `hybrid` · `cautious`
- **Stat bias:** high `handling`, `kicking`, `composure`.
- **Board ambition:** `title`

### Star players

- **Thomas du Toit** (Prop, South Africa) Index high: `setPiece`, `strength`, `breakdown`, `tackling`, `stamina`. Suggested rating: **93/100**.
- **Finn Russell** (Fly-half, Scotland) Index high: `handling`, `kicking`, `composure`, `positioning`, `agility`. Suggested rating: **92/100**. Marquee: yes. Wage: £1m.
- **Ben Spencer** (Scrum-half, England) Index high: `kicking`, `composure`, `positioning`, `discipline`, `handling`. Suggested rating: **85/100**.
- **Sam Underhill** (Flanker, England) Index high: `tackling`, `breakdown`, `strength`, `stamina`. Suggested rating: **86/100**.
- **Santi Carreras** (Full-back, Argentina) Index high: `handling`, `kicking`, `agility`, `positioning`. Suggested rating: **84/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Thomas du Toit | Prop | 1995-05-05 | 31 | South Africa | 89 | 99 | 78 | 78 | 78 | 99 | 99 | 54 | 99 | 97 | 99 | 98 |
| Tom Dunn | Hooker | 1992-11-12 | 33 | England | 85 | 89 | 71 | 75 | 86 | 86 | 85 | 62 | 98 | 86 | 84 | 88 |
| Beno Obano | Prop | 1994-10-25 | 31 | England | 81 | 97 | 69 | 71 | 80 | 87 | 85 | 59 | 99 | 79 | 79 | 85 |
| Charlie Ewels | Lock | 1995-06-29 | 30 | England | 85 | 88 | 73 | 74 | 77 | 85 | 85 | 55 | 96 | 81 | 83 | 81 |
| Ted Hill | Lock / Flanker | 1999-03-26 | 27 | England | 82 | 86 | 90 | 72 | 83 | 85 | 84 | 56 | 98 | 79 | 82 | 85 |
| Sam Underhill | Flanker | 1996-07-22 | 29 | England | 99 | 92 | 78 | 78 | 78 | 99 | 99 | 63 | 78 | 78 | 81 | 78 |
| Josh Bayliss | Flanker | 1997-09-18 | 28 | Scotland | 88 | 89 | 91 | 84 | 88 | 90 | 95 | 65 | 87 | 85 | 82 | 85 |
| Alfie Barbeary | Number 8 | 2000-10-05 | 25 | England | 87 | 94 | 79 | 87 | 87 | 92 | 89 | 65 | 89 | 80 | 84 | 84 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ben Spencer | Scrum-half | 1992-07-31 | 33 | England | 88 | 78 | 79 | 78 | 95 | 78 | 78 | 95 | 62 | 95 | 95 | 95 |
| Finn Russell | Fly-half | 1992-09-23 | 33 | Scotland | 82 | 78 | 78 | 97 | 99 | 78 | 78 | 99 | 63 | 99 | 99 | 99 |
| Henry Arundell | Wing | 2002-11-08 | 23 | England | 84 | 76 | 99 | 93 | 93 | 78 | 78 | 87 | 57 | 85 | 88 | 89 |
| Max Ojomoh | Centre | 2000-09-14 | 25 | England | 82 | 82 | 85 | 84 | 90 | 86 | 83 | 81 | 61 | 84 | 88 | 86 |
| Ollie Lawrence | Centre | 1999-09-18 | 26 | England | 84 | 87 | 88 | 87 | 91 | 90 | 85 | 82 | 64 | 84 | 86 | 91 |
| Joe Cokanasiga | Wing | 1997-11-15 | 28 | England | 84 | 76 | 94 | 97 | 88 | 81 | 74 | 87 | 58 | 84 | 84 | 87 |
| Santi Carreras | Full-back | 1998-03-30 | 28 | Argentina | 88 | 78 | 80 | 95 | 95 | 78 | 78 | 95 | 63 | 90 | 98 | 90 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dan Frost | Hooker | 1997-04-24 | 29 | England | 77 | 84 | 67 | 70 | 78 | 84 | 81 | 62 | 92 | 74 | 78 | 76 |
| Archie Griffin | Prop | 2001-07-24 | 24 | Wales | 78 | 88 | 62 | 67 | 73 | 83 | 83 | 58 | 92 | 73 | 71 | 76 |
| Will Stuart | Prop | 1996-07-12 | 29 | England | 78 | 85 | 62 | 66 | 68 | 87 | 78 | 54 | 89 | 72 | 76 | 74 |
| Quinn Roux | Lock | 1990-10-30 | 35 | Ireland | 78 | 88 | 63 | 67 | 73 | 81 | 78 | 57 | 93 | 73 | 73 | 78 |
| Guy Pepper | Flanker | 2003-04-15 | 23 | England | 78 | 78 | 70 | 80 | 74 | 88 | 90 | 67 | 82 | 75 | 80 | 77 |
| Tom Carr-Smith | Scrum-half | 2002-02-28 | 24 | England | 78 | 67 | 83 | 78 | 81 | 79 | 79 | 86 | 63 | 80 | 83 | 86 |
| Cameron Redpath | Centre | 1999-12-23 | 26 | Scotland | 78 | 80 | 81 | 80 | 80 | 81 | 76 | 76 | 66 | 71 | 80 | 83 |
| Will Muir | Wing | 1995-10-30 | 30 | England | 75 | 75 | 89 | 89 | 81 | 74 | 72 | 72 | 56 | 76 | 79 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ethan Staddon | Flanker | 2002-07-03 | 23 | England | 75 | 76 | 67 | 70 | 70 | 80 | 75 | 63 | 74 | 67 | 72 | 72 |
| Ewan Richards | Flanker | 2002-04-06 | 24 | England | 72 | 77 | 64 | 67 | 66 | 81 | 77 | 63 | 69 | 71 | 72 | 69 |
| Francois van Wyk | Prop | 1991-07-30 | 34 | South Africa | 72 | 80 | 54 | 57 | 63 | 74 | 72 | 55 | 83 | 69 | 70 | 69 |
| Thompson Cowan | Flanker | 2002-08-02 | 23 | Wales | 75 | 78 | 67 | 67 | 68 | 75 | 77 | 62 | 73 | 63 | 72 | 70 |
| Ross Molony | Lock | 1994-05-11 | 32 | Ireland | 72 | 80 | 61 | 62 | 68 | 75 | 72 | 55 | 82 | 65 | 73 | 72 |
| Jaco Coetzee | Number 8 | 1996-06-10 | 29 | South Africa | 72 | 80 | 69 | 70 | 72 | 78 | 78 | 69 | 71 | 68 | 66 | 67 |
| Jasper Spandler | Hooker | 2003-05-21 | 23 | England | 70 | 72 | 55 | 64 | 72 | 74 | 72 | 59 | 81 | 63 | 72 | 69 |
| Kieran Verden | Prop | 1998-11-06 | 27 | England | 72 | 80 | 50 | 55 | 59 | 73 | 72 | 54 | 85 | 64 | 65 | 72 |
| Mikey Summerfield | Prop | 2002-10-30 | 23 | England | 72 | 79 | 48 | 59 | 61 | 73 | 75 | 53 | 87 | 66 | 70 | 73 |
| Miles Reid | Flanker | 1998-09-05 | 27 | England | 76 | 74 | 63 | 68 | 70 | 74 | 75 | 69 | 67 | 69 | 72 | 70 |


**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Austin Emens | Full-back | 2002-10-09 | 23 | England | 78 | 66 | 79 | 74 | 75 | 70 | 67 | 72 | 59 | 70 | 73 | 77 |
| Bernard van der Linde | Scrum-half | 2000-11-30 | 25 | South Africa | 80 | 62 | 75 | 75 | 76 | 67 | 69 | 76 | 64 | 66 | 73 | 79 |
| Ciaran Donoghue | Fly-half | 2003-01-07 | 23 | Ireland | 86 | 59 | 67 | 67 | 81 | 66 | 67 | 90 | 62 | 72 | 74 | 80 |
| Louie Hennessey | Centre | 2004-03-29 | 22 | Wales | 88 | 72 | 72 | 75 | 72 | 72 | 70 | 68 | 61 | 67 | 74 | 69 |
| Will Butt | Centre | 2000-01-15 | 26 | England | 82 | 72 | 72 | 72 | 75 | 72 | 65 | 65 | 63 | 70 | 73 | 75 |
| Neil le Roux | Scrum-half | 2003-04-16 | 23 | South Africa | 88 | 63 | 72 | 72 | 78 | 66 | 69 | 74 | 66 | 71 | 72 | 78 |
| Sam Harris | Fly-half | 2003-09-03 | 22 | England | 84 | 60 | 69 | 66 | 80 | 66 | 61 | 87 | 59 | 72 | 73 | 75 |
| Tom de Glanville | Full-back | 1999-12-10 | 26 | England | 88 | 64 | 75 | 78 | 78 | 67 | 65 | 72 | 65 | 80 | 74 | 85 |
| Chris Harris | Centre | 1990-12-28 | 35 | Scotland | 80 | 72 | 74 | 74 | 73 | 73 | 69 | 71 | 60 | 88 | 72 | 82 |

---

## Exeter

- **Home ground:** Sandy Park.
- **Club colours:** `#000000` / `#ffffff`
- **Nickname:** Chiefs.
- **Founded:** 1871.
- **Stadium capacity:** 15,600.
- **Head coach:** Rob Baxter (Director of Rugby since 2009 — the league's longest-serving head coach).
- **Captain:** Dafydd Jenkins.
- **Overall rating:** **70/100**
- **Suggested tactics:** `possession` · `keep_it_tight` · `commit_numbers` · `counter_ruck` · `one_back` · `blitz` · `cautious`
- **Stat bias:** high `stamina`, `breakdown`, `setPiece`.
- **Board ambition:** `playoffs`

### Star players

- **Henry Slade** (Centre, England) Index high: `handling`, `kicking`, `tackling`, `positioning`, `composure`. Suggested rating: **82/100**.
- **Len Ikitau** (Centre, Australia) Index high: `tackling`, `strength`, `pace`, `positioning`. Suggested rating: **85/100**.
- **Immanuel Feyi-Waboso** (Wing, England) Index high: `pace`, `agility`, `handling`, `strength`. Suggested rating: **86/100**. Marquee: yes. Wage: £500k.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Scott Sio | Prop | 1991-10-16 | 34 | Australia | 79 | 92 | 65 | 64 | 68 | 88 | 87 | 49 | 93 | 75 | 78 | 78 |
| Joseph Dweba | Hooker | 1995-10-25 | 30 | South Africa | 78 | 84 | 70 | 69 | 74 | 82 | 89 | 49 | 90 | 81 | 80 | 79 |
| Josh Iosefa-Scott | Prop | 1996-07-16 | 29 | New Zealand | 80 | 90 | 64 | 65 | 66 | 90 | 83 | 48 | 90 | 80 | 80 | 81 |
| Dafydd Jenkins | Lock | 2002-12-05 | 23 | Wales | 89 | 83 | 69 | 67 | 75 | 85 | 86 | 50 | 94 | 86 | 91 | 95 |
| Andrea Zambonin | Lock | 2000-09-03 | 25 | Italy | 81 | 85 | 64 | 71 | 70 | 87 | 84 | 52 | 92 | 76 | 76 | 80 |
| Ethan Roots | Flanker | 1997-11-10 | 28 | England | 86 | 87 | 79 | 84 | 78 | 92 | 93 | 57 | 88 | 80 | 79 | 76 |
| Christ Tshiunza | Flanker| 2002-01-09 | 24 | Wales | 85 | 86 | 78 | 79 | 74 | 88 | 89 | 55 | 82 | 74 | 79 | 76 |
| Greg Fisilau | Number 8 | 2003-07-09 | 22 | England | 84 | 86 | 76 | 83 | 78 | 83 | 85 | 62 | 90 | 78 | 83 | 76 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Stephen Varney | Scrum-half | 2001-05-16 | 25 | Italy | 81 | 69 | 82 | 84 | 84 | 79 | 79 | 83 | 64 | 83 | 86 | 84 |
| Harvey Skinner | Fly-half | 1997-12-31 | 28 | England | 79 | 70 | 85 | 83 | 83 | 76 | 76 | 94 | 64 | 83 | 83 | 85 |
| Immanuel Feyi-Waboso | Wing | 2002-12-20 | 23 | England | 88 | 95 | 95 | 99 | 99 | 78 | 78 | 78 | 57 | 78 | 92 | 78 |
| Len Ikitau | Centre | 1998-10-01 | 27 | Australia | 88 | 95 | 95 | 78 | 93 | 99 | 78 | 78 | 58 | 78 | 95 | 78 |
| Henry Slade | Centre | 1993-03-19 | 33 | England | 88 | 78 | 85 | 78 | 95 | 95 | 78 | 95 | 62 | 78 | 95 | 95 |
| Paul Brown-Bampoe | Wing | 2002-05-15 | 24 | England | 85 | 76 | 92 | 92 | 86 | 75 | 73 | 80 | 63 | 77 | 83 | 75 |
| Olly Woodburn | Wing / Full Back | 1991-11-18 | 34 | England | 80 | 78 | 88 | 88 | 87 | 80 | 75 | 86 | 57 | 78 | 89 | 80 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Max Norey | Hooker | 1999-08-05 | 26 | England | 71 | 79 | 63 | 66 | 78 | 81 | 83 | 54 | 89 | 69 | 69 | 69 |
| Will Goodrick-Clarke | Prop | 1996-12-29 | 29 | England | 78 | 83 | 53 | 57 | 66 | 81 | 79 | 50 | 93 | 70 | 68 | 68 |
| Ethan Burger | Prop | 2000-05-23 | 25 | South Africa | 78 | 81 | 57 | 60 | 67 | 78 | 79 | 51 | 95 | 69 | 71 | 69 |
| Alfie Bell | Lock | 2003-04-12 | 23 | England | 79 | 78 | 63 | 61 | 69 | 81 | 81 | 54 | 92 | 74 | 69 | 69 |
| Rusi Tuima | Flanker | 2000-05-21 | 26 | Fiji | 80 | 82 | 71 | 77 | 66 | 84 | 87 | 57 | 81 | 69 | 78 | 73 |
| Tom Cairns | Scrum-half | 2002-06-19 | 23 | England | 77 | 65 | 78 | 78 | 78 | 69 | 77 | 78 | 61 | 75 | 78 | 79 |
| Will Haydon-Wood | Fly-half | 2000-10-27 | 25 | England | 83 | 64 | 72 | 71 | 79 | 68 | 74 | 87 | 63 | 78 | 78 | 78 |
| Dan John | Wing | 2001-10-04 | 24 | Wales | 80 | 67 | 83 | 82 | 78 | 73 | 67 | 70 | 57 | 75 | 78 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Kwenzo Blose | Prop | 1997-05-12 | 29 | South Africa | 72 | 72 | 44 | 56 | 53 | 73 | 74 | 49 | 87 | 65 | 60 | 63 |
| Bachuki Tchumbadze | Prop | 2001-11-30 | 24 | Georgia | 72 | 78 | 49 | 54 | 53 | 72 | 72 | 46 | 80 | 65 | 64 | 62 |
| Tom Hooper | Flanker | 2001-01-29 | 25 | Australia | 75 | 74 | 64 | 67 | 60 | 76 | 78 | 58 | 71 | 62 | 72 | 60 |
| Joe Bailey | Lock | 2004-07-06 | 21 | England | 72 | 72 | 56 | 54 | 56 | 72 | 72 | 46 | 87 | 66 | 62 | 65 |
| Oscar Beckerleg | Lock | 2005-05-11 | 21 | England | 72 | 72 | 55 | 56 | 55 | 73 | 72 | 53 | 86 | 62 | 64 | 65 |
| Ehren Painter | Prop | 1998-03-21 | 28 | England | 72 | 75 | 49 | 53 | 55 | 72 | 74 | 50 | 85 | 61 | 65 | 67 |
| Richard Capstick | Flanker | 2000-02-13 | 26 | England | 72 | 72 | 65 | 69 | 62 | 72 | 79 | 56 | 68 | 65 | 72 | 63 |
| Jack Yeandle | Hooker | 1989-12-22 | 36 | England | 62 | 72 | 53 | 60 | 72 | 72 | 72 | 49 | 80 | 65 | 69 | 64 |
| Jimmy Roots | Prop | 2000-01-31 | 26 | England | 72 | 73 | 51 | 53 | 51 | 72 | 72 | 44 | 85 | 67 | 64 | 65 |
| Julian Heaven | Hooker | 2000-10-01 | 25 | Australia | 69 | 72 | 54 | 60 | 72 | 72 | 72 | 51 | 82 | 60 | 64 | 66 |
| Khwezi Mona | Prop | 1992-10-08 | 33 | South Africa | 72 | 76 | 48 | 55 | 55 | 75 | 72 | 45 | 83 | 64 | 63 | 60 |
| Lewis Pearson | Lock | 1999-10-26 | 26 | England | 72 | 76 | 55 | 54 | 60 | 72 | 72 | 53 | 83 | 65 | 62 | 67 |
| Martin Moloney | Flanker | 1999-10-19 | 26 | Ireland | 72 | 72 | 63 | 68 | 60 | 73 | 79 | 58 | 72 | 64 | 72 | 65 |
| Louie Gulley | Hooker | 2005-08-04 | 20 | England | 65 | 72 | 51 | 60 | 72 | 72 | 76 | 53 | 82 | 63 | 63 | 60 |
| Ross Vintcent | Number 8 | 2002-06-05 | 23 | Italy | 72 | 73 | 64 | 68 | 72 | 72 | 76 | 62 | 73 | 62 | 65 | 60 |
| Kane James | Flanker | 2005-03-26 | 21 | England | 72 | 72 | 61 | 68 | 62 | 74 | 76 | 55 | 68 | 62 | 72 | 63 |
| Sol Moody | Hooker | 2005-04-16 | 21 | England | 66 | 72 | 57 | 60 | 72 | 72 | 74 | 52 | 77 | 60 | 63 | 65 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Charlie Chapman | Scrum-half | 1998-12-01 | 27 | England | 86 | 61 | 72 | 72 | 72 | 66 | 65 | 72 | 63 | 64 | 72 | 72 |
| Ben Coen | Fly-half | 2005-01-11 | 21 | England | 85 | 55 | 67 | 70 | 72 | 60 | 63 | 81 | 62 | 72 | 72 | 72 |
| Iwan Jenkins | Fly-half | 2003-03-13 | 23 | Wales | 87 | 55 | 63 | 68 | 72 | 62 | 64 | 83 | 63 | 72 | 72 | 73 |
| Will Becconsall | Scrum-half | 2002-12-20 | 23 | England | 88 | 56 | 72 | 72 | 72 | 64 | 65 | 72 | 58 | 65 | 72 | 72 |
| Tamati Tua | Centre | 1997-11-26 | 28 | New Zealand | 88 | 72 | 72 | 72 | 72 | 72 | 66 | 60 | 61 | 62 | 72 | 68 |
| Tommy Wyatt | Wing | 1999-12-14 | 26 | England | 88 | 57 | 76 | 77 | 72 | 63 | 57 | 60 | 62 | 66 | 72 | 72 |
| Will Rigg | Centre | 2000-03-22 | 26 | England | 85 | 72 | 72 | 72 | 72 | 72 | 63 | 58 | 66 | 67 | 72 | 63 |
| Zack Wimbush | Centre | 2003-10-24 | 22 | England | 84 | 72 | 72 | 72 | 72 | 72 | 65 | 63 | 66 | 60 | 72 | 68 |
| Ben Hammersley | Wing | 2003-05-20 | 23 | England | 83 | 61 | 79 | 77 | 72 | 60 | 61 | 59 | 58 | 60 | 72 | 72 |

---

## Harlequins

- **Home ground:** The Stoop.
- **Club colours:** `#73144a` / `#23bcad`
- **Nickname:** Quins.
- **Founded:** 1866 — one of the league's oldest clubs.
- **Stadium capacity:** 14,800.
- **Head coach:** Jason Gilmore (Head Coach since September 2025, promoted from defence coach after Danny Wilson's late departure to Wales).
- **Captain:** Alex Dombrandt (since 2024-25).
- **Overall rating:** **66/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `one_back` · `drift` · `offload_freely`
- **Stat bias:** high `pace`, `agility`, `handling`.
- **Board ambition:** `playoffs`

### Star players

- **Marcus Smith** (Fly-half, England) Index high: `handling`, `agility`, `kicking`, `composure`, `pace`. Suggested rating: **90/100**. Marquee: yes. Wage: £525k.
- **Alex Dombrandt** (Number 8, England) Index high: `strength`, `handling`, `breakdown`, `tackling`, `stamina`. Suggested rating: **84/100**.
- **Chandler Cunningham-South** (Flanker, England) Index high: `strength`, `tackling`, `breakdown`, `setPiece`, `stamina`. Suggested rating: **83/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fin Baxter | Prop | 2002-02-12 | 24 | England | 78 | 91 | 64 | 72 | 75 | 81 | 82 | 45 | 90 | 76 | 72 | 79 |
| Sam Riley | Hooker | 2001-04-23 | 25 | England | 77 | 82 | 70 | 74 | 79 | 82 | 82 | 50 | 91 | 78 | 79 | 76 |
| Pedro Delgado | Prop | 1997-09-01 | 28 | Argentina | 77 | 84 | 63 | 68 | 73 | 87 | 81 | 49 | 93 | 73 | 72 | 77 |
| Guido Petti | Lock | 1994-11-17 | 31 | Argentina | 77 | 86 | 71 | 75 | 76 | 85 | 82 | 51 | 97 | 80 | 82 | 73 |
| Joe Launchbury | Lock | 1991-04-12 | 35 | England | 79 | 87 | 72 | 73 | 77 | 79 | 82 | 44 | 97 | 77 | 76 | 78 |
| Chandler Cunningham-South | Flanker | 2003-03-18 | 23 | England | 95 | 95 | 78 | 78 | 78 | 95 | 95 | 55 | 95 | 78 | 78 | 78 |
| Jack Kenningham | Flanker | 1999-11-19 | 26 | England | 83 | 79 | 77 | 83 | 80 | 84 | 98 | 58 | 76 | 73 | 81 | 77 |
| Alex Dombrandt | Number 8 | 1997-04-29 | 29 | England | 89 | 90 | 78 | 78 | 90 | 95 | 95 | 56 | 78 | 90 | 90 | 90 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Will Porter | Scrum-half | 1998-12-14 | 27 | England | 85 | 74 | 90 | 85 | 87 | 78 | 81 | 82 | 57 | 82 | 85 | 78 |
| Marcus Smith | Fly-half | 1999-02-14 | 27 | England | 88 | 78 | 89 | 99 | 99 | 78 | 78 | 99 | 25 | 91 | 99 | 95 |
| Cadan Murley | Wing | 1999-07-31 | 26 | England | 80 | 80 | 95 | 94 | 87 | 74 | 69 | 76 | 54 | 72 | 77 | 76 |
| Oscar Beard | Centre | 2001-11-20 | 24 | England | 90 | 85 | 81 | 87 | 85 | 78 | 77 | 71 | 56 | 76 | 76 | 81 |
| Luke Northmore | Centre | 1997-03-16 | 29 | England | 88 | 82 | 85 | 85 | 86 | 80 | 74 | 76 | 56 | 74 | 83 | 77 |
| Rodrigo Isgró | Wing | 1999-03-24 | 27 | Argentina | 84 | 70 | 93 | 91 | 82 | 70 | 73 | 77 | 55 | 74 | 76 | 80 |
| Tyrone Green | Full-back | 1998-03-05 | 28 | South Africa | 90 | 75 | 84 | 90 | 85 | 82 | 75 | 78 | 58 | 77 | 83 | 79 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jack Musk | Hooker | 2000-03-04 | 26 | England | 76 | 78 | 64 | 67 | 78 | 78 | 78 | 51 | 87 | 71 | 73 | 73 |
| Harry Williams | Prop | 1991-10-01 | 34 | England | 78 | 87 | 54 | 61 | 60 | 78 | 78 | 43 | 87 | 69 | 68 | 68 |
| Will Hobson | Prop | 2002-11-09 | 23 | England | 78 | 82 | 59 | 64 | 67 | 78 | 78 | 44 | 91 | 66 | 70 | 70 |
| Stephan Lewies | Lock | 1992-01-27 | 34 | South Africa | 78 | 79 | 63 | 67 | 68 | 78 | 78 | 48 | 88 | 69 | 70 | 72 |
| Will Evans | Flanker | 1997-01-28 | 29 | England | 88 | 78 | 70 | 78 | 72 | 80 | 98 | 56 | 71 | 82 | 88 | 86 |
| Lucas Friday | Scrum-half | 2006-07-13 | 19 | England | 91 | 63 | 88 | 78 | 88 | 67 | 74 | 85 | 56 | 88 | 88 | 81 |
| Jarrod Evans | Fly-half | 1996-07-25 | 29 | Wales | 79 | 77 | 72 | 72 | 78 | 71 | 64 | 88 | 55 | 78 | 78 | 78 |
| Cassius Cleaves | Wing | 2003-03-15 | 23 | England | 68 | 68 | 86 | 83 | 78 | 68 | 67 | 68 | 54 | 69 | 78 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Boris Wenger | Prop | 2002-07-01 | 23 | Argentina | 72 | 76 | 47 | 53 | 60 | 72 | 72 | 49 | 78 | 61 | 63 | 60 |
| Jonny Green | Lock | 2004-03-16 | 22 | England | 72 | 72 | 53 | 59 | 57 | 72 | 72 | 48 | 83 | 65 | 64 | 60 |
| George Turner | Hooker | 1992-10-08 | 33 | Scotland | 62 | 72 | 56 | 60 | 72 | 72 | 72 | 49 | 74 | 60 | 60 | 63 |
| Jordan Els | Prop | 1997-06-11 | 28 | South Africa | 72 | 75 | 48 | 53 | 52 | 72 | 72 | 43 | 78 | 60 | 60 | 63 |
| James Chisholm | Back Row | 1995-08-11 | 30 | England | 72 | 88 | 68 | 64 | 65 | 73 | 72 | 55 | 63 | 62 | 72 | 62 |
| Jack Walker | Hooker | 1996-05-06 | 30 | England | 60 | 72 | 55 | 60 | 72 | 72 | 72 | 52 | 73 | 60 | 63 | 64 |
| Kieran Treadwell | Lock | 1995-11-06 | 30 | Ireland | 72 | 73 | 55 | 57 | 59 | 72 | 72 | 45 | 82 | 63 | 63 | 61 |
| Simon Kerrod | Prop | 1992-08-25 | 33 | England | 72 | 72 | 53 | 52 | 58 | 72 | 72 | 44 | 78 | 60 | 60 | 62 |
| Titi Lamositele | Prop | 1995-02-11 | 31 | USA | 72 | 72 | 51 | 53 | 53 | 72 | 72 | 50 | 76 | 64 | 60 | 61 |
| Tom Lawday | Number 8 | 1993-11-11 | 32 | England | 72 | 72 | 63 | 68 | 72 | 72 | 72 | 57 | 68 | 60 | 64 | 65 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ben Waghorn | Centre | 2004-04-02 | 22 | England | 80 | 72 | 72 | 72 | 72 | 72 | 59 | 58 | 61 | 63 | 72 | 60 |
| Conor Byrne | Full-back | 2005-07-07 | 20 | England | 81 | 57 | 72 | 68 | 72 | 64 | 59 | 72 | 53 | 66 | 72 | 72 |
| Hayden Hyde | Centre | 2000-09-15 | 25 | England | 74 | 72 | 72 | 72 | 72 | 72 | 59 | 63 | 61 | 62 | 72 | 67 |
| Jamie Benson | Fly-half | 2002-09-23 | 23 | England | 75 | 60 | 68 | 65 | 72 | 60 | 56 | 79 | 57 | 72 | 72 | 72 |
| Bryn Bradley | Centre | 2003-04-17 | 23 | Wales | 80 | 72 | 72 | 72 | 72 | 72 | 59 | 58 | 58 | 61 | 72 | 64 |
| Nick David | Full-back | 1998-11-04 | 27 | England | 80 | 56 | 76 | 74 | 72 | 61 | 61 | 72 | 54 | 62 | 72 | 72 |
| Sean Kerr | Centre | 2004-11-08 | 21 | England | 82 | 72 | 72 | 72 | 72 | 72 | 64 | 58 | 58 | 60 | 72 | 60 |
| Stu Townsend | Scrum-half | 1995-10-11 | 30 | England | 83 | 55 | 72 | 72 | 72 | 60 | 62 | 72 | 56 | 61 | 72 | 72 |
| Max Green | Scrum-half | 1996-02-13 | 30 | England | 80 | 53 | 72 | 73 | 72 | 64 | 64 | 72 | 53 | 62 | 72 | 72 |
| Cameron Anderson | Full-back | 1999-09-16 | 26 | England | 81 | 58 | 76 | 71 | 72 | 64 | 61 | 72 | 59 | 60 | 72 | 72 |

---

## Newcastle

- **Home ground:** Kingston Park.
- **Club colours:** `#000000` / `#c8a84b`
- **Nickname:** Falcons.
- **Founded:** 1877 (as Gosforth FC).
- **Stadium capacity:** 10,200.
- **Head coach:** Stephen Jones (interim Head Coach from March 2026 after Alan Dickens departed; Dan McFarland publicly linked with the role from 2026-27).
- **Captain:** George McGuigan.
- **Overall rating:** **55/100**
- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `three_back` · `hybrid` · `cautious`
- **Stat bias:** modest across the board (rebuild status); slight lean toward `stamina` and `discipline`.
- **Board ambition:** `topHalf`

### Star players

- **Liam Williams** (Full-back, Wales) Index high: `positioning`, `handling`, `composure`, `agility`, `pace`. Suggested rating: **84/100**. Marquee: yes.
- **Amanaki Mafi** (Number 8, Japan) Index high: `strength`, `handling`, `breakdown`, `stamina`, `tackling`. Suggested rating: **80/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Eduardo Bello | Prop | 1995-09-14 | 30 | Argentina | 79 | 87 | 55 | 61 | 61 | 82 | 74 | 44 | 88 | 73 | 70 | 72 |
| Samson Adejimi | Hooker | 2002-02-15 | 24 | England | 73 | 82 | 58 | 68 | 68 | 74 | 79 | 44 | 86 | 77 | 71 | 70 |
| Adam Brocklebank | Prop | 1995-09-06 | 30 | England | 79 | 85 | 57 | 65 | 62 | 83 | 74 | 39 | 93 | 77 | 75 | 73 |
| Finn Baker | Lock | 2004-10-17 | 21 | England | 81 | 82 | 65 | 65 | 68 | 75 | 80 | 41 | 87 | 75 | 70 | 74 |
| Tim Cardall | Lock | 1997-01-13 | 29 | England | 80 | 81 | 65 | 62 | 69 | 80 | 73 | 43 | 89 | 77 | 75 | 74 |
| Tom Christie | Flanker | 1998-03-04 | 28 | New Zealand | 78 | 83 | 68 | 72 | 70 | 80 | 85 | 51 | 78 | 71 | 78 | 71 |
| Tom Gordon | Flanker | 1997-01-30 | 29 | Scotland | 83 | 78 | 74 | 75 | 71 | 81 | 82 | 49 | 79 | 76 | 77 | 68 |
| Amanaki Mafi | Number 8 | 1990-01-11 | 36 | Japan | 95 | 95 | 78 | 78 | 95 | 95 | 95 | 52 | 78 | 78 | 78 | 78 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Simon Benitez Cruz | Scrum-half | 1999-09-06 | 26 | Argentina | 88 | 70 | 81 | 74 | 75 | 72 | 72 | 76 | 53 | 74 | 75 | 76 |
| Boeta Chamberlain | Fly-half | 1999-02-22 | 27 | South Africa | 85 | 69 | 72 | 72 | 82 | 68 | 65 | 91 | 50 | 77 | 78 | 82 |
| Joel Grayson | Wing | 2002-04-15 | 24 | England | 83 | 65 | 88 | 81 | 77 | 70 | 67 | 72 | 49 | 75 | 78 | 70 |
| Sammy Arnold | Centre | 1996-04-08 | 30 | Ireland | 85 | 74 | 78 | 74 | 80 | 74 | 72 | 68 | 56 | 75 | 78 | 76 |
| Max Clark | Centre | 1995-10-03 | 30 | England | 88 | 77 | 79 | 80 | 77 | 74 | 69 | 70 | 51 | 79 | 75 | 71 |
| Liam Williams | Wing | 1991-04-09 | 35 | Wales | 88 | 78 | 89 | 89 | 90 | 78 | 78 | 78 | 48 | 98 | 95 | 95 |
| Josh Hodge | Full-back | 2000-05-23 | 26 | England | 88 | 77 | 89 | 89 | 79 | 82 | 80 | 84 | 34 | 81 | 84 | 85 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hame Faiva | Hooker | 1994-05-09 | 32 | Italy | 71 | 88 | 52 | 65 | 78 | 78 | 78 | 49 | 82 | 72 | 65 | 68 |
| Lou de Bruin | Prop | 1993-02-13 | 33 | South Africa | 78 | 88 | 52 | 55 | 54 | 78 | 78 | 42 | 87 | 70 | 67 | 67 |
| Connor Hancock | Prop | 2000-11-10 | 25 | England | 78 | 90 | 46 | 59 | 54 | 78 | 78 | 39 | 83 | 67 | 65 | 65 |
| Freddie Clarke | Lock/Back row | 1992-10-10 | 33 | England | 78 | 83 | 57 | 56 | 60 | 78 | 78 | 42 | 85 | 67 | 69 | 67 |
| Cameron Neild | Flanker | 1996-09-06 | 29 | England | 78 | 78 | 73 | 65 | 66 | 78 | 79 | 54 | 67 | 72 | 78 | 65 |
| Joe Davis | Scrum-half | 2005-12-31 | 20 | England | 85 | 61 | 78 | 78 | 78 | 66 | 69 | 78 | 53 | 67 | 78 | 78 |
| Brett Connon | Fly-half | 1996-08-29 | 29 | Ireland | 85 | 59 | 65 | 69 | 78 | 65 | 60 | 84 | 48 | 78 | 78 | 78 |
| Harrison Obatoyinbo | Wing | 2000-07-15 | 25 | England | 87 | 68 | 83 | 78 | 78 | 65 | 56 | 66 | 48 | 66 | 78 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Adam Scott | Lock | 2001-11-27 | 24 | England | 72 | 72 | 49 | 52 | 54 | 72 | 72 | 46 | 75 | 63 | 61 | 60 |
| Bryce Gordon | Hooker | 2001-08-06 | 24 | New Zealand | 60 | 72 | 46 | 60 | 72 | 72 | 72 | 47 | 72 | 60 | 60 | 60 |
| Cam Jordan | Lock | 1999-11-17 | 26 | England | 72 | 72 | 49 | 51 | 55 | 72 | 72 | 41 | 73 | 60 | 63 | 60 |
| Charlie Turnbull | Back Row | 2005-10-02 | 20 | England | 72 | 72 | 58 | 60 | 60 | 72 | 72 | 53 | 59 | 60 | 72 | 60 |
| Fergus Lee-Warner | Lock | 1994-02-03 | 32 | Australia | 72 | 72 | 45 | 53 | 50 | 72 | 72 | 48 | 78 | 60 | 62 | 60 |
| Freddie Lockwood | Back Row | 2000-12-31 | 25 | England | 72 | 72 | 60 | 60 | 60 | 72 | 72 | 55 | 58 | 61 | 72 | 60 |
| George McGuigan | Hooker | 1993-03-30 | 33 | England | 60 | 72 | 49 | 60 | 72 | 72 | 72 | 48 | 76 | 62 | 60 | 60 |
| Jamie Hodgson | Lock | 1998-03-19 | 28 | Scotland | 72 | 72 | 45 | 46 | 49 | 72 | 72 | 41 | 76 | 60 | 63 | 61 |
| John Hawkins | Lock | 1996-11-11 | 29 | Wales | 72 | 72 | 49 | 51 | 52 | 72 | 72 | 40 | 78 | 60 | 61 | 60 |
| Micky Rewcastle | Prop | 2004-05-17 | 21 | England | 72 | 72 | 41 | 50 | 46 | 72 | 72 | 39 | 74 | 60 | 60 | 60 |
| Murray McCallum | Prop | 1996-03-16 | 30 | Scotland | 72 | 72 | 41 | 50 | 51 | 72 | 72 | 41 | 72 | 61 | 60 | 60 |
| Ollie Fletcher | Hooker | 2002-09-09 | 23 | England | 80 | 72 | 47 | 60 | 72 | 72 | 72 | 45 | 72 | 63 | 60 | 60 |
| Ollie Leatherbarrow | Back Row | 2002-04-08 | 24 | England | 82 | 72 | 53 | 61 | 60 | 72 | 72 | 53 | 64 | 60 | 72 | 60 |
| Oscar Usher | Lock | 2004-06-12 | 21 | England | 82 | 72 | 48 | 51 | 51 | 72 | 72 | 46 | 75 | 60 | 62 | 60 |
| Rob Palframan | Prop | 1993-12-20 | 32 | England | 82 | 72 | 43 | 47 | 49 | 72 | 72 | 41 | 72 | 60 | 60 | 60 |
| Sebastian De Chaves | Lock | 1990-10-30 | 35 | South Africa | 82 | 72 | 46 | 52 | 55 | 72 | 72 | 46 | 78 | 61 | 60 | 60 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alex Hearle | Centre | 1998-11-08 | 27 | England | 82 | 72 | 72 | 72 | 72 | 72 | 57 | 58 | 50 | 60 | 72 | 60 |
| Cameron Hutchison | Centre | 1998-06-01 | 27 | Scotland | 80 | 72 | 72 | 72 | 72 | 72 | 56 | 57 | 53 | 60 | 72 | 60 |
| Christian Wade | Wing | 1991-05-15 | 35 | England | 80 | 54 | 90 | 88 | 82 | 70 | 54 | 55 | 49 | 82 | 82 | 82 |
| Connor Doherty | Centre | 2000-07-18 | 25 | England | 66 | 72 | 72 | 72 | 72 | 72 | 54 | 54 | 54 | 60 | 72 | 60 |
| Elliott Obatoyinbo | Wing/Full-back | 1998-10-09 | 27 | England | 60 | 58 | 72 | 72 | 72 | 60 | 55 | 72 | 53 | 60 | 72 | 72 |
| Ethan Grayson | Fly-half | 2004-04-15 | 22 | England | 80 | 55 | 58 | 60 | 72 | 60 | 57 | 78 | 49 | 72 | 72 | 72 |
| James Elliott | Scrum-half | 1998-08-29 | 27 | England | 80 | 53 | 72 | 72 | 72 | 60 | 57 | 72 | 52 | 61 | 72 | 72 |
| Nathan Greenwood | Wing | 2003-11-20 | 22 | England | 80 | 53 | 72 | 72 | 72 | 60 | 55 | 58 | 46 | 60 | 72 | 72 |
| Oliver Spencer | Centre | 2004-02-22 | 22 | England | 85 | 72 | 72 | 72 | 72 | 72 | 56 | 53 | 54 | 60 | 72 | 60 |
| Sam Stuart | Scrum-half | 1991-09-27 | 34 | England | 82 | 52 | 72 | 72 | 72 | 60 | 62 | 72 | 50 | 62 | 72 | 72 |
| Sam Waugh | Centre | 2005-07-16 | 20 | England | 84 | 72 | 72 | 72 | 72 | 72 | 58 | 53 | 51 | 63 | 72 | 60 |

---

## Northampton

- **Home ground:** Franklin's Gardens.
- **Club colours:** `#00563f` / `#000000`
- **Nickname:** Saints.
- **Founded:** 1880.
- **Stadium capacity:** 15,249.
- **Head coach:** Phil Dowson (Director of Rugby since 2022).
- **Captain:** Fraser Dingwall.
- **Overall rating:** **76/100**
- **Suggested tactics:** `possession` · `wide_wide` · `minimal_ruck` · `jackal` · `one_back` · `hybrid` · `balanced`
- **Stat bias:** high `pace`, `handling`, `agility`.
- **Board ambition:** `title`

### Star players

- **Fin Smith** (Fly-half, England) Index high: `kicking`, `composure`, `handling`, `positioning`, `discipline`. Suggested rating: **92/100**. Marquee: yes. Wage: £600k.
- **Tommy Freeman** (Wing, England) Index high: `pace`, `handling`, `positioning`, `agility`, `composure`. Suggested rating: **91/100**.
- **Alex Mitchell** (Scrum-half, England) Index high: `pace`, `agility`, `handling`, `positioning`, `stamina`. Suggested rating: **86/100**.
- **Henry Pollock** (Flanker, England) Index high: `breakdown`, `stamina`, `pace`, `tackling`, `agility`. Suggested rating: **85/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Trevor Davison | Prop | 1992-08-20 | 33 | England | 80 | 89 | 71 | 73 | 72 | 89 | 83 | 48 | 99 | 79 | 80 | 81 |
| Curtis Langdon | Hooker | 1997-08-03 | 28 | England | 83 | 86 | 74 | 79 | 81 | 87 | 84 | 53 | 98 | 78 | 80 | 82 |
| Danilo Fischetti | Prop | 1998-01-26 | 28 | Italy | 80 | 94 | 69 | 74 | 74 | 86 | 86 | 53 | 99 | 78 | 79 | 79 |
| Alex Coles | Lock | 1999-09-21 | 26 | England | 85 | 90 | 76 | 71 | 80 | 84 | 84 | 51 | 98 | 83 | 82 | 89 |
| JJ van der Mescht | Lock | 1999-05-04 | 27 | South Africa | 75 | 95 | 71 | 79 | 78 | 83 | 82 | 55 | 99 | 77 | 82 | 82 |
| Henry Pollock | Flanker | 2005-01-14 | 21 | England | 95 | 78 | 89 | 95 | 78 | 90 | 90 | 77 | 78 | 78 | 88 | 78 |
| Tom Pearson | Flanker | 1999-10-26 | 26 | England | 82 | 91 | 81 | 87 | 82 | 87 | 88 | 58 | 86 | 82 | 83 | 81 |
| Callum Chick | Number 8 | 1996-11-25 | 29 | England | 87 | 90 | 80 | 86 | 87 | 86 | 89 | 60 | 88 | 80 | 83 | 80 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alex Mitchell | Scrum-half | 1997-05-25 | 28 | England | 89 | 70 | 85 | 90 | 95 | 70 | 68 | 91 | 10 | 88 | 95 | 89 |
| Fin Smith | Fly-half | 2002-05-11 | 24 | England | 90 | 78 | 83 | 89 | 99 | 88 | 68 | 95 | 49 | 95 | 95 | 95 |
| Tommy Freeman | Wing | 2001-03-05 | 25 | England | 99 | 88 | 95 | 92 | 99 | 97 | 78 | 78 | 48 | 88 | 93 | 94 |
| Fraser Dingwall | Centre | 1999-04-07 | 27 | England | 85 | 79 | 81 | 89 | 88 | 86 | 79 | 82 | 65 | 81 | 91 | 99 |
| Rory Hutchinson | Centre | 1995-01-29 | 31 | Scotland | 82 | 82 | 89 | 91 | 88 | 83 | 79 | 78 | 62 | 80 | 87 | 83 |
| George Hendy | Wing | 2002-10-15 | 23 | England | 80 | 78 | 95 | 98 | 86 | 80 | 78 | 81 | 59 | 78 | 83 | 78 |
| George Furbank | Full-back | 1996-10-17 | 29 | England | 86 | 75 | 90 | 88 | 88 | 83 | 78 | 87 | 64 | 81 | 86 | 95 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Robbie Smith | Hooker | 1998-09-26 | 27 | Scotland | 72 | 81 | 68 | 74 | 78 | 80 | 80 | 56 | 89 | 70 | 78 | 72 |
| Elliot Millar-Mills | Prop | 1992-07-08 | 33 | Scotland | 78 | 82 | 62 | 68 | 71 | 78 | 82 | 52 | 94 | 75 | 77 | 71 |
| Emmanuel Iyogun | Prop | 2000-11-24 | 25 | England | 78 | 89 | 64 | 62 | 68 | 82 | 78 | 51 | 89 | 76 | 77 | 69 |
| Aiden Ainsworth-Cave | Lock | 2006-07-21 | 19 | England | 78 | 80 | 67 | 70 | 73 | 80 | 78 | 51 | 90 | 76 | 72 | 73 |
| Josh Kemeny | Flanker | 1998-11-29 | 27 | Australia | 80 | 78 | 75 | 76 | 73 | 86 | 84 | 62 | 75 | 69 | 78 | 76 |
| Archie McParland | Scrum-half | 2005-02-17 | 21 | England | 86 | 70 | 87 | 78 | 82 | 74 | 76 | 78 | 58 | 75 | 81 | 82 |
| Anthony Belleau | Fly-half | 1996-04-08 | 30 | France | 86 | 64 | 76 | 82 | 86 | 71 | 66 | 93 | 64 | 78 | 81 | 79 |
| Ollie Sleightholme | Wing | 2000-04-13 | 26 | England | 84 | 70 | 95 | 88 | 78 | 71 | 69 | 73 | 59 | 77 | 79 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Angus Scott-Young | Back Row | 1997-04-23 | 29 | Australia | 72 | 75 | 64 | 67 | 67 | 72 | 77 | 60 | 73 | 66 | 72 | 64 |
| Archie Appleby | Back Row | 2007-01-13 | 19 | England | 72 | 77 | 70 | 71 | 68 | 72 | 74 | 63 | 69 | 62 | 72 | 63 |
| Archie Benson | Lock | 2001-08-18 | 24 | England | 72 | 73 | 54 | 62 | 61 | 72 | 72 | 50 | 83 | 65 | 69 | 69 |
| Charlie Ulcoq | Back Row | 2006-05-02 | 20 | England | 72 | 72 | 67 | 70 | 66 | 72 | 73 | 59 | 72 | 67 | 72 | 64 |
| Chunya Munga | Lock | 2000-09-02 | 25 | England | 72 | 75 | 59 | 62 | 66 | 74 | 72 | 53 | 83 | 68 | 69 | 67 |
| Cleopas Kundiona | Prop | 1998-12-15 | 27 | Zimbabwe | 72 | 78 | 56 | 61 | 58 | 73 | 72 | 47 | 80 | 63 | 68 | 64 |
| Craig Wright | Hooker | 2004-05-31 | 21 | England | 64 | 72 | 55 | 64 | 72 | 73 | 72 | 55 | 81 | 66 | 68 | 63 |
| Ed Prowse | Lock | 2000-10-27 | 25 | England | 72 | 76 | 57 | 64 | 65 | 72 | 72 | 51 | 83 | 68 | 66 | 68 |
| Luke Green | Prop | 2001-05-06 | 25 | England | 72 | 74 | 50 | 60 | 60 | 72 | 72 | 51 | 84 | 65 | 62 | 63 |
| Emeka Atuanya | Lock | 2003-03-17 | 23 | England | 72 | 75 | 59 | 59 | 66 | 74 | 72 | 49 | 82 | 64 | 66 | 64 |
| Fyn Brown | Back Row | 2002-10-11 | 23 | England | 73 | 75 | 68 | 66 | 68 | 72 | 72 | 57 | 69 | 63 | 72 | 69 |
| Henry Walker | Hooker | 1998-03-10 | 28 | England | 62 | 72 | 54 | 63 | 72 | 73 | 72 | 56 | 77 | 68 | 70 | 61 |
| Jack Lawrence | Back Row | 2007-02-02 | 19 | England | 72 | 73 | 68 | 70 | 70 | 72 | 76 | 60 | 73 | 64 | 72 | 62 |
| Sam Graham | Flanker | 1997-07-06 | 28 | England | 72 | 76 | 69 | 70 | 66 | 77 | 73 | 58 | 68 | 65 | 72 | 63 |
| Ollie Scola | Prop | 2006-02-03 | 20 | England | 72 | 76 | 54 | 60 | 62 | 73 | 72 | 53 | 81 | 67 | 65 | 65 |
| Siep Walta | Back Row | 2006-09-21 | 20 | Netherlands | 73 | 76 | 66 | 72 | 71 | 73 | 72 | 64 | 73 | 62 | 72 | 69 |
| Sonny Tonga'uiha | Prop | 2006-08-01 | 19 | England | 72 | 75 | 50 | 55 | 61 | 72 | 72 | 46 | 83 | 66 | 69 | 65 |
| Tom Lockett | Lock | 2002-10-06 | 23 | England | 72 | 77 | 56 | 59 | 63 | 72 | 72 | 52 | 87 | 63 | 63 | 62 |
| Tom West | Prop | 1996-02-11 | 30 | England | 72 | 80 | 56 | 61 | 63 | 76 | 73 | 47 | 84 | 65 | 62 | 66 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Aiden Pugh | Scrum-half | 2006-09-18 | 19 | England | 87 | 59 | 74 | 76 | 74 | 64 | 70 | 72 | 59 | 70 | 72 | 72 |
| Tom James | Scrum-half | 1993-10-12 | 32 | England | 81 | 58 | 75 | 77 | 74 | 64 | 69 | 73 | 62 | 67 | 72 | 72 |
| Billy Pasco | Centre | 2005-10-02 | 20 | England | 81 | 72 | 76 | 77 | 76 | 72 | 68 | 64 | 62 | 68 | 72 | 66 |
| Edoardo Todaro | Wing | 2006-09-24 | 19 | Italy | 83 | 62 | 86 | 79 | 72 | 63 | 58 | 67 | 59 | 64 | 72 | 72 |
| Freddie St John | Centre | 2007-11-07 | 19 | England | 77 | 72 | 72 | 76 | 72 | 72 | 66 | 65 | 60 | 63 | 72 | 66 |
| Henry Lumley | Centre | 2007-07-18 | 18 | England | 83 | 73 | 78 | 75 | 72 | 73 | 63 | 66 | 62 | 63 | 72 | 64 |
| James Martin | Wing | 1999-07-31 | 26 | England | 73 | 58 | 79 | 78 | 74 | 62 | 63 | 67 | 54 | 62 | 72 | 72 |
| James Pater | Wing | 2007-07-02 | 18 | England | 75 | 61 | 82 | 83 | 72 | 65 | 62 | 62 | 61 | 64 | 72 | 72 |
| James Ramm | Wing | 1998-04-30 | 28 | Australia | 82 | 75 | 86 | 82 | 72 | 62 | 61 | 61 | 56 | 85 | 82 | 82 |
| Jonny Weimann | Scrum-half | 2006-03-28 | 20 | England | 81 | 62 | 74 | 72 | 72 | 64 | 65 | 72 | 57 | 69 | 73 | 72 |
| Toby Thame | Centre | 2003-11-08 | 22 | England | 83 | 72 | 73 | 75 | 75 | 72 | 65 | 63 | 61 | 64 | 72 | 70 |
| Tom Litchfield | Centre | 2002-04-20 | 24 | England | 80 | 73 | 72 | 75 | 75 | 72 | 63 | 60 | 61 | 85 | 82 | 84 |
| Amena Caqusau | Wing | 2004-07-17 | 21 | Scotland | 82 | 62 | 82 | 82 | 76 | 64 | 56 | 67 | 56 | 68 | 72 | 72 |
| Will Glister | Wing | 2005-05-05 | 21 | England | 88 | 61 | 82 | 78 | 73 | 63 | 57 | 63 | 56 | 63 | 72 | 72 |

---

## Sale

- **Home ground:** Salford Community Stadium.
- **Club colours:** `#0a1b40` / `#ffffff`
- **Nickname:** Sharks.
- **Founded:** 1861 — one of the world's oldest surviving rugby clubs.
- **Stadium capacity:** 11,404 (shared with Salford Red Devils RL).
- **Head coach:** Alex Sanderson (Director of Rugby since 2021).
- **Captain:** Ernst van Rhyn (2025-26; succeeded Ben Curry, who stepped down with his England-contract availability reduced).
- **Overall rating:** **68/100**
- **Suggested tactics:** `kicking` · `keep_it_tight` · `balanced` · `jackal` · `one_back` · `blitz` · `cautious`
- **Stat bias:** high `tackling`, `strength`, `kicking`.
- **Board ambition:** `playoffs`

### Star players

- **Tom Curry** (Flanker, England) Index high: `tackling`, `breakdown`, `stamina`, `strength`, `positioning`. Suggested rating: **91/100**.
- **George Ford** (Fly-half, England) Index high: `kicking`, `composure`, `positioning`, `handling`, `discipline`. Suggested rating: **90/100**. Marquee: yes. Wage: £750k.
- **Ben Curry** (Flanker, England) Index high: `tackling`, `breakdown`, `stamina`, `strength`, `discipline`. Suggested rating: **86/100**.
- **Tom Roebuck** (Wing, England) Index high: `pace`, `handling`, `agility`, `strength`, `positioning`. Suggested rating: **84/100**.

### Squad (2025-26)

**Starting XV — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bevan Rodd | Prop | 2000-08-26 | 25 | England | 73 | 93 | 64 | 64 | 71 | 87 | 80 | 49 | 97 | 73 | 80 | 76 |
| Luke Cowan-Dickie | Hooker | 1993-06-20 | 32 | England | 77 | 84 | 68 | 68 | 75 | 88 | 82 | 56 | 95 | 80 | 79 | 79 |
| Asher Opoku-Fordjour | Prop | 2004-07-16 | 21 | England | 80 | 89 | 71 | 71 | 67 | 86 | 80 | 48 | 92 | 75 | 74 | 78 |
| Ernst van Rhyn | Lock | 1997-09-19 | 28 | South Africa | 79 | 86 | 68 | 70 | 72 | 86 | 78 | 52 | 97 | 77 | 78 | 80 |
| Ben Bamber | Lock | 2001-01-24 | 25 | England | 81 | 93 | 68 | 72 | 75 | 87 | 84 | 53 | 92 | 78 | 82 | 78 |
| Ben Curry | Flanker | 1998-06-15 | 27 | England | 95 | 95 | 78 | 78 | 78 | 98 | 99 | 59 | 78 | 95 | 78 | 78 |
| Tom Curry | Flanker | 1998-06-15 | 27 | England | 99 | 90 | 78 | 99 | 99 | 99 | 99 | 57 | 78 | 91 | 99 | 98 |
| Dan du Preez | Number 8 | 1995-08-05 | 30 | South Africa | 80 | 88 | 75 | 78 | 81 | 91 | 87 | 58 | 80 | 78 | 80 | 74 |

**Starting XV — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Gus Warr | Scrum-half | 1999-09-24 | 26 | England | 89 | 70 | 88 | 82 | 82 | 78 | 78 | 84 | 55 | 76 | 81 | 80 |
| George Ford | Fly-half | 1993-03-16 | 33 | England | 86 | 70 | 78 | 90 | 99 | 68 | 68 | 99 | 19 | 99 | 99 | 99 |
| Tom Roebuck | Wing | 2001-01-07 | 25 | England | 88 | 85 | 95 | 95 | 95 | 78 | 78 | 78 | 53 | 78 | 95 | 78 |
| Rob du Preez | Centre | 1993-07-30 | 32 | South Africa | 86 | 80 | 81 | 82 | 84 | 88 | 74 | 77 | 59 | 75 | 84 | 79 |
| Rekeiti Ma'asi-White | Centre | 2003-02-03 | 23 | England | 82 | 85 | 85 | 84 | 82 | 82 | 74 | 81 | 60 | 77 | 81 | 77 |
| Arron Reed | Wing | 1999-07-10 | 26 | Scotland | 85 | 80 | 89 | 91 | 81 | 75 | 71 | 81 | 52 | 77 | 81 | 74 |
| Joe Carpenter | Full-back | 2001-08-19 | 24 | England | 84 | 78 | 88 | 82 | 85 | 80 | 73 | 84 | 58 | 78 | 82 | 84 |

**Bench**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nathan Jibulu | Hooker | 2003-01-26 | 23 | England | 76 | 88 | 77 | 65 | 78 | 79 | 78 | 58 | 88 | 71 | 76 | 71 |
| Si McIntyre | Prop | 1991-03-19 | 35 | England | 78 | 85 | 52 | 61 | 66 | 81 | 78 | 46 | 90 | 70 | 73 | 70 |
| WillGriff John | Prop | 1992-12-04 | 33 | Wales | 68 | 85 | 58 | 59 | 59 | 78 | 78 | 51 | 85 | 68 | 67 | 68 |
| Tom Burrow | Lock | 2005-07-27 | 20 | England | 78 | 80 | 63 | 58 | 65 | 79 | 78 | 55 | 91 | 71 | 69 | 69 |
| Rouban Birch | Flanker | 1999-09-20 | 26 | England | 78 | 78 | 71 | 75 | 69 | 82 | 84 | 59 | 73 | 71 | 78 | 73 |
| Raffi Quirke | Scrum-half | 2001-08-18 | 24 | England | 82 | 64 | 78 | 78 | 78 | 75 | 70 | 81 | 60 | 70 | 78 | 78 |
| Tom Curtis | Fly-half | 2001-07-01 | 24 | England | 74 | 67 | 71 | 75 | 78 | 67 | 69 | 93 | 58 | 78 | 78 | 81 |
| Tom O'Flaherty | Wing | 1994-07-21 | 31 | England | 84 | 72 | 89 | 83 | 78 | 70 | 64 | 73 | 53 | 70 | 78 | 78 |

**Wider squad — Forwards**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| James Harper | Prop | 2000-10-16 | 25 | England | 72 | 74 | 50 | 55 | 51 | 77 | 72 | 51 | 79 | 66 | 62 | 65 |
| Hyron Andrews | Lock | 1995-07-06 | 30 | South Africa | 72 | 72 | 49 | 56 | 54 | 72 | 72 | 50 | 78 | 65 | 62 | 62 |
| Huw Davies | Back Row | 2003-11-12 | 22 | Wales | 72 | 72 | 64 | 66 | 66 | 74 | 72 | 59 | 68 | 62 | 72 | 64 |
| Jacques Vermeulen | Flanker | 1995-02-08 | 31 | South Africa | 72 | 85 | 69 | 66 | 60 | 75 | 73 | 60 | 68 | 87 | 90 | 88 |
| Jos Gilmore | Back Row | 2005-11-25 | 20 | England | 72 | 76 | 61 | 62 | 60 | 75 | 72 | 60 | 68 | 64 | 72 | 65 |
| Ethan Caine | Hooker | 2001-09-20 | 24 | England | 61 | 72 | 50 | 60 | 72 | 73 | 72 | 57 | 81 | 65 | 62 | 60 |
| Reuben Logan | Back Row | 2005-07-28 | 20 | Scotland | 72 | 74 | 63 | 65 | 62 | 75 | 74 | 56 | 70 | 62 | 72 | 63 |
| Sam Dugdale | Back Row | 1999-09-30 | 26 | England | 72 | 75 | 62 | 62 | 64 | 72 | 73 | 58 | 70 | 64 | 72 | 65 |
| Tadgh McElroy | Hooker | 1997-06-16 | 28 | Ireland | 64 | 74 | 49 | 60 | 72 | 72 | 72 | 56 | 81 | 60 | 65 | 65 |
| Tristan Woodman | Back Row | 2004-02-12 | 22 | England | 72 | 72 | 60 | 65 | 66 | 72 | 72 | 57 | 67 | 63 | 72 | 60 |
| Tye Raymont | Prop | 2005-07-19 | 20 | England | 72 | 75 | 50 | 51 | 56 | 76 | 72 | 51 | 80 | 65 | 61 | 60 |

**Wider squad — Backs**
| Name | Position | DOB | Age | Nationality | Stam | Str | Pace | Agil | Hand | Tack | Brk | Kick | SetP | Disc | Posi | Comp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alex Wills | Wing | 2004-02-11 | 22 | England | 80 | 61 | 79 | 72 | 72 | 65 | 54 | 61 | 59 | 61 | 72 | 72 |
| Dom Hanson | Scrum-half | 2005-12-17 | 20 | England | 81 | 59 | 72 | 72 | 72 | 65 | 67 | 72 | 54 | 67 | 72 | 72 |
| Luke James | Full-back | 1999-03-18 | 27 | England | 82 | 62 | 73 | 74 | 72 | 67 | 57 | 72 | 57 | 61 | 73 | 72 |
| Nye Thomas | Scrum-half | 2003-03-24 | 23 | Wales | 80 | 63 | 72 | 72 | 72 | 66 | 63 | 72 | 57 | 63 | 72 | 72 |
| Ollie Davies | Fly-half | 2006-12-01 | 19 | England | 81 | 63 | 68 | 66 | 72 | 65 | 62 | 79 | 60 | 72 | 72 | 72 |
| Joe Bedlow | Centre | 2002-03-29 | 24 | England | 82 | 74 | 72 | 72 | 72 | 72 | 61 | 67 | 56 | 65 | 72 | 67 |
| Marius Louw | Centre | 1995-10-24 | 30 | South Africa | 81 | 72 | 72 | 72 | 72 | 72 | 60 | 65 | 60 | 65 | 72 | 60 |
| Obi Ene | Wing | 2003-06-25 | 22 | England | 84 | 62 | 86 | 73 | 72 | 67 | 54 | 66 | 52 | 61 | 72 | 72 |

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
