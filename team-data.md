# Team Data — Gallagher Premiership Profiles

This file is the canonical, human-readable reference for each Gallagher Premiership club's identity. Each profile summarises a team's playing style, signature gameplay features, and core DNA in 4–5 lines, with a suggested mapping to the in-game `TeamTactics` dimensions, a hint on which player stats should be biased for that club's character, and the 2025-26 senior first-team squad.

The simulator currently ships with 4 of the 10 Premiership clubs; the remaining 6 are flagged `to add`. Today this file is descriptive only — it is not parsed by the engine. The intent is that a future task will use it to seed player ratings, default tactics, AI behaviour, and the actual rosters for each club.

**Squad data note:** Squad lists are compiled from public sources (club websites, Wikipedia, Ultimate Rugby, RugbyPass) as of May 2026. Coverage is best-effort: DOBs and ages are filled where available, blank where not. The data has not been manually validated against current club rosters — see "Data notes" at the bottom of this file for known caveats (likely transfer artifacts, duplicate listings, possible retirees).

Related docs: see `CLAUDE.md` "Tactics system" for tactic-effect mechanics, `engine.md` "Carry Phases" for how tactics shape match outcomes, and `src/types/team.ts` for the authoritative `TeamTactics` definition.

---

## Legend

**`TeamTactics` dimensions** (from `src/types/team.ts`):

| Dimension | Values |
|---|---|
| `attackingGamePlan` | `possession` · `balanced` · `kicking` |
| `attackingStyle` | `keep_it_tight` · `balanced` · `wide_wide` |
| `attackingBreakdown` | `pick_and_drive` · `balanced` · `wide_play` |
| `defendingBreakdown` | `jackal` · `counter_ruck` · `shadow` |
| `backfieldDefence` | `one_back` · `two_back` · `three_back` |

**Player base stats** (12 fields, 0–100 scale, from `src/data/team-*.json`):
`stamina · strength · pace · agility · handling · tackling · breakdown · kicking · setPiece · discipline · positioning · composure`

---

## Gloucester *(in game)*

A historic west-country club with a cherry-and-white forwards-led identity, defined by the close, vocal "Shed" at Kingsholm. Gloucester traditionally make their living from a robust, hard-carrying pack, set-piece confrontation and direct lines through the middle. The backline is functional rather than expansive, leaning on power runners to punch holes that fast support can exploit. At their best they are abrasive, physical and uncompromising at the breakdown; at their worst they over-rely on the forwards when a wider game is needed.

- **Suggested tactics:** `balanced` · `keep_it_tight` · `pick_and_drive` · `counter_ruck` · `one_back`
- **Stat bias:** high `strength`, `breakdown`, `setPiece`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Josh Basham | Flanker | 1999-08-08 | 26 | England |
| Jono Benz-Salomon | Prop | | | England |
| Seb Blake | Hooker | 2002-06-23 | 23 | England |
| Hugh Bokenham | Lock | | 24 | England |
| Arthur Clark | Lock | 1999-09-24 | 26 | England |
| Jack Clement | Back Row | 2001-04-04 | 25 | England |
| Danny Eite | Lock | | 22 | England |
| Afolabi Fasogbon | Prop | 2003-12-17 | 22 | Ireland |
| Jamal Ford-Robinson | Prop | 1993-04-23 | 33 | England |
| Kirill Gotovtsev | Prop | 1992-07-09 | 33 | Russia |
| Jack Innard | Hooker | 2001-04-13 | 25 | England |
| Cameron Jordan | Lock | 1996-05-23 | 30 | England |
| Ciaran Knight | Prop | 1995-08-30 | 30 | England |
| Nepo Laulala | Prop | 1991-10-29 | 34 | New Zealand |
| Lewis Ludlow | Flanker | 1994-12-19 | 31 | England |
| Jack Mann | Back Row | 1999-01-30 | 27 | England |
| Archie McArthur | Prop | | 22 | Scotland |
| Val Rapava-Ruskin | Prop | 1992-12-12 | 33 | Georgia |
| Jack Singleton | Hooker | 1996-08-07 | 29 | England |
| Harry Taylor | Back Row | 2002-01-15 | 24 | England |
| Freddie Thomas | Lock | 1999-07-22 | 26 | England |
| Will Trenholm | Back Row | | 24 | England |
| James Venter | Flanker | 1995-12-28 | 30 | South Africa |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Charlie Atkinson | Fly-half | 2001-04-08 | 25 | England |
| Seb Atkinson | Centre | 2001-08-27 | 24 | England |
| Mike Austin | Scrum-half | | | England |
| George Barton | Utility Back | 1999-09-04 | 26 | England |
| Will Butler | Centre | | | England |
| Ross Byrne | Fly-half | 1995-03-29 | 31 | Ireland |
| Caolan Englefield | Scrum-half | 2000-04-15 | 26 | England |
| Josh Hathaway | Wing | 2003-09-04 | 22 | England |
| Will Joseph | Centre | 2003-02-04 | 23 | England |
| Max Llewellyn | Centre | 1997-09-04 | 28 | Wales |
| Ben Loader | Wing | 1999-01-24 | 27 | England |
| Jake Morris | Wing | 2002-05-10 | 24 | England |
| Ben Redshaw | Full-back | | 22 | England |
| Rob Russell | Wing | 1998-12-04 | 27 | Ireland |
| Ollie Thorley | Wing | 1996-08-23 | 29 | England |
| Tomos Williams | Scrum-half | 1994-10-25 | 31 | Wales |

