# Rugby Simulator vs. World Rugby Laws

I've reviewed the core engine logic (`engine.md`, `MatchEngine.ts`, and the phase resolvers) against the official Laws of Rugby Union. 

While the engine captures the spirit and fundamental flow of rugby remarkably well, it relies on several necessary abstractions. Here are the notable inconsistencies and missing laws compared to real-world rugby:

## 1. Tactical Kicking & The Touchline
The engine currently forces all tactical kicks into a binary "Touch (Lineout)" or "Caught (OpenPlay)" outcome. It misses one crucial real-world kicking law:
- **Mark:** Players cannot currently call a "Mark" by catching the ball cleanly inside their own 22. 

## 2. Foul Play & Disciplinary Sanctions
- **No Cards:** The engine's penalty system strictly deals with possession changes and kicks. It does not model Yellow Cards (10-minute sin bin) or Red Cards. Teams will never play with 14 or 13 men.
- **Offside:** Penalties are only awarded for Breakdown infringements (holding on/hands in the ruck) and Scrum collapses. Offside—the most common penalty in real rugby—is not modeled in open play or phase play.

## 3. The Scrum
- **Free Kicks:** Minor scrum offenses result in free kicks in real life (like early engagement). The engine treats all scrum infractions as full penalties (`dominant_penalty`).

## 4. Phase Play (Mauls vs Rucks)
- The engine uses a universal `Breakdown` phase for all post-tackle situations. It heavily models a "Jackal" attempting to steal the ball with their hands. 
- **Mauls:** The concept of a "Maul" (where the ball carrier is held up and teammates bind on to drive forward) is completely absent. All collisions go to ground as rucks.

## 5. Scoring
- **Drop Goals:** Players cannot currently attempt a drop goal in open play. The only way to score points via the boot is through a penalty kick or a conversion.

## 6. Substitutions
- Teams are strictly composed of 15 players who play the full 80 minutes. There is no bench, meaning stamina management is purely about surviving the degradation curve rather than tactical replacements.

---

### What The Engine Gets Perfectly Right
Despite the simplifications above, the engine correctly handles many complex sequences:
- **Penalty Kicks to Touch:** Correctly retains possession and awards the lineout to the kicking team.
- **Post-Score Restarts:** Correctly forces the team that conceded the try/penalty to kick off to the scoring team.
- **Knock-ons:** Accurately flips possession and awards a scrum to the non-offending team across all phases (Kick-off, Box Kicks, Open Play, Lineouts).
