// Balance telemetry. Runs every (home, away) pairing of the 10-club league
// through a silent MatchCoordinator (no UI, zero tick delay), aggregates
// per-event and per-team statistics, and prints a markdown report.
//
// Not part of `npm run verify` — this is a tuning tool, not a correctness
// gate. Run via `npm run telemetry` when iterating on balance.
//
// Determinism: each fixture derives its own seed via deriveFixtureSeed
// (same recipe as the headless season AI fixtures). The full report is
// reproducible from the same root seed.

import { MatchCoordinator } from '../src/engine/MatchCoordinator.js';
import { deriveFixtureSeed } from '../src/game/derive.js';
import { eventBus } from '../src/utils/eventBus.js';
import type { RawTeamInput } from '../src/types/teamData.js';
import type { TeamTactics, AttackingGamePlan, AttackingBreakdown, BackfieldDefence } from '../src/types/team.js';
import type { MatchState } from '../src/types/match.js';
import { MatchPhase } from '../src/types/engine.js';

import bathRaw        from '../src/data/team-bath.json'        with { type: 'json' };
import bristolRaw     from '../src/data/team-bristol.json'     with { type: 'json' };
import exeterRaw      from '../src/data/team-exeter.json'      with { type: 'json' };
import gloucesterRaw  from '../src/data/team-gloucester.json'  with { type: 'json' };
import harlequinsRaw  from '../src/data/team-harlequins.json'  with { type: 'json' };
import leicesterRaw   from '../src/data/team-leicester.json'   with { type: 'json' };
import newcastleRaw   from '../src/data/team-newcastle.json'   with { type: 'json' };
import northamptonRaw from '../src/data/team-northampton.json' with { type: 'json' };
import saleRaw        from '../src/data/team-sale.json'        with { type: 'json' };
import saracensRaw    from '../src/data/team-saracens.json'    with { type: 'json' };

const ROOT_SEED = 0xDEADBEEF;
const ALL_TEAMS = [
  bathRaw, bristolRaw, exeterRaw, gloucesterRaw, harlequinsRaw,
  leicesterRaw, newcastleRaw, northamptonRaw, saleRaw, saracensRaw,
] as unknown as RawTeamInput[];

interface MatchSummary {
  home: RawTeamInput;
  away: RawTeamInput;
  homeTactics: TeamTactics;
  awayTactics: TeamTactics;
  state: MatchState;
}

function runSilent(home: RawTeamInput, away: RawTeamInput, seed: number): Promise<MatchSummary> {
  return new Promise(resolve => {
    const engine = new MatchCoordinator(home, away, { tickDelayMs: 0, seed, silent: true });
    const off = eventBus.on('engine:finished', ({ state }) => {
      off();
      const summary: MatchSummary = {
        home,
        away,
        // Capture each team's tactics at kick-off. The director mutates them
        // late-game, so the team's *current* tactics at engine:finished
        // could be CHASING/PROTECTING rather than the baseline — that's fine
        // for late-game telemetry but not for "what did team X start with".
        // For grouping we want the baseline so we use the JSON's
        // suggestedTactics.
        homeTactics: home.suggestedTactics!,
        awayTactics: away.suggestedTactics!,
        state,
      };
      engine.destroy();
      resolve(summary);
    });
    engine.initialize();
    engine.start();
  });
}