---

## Bristol Bears *(in game)*

Shaped by the Pat Lam era's "Bristol-Bilbao" expansive ambition, the Bears are the league's most ball-in-hand, high-tempo side, willing to attack from anywhere on the pitch. They prize width, offloads and pace over territorial caution, and will gladly trade penalties for tempo. Their forwards are built for carrying and linking rather than maul dominance, and they often outscore opponents in shootouts. The flip side is risk: turnovers and defensive lapses come with the style.

- **Suggested tactics:** `possession` · `wide_wide` · `wide_play` · `jackal` · `two_back`
- **Stat bias:** high `pace`, `handling`, `agility`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Steele Barker | Lock | | | England |
| Joe Batley | Lock | 1996-09-06 | 29 | England |
| Will Capon | Hooker | 1997-09-01 | 28 | England |
| Lovejoy Chawatama | Prop | 1991-12-30 | 34 | England |
| Ellis Genge | Prop | 1995-02-22 | 31 | England |
| Sam Grahamslaw | Prop | 1999-08-04 | 26 | Scotland |
| Santiago Grondona | Number 8 | 1999-04-15 | 27 | Argentina |
| Tomas Gwilliam | Hooker | | | Wales |
| Jimmy Halliwell | Prop | | | England |
| Fitz Harding | Flanker | 1997-11-29 | 28 | England |
| Jake Heenan | Flanker | 1992-04-09 | 34 | Ireland |
| Luka Ivanishvili | Flanker | 1999-12-12 | 26 | Georgia |
| George Kloska | Prop | 2002-02-11 | 24 | England |
| Max Lahiff | Prop | 1989-09-24 | 36 | England |
| Steven Luatua | Flanker | 1991-06-10 | 34 | New Zealand |
| Viliame Mata | Number 8 | 1991-04-15 | 35 | Fiji |
| Gabriel Oghre | Hooker | 1998-11-21 | 27 | England |
| Joe Owen | Lock | 2003-01-23 | 23 | England |
| Paddy Pearce | Flanker | | 21 | England |
| Will Ramply | Lock | | | England |
| Pedro Rubiolo | Lock | 2002-03-15 | 24 | Argentina |
| Harry Thacker | Hooker | 1994-04-22 | 32 | England |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Jack Bates | Wing | 2001-09-21 | 24 | England |
| Sam Bedlow | Centre | | | England |
| Josh Carrington | Wing | | | England |
| Noah Heward | Full-back | 2002-03-30 | 24 | England |
| Gabriel Ibitoye | Wing | 1998-04-26 | 28 | England |
| Benhard Janse van Rensburg | Centre | 1994-02-09 | 32 | South Africa |
| Joe Jenkins | Centre | | | England |
| Tom Jordan | Fly-half | 1998-08-19 | 27 | Scotland |
| Rich Lane | Full-back | 1994-12-22 | 31 | England |
| AJ MacGinty | Fly-half | 1989-12-07 | 36 | USA |
| Kieran Marmion | Scrum-half | 1992-05-29 | 33 | Ireland |
| Max Pepper | Scrum-half | 2001-01-09 | 25 | England |
| Harry Randall | Scrum-half | 1997-10-29 | 28 | England |
| Kalaveti Ravouvou | Wing | 1996-03-30 | 30 | Fiji |
| Louis Rees-Zammit | Wing | 2001-02-02 | 25 | Wales |
| James Williams | Centre | 1998-08-04 | 27 | England |
| Sam Wolstenholme | Scrum-half | 2001-04-19 | 25 | England |

---

## Leicester Tigers *(in game)*

The Welford Road tradition is set-piece power, structured forward-led play, and hard-nosed defence built on discipline. Tigers historically squeeze the game through scrum and maul dominance, accurate exit kicking, and a defensive line that gives nothing cheap. Their attack is built off forward platform first, with the backs called on to finish rather than create from scratch. Recent rebuilds have softened the edges, but the identity remains: territory, set piece, pressure.

