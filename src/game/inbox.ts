import type { GameState } from '../types/gameState';
import type { RawTeamInput } from '../types/teamData';
import type { Player } from '../types/player';
import { EXPIRING_CONTRACT_WINDOW_MONTHS } from '../engine/balance/transfers';
import { playerOverall } from '../engine/RatingEngine';
import { recentForm } from './teamStats';
import type { FormResult } from './teamStats';
import { teamSeasonStat } from './seasonLeaderboards';
import { sortStandings } from './leagueTable';
import { getAge } from './age';
import { playoffRaceStatus } from './playoffRace';

export interface InboxItem {
  id: string;
  category: 'league' | 'medical' | 'squad' | 'transfers' | 'contracts' | 'match';
  priority: number;
  subject: string;
  body: string;
  deepLink?: 'squad' | 'contracts' | 'transfers' | 'fixtures' | 'league';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function currentStreak(form: Array<FormResult | null>): { type: FormResult; count: number } | null {
  const actual = form.filter((r): r is FormResult => r !== null);
  if (actual.length === 0) return null;
  const last = actual[actual.length - 1];
  let count = 1;
  for (let i = actual.length - 2; i >= 0; i--) {
    if (actual[i] === last) count++;
    else break;
  }
  return { type: last, count };
}

export function buildAssistantReport(state: GameState, allTeams: RawTeamInput[]): InboxItem[] {
  const items: InboxItem[] = [];
  const teamId = state.player.teamId;
  const season = state.calendar.seasonLabel;
  const club = state.career.clubs.find(c => c.id === teamId);
  if (!club) return [];

  const today = new Date(state.calendar.date);
  const myTeam = allTeams.find(t => t.id === teamId);

  // --- Injuries ---
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (!p?.injury) continue;
    const name = `${p.firstName} ${p.lastName}`;
    const weeks = p.injury.weeksRemaining;
    items.push({
      id: `inj:${season}:${rid}:${p.injury.injuredOn}`,
      category: 'medical',
      priority: 80,
      subject: `${name} is injured`,
      body: `${name} is out for approximately ${weeks} week${weeks !== 1 ? 's' : ''}. Check the squad for cover.`,
      deepLink: 'squad',
    });
  }

  // --- Squad fatigue ---
  const FATIGUE_THRESHOLD = 70;
  const tiredPlayers = club.squad
    .map(rid => state.career.roster[rid])
    .filter((p): p is Player => !!p && !p.injury && p.condition < FATIGUE_THRESHOLD);

  if (tiredPlayers.length >= 3) {
    const listed = tiredPlayers.slice(0, 3).map(p => p.lastName);
    const extra = tiredPlayers.length > 3 ? ` and ${tiredPlayers.length - 3} more` : '';
    items.push({
      id: `fatigue:${season}:w${state.calendar.week}`,
      category: 'medical',
      priority: 50,
      subject: `${tiredPlayers.length} players below match fitness`,
      body: `${listed.join(', ')}${extra} are below ${FATIGUE_THRESHOLD}% condition. Consider adjusting training intensity or rotating the squad ahead of the next fixture.`,
      deepLink: 'squad',
    });
  }

  // --- Expiring contracts ---
  const leaving = new Set(
    state.career.pendingMoves
      .filter(m => m.toClubId !== teamId)
      .map(m => m.rosterId),
  );
  for (const rid of club.squad) {
    if (leaving.has(rid)) continue;
    const p = state.career.roster[rid];
    const expiresOn = p?.contract?.expiresOn;
    if (!expiresOn) continue;
    const exp = new Date(expiresOn);
    const monthsAhead = (exp.getUTCFullYear() - today.getUTCFullYear()) * 12
                      + (exp.getUTCMonth() - today.getUTCMonth());
    if (monthsAhead < 0 || monthsAhead > EXPIRING_CONTRACT_WINDOW_MONTHS) continue;
    const name = `${p.firstName} ${p.lastName}`;
    items.push({
      id: `con:${season}:${rid}`,
      category: 'contracts',
      priority: 40,
      subject: `${name}'s contract is expiring`,
      body: `${name}'s contract expires in ${monthsAhead} month${monthsAhead !== 1 ? 's' : ''}. Consider opening renewal talks.`,
      deepLink: 'contracts',
    });
  }

  // --- Poach threats ---
  for (const rid of (state.career.activePoachedIds ?? [])) {
    if (!club.squad.includes(rid)) continue;
    const p = state.career.roster[rid];
    if (!p) continue;
    const name = `${p.firstName} ${p.lastName}`;
    items.push({
      id: `poach:${season}:${rid}`,
      category: 'transfers',
      priority: 60,
      subject: `${name} is attracting interest`,
      body: `Rival clubs are monitoring ${name}. You may want to review their contract situation.`,
      deepLink: 'transfers',
    });
  }