function sumMatchStats(team: 'home' | 'away', state: MatchState): {
  tries: number; lineBreaks: number; kicksFromHand: number; kickMetres: number;
  knockOns: number; turnoversWon: number; metresCarried: number; carries: number;
  possessionPct: number; territoryPct: number;
} {
  const t = team === 'home' ? state.homeTeam : state.awayTeam;
  const allPlayers = [...t.players, ...t.substitutedOff];
  const reduced = allPlayers.reduce((acc, p) => ({
    tries:         acc.tries         + p.matchStats.tries,
    lineBreaks:    acc.lineBreaks    + p.matchStats.lineBreaks,
    kicksFromHand: acc.kicksFromHand + p.matchStats.kicksFromHand,
    kickMetres:    acc.kickMetres    + p.matchStats.kickMetres,
    knockOns:      acc.knockOns      + p.matchStats.knockOns,
    turnoversWon:  acc.turnoversWon  + p.matchStats.turnoversWon,
    metresCarried: acc.metresCarried + p.matchStats.metresCarried,
    carries:       acc.carries       + p.matchStats.carries,
  }), { tries: 0, lineBreaks: 0, kicksFromHand: 0, kickMetres: 0, knockOns: 0, turnoversWon: 0, metresCarried: 0, carries: 0 });
  const possTotal = state.stats.possession.home + state.stats.possession.away || 1;
  const terrTotal = state.stats.territory.home  + state.stats.territory.away  || 1;
  return {
    ...reduced,
    possessionPct: 100 * state.stats.possession[team] / possTotal,
    territoryPct:  100 *  state.stats.territory[team] / terrTotal,
  };
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

async function main(): Promise<void> {
  const fixtures: Array<{ home: RawTeamInput; away: RawTeamInput; round: number }> = [];
  let round = 1;
  for (const home of ALL_TEAMS) {
    for (const away of ALL_TEAMS) {
      if (home.id === away.id) continue;
      fixtures.push({ home, away, round: round++ });
    }
  }

  const t0 = Date.now();
  const summaries: MatchSummary[] = [];
  for (const f of fixtures) {
    const seed = deriveFixtureSeed(ROOT_SEED, f.round, f.home.id, f.away.id);
    summaries.push(await runSilent(f.home, f.away, seed));
  }
  const elapsedMs = Date.now() - t0;

  // ── Per-club table ────────────────────────────────────────────────────
  const clubAgg = new Map<string, { games: number; tries: number; kickMetres: number; lineBreaks: number; possessionPct: number; pointsFor: number; pointsAgainst: number; wins: number; draws: number; losses: number }>();
  for (const t of ALL_TEAMS) clubAgg.set(t.id, { games: 0, tries: 0, kickMetres: 0, lineBreaks: 0, possessionPct: 0, pointsFor: 0, pointsAgainst: 0, wins: 0, draws: 0, losses: 0 });

  for (const s of summaries) {
    const ha = sumMatchStats('home', s.state);
    const aa = sumMatchStats('away', s.state);
    const h = clubAgg.get(s.home.id)!;
    const a = clubAgg.get(s.away.id)!;
    h.games++; h.tries += ha.tries; h.kickMetres += ha.kickMetres; h.lineBreaks += ha.lineBreaks; h.possessionPct += ha.possessionPct;
    a.games++; a.tries += aa.tries; a.kickMetres += aa.kickMetres; a.lineBreaks += aa.lineBreaks; a.possessionPct += aa.possessionPct;
    h.pointsFor += s.state.score.home; h.pointsAgainst += s.state.score.away;
    a.pointsFor += s.state.score.away; a.pointsAgainst += s.state.score.home;
    if (s.state.score.home > s.state.score.away) { h.wins++; a.losses++; }
    else if (s.state.score.home < s.state.score.away) { a.wins++; h.losses++; }
    else { h.draws++; a.draws++; }
  }

  // ── Per-attackingGamePlan slice ───────────────────────────────────────
  const planAgg = new Map<AttackingGamePlan, { games: number; tries: number; kickMetres: number; possessionPct: number; pointsFor: number; pointsAgainst: number }>();
  for (const plan of ['possession', 'balanced', 'kicking'] as AttackingGamePlan[]) {
    planAgg.set(plan, { games: 0, tries: 0, kickMetres: 0, possessionPct: 0, pointsFor: 0, pointsAgainst: 0 });
  }

  // ── Per-attackingBreakdown slice ──────────────────────────────────────
  const bdAgg = new Map<AttackingBreakdown, { games: number; metresCarried: number; carries: number; turnoversWon: number; pointsFor: number }>();
  for (const bd of ['pick_and_drive', 'balanced', 'wide_play'] as AttackingBreakdown[]) {
    bdAgg.set(bd, { games: 0, metresCarried: 0, carries: 0, turnoversWon: 0, pointsFor: 0 });
  }

  // ── Per-backfieldDefence slice (defensive — concede stats) ────────────
  const bfAgg = new Map<BackfieldDefence, { games: number; concededLineBreaks: number; concededKickMetres: number; pointsAgainst: number }>();
  for (const bf of ['one_back', 'two_back', 'three_back'] as BackfieldDefence[]) {
    bfAgg.set(bf, { games: 0, concededLineBreaks: 0, concededKickMetres: 0, pointsAgainst: 0 });
  }

  for (const s of summaries) {
    const ha = sumMatchStats('home', s.state);
    const aa = sumMatchStats('away', s.state);

    for (const [tactics, mine, opp, myScore, oppScore] of [
      [s.homeTactics, ha, aa, s.state.score.home, s.state.score.away] as const,
      [s.awayTactics, aa, ha, s.state.score.away, s.state.score.home] as const,
    ]) {
      const p = planAgg.get(tactics.attackingGamePlan)!;
      p.games++; p.tries += mine.tries; p.kickMetres += mine.kickMetres; p.possessionPct += mine.possessionPct;
      p.pointsFor += myScore; p.pointsAgainst += oppScore;

      const b = bdAgg.get(tactics.attackingBreakdown)!;
      b.games++; b.metresCarried += mine.metresCarried; b.carries += mine.carries; b.turnoversWon += mine.turnoversWon; b.pointsFor += myScore;

      // backfieldDefence is *defensive* — it shapes what the opponent does
      // against this side. So conceded stats are the *opponent's* attacking
      // numbers.
      const bf = bfAgg.get(tactics.backfieldDefence)!;
      bf.games++; bf.concededLineBreaks += opp.lineBreaks; bf.concededKickMetres += opp.kickMetres; bf.pointsAgainst += oppScore;
    }
  }

  // ── Phase frequency across all matches ────────────────────────────────
  const phaseCount = new Map<MatchPhase, number>();
  for (const s of summaries) {
    for (const e of s.state.events) {
      phaseCount.set(e.phase, (phaseCount.get(e.phase) ?? 0) + 1);
    }
  }

  // ── Try origin: most recent non-try, non-conversion phase before each
  // TRY_SCORED event. Walking back skips clusters of TRY_SCORED announce +
  // award commentary events that emit back-to-back, and the conversion that
  // follows the previous try, so we surface the actual rugby phase that led
  // into the score (LINEOUT, BREAKDOWN, KICK_RETURN, etc.).
  const tryOrigin = new Map<MatchPhase, number>();
  let totalTries = 0;
  for (const s of summaries) {
    for (let i = 0; i < s.state.events.length; i++) {
      const e = s.state.events[i];
      if (e.phase !== MatchPhase.TryScored) continue;
      totalTries++;
      let origin: MatchPhase = MatchPhase.KickOff;
      for (let j = i - 1; j >= 0; j--) {
        const p = s.state.events[j].phase;
        if (p !== MatchPhase.TryScored && p !== MatchPhase.ConversionKick) {
          origin = p;
          break;
        }
      }
      tryOrigin.set(origin, (tryOrigin.get(origin) ?? 0) + 1);
    }
  }

  // ── Print report ──────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push('# Telemetry');
  lines.push('');
  lines.push(`Root seed: 0x${ROOT_SEED.toString(16)} · ${summaries.length} fixtures · ${elapsedMs} ms`);
  lines.push('');

  lines.push('## Per-club results (full double round-robin)');
  lines.push('');
  lines.push('| Club | P | W | D | L | PF | PA | tries/g | kick m/g | line breaks/g | poss% |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const sortedClubs = [...ALL_TEAMS].sort((x, y) => {
    const xa = clubAgg.get(x.id)!; const ya = clubAgg.get(y.id)!;
    return (ya.wins * 4 + ya.draws * 2) - (xa.wins * 4 + xa.draws * 2);
  });
  for (const c of sortedClubs) {
    const a = clubAgg.get(c.id)!;
    lines.push(`| ${c.shortName} | ${a.games} | ${a.wins} | ${a.draws} | ${a.losses} | ${a.pointsFor} | ${a.pointsAgainst} | ${fmt(a.tries/a.games)} | ${fmt(a.kickMetres/a.games)} | ${fmt(a.lineBreaks/a.games)} | ${fmt(a.possessionPct/a.games)} |`);
  }
  lines.push('');

  lines.push('## attackingGamePlan slice');
  lines.push('');
  lines.push('| plan | games | tries/g | kick m/g | poss%/g | PF/g | PA/g |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const plan of ['possession', 'balanced', 'kicking'] as AttackingGamePlan[]) {
    const p = planAgg.get(plan)!;
    if (p.games === 0) continue;
    lines.push(`| ${plan} | ${p.games} | ${fmt(p.tries/p.games)} | ${fmt(p.kickMetres/p.games)} | ${fmt(p.possessionPct/p.games)} | ${fmt(p.pointsFor/p.games)} | ${fmt(p.pointsAgainst/p.games)} |`);
  }
  lines.push('');

  lines.push('## attackingBreakdown slice');
  lines.push('');
  lines.push('| breakdown | games | carries/g | metres/carry | turnovers won/g | PF/g |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const bd of ['pick_and_drive', 'balanced', 'wide_play'] as AttackingBreakdown[]) {
    const b = bdAgg.get(bd)!;
    if (b.games === 0) continue;
    const mpc = b.carries > 0 ? b.metresCarried / b.carries : 0;
    lines.push(`| ${bd} | ${b.games} | ${fmt(b.carries/b.games)} | ${fmt(mpc, 2)} | ${fmt(b.turnoversWon/b.games)} | ${fmt(b.pointsFor/b.games)} |`);
  }
  lines.push('');

  lines.push('## backfieldDefence slice (defensive — concede stats are opposition\'s)');
  lines.push('');
  lines.push('| backfield | games | line breaks conceded/g | kick m conceded/g | PA/g |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const bf of ['one_back', 'two_back', 'three_back'] as BackfieldDefence[]) {
    const b = bfAgg.get(bf)!;
    if (b.games === 0) continue;
    lines.push(`| ${bf} | ${b.games} | ${fmt(b.concededLineBreaks/b.games)} | ${fmt(b.concededKickMetres/b.games)} | ${fmt(b.pointsAgainst/b.games)} |`);
  }
  lines.push('');

  lines.push('## Phase frequency (GameEvents across all fixtures)');
  lines.push('');
  lines.push('| phase | events |');
  lines.push('|---|---:|');
  for (const [phase, n] of [...phaseCount.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${phase} | ${n} |`);
  }
  lines.push('');

  lines.push('## Try origin (phase immediately before each TRY_SCORED event)');
  lines.push('');
  lines.push(`Total tries: ${totalTries}`);
  lines.push('');
  lines.push('| preceding phase | tries | share |');
  lines.push('|---|---:|---:|');
  for (const [phase, n] of [...tryOrigin.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${phase} | ${n} | ${fmt(100 * n / totalTries)}% |`);
  }

  console.log(lines.join('\n'));
}

await main();