- **Suggested tactics:** `kicking` · `keep_it_tight` · `pick_and_drive` · `jackal` · `two_back`
- **Stat bias:** high `setPiece`, `tackling`, `discipline`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Diamond Ayiehfor | Prop | | 19 | England |
| Jamie Blamire | Hooker | 1997-12-22 | 28 | England |
| Finn Carnduff | Flanker | 2004-03-10 | 22 | England |
| Lewis Chessum | Lock | 2003-02-27 | 23 | England |
| Ollie Chessum | Lock | 2000-09-06 | 25 | England |
| Charlie Clare | Hooker | 1991-12-16 | 34 | England |
| Olly Cracknell | Flanker | 1994-05-26 | 31 | Wales |
| Tarek Haffar | Prop | 2001-09-13 | 24 | England |
| Cam Henderson | Lock | 2000-01-13 | 26 | Scotland |
| Joe Heyes | Prop | 1999-04-13 | 27 | England |
| Will Hurd | Prop | 1999-06-29 | 26 | Scotland |
| Emeka Ilione | Flanker | 2002-03-20 | 24 | England |
| Tonga Kofe | Prop | | 29 | USA |
| Hanro Liebenberg | Number 8 | 1995-10-10 | 30 | South Africa |
| Ale Loman | Prop | 2000-05-15 | 26 | Sweden |
| Tubuna Maka | Prop | 2005-11-18 | 20 | Fiji |
| Joshua Manz | Back Row | 2004-03-22 | 22 | England |
| Tom Manz | Lock | 2001-07-09 | 24 | England |
| George Marsh | Back Row | | 19 | England |
| George Martin | Lock | 2001-06-18 | 24 | England |
| Cameron Miell | Prop | 2004-05-09 | 22 | South Africa |
| Joaquin Moro | Flanker | 2001-01-24 | 25 | Argentina |
| Harry Palmer | Lock | 2005-10-28 | 20 | England |
| Tommy Reffell | Flanker | 1999-04-27 | 27 | Wales |
| Nicky Smith | Prop | 1994-04-07 | 32 | Wales |
| John Stewart | Hooker | 2002-03-08 | 24 | England |
| Osian Thomas | Lock | 2004-11-30 | 21 | Wales |
| James Thompson | Lock | 1999-07-13 | 26 | New Zealand |
| Archie van der Flier | Prop | 2002-04-25 | 24 | England |
| Harry Wells | Lock | 1993-09-29 | 32 | England |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Ollie Allan | Scrum-half | 2004-02-04 | 22 | England |
| Orlando Bailey | Fly-half | 2001-09-30 | 24 | England |
| Gabriel Hamer-Webb | Wing | 2000-11-07 | 25 | England |
| Ollie Hassell-Collins | Wing | 1999-01-17 | 27 | England |
| Solomone Kata | Centre | 1994-12-03 | 31 | Tonga |
| Wilf McCarthy | Centre | 2002-10-08 | 23 | England |
| James O'Connor | Fly-half | 1990-07-05 | 35 | Australia |
| Izaia Perese | Centre | 1997-05-17 | 28 | Australia |
| Adam Radwan | Wing | 1997-12-30 | 28 | England |
| Billy Searle | Fly-half | 1996-03-25 | 30 | England |
| Freddie Steward | Full-back | 2000-12-05 | 25 | England |
| Charlie Titcombe | Fly-half | 2001-12-28 | 24 | England |
| Jack van Poortvliet | Scrum-half | 2001-05-15 | 25 | England |
| Will Wand | Centre | 2001-12-31 | 24 | England |
| Tom Whiteley | Scrum-half | 1995-12-17 | 30 | England |
| Joseph Woodward | Centre | 2003-09-17 | 22 | England |

---

## Saracens *(in game)*

Under Mark McCall, Saracens have been the league's clinical operator — structure, precision and physical dominance executed to a finer tolerance than anyone else. The "Wolfpack" defence with its aggressive line-speed and choke tackles is the signature, paired with a smart kicking game that turns territory into points. They are ruthless game managers: ahead late, they will close a match out with possession and field position rather than tries. Calm under pressure, brutal in the collision.

- **Suggested tactics:** `kicking` · `balanced` · `balanced` · `shadow` · `two_back`
- **Stat bias:** high `tackling`, `positioning`, `composure`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Samson Adejimi | Hooker | | 24 | England |
| Harvey Beaton | Prop | 2001-03-15 | 25 | England |
| Phil Brantingham | Prop | 2001-10-02 | 24 | England |
| Rhys Carre | Prop | 1998-02-08 | 28 | Wales |
| Alec Clarey | Prop | 1994-02-08 | 32 | England |
| Eoghan Clarke | Hooker | 1998-06-12 | 27 | Ireland |
| Theo Dan | Hooker | 2000-12-26 | 25 | England |
| Ben Earl | Number 8 | 1998-01-07 | 28 | England |
| Mak Eke | Back Row | | 22 | England |
| Jamie George | Hooker | 1990-10-20 | 35 | England |
| Juan Martin Gonzalez | Flanker | 2000-11-14 | 25 | Argentina |
| James Hadfield | Hooker | | 28 | England |
| James Isaacs | Hooker | 2004-03-28 | 22 | England |
| Nick Isiekwe | Lock | 1998-04-20 | 28 | England |
| Maro Itoje | Lock | 1994-10-28 | 31 | England |
| Toby Knight | Flanker | 2002-01-05 | 24 | England |
| Eroni Mawi | Prop | 1996-02-06 | 30 | Fiji |
| Theo McFarland | Back Row | 1995-10-16 | 30 | Samoa |
| Barnaby Merrett | Back Row | 2004-11-22 | 21 | England |
| Nathan Michelow | Back Row | 2004-05-16 | 22 | England |
| Vilikesa Nairau | Prop | | 22 | Fiji |
| Andy Onyeama-Christie | Flanker | 1999-03-22 | 27 | Scotland |
| Marco Riccioni | Prop | 1997-10-19 | 28 | Italy |
| Marcus Street | Prop | 1999-02-06 | 27 | England |
| Hugh Tizard | Lock | 2000-03-31 | 26 | England |
| Tom Willis | Number 8 | 1999-01-18 | 27 | England |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Charlie Bracken | Scrum-half | 2003-12-09 | 22 | England |
| Jack Bracken | Wing | 2005-10-15 | 20 | England |
| Fergus Burke | Fly-half | 1999-09-03 | 26 | Scotland |
| Noah Caluori | Wing | 2006-09-22 | 19 | England |
| Lucio Cinti | Centre | 2000-02-23 | 26 | Argentina |
| Elliot Daly | Full-back | 1992-10-08 | 33 | England |
| Tobias Elliott | Wing | 2003-09-16 | 22 | England |
| Owen Farrell | Fly-half | 1991-09-24 | 34 | England |
| Angus Hall | Centre | 2005-09-17 | 20 | England |
| Olly Hartley | Centre | 2002-02-19 | 24 | England |
| Cameron Hutchison | Centre | 1998-06-01 | 27 | Scotland |
| Louie Johnson | Fly-half | 2003-06-13 | 22 | England |
| Alex Lozowski | Centre | 1993-06-30 | 32 | England |
| Max Malins | Wing | 1997-01-07 | 29 | England |
| Rotimi Segun | Wing | 1996-12-28 | 29 | England |
| Gareth Simpson | Scrum-half | 1997-11-02 | 28 | England |
| Sam Spink | Centre | 1999-10-06 | 26 | England |
| Nick Tompkins | Centre | 1995-02-16 | 31 | Wales |
| Ivan van Zyl | Scrum-half | 1995-06-30 | 30 | South Africa |