  // --- Discipline concern ---
  const DISCIPLINE_YELLOW_THRESHOLD = 2;
  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (!p || p.seasonStats.yellowCards < DISCIPLINE_YELLOW_THRESHOLD) continue;
    const name = `${p.firstName} ${p.lastName}`;
    const yellows = p.seasonStats.yellowCards;
    items.push({
      id: `disc:${season}:${rid}`,
      category: 'squad',
      priority: 45,
      subject: `${name} — discipline concern`,
      body: `${name} has collected ${yellows} yellow card${yellows !== 1 ? 's' : ''} this season. Another offence risks a citing or suspension at a critical point in the campaign.`,
      deepLink: 'squad',
    });
  }

  // --- Form collapse ---
  const myForm = recentForm(teamId, state.league.results, 3);
  const recentThree = myForm.filter((r): r is FormResult => r !== null);
  if (recentThree.length === 3 && recentThree.every(r => r === 'L')) {
    const lastMatch = state.league.results
      .filter(r => r.homeId === teamId || r.awayId === teamId)
      .sort((a, b) => b.round - a.round)[0];
    items.push({
      id: `collapse:${season}:r${lastMatch?.round ?? 0}`,
      category: 'league',
      priority: 70,
      subject: 'Three-match losing run',
      body: 'We have lost our last three fixtures. A response is needed — consider reviewing tactics and squad rotation ahead of the next match.',
      deepLink: 'league',
    });
  }

  // --- Derby / big match preview ---
  const playedRounds = new Set(
    state.league.results
      .filter(r => r.homeId === teamId || r.awayId === teamId)
      .map(r => r.round),
  );
  const nextFixture = state.league.fixtures
    .filter(f => (f.homeId === teamId || f.awayId === teamId) && !playedRounds.has(f.round))
    .sort((a, b) => a.round - b.round)[0] ?? null;

  if (nextFixture?.isDerby) {
    const oppId = nextFixture.homeId === teamId ? nextFixture.awayId : nextFixture.homeId;
    const opp = allTeams.find(t => t.id === oppId);
    const oppName = opp?.name ?? 'your opponent';
    items.push({
      id: `match:${season}:r${nextFixture.round}`,
      category: 'match',
      priority: 20,
      subject: `Derby week — ${oppName}`,
      body: `Round ${nextFixture.round} is a Derby fixture against ${oppName}. These matches always carry extra intensity and pressure. Make sure the squad is ready.`,
      deepLink: 'fixtures',
    });
  }

  // --- Scout report ---
  if (nextFixture) {
    const oppId = nextFixture.homeId === teamId ? nextFixture.awayId : nextFixture.homeId;
    const opp = allTeams.find(t => t.id === oppId);
    const oppStats = teamSeasonStat(state, oppId);

    if (opp && oppStats.matchesPlayed >= 2) {
      const sorted = sortStandings(state.league.standings);
      const oppPos = sorted.findIndex(s => s.teamId === oppId) + 1;
      const oppForm = recentForm(oppId, state.league.results, 5);
      const streak = currentStreak(oppForm);

      const sentences: string[] = [];

      // Context — league position + current streak
      if (oppPos > 0) {
        if (streak && streak.type === 'W' && streak.count >= 3) {
          sentences.push(`${opp.name} arrive on a ${streak.count}-match winning run and sit ${ordinal(oppPos)} in the table.`);
        } else if (streak && streak.type === 'L' && streak.count >= 3) {
          sentences.push(`${opp.name} have lost ${streak.count} in a row and are down to ${ordinal(oppPos)}.`);
        } else {
          sentences.push(`${opp.name} are ${ordinal(oppPos)} in the table.`);
        }
      }

      // Set piece — one notable strength or weakness
      const lineoutPct = oppStats.lineoutsThrown > 0
        ? (oppStats.lineoutsWon / oppStats.lineoutsThrown) * 100 : 0;
      const scrumPct = oppStats.scrumsPutIn > 0
        ? (oppStats.scrumsWon / oppStats.scrumsPutIn) * 100 : 0;

      if (lineoutPct >= 82 && oppStats.lineoutsThrown >= 8) {
        sentences.push(`Their lineout is a weapon — ${Math.round(lineoutPct)}% success rate this season.`);
      } else if (lineoutPct < 65 && oppStats.lineoutsThrown >= 8) {
        sentences.push(`Their lineout has been unreliable — only ${Math.round(lineoutPct)}% won. Look to disrupt at the tail.`);
      } else if (scrumPct >= 82 && oppStats.scrumsPutIn >= 6) {
        sentences.push(`They dominate at the scrum — winning ${Math.round(scrumPct)}% of their own ball.`);
      } else if (scrumPct < 58 && oppStats.scrumsPutIn >= 6) {
        sentences.push(`Their scrum has been under pressure — only ${Math.round(scrumPct)}% won. A physical front row could be decisive.`);
      }

      // Risk or opportunity — discipline, attack threat, or defensive leaks
      const cardsPerGame = (oppStats.yellowCards + oppStats.redCards) / oppStats.matchesPlayed;
      const triesPerGame = oppStats.tries / oppStats.matchesPlayed;
      const tacklePct = oppStats.tacklesAttempted > 0
        ? (oppStats.tacklesMade / oppStats.tacklesAttempted) * 100 : 0;

      if (cardsPerGame >= 1.5) {
        sentences.push(`Discipline has been a problem for them — ${oppStats.yellowCards} yellows this season. Pressure them at the breakdown.`);
      } else if (triesPerGame >= 4.5) {
        sentences.push(`Their attack has been prolific — ${triesPerGame.toFixed(1)} tries per game. The defensive line must be disciplined.`);
      } else if (tacklePct < 80 && oppStats.tacklesAttempted >= 40) {
        sentences.push(`Their defence has been leaky — ${Math.round(tacklePct)}% tackle completion. Target the wide channels.`);
      }

      if (sentences.length > 0) {
        items.push({
          id: `scout:${season}:r${nextFixture.round}`,
          category: 'match',
          priority: 30,
          subject: `Scout report — Round ${nextFixture.round} vs ${opp.name}`,
          body: sentences.join(' '),
          deepLink: 'fixtures',
        });
      }
    }
  }

  // --- Home attendance ---
  if (myTeam?.stadiumCapacity) {
    const lastHomeResult = state.league.results
      .filter(r => r.homeId === teamId && r.attendance != null)
      .sort((a, b) => b.round - a.round)[0];

    if (lastHomeResult?.attendance != null) {
      const matchedFixture = state.league.fixtures.find(
        f => f.homeId === teamId && f.round === lastHomeResult.round,
      );
      const capacity = matchedFixture?.venueCapacity ?? myTeam.stadiumCapacity;
      const venueName = matchedFixture?.venue ?? myTeam.stadium;
      const fillRate = lastHomeResult.attendance / capacity;

      const SELLOUT_THRESHOLD = 0.97;
      const POOR_THRESHOLD    = 0.65;

      if (fillRate >= SELLOUT_THRESHOLD) {
        items.push({
          id: `attendance:${season}:r${lastHomeResult.round}`,
          category: 'match',
          priority: 15,
          subject: `Sellout at ${venueName}`,
          body: `${lastHomeResult.attendance.toLocaleString()} supporters filled ${venueName} for Round ${lastHomeResult.round} — a full house and the atmosphere to match.`,
          deepLink: 'fixtures',
        });
      } else if (fillRate < POOR_THRESHOLD) {
        items.push({
          id: `attendance:${season}:r${lastHomeResult.round}`,
          category: 'match',
          priority: 15,
          subject: 'Crowd below expectations',
          body: `Attendance at ${venueName} was at ${Math.round(fillRate * 100)}% capacity for Round ${lastHomeResult.round}. Better home performances will bring the fans back.`,
          deepLink: 'fixtures',
        });
      }
    }
  }

  // --- Rising prospects ---
  const PROSPECT_MAX_AGE    = 24;
  const PROSPECT_MIN_GAP    = 10;
  const PROSPECT_MIN_APPS   = 3;
  const PROSPECT_MIN_RATING = 7.0;

  for (const rid of club.squad) {
    const p = state.career.roster[rid];
    if (!p || !p.potential || p.injury) continue;
    const age = getAge(p.dob, state.calendar.date);
    if (!age || age > PROSPECT_MAX_AGE) continue;
    const ovr = playerOverall(p.baseStats, p.position);
    if (p.potential - ovr < PROSPECT_MIN_GAP) continue;
    const apps = p.seasonStats.appearances;
    if (apps < PROSPECT_MIN_APPS) continue;
    const avgRating = p.seasonStats.ratingSum / apps;
    if (avgRating < PROSPECT_MIN_RATING) continue;
    const name = `${p.firstName} ${p.lastName}`;
    items.push({
      id: `prospect:${season}:${rid}`,
      category: 'squad',
      priority: 25,
      subject: `${name} is emerging`,
      body: `At ${age}, ${name} is averaging ${avgRating.toFixed(1)} from ${apps} appearance${apps !== 1 ? 's' : ''} this season. With significant development potential, this is a player to build around.`,
      deepLink: 'squad',
    });
  }

  // --- Chairman's season objectives (WK1 only) ---
  if (state.calendar.week === 1) {
    const ambition = myTeam?.boardAmbition ?? 'playoffs';
    const lastSeason = state.career.archive[state.career.archive.length - 1];

    let body: string;
    if (!lastSeason) {
      // Year 1 — set expectations from authored ambition
      if (ambition === 'title') {
        body = 'The board\'s expectation is clear — we are here to compete for silverware. A playoff place is the floor, and the title is the ambition.';
      } else if (ambition === 'topHalf') {
        body = 'The board understands this is a year of building. A top-half finish would be a solid foundation — avoid the wooden spoon and show the fans we are heading in the right direction.';
      } else {
        body = 'The board expects playoff rugby this season. A top-four finish would be a strong start and set us up well going forward.';
      }
    } else {
      const lastPos = sortStandings(lastSeason.standings).findIndex(s => s.teamId === teamId) + 1;
      const wasChampion = lastSeason.championTeamId === teamId;

      if (wasChampion) {
        body = 'Last season was everything we hoped for. The board\'s expectation is simple — defend the title. Nothing less will do.';
      } else if (ambition === 'title') {
        if (lastPos <= 2) {
          body = `Finishing ${ordinal(lastPos)} last season was a strong result but the board wants to go all the way. Bring home the title this time.`;
        } else if (lastPos <= 4) {
          body = `A ${ordinal(lastPos)}-place finish was below expectations for a club of our ambition. The board wants a Grand Final place at minimum this season.`;
        } else {
          body = `Finishing ${ordinal(lastPos)} last season was not acceptable. The board expects an immediate return to the top four and a serious playoff run.`;
        }
      } else if (ambition === 'topHalf') {
        if (lastPos <= 5) {
          body = `A ${ordinal(lastPos)}-place finish last season was genuinely encouraging. The board is beginning to raise its expectations — a playoff push would be very welcome.`;
        } else if (lastPos <= 7) {
          body = `${ordinal(lastPos)} place last season was reasonable progress. The board wants to keep moving up — a top-half finish again, with an eye on the top four.`;
        } else {
          body = `Finishing ${ordinal(lastPos)} last season was difficult. The board wants to see improvement — a top-half finish (5th or better) is the target this season.`;
        }
      } else {
        // ambition === 'playoffs'
        if (lastPos <= 2) {
          body = `Reaching the Grand Final last season was excellent. The board wants to push on — go one further and claim the title.`;
        } else if (lastPos <= 4) {
          body = `Making the playoffs again would be the baseline. But the board wants more — a Grand Final place (top two) is the target this season.`;
        } else if (lastPos <= 7) {
          body = `Missing the playoffs last season was a real disappointment. The board expects a return to the top four this time — playoff rugby is non-negotiable.`;
        } else {
          body = `Finishing ${ordinal(lastPos)} was well below where this club should be. The board is demanding a significant improvement — top four is the minimum expectation.`;
        }
      }
    }

    items.push({
      id: `chairman:${season}`,
      category: 'league',
      priority: 90,
      subject: 'Chairman\'s message — season objectives',
      body,
      deepLink: 'league',
    });
  }

  // --- Chairman's block report (fires on first round after an international break) ---
  if (state.calendar.week > 1) {
    const prevRoundDates = state.league.fixtures
      .filter(f => f.round === state.calendar.week - 1 && f.date)
      .map(f => new Date(f.date!).getTime());
    const currRoundDates = state.league.fixtures
      .filter(f => f.round === state.calendar.week && f.date)
      .map(f => new Date(f.date!).getTime());

    if (prevRoundDates.length && currRoundDates.length) {
      const gapDays = (Math.min(...currRoundDates) - Math.max(...prevRoundDates)) / 86_400_000;

      if (gapDays > 18) {
        const ambition = myTeam?.boardAmbition ?? 'playoffs';
        const sorted = sortStandings(state.league.standings);
        const pos = sorted.findIndex(s => s.teamId === teamId) + 1;
        const standing = sorted.find(s => s.teamId === teamId);
        const played = standing?.played ?? 0;
        const wins   = standing?.won    ?? 0;

        const form5    = recentForm(teamId, state.league.results, 5);
        const played5  = form5.filter((r): r is FormResult => r !== null).length;
        const wins5    = form5.filter(r => r === 'W').length;

        // Average home fill rate over the last four home results with attendance data
        let avgFillRate: number | null = null;
        if (myTeam?.stadiumCapacity) {
          const recentHome = state.league.results
            .filter(r => r.homeId === teamId && r.attendance != null)
            .sort((a, b) => b.round - a.round)
            .slice(0, 4);
          if (recentHome.length >= 2) {
            const total = recentHome.reduce((sum, r) => {
              const fix = state.league.fixtures.find(f => f.homeId === teamId && f.round === r.round);
              const cap = fix?.venueCapacity ?? myTeam!.stadiumCapacity!;
              return sum + r.attendance! / cap;
            }, 0);
            avgFillRate = total / recentHome.length;
          }
        }

        const sentences: string[] = [];

        // Strand 1 — position + record (always present)
        if (pos > 0 && played > 0) {
          sentences.push(
            `We go into this break ${ordinal(pos)} in the league with ${wins} win${wins !== 1 ? 's' : ''} from ${played} game${played !== 1 ? 's' : ''}.`
          );
        }

        // Strand 2 — form (only surface if notably good or bad)
        if (played5 >= 3) {
          if (wins5 >= 4) {
            sentences.push(`The form coming into this break has been excellent — ${wins5} wins from our last ${played5}.`);
          } else if (wins5 <= 1) {
            sentences.push(`Recent form has been a concern — ${wins5 === 0 ? 'no' : String(wins5)} win${wins5 !== 1 ? 's' : ''} from our last ${played5} fixtures.`);
          }
        }

        // Strand 3 — attendance (only surface if clearly high or low)
        if (avgFillRate !== null) {
          if (avgFillRate >= 0.90) {
            sentences.push(`The home crowds have been excellent — averaging ${Math.round(avgFillRate * 100)}% capacity.`);
          } else if (avgFillRate < 0.65) {
            sentences.push(`Home attendances have been disappointing at ${Math.round(avgFillRate * 100)}% capacity. Results on the pitch will bring the fans back.`);
          }
        }

        // Strand 4 — chairman's assessment (always present)
        const isAhead  = (ambition === 'title'    && pos <= 2)
                       || (ambition === 'playoffs' && pos <= 2)
                       || (ambition === 'topHalf'  && pos <= 4);
        const onTrack  = (ambition === 'title'    && pos <= 4)
                       || (ambition === 'playoffs' && pos <= 4)
                       || (ambition === 'topHalf'  && pos <= 7);

        if (isAhead && wins5 >= 3) {
          sentences.push(`This is exactly what the board wanted to see. Keep building.`);
        } else if (isAhead) {
          sentences.push(`The position is encouraging. Let's maintain that momentum.`);
        } else if (onTrack) {
          sentences.push(`We are where we need to be. The board expects us to push on from here.`);
        } else if (ambition === 'topHalf' && pos <= 8) {
          sentences.push(`The board would like to see us moving up the table. There is still time, but we need a response.`);
        } else if (pos <= 6) {
          sentences.push(`We're not far off the pace, but the board expects more from the second half of the season.`);
        } else {
          sentences.push(`This is below where we need to be. The board is expecting a significant improvement when the season resumes.`);
        }

        items.push({
          id: `chairman-block:${season}:r${state.calendar.week}`,
          category: 'league',
          priority: 85,
          subject: 'Chairman\'s message — mid-season review',
          body: sentences.join(' '),
          deepLink: 'league',
        });
      }
    }
  }

  // --- Playoff race status ---
  if (state.league.playoffs === null && state.league.standings.length > 0) {
    const { securedTop4, securedTop2, eliminated } = playoffRaceStatus(state, teamId);
    if (eliminated) {
      items.push({
        id: `lg-out:${season}`,
        category: 'league',
        priority: 100,
        subject: 'Mathematically out of the playoffs',
        body: 'We can no longer finish in the top four. Focus on finishing the season strongly.',
        deepLink: 'league',
      });
    } else if (securedTop2) {
      items.push({
        id: `lg-secured2:${season}`,
        category: 'league',
        priority: 100,
        subject: 'Home semi-final secured',
        body: 'We are guaranteed to finish in the top two. A home semi-final awaits in the playoffs.',
        deepLink: 'league',
      });
    } else if (securedTop4) {
      items.push({
        id: `lg-secured4:${season}`,
        category: 'league',
        priority: 100,
        subject: 'Playoff place secured',
        body: 'We have mathematically secured a top-four finish. The playoffs are guaranteed.',
        deepLink: 'league',
      });
    }
  }

  return items.sort((a, b) => b.priority - a.priority);
}
