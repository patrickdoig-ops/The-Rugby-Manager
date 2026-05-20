# Team Data — Gallagher Premiership Profiles

This file is the canonical, human-readable reference for each Gallagher Premiership club's identity. Each profile summarises a team's playing style, signature gameplay features, and core DNA in 4–5 lines, with a suggested mapping to the in-game `TeamTactics` dimensions and a hint on which player stats should be biased for that club's character.

The simulator currently ships with 4 of the 10 Premiership clubs; the remaining 6 are flagged `to add`. Today this file is descriptive only — it is not parsed by the engine. The intent is that a future task will use it to seed player ratings, default tactics, and AI behaviour for each club.

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

---

## Bristol Bears *(in game)*

Shaped by the Pat Lam era's "Bristol-Bilbao" expansive ambition, the Bears are the league's most ball-in-hand, high-tempo side, willing to attack from anywhere on the pitch. They prize width, offloads and pace over territorial caution, and will gladly trade penalties for tempo. Their forwards are built for carrying and linking rather than maul dominance, and they often outscore opponents in shootouts. The flip side is risk: turnovers and defensive lapses come with the style.

- **Suggested tactics:** `possession` · `wide_wide` · `wide_play` · `jackal` · `two_back`
- **Stat bias:** high `pace`, `handling`, `agility`.

---

## Leicester Tigers *(in game)*

The Welford Road tradition is set-piece power, structured forward-led play, and hard-nosed defence built on discipline. Tigers historically squeeze the game through scrum and maul dominance, accurate exit kicking, and a defensive line that gives nothing cheap. Their attack is built off forward platform first, with the backs called on to finish rather than create from scratch. Recent rebuilds have softened the edges, but the identity remains: territory, set piece, pressure.

- **Suggested tactics:** `kicking` · `keep_it_tight` · `pick_and_drive` · `jackal` · `two_back`
- **Stat bias:** high `setPiece`, `tackling`, `discipline`.

---

## Saracens *(in game)*

Under Mark McCall, Saracens have been the league's clinical operator — structure, precision and physical dominance executed to a finer tolerance than anyone else. The "Wolfpack" defence with its aggressive line-speed and choke tackles is the signature, paired with a smart kicking game that turns territory into points. They are ruthless game managers: ahead late, they will close a match out with possession and field position rather than tries. Calm under pressure, brutal in the collision.

- **Suggested tactics:** `kicking` · `balanced` · `balanced` · `shadow` · `two_back`
- **Stat bias:** high `tackling`, `positioning`, `composure`.

---

## Bath Rugby *(to add)*

The 2024-25 champions, built around a dual-playmaker backline of Finn Russell at 10 and Santi Carreras at 15, with strong ball-playing centres giving Bath multiple distributors at the line. Their best rugby blends forward dominance and territory with a backline that can shift the point of attack at will. Russell's growing pragmatism has added game management to the flair, though some 2025-26 criticism has pointed to conservative five-metre pick-and-drive over their expansive instincts. At full song, they balance heft up front with the league's most creative half-back axis.

- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `two_back`
- **Stat bias:** high `handling`, `kicking`, `composure`.

---

## Exeter Chiefs *(to add)*

The Rob Baxter long-build identity is phase-heavy possession rugby — pressure and patience, suffocating teams with multiple phases and field position before striking. The driving maul is a signature weapon and the forwards are built for relentless go-forward over flashy carries. Chiefs cede little territory, kick smartly and trust their fitness to wear opponents down. They are mid-rebuild after the peak title-winning era, but the DNA — disciplined, methodical, set-piece confident — is intact.

- **Suggested tactics:** `possession` · `keep_it_tight` · `pick_and_drive` · `counter_ruck` · `one_back`
- **Stat bias:** high `stamina`, `breakdown`, `setPiece`.

---

## Harlequins *(to add)*

The Twickenham Stoop entertainers and the league's most committed expansive, attacking side. Built around Marcus Smith's creative range — cross-field kicks, late drop-goal nous, footwork at first receiver — Quins play fast-paced running rugby and back themselves to outscore anyone. Their forwards are mobile and carry-friendly rather than maul-monsters, and they thrive on broken-field rugby and counter-attack. The trade-off is defensive vulnerability when the tempo turns against them.

- **Suggested tactics:** `possession` · `wide_wide` · `wide_play` · `jackal` · `one_back`
- **Stat bias:** high `pace`, `agility`, `handling`.

---

## Newcastle Red Bulls *(to add)*

Newly rebranded from the Falcons after Red Bull's August 2025 takeover, Newcastle are mid-transformation: heavy investment, aggressive recruitment, and a search for a clearer identity after three straight bottom-of-the-table finishes. Historically a developmental, lower-budget side that fought hard but lacked depth, the Red Bulls era is rebuilding from the ground up. Kingston Park remains home, but the playing identity is still being written — expect them to start the simulator era as the league's weakest squad, with room to grow.

- **Suggested tactics:** `balanced` · `balanced` · `balanced` · `jackal` · `two_back`
- **Stat bias:** modest across the board (rebuild status); slight lean toward `stamina` and `discipline`.

---

## Northampton Saints *(to add)*

The 2023-24 champions under Phil Dowson, Saints are the league's electric attacking outfit — willing to play from anywhere on the pitch and devastating in transition. Fin Smith conducts a heads-up backline that scores tries from deep, off turnover ball and from set-piece strike plays in equal measure. Their forwards are mobile and link-friendly rather than collision-first, designed to win quick ball and feed the runners. When they get rolling they put 40+ on teams; when the platform wobbles, the structure shows cracks.

- **Suggested tactics:** `possession` · `wide_wide` · `wide_play` · `jackal` · `one_back`
- **Stat bias:** high `pace`, `handling`, `agility`.

---

## Sale Sharks *(to add)*

The Manchester defence-first side: line-speed, collision-dominant loose forwards and a physical inside-centre channel, all built to choke teams into errors. Sale are happy to cede possession because they back their defence to win the field-position battle, and George Ford's tempo control gives them clinical execution when they do attack. Tackles, turnovers and territory underpin everything; they are the league's least flashy and most resilient team. Box-kick, chase, tackle, repeat.

- **Suggested tactics:** `kicking` · `keep_it_tight` · `balanced` · `shadow` · `three_back`
- **Stat bias:** high `tackling`, `strength`, `kicking`.