---

## Bath Rugby *(to add)*

The 2024-25 champions, built around a dual-playmaker backline of Finn Russell at 10 and Santi Carreras at 15, with strong ball-playing centres giving Bath multiple distributors at the line. Their best rugby blends forward dominance and territory with a backline that can shift the point of attack at will. Russell's growing pragmatism has added game management to the flair, though some 2025-26 criticism has pointed to conservative five-metre pick-and-drive over their expansive instincts. At full song, they balance heft up front with the league's most creative half-back axis.

- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `two_back`
- **Stat bias:** high `handling`, `kicking`, `composure`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Alfie Barbeary | Number 8 | 2000-10-05 | 25 | England |
| Josh Bayliss | Flanker | 1997-09-18 | 28 | Scotland |
| Jaco Coetzee | Number 8 | 1996-06-10 | 29 | South Africa |
| Thompson Cowan | Flanker | 2002-08-02 | 23 | Wales |
| Thomas du Toit | Prop | 1995-05-05 | 31 | South Africa |
| Tom Dunn | Hooker | 1992-11-12 | 33 | England |
| Charlie Ewels | Lock | 1995-06-29 | 30 | England |
| Dan Frost | Hooker | 1997-04-24 | 29 | England |
| Archie Griffin | Prop | 2001-07-24 | 24 | Wales |
| Ted Hill | Flanker | 1999-03-26 | 27 | England |
| Ross Molony | Lock | 1994-05-11 | 32 | Ireland |
| Beno Obano | Prop | 1994-10-25 | 31 | England |
| Guy Pepper | Flanker | 2003-04-15 | 23 | England |
| Miles Reid | Flanker | 1998-09-05 | 27 | England |
| Ewan Richards | Flanker | 2002-04-06 | 24 | England |
| Quinn Roux | Lock | 1990-10-30 | 35 | Ireland |
| Jasper Spandler | Hooker | 2003-05-21 | 23 | England |
| Ethan Staddon | Flanker | 2002-07-03 | 23 | England |
| Will Stuart | Prop | 1996-07-12 | 29 | England |
| Mikey Summerfield | Prop | 2002-10-30 | 23 | England |
| Sam Underhill | Flanker | 1996-07-22 | 29 | England |
| Francois van Wyk | Prop | 1991-07-30 | 34 | South Africa |
| Kieran Verden | Prop | 1998-11-06 | 27 | England |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Henry Arundell | Wing | 2002-11-08 | 23 | England |
| Will Butt | Centre | 2000-01-15 | 26 | England |
| Tom Carr-Smith | Scrum-half | 2002-02-28 | 24 | England |
| Santi Carreras | Full-back | 1998-03-30 | 28 | Argentina |
| Joe Cokanasiga | Wing | 1997-11-15 | 28 | England |
| Tom de Glanville | Full-back | 1999-12-10 | 26 | England |
| Ciaran Donoghue | Fly-half | 2003-01-07 | 23 | Ireland |
| Austin Emens | Full-back | 2002-10-09 | 23 | England |
| Chris Harris | Centre | 1990-12-28 | 35 | Scotland |
| Sam Harris | Fly-half | 2003-09-03 | 22 | England |
| Louie Hennessey | Centre | 2004-03-29 | 22 | Wales |
| Ollie Lawrence | Centre | 1999-09-18 | 26 | England |
| Neil le Roux | Scrum-half | 2003-04-16 | 23 | South Africa |
| Will Muir | Wing | 1995-10-30 | 30 | England |
| Max Ojomoh | Centre | 2000-09-14 | 25 | England |
| Cameron Redpath | Centre | 1999-12-23 | 26 | Scotland |
| Finn Russell | Fly-half | 1992-09-23 | 33 | Scotland |
| Ben Spencer | Scrum-half | 1992-07-31 | 33 | England |
| Bernard van der Linde | Scrum-half | 2000-11-30 | 25 | South Africa |

---

## Exeter Chiefs *(to add)*

The Rob Baxter long-build identity is phase-heavy possession rugby — pressure and patience, suffocating teams with multiple phases and field position before striking. The driving maul is a signature weapon and the forwards are built for relentless go-forward over flashy carries. Chiefs cede little territory, kick smartly and trust their fitness to wear opponents down. They are mid-rebuild after the peak title-winning era, but the DNA — disciplined, methodical, set-piece confident — is intact.

- **Suggested tactics:** `possession` · `keep_it_tight` · `pick_and_drive` · `counter_ruck` · `one_back`
- **Stat bias:** high `stamina`, `breakdown`, `setPiece`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Joe Bailey | Lock | 2004-07-06 | 21 | England |
| Oscar Beckerleg | Lock | 2005-05-11 | 21 | England |
| Alfie Bell | Lock | 2003-04-12 | 23 | England |
| Kwenzo Blose | Prop | 1997-05-12 | 29 | South Africa |
| Ethan Burger | Prop | 2000-05-23 | 25 | South Africa |
| Richard Capstick | Flanker | 2000-02-13 | 26 | England |
| Joseph Dweba | Hooker | 1995-10-25 | 30 | South Africa |
| Greg Fisilau | Number 8 | 2003-07-09 | 22 | England |
| Will Goodrick-Clarke | Prop | 1996-12-29 | 29 | England |
| Louie Gulley | Hooker | | 20 | England |
| Julian Heaven | Hooker | 2000-10-01 | 25 | Australia |
| Tom Hooper | Flanker | 2001-01-29 | 25 | Australia |
| Josh Iosefa-Scott | Prop | 1996-07-16 | 29 | New Zealand |
| Kane James | Flanker | 2005-03-26 | 21 | England |
| Dafydd Jenkins | Lock | 2002-12-05 | 23 | Wales |
| Khwezi Mona | Prop | 1992-10-08 | 33 | South Africa |
| Martin Moloney | Flanker | 1999-10-19 | 26 | Ireland |
| Sol Moody | Hooker | 2005-04-16 | 21 | England |
| Max Norey | Hooker | 1999-08-05 | 26 | England |
| Ehren Painter | Prop | 1998-03-21 | 28 | England |
| Lewis Pearson | Lock | 1999-10-26 | 26 | England |
| Ethan Roots | Flanker | 1997-11-10 | 28 | England |
| Jimmy Roots | Prop | 2000-01-31 | 26 | England |
| Scott Sio | Prop | 1991-10-16 | 34 | Australia |
| Bachuki Tchumbadze | Prop | | 24 | Georgia |
| Christ Tshiunza | Lock | 2002-01-09 | 24 | Wales |
| Rusi Tuima | Flanker | 2000-05-21 | 26 | Fiji |
| Ross Vintcent | Number 8 | 2002-06-05 | 23 | Italy |
| Jack Yeandle | Hooker | 1989-12-22 | 36 | England |
| Andrea Zambonin | Lock | 2000-09-03 | 25 | Italy |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Will Becconsall | Scrum-half | 2002-12-20 | 23 | England |
| Paul Brown-Bampoe | Wing | 2002-05-15 | 24 | England |
| Tom Cairns | Scrum-half | 2002-06-19 | 23 | England |
| Charlie Chapman | Scrum-half | 1998-12-01 | 27 | England |
| Ben Coen | Fly-half | 2005-01-11 | 21 | England |
| Immanuel Feyi-Waboso | Wing | 2002-12-20 | 23 | England |
| Ben Hammersley | Wing | 2003-05-20 | 23 | England |
| Will Haydon-Wood | Fly-half | 2000-10-27 | 25 | England |
| Josh Hodge | Full-back | 2000-05-23 | 26 | England |
| Len Ikitau | Centre | 1998-10-01 | 27 | Australia |
| Iwan Jenkins | Fly-half | 2003-03-13 | 23 | Wales |
| Dan John | Wing | 2001-10-04 | 24 | Wales |
| Will Rigg | Centre | 2000-03-22 | 26 | England |
| Harvey Skinner | Fly-half | 1997-12-31 | 28 | England |
| Henry Slade | Centre | 1993-03-19 | 33 | England |
| Tamati Tua | Centre | 1997-11-26 | 28 | New Zealand |
| Stephen Varney | Scrum-half | 2001-05-16 | 25 | Italy |
| Zack Wimbush | Centre | 2003-10-24 | 22 | England |
| Olly Woodburn | Wing | 1991-11-18 | 34 | England |
| Tommy Wyatt | Wing | 1999-12-14 | 26 | England |

---

## Harlequins *(to add)*

The Twickenham Stoop entertainers and the league's most committed expansive, attacking side. Built around Marcus Smith's creative range — cross-field kicks, late drop-goal nous, footwork at first receiver — Quins play fast-paced running rugby and back themselves to outscore anyone. Their forwards are mobile and carry-friendly rather than maul-monsters, and they thrive on broken-field rugby and counter-attack. The trade-off is defensive vulnerability when the tempo turns against them.

- **Suggested tactics:** `possession` · `wide_wide` · `wide_play` · `jackal` · `one_back`
- **Stat bias:** high `pace`, `agility`, `handling`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Fin Baxter | Prop | 2002-02-12 | 24 | England |
| James Chisholm | Flanker | 1995-08-11 | 30 | England |
| Chandler Cunningham-South | Flanker | 2003-03-18 | 23 | England |
| Pedro Delgado | Prop | 1997-09-01 | 28 | Argentina |
| Alex Dombrandt | Number 8 | 1997-04-29 | 29 | England |
| Jordan Els | Prop | 1997-06-11 | 28 | South Africa |
| Will Evans | Flanker | 1997-01-28 | 29 | England |
| Jonny Green | Lock | 2004-03-16 | 22 | England |
| Will Hobson | Prop | 2002-11-09 | 23 | England |
| Jack Kenningham | Flanker | 1999-11-19 | 26 | England |
| Simon Kerrod | Prop | 1992-08-25 | 33 | England |
| Titi Lamositele | Prop | 1995-02-11 | 31 | USA |
| Joe Launchbury | Lock | 1991-04-12 | 35 | England |
| Tom Lawday | Number 8 | 1993-11-11 | 32 | England |
| Stephan Lewies | Lock | 1992-01-27 | 34 | South Africa |
| Jack Musk | Hooker | 2000-03-04 | 26 | England |
| Guido Petti | Lock | 1994-11-17 | 31 | Argentina |
| Sam Riley | Hooker | 2001-04-23 | 25 | England |
| Kieran Treadwell | Lock | 1995-11-06 | 30 | Ireland |
| George Turner | Hooker | 1992-10-08 | 33 | Scotland |
| Jack Walker | Hooker | 1996-05-06 | 30 | England |
| Boris Wenger | Prop | 2002-07-01 | 23 | Argentina |
| Harry Williams | Prop | 1991-10-01 | 34 | England |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Cameron Anderson | Full-back | 1999-09-16 | 26 | England |
| Oscar Beard | Centre | 2001-11-20 | 24 | England |
| Jamie Benson | Fly-half | 2002-09-23 | 23 | England |
| Bryn Bradley | Centre | 2003-04-17 | 23 | England |
| Conor Byrne | Full-back | 2005-07-07 | 20 | England |
| Cassius Cleaves | Wing | 2003-03-15 | 23 | England |
| Nick David | Full-back | 1998-11-04 | 27 | England |
| Jarrod Evans | Fly-half | 1996-07-25 | 29 | Wales |
| Max Green | Scrum-half | 1996-02-13 | 30 | England |
| Tyrone Green | Full-back | 1998-03-05 | 28 | South Africa |
| Hayden Hyde | Centre | 2000-09-15 | 25 | Ireland |
| Rodrigo Isgró | Wing | 1999-03-24 | 27 | Argentina |
| Sean Kerr | Centre | 2004-11-08 | 21 | England |
| Cadan Murley | Wing | 1999-07-31 | 26 | England |
| Luke Northmore | Centre | 1997-03-16 | 29 | England |
| Will Porter | Scrum-half | 1998-12-14 | 27 | England |
| Marcus Smith | Fly-half | 1999-02-14 | 27 | England |
| Stu Townsend | Scrum-half | 1995-10-11 | 30 | England |
| Ben Waghorn | Centre | 2004-04-02 | 22 | England |

---

## Newcastle Red Bulls *(to add)*

Newly rebranded from the Falcons after Red Bull's August 2025 takeover, Newcastle are mid-transformation: heavy investment, aggressive recruitment, and a search for a clearer identity after three straight bottom-of-the-table finishes. Historically a developmental, lower-budget side that fought hard but lacked depth, the Red Bulls era is rebuilding from the ground up. Kingston Park remains home, but the playing identity is still being written — expect them to start the simulator era as the league's weakest squad, with room to grow.

- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `two_back`
- **Stat bias:** modest across the board (rebuild status); slight lean toward `stamina` and `discipline`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Senatla Adejimi | Hooker | | | England |
| Finn Baker | Lock | | | England |
| Ewan Bello | Prop | | | England |
| Adam Brocklebank | Prop | | | England |
| Tim Cardall | Lock | | | England |
| Tom Christie | Flanker | 1998-03-04 | 28 | New Zealand |
| Freddie Clarke | Lock/Back row | | | England |
| Sebastian De Chaves | Lock | 1990-10-30 | 35 | South Africa |
| Lou de Bruin | Prop | | | South Africa |
| Hame Faiva | Hooker | 1994-05-09 | 32 | Italy |
| Ollie Fletcher | Hooker | | | England |
| Bryce Gordon | Hooker | | | New Zealand |
| Tom Gordon | Flanker | | | Scotland |
| Sam Graham | Back Row | 1997-07-06 | 28 | England |
| Connor Hancock | Prop | | 25 | England |
| John Hawkins | Lock | | | Wales |
| Jamie Hodgson | Lock | | | Scotland |
| Cam Jordan | Lock | 1999-11-17 | 26 | England |
| Ollie Leatherbarrow | Back Row | | | England |
| Fergus Lee-Warner | Lock | 1994-02-03 | 32 | Australia |
| Freddie Lockwood | Back Row | 2000-12-31 | 25 | England |
| Amanaki Mafi | Number 8 | 1990-01-11 | 36 | Japan |
| Murray McCallum | Prop | 1996-03-16 | 30 | Scotland |
| George McGuigan | Hooker | | 32 | England |
| Elliot Millar-Mills | Prop | 1992-07-08 | 33 | Scotland |
| Cameron Neild | Flanker | 1996-09-06 | 29 | England |
| Rob Palframan | Prop | | | England |
| Pouri Rakete-Stones | Prop | | | New Zealand |
| Micky Rewcastle | Prop | | | England |
| Adam Scott | Lock | | | England |
| Rusi Tuima | Lock | | 25 | Fiji |
| Charlie Turnbull | Back Row | | | England |
| Oscar Usher | Lock | | | England |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Sammy Arnold | Centre | | 28 | Ireland |
| Simon Benitez Cruz | Scrum-half | | | Argentina |
| Boeta Chamberlain | Fly-half | | | South Africa |
| Max Clark | Centre | | | England |
| Brett Connon | Fly-half | 1996-08-29 | 29 | Ireland |
| Joe Davis | Scrum-half | | | England |
| Connor Doherty | Centre | | | England |
| James Elliott | Scrum-half | | | England |
| Ethan Grayson | Fly-half | | | England |
| Joel Grayson | Wing | | | England |
| Nick Greenwood | Wing | | | England |
| Alex Hearle | Centre | | | England |
| Josh Hodge | Full-back | | | England |
| Cameron Hutchison | Centre | | | Scotland |
| Elliott Obatoyinbo | Wing/Full-back | 1998-10-09 | 27 | England |
| Harrison Obatoyinbo | Wing | | 24 | England |
| Oliver Spencer | Centre | | | England |
| Sam Stuart | Scrum-half | 1991-09-27 | 34 | England |
| Christian Wade | Wing | 1991-05-15 | 35 | England |
| Sam Waugh | Centre | | | England |
| Liam Williams | Full-back | 1991-04-09 | 35 | Wales |

---

## Northampton Saints *(to add)*

The 2023-24 champions under Phil Dowson, Saints are the league's electric attacking outfit — willing to play from anywhere on the pitch and devastating in transition. Fin Smith conducts a heads-up backline that scores tries from deep, off turnover ball and from set-piece strike plays in equal measure. Their forwards are mobile and link-friendly rather than collision-first, designed to win quick ball and feed the runners. When they get rolling they put 40+ on teams; when the platform wobbles, the structure shows cracks.

- **Suggested tactics:** `possession` · `wide_wide` · `wide_play` · `jackal` · `one_back`
- **Stat bias:** high `pace`, `handling`, `agility`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Aiden Ainsworth-Cave | Lock | | | England |
| Archie Appleby | Back Row | | | England |
| Emeka Atuanya | Lock | 2003-03-17 | 23 | England |
| Archie Benson | Lock | 2001-08-18 | 24 | England |
| Fyn Brown | Back Row | 2002-10-11 | 23 | England |
| Callum Chick | Number 8 | 1996-11-25 | 29 | England |
| Alex Coles | Lock | 1999-09-21 | 26 | England |
| Trevor Davison | Prop | 1992-08-20 | 33 | England |
| Danilo Fischetti | Prop | 1998-01-26 | 28 | Italy |
| Sam Graham | Flanker | 1997-07-06 | 28 | England |
| Luke Green | Prop | 2001-05-06 | 25 | England |
| Emmanuel Iyogun | Prop | 2000-11-24 | 25 | England |
| Josh Kemeny | Flanker | 1998-11-29 | 27 | Australia |
| Cleopas Kundiona | Prop | 1998-12-15 | 27 | Zimbabwe |
| Curtis Langdon | Hooker | 1997-08-03 | 28 | England |
| Jack Lawrence | Back Row | | | England |
| Tom Lockett | Lock | 2002-10-06 | 23 | England |
| Elliot Millar Mills | Prop | 1992-07-08 | 33 | Scotland |
| Chunya Munga | Lock | 2000-09-02 | 25 | England |
| Tom Pearson | Flanker | 1999-10-26 | 26 | England |
| Henry Pollock | Flanker | 2005-01-14 | 21 | England |
| Ed Prowse | Lock | 2000-10-27 | 25 | England |
| Ollie Scola | Prop | | | England |
| Angus Scott-Young | Back Row | 1997-04-23 | 29 | Australia |
| Robbie Smith | Hooker | 1998-09-26 | 27 | Scotland |
| Sonny Tonga'uiha | Prop | | | England |
| Charlie Ulcoq | Back Row | | | England |
| JJ van der Mescht | Lock | 1999-05-04 | 27 | South Africa |
| Henry Walker | Hooker | 1998-03-10 | 28 | England |
| Siep Walta | Back Row | | | Netherlands |
| Tom West | Prop | 1996-02-11 | 30 | England |
| Craig Wright | Hooker | 2004-05-31 | 21 | England |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Anthony Belleau | Fly-half | 1996-04-08 | 30 | France |
| Amena Caqusau | Wing | 2004-07-17 | 21 | Scotland |
| Fraser Dingwall | Centre | 1999-04-07 | 27 | England |
| Tommy Freeman | Wing | 2001-03-05 | 25 | England |
| George Furbank | Full-back | 1996-10-17 | 29 | England |
| Will Glister | Wing | | | England |
| George Hendy | Wing | 2002-10-15 | 23 | England |
| Rory Hutchinson | Centre | 1995-01-29 | 31 | Scotland |
| Tom James | Scrum-half | 1993-10-12 | 32 | England |
| Tom Litchfield | Centre | 2002-04-20 | 24 | England |
| Henry Lumley | Centre | | | England |
| James Martin | Wing | 1999-07-31 | 26 | England |
| Archie McParland | Scrum-half | 2005-02-17 | 21 | England |
| Alex Mitchell | Scrum-half | 1997-05-25 | 28 | England |
| Billy Pasco | Centre | | | England |
| James Pater | Wing | | | England |
| Aiden Pugh | Scrum-half | | | England |
| James Ramm | Wing | 1998-04-30 | 28 | Australia |
| Ollie Sleightholme | Wing | 2000-04-13 | 26 | England |
| Fin Smith | Fly-half | 2002-05-11 | 24 | England |
| Freddie St John | Centre | | | England |
| Toby Thame | Centre | 2003-11-08 | 22 | England |
| Edoardo Todaro | Wing | | | Italy |
| Jonny Weimann | Scrum-half | | | England |

---

## Sale Sharks *(to add)*

The Manchester defence-first side: line-speed, collision-dominant loose forwards and a physical inside-centre channel, all built to choke teams into errors. Sale are happy to cede possession because they back their defence to win the field-position battle, and George Ford's tempo control gives them clinical execution when they do attack. Tackles, turnovers and territory underpin everything; they are the league's least flashy and most resilient team. Box-kick, chase, tackle, repeat.

- **Suggested tactics:** `kicking` · `keep_it_tight` · `balanced` · `shadow` · `three_back`
- **Stat bias:** high `tackling`, `strength`, `kicking`.

### Squad (2025-26)

**Forwards**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Hyron Andrews | Lock | | | South Africa |
| Ben Bamber | Lock | | | England |
| Rouban Birch | Flanker | | | England |
| Tom Burrow | Lock | | | England |
| Ethan Caine | Hooker | | | England |
| Luke Cowan-Dickie | Hooker | 1993-06-20 | 32 | England |
| Ben Curry | Flanker | 1998-06-15 | 27 | England |
| Tom Curry | Flanker | 1998-06-15 | 27 | England |
| Huw Davies | Back Row | | | Wales |
| Sam Dugdale | Back Row | 1999-09-30 | 26 | England |
| Jos Gilmore | Back Row | | | England |
| James Harper | Prop | | | England |
| Nathan Jibulu | Hooker | | | England |
| WillGriff John | Prop | 1992-12-04 | 33 | Wales |
| Reuben Logan | Back Row | | | England |
| Tadgh McElroy | Hooker | | 28 | Ireland |
| Si McIntyre | Prop | | | England |
| Asher Opoku-Fordjour | Prop | | 21 | England |
| Dan du Preez | Number 8 | | | South Africa |
| Tye Raymont | Prop | | | England |
| Le Roux Roets | Lock | | | South Africa |
| Bevan Rodd | Prop | | | England |
| Ernst van Rhyn | Lock | | | South Africa |
| Jacques Vermeulen | Flanker | | | South Africa |
| Tristan Woodman | Back Row | | | England |

**Backs**
| Name | Position | DOB | Age | Nationality |
|---|---|---|---|---|
| Joe Bedlow | Centre | 2002-03-29 | 24 | England |
| Sam Bedlow | Centre | 1995-08-08 | 30 | England |
| Joe Carpenter | Full-back | 2001-08-19 | 24 | England |
| Tom Curtis | Fly-half | | | England |
| Ollie Davies | Fly-half | | | England |
| Obi Ene | Wing | | | England |
| George Ford | Fly-half | 1993-03-16 | 33 | England |
| Dom Hanson | Scrum-half | | | England |
| Luke James | Full-back | | | England |
| Marius Louw | Centre | 1995-10-24 | 30 | South Africa |
| Rekeiti Ma'asi-White | Centre | 2003-02-03 | 23 | England |
| Tom O'Flaherty | Wing | 1994-07-21 | 31 | England |
| Rob du Preez | Centre | | | South Africa |
| Raffi Quirke | Scrum-half | | 24 | England |
| Arron Reed | Wing | 1999-07-10 | 26 | Scotland |
| Tom Roebuck | Wing | 2001-01-07 | 25 | England |
| Nye Thomas | Scrum-half | | | Wales |
| Gus Warr | Scrum-half | | | England |
| Alex Wills | Wing | | | England |

---

## Data notes

Squad data was compiled in parallel from multiple public sources and has **not** been manually validated against current club rosters. Known caveats for a future cleanup pass:

- **Cross-listed players (likely transfer / stale-source artifacts):**
  - `Sam Graham` (DOB 1997-07-06) appears in both Sale Sharks and Northampton Saints squads. Same DOB — one entry is wrong.
  - `Cameron Hutchison` appears in both Saracens and Northampton Saints squads.
  - `Elliot Millar-Mills` / `Elliot Millar Mills` (DOB 1992-07-08) appears in both Sale Sharks and Northampton Saints squads.
  - `Rusi Tuima` appears in both Exeter Chiefs and Northampton Saints squads.
  - `Sam Bedlow` appears in both Bristol Bears and Sale Sharks squads.
  - `Josh Hodge` appears in both Exeter Chiefs and Northampton Saints squads.
  - `Henry Pollock` listed at Sale — Pollock is actually a Northampton Saints flanker; likely a source mix-up.
  - The Northampton "Forwards" list appears to have absorbed several players whose true club is elsewhere (Sale / Newcastle / Exeter) — this section needs the most scrutiny.
- **Possibly stale entries:** `Joe Launchbury` (listed at Newcastle Red Bulls), `Christian Wade` (listed at Northampton) — both were thought to have retired; verify against current squad announcements.
- **Position normalisation:** Some entries use `Back Row` / `Back row` / specific (`Flanker`, `Number 8`) interchangeably. When this file is wired into the engine, normalise to the position literals used in `src/data/team-*.json`.
- **Missing fields:** DOB and age are blank where the public source didn't expose them — particularly common for academy-grade or recently-signed players. Filling these in is straightforward when seeding JSON.
- **Newcastle Red Bulls:** Post-takeover (Aug 2025) recruitment has been heavy and the squad is in flux; expect this list to be the least stable of the ten.
