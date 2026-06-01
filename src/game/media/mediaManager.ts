// Media-story generator. Pure + deterministic: every draw comes off a local
// seeded RNG (makeRng) keyed to a stable per-fixture seed, so it never touches
// the career stream and can't perturb season determinism. The orchestrator
// (GameCoordinator) builds a MediaMatchContext from the post-match snapshot,
// calls generateMatchStory, and persists the result via MEDIA_STORY_PUBLISHED.
//
// One story per fixture: a weighted selector picks the most newsworthy
// archetype (result / player focus / style-DNA / crowd / manager pressure),
// then a slot assembler renders it through a randomly-chosen persona voice.
// Bank lives in ./phrases; cast in ./personas. Grow either freely — the
// assembler is combinatorial, not template-final.

import { makeRng } from '../../utils/rng';
import type { Position } from '../../types/player';
import { isForward } from '../../types/player';
import type { TeamTactics } from '../../types/team';
import type { MediaStory, TeamSeasonStats } from '../../types/gameState';
import { PERSONAS, OPENERS, SIGNOFFS, type Persona } from './personas';
import * as P from './phrases';

export interface MediaPlayer {
  firstName: string;
  lastName: string;
  position: Position;
  age: number | null;
  rating: number;
  tries: number;
  lineBreaks: number;
  defendersBeaten: number;
  tacklesMade: number;
  turnoversWon: number;
  carries: number;
}

export interface MediaMatchContext {
  seed: number;
  round: number;
  clubName: string;
  clubShort: string;
  oppName: string;
  isHome: boolean;
  teamScore: number;
  oppScore: number;
  teamTries: number;
  stadium: string;
  attendance?: number;
  capacity?: number;
  expectedToWin: boolean;
  // Most-recent-last run of the club's last few results.
  recentForm: ('W' | 'L' | 'D')[];
  tactics?: TeamTactics;
  teamSummary: TeamSeasonStats;
  players: MediaPlayer[];
}

export interface MediaPredictionContext {
  seed: number;
  clubName: string;
  // Forecast tier the inbox derives from last season's finish (falling back to
  // board ambition for a club's first season).
  tier: 'title' | 'playoffs' | 'midtable' | 'struggle';
}

type Rng = () => number;
const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (rng: Rng, p: number): boolean => rng() < p;

// Two distinct picks from a pool (falls back to one if the pool is tiny).
function pick2(rng: Rng, arr: readonly string[]): [string, string] {
  const a = pick(rng, arr);
  if (arr.length < 2) return [a, a];
  let b = pick(rng, arr);
  while (b === a) b = pick(rng, arr);
  return [a, b];
}

function fill(s: string, ctx: MediaMatchContext, extra: Record<string, string> = {}): string {
  const vars: Record<string, string> = {
    club: ctx.clubName,
    clubShort: ctx.clubShort,
    opp: ctx.oppName,
    stadium: ctx.stadium,
    ...extra,
  };
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

function playerName(p: MediaPlayer): string {
  return `${p.firstName} ${p.lastName}`;
}

// ---- Player-focus framing (subject clauses + profile-keyed cliché pools) ----

const POS_CLAUSES = ['Take a bow, {player}', 'It was {player}’s afternoon', 'All eyes were on {player}', 'One to remember for {player}'];
const POS_CLAUSES_YOUNG = ['A star is born in {player}', 'Remember the name — {player}', 'Take a bow, {player}', 'The kid {player} announced himself', 'All eyes on the precocious {player}', 'A coming-of-age display from {player}', 'The {player} hype is real'];
const POS_CLAUSES_VET = ['It was vintage {player}', 'Roll back the years for {player}', 'The old stager {player} delivered'];
const NEG_CLAUSES = ['Spare a thought for {player}', 'A rotten afternoon for {player}', 'It all rather passed {player} by', 'Questions for {player}'];

type Profile = 'young' | 'veteran' | 'mid';
function profileOf(age: number | null): Profile {
  if (age === null) return 'mid';
  if (age <= 23) return 'young';
  if (age >= 31) return 'veteran';
  return 'mid';
}

// A position/role-appropriate positive cliché for a strong showing.
function relevantPositiveCliche(rng: Rng, p: MediaPlayer): readonly string[] {
  const back = !isForward(p.position);
  const playmaker = p.position === 'Fly-Half' || p.position === 'Scrum-Half';
  if (playmaker) return chance(rng, 0.5) ? P.CLICHE_RUGBY_IQ : P.CLICHE_COMPOSURE;
  if (back && (p.lineBreaks >= 1 || p.defendersBeaten >= 2 || p.tries >= 1)) return P.CLICHE_PACE;
  if (p.tacklesMade >= 12) return P.CLICHE_DEFENCE;
  if (isForward(p.position)) return chance(rng, 0.5) ? P.CLICHE_PHYSICAL : P.CLICHE_SETPIECE;
  return P.CLICHE_SKILLS_GOOD;
}

function statCallout(rng: Rng, p: MediaPlayer): string | null {
  if (p.tries >= 2) return pick(rng, P.STAT_TWO_TRIES);
  if (p.tries === 1) return pick(rng, P.STAT_ONE_TRY);
  if (p.lineBreaks >= 2) return pick(rng, P.STAT_BREAKS).replace('{n}', String(p.lineBreaks));
  if (p.turnoversWon >= 2) return pick(rng, P.STAT_TURNOVERS).replace('{n}', String(p.turnoversWon));
  if (p.tacklesMade >= 15) return pick(rng, P.STAT_TACKLES).replace('{n}', String(p.tacklesMade));
  return null;
}

function buildPlayerStory(rng: Rng, ctx: MediaMatchContext, p: MediaPlayer, positive: boolean): { subject: string; body: string } {
  const prof = profileOf(p.age);
  const name = playerName(p);
  const parts: string[] = [];

  if (positive) {
    const clause = prof === 'young' ? pick(rng, POS_CLAUSES_YOUNG)
      : prof === 'veteran' ? pick(rng, POS_CLAUSES_VET)
      : pick(rng, POS_CLAUSES);
    const pool = prof === 'veteran' ? P.CLICHE_RESURGENCE
      : prof === 'young' ? P.CLICHE_MATURITY
      : P.CLICHE_INFORM;
    const skill = relevantPositiveCliche(rng, p);
    const c1 = pick(rng, pool);
    const c2 = pick(rng, skill);
    parts.push(`${fill(clause, ctx, { player: name })} — ${c1}, ${c2}.`);
    if (prof === 'young') parts.push(`${name} looks ${pick(rng, P.CLICHE_HYPE)}.`);
    const sc = statCallout(rng, p);
    if (sc) parts.push(sc);
    // Even on a positive young story, often mix in a sceptical counterpoint so
    // the coverage isn't pure praise — mostly an ego / stay-grounded / focus-on-
    // the-basics caveat, sometimes an off-field nudge.
    if (prof === 'young' && chance(rng, 0.55)) {
      parts.push(chance(rng, 0.65) ? pick(rng, P.EGO_CAVEAT) : pick(rng, P.DISTRACTION_NUDGE));
    }
  } else {
    const clause = pick(rng, NEG_CLAUSES);
    if (prof === 'veteran') {
      const [d1, d2] = pick2(rng, P.CLICHE_DECLINE);
      parts.push(`${fill(clause, ctx, { player: name })} — ${d1}, ${d2}.`);
      parts.push(pick(rng, P.DECLINE_VERDICT));
    } else if (prof === 'young') {
      parts.push(`${fill(clause, ctx, { player: name })} — ${pick(rng, P.CLICHE_CRITICISM)}, ${pick(rng, P.CLICHE_DISTRACTION)}.`);
      parts.push(pick(rng, P.DISTRACTION_NUDGE));
    } else {
      const [c1, c2] = pick2(rng, P.CLICHE_CRITICISM);
      parts.push(`${fill(clause, ctx, { player: name })} — ${c1}, ${c2}.`);
    }
  }

  const subject = positive
    ? pick(rng, [`${name} the star of the show`, `${name} steals the headlines`, `${p.lastName} on song`])
    : pick(rng, [`Tough day at the office for ${name}`, `${p.lastName} under the microscope`, `Questions for ${name}`]);
  return { subject, body: parts.join(' ') };
}

// ---- Result framing ----

function buildResultStory(rng: Rng, ctx: MediaMatchContext): { subject: string; body: string } {
  const margin = ctx.teamScore - ctx.oppScore;
  const win = margin > 0, draw = margin === 0;
  let pool: readonly string[];
  if (win && !ctx.expectedToWin && chance(rng, 0.85)) pool = P.RESULT_UPSET;
  else if (win && margin >= 21) pool = chance(rng, 0.5) ? P.RESULT_THRASHING : P.RESULT_STATEMENT;
  else if (win && margin >= 14) pool = P.RESULT_STATEMENT;
  else if (win && margin <= 7) pool = P.RESULT_NARROW;
  else if (win) pool = chance(rng, 0.5) ? P.RESULT_STATEMENT : P.RESULT_NARROW;
  else if (draw) pool = P.RESULT_NARROW;
  else if (margin <= -21 || ctx.expectedToWin) pool = P.RESULT_CAPITULATION;
  else if (margin >= -7) pool = P.RESULT_GALLANT_LOSS;
  else pool = chance(rng, 0.5) ? P.RESULT_CAPITULATION : P.RESULT_GALLANT_LOSS;

  const n = String(Math.max(ctx.teamScore, ctx.oppScore));
  const body = fill(pick(rng, pool), ctx, { n });
  const subject = `${ctx.clubName} ${ctx.teamScore}–${ctx.oppScore} ${ctx.oppName}`;
  return { subject, body };
}

// ---- Style / DNA ----

function styleKind(rng: Rng, ctx: MediaMatchContext): readonly string[] | null {
  const t = ctx.tactics;
  const tries = ctx.teamTries;
  const kicks = ctx.teamSummary.kicksFromHand;
  const kickHeavy = kicks >= 25;
  const expansiveDNA = !!t && (t.attackingStyle === 'wide_wide' || t.attackingGamePlan === 'possession');
  const win = ctx.teamScore > ctx.oppScore;
  // Losses in the run BEFORE this match (recentForm is most-recent-last and
  // includes the just-played fixture).
  const priorLosses = ctx.recentForm.slice(0, -1).filter(r => r === 'L').length;

  // A return to expansive form after a poor patch — the "swagger is back" beat.
  if (expansiveDNA && win && tries >= 2 && priorLosses >= 2) return P.STYLE_REDISCOVERED;
  if (tries >= 4) return P.STYLE_EXPANSIVE_PRAISE;
  if (expansiveDNA && tries >= 3) return P.STYLE_EXPANSIVE_PRAISE;
  if (expansiveDNA && kickHeavy && tries <= 1) return chance(rng, 0.5) ? P.STYLE_LOST_IDENTITY : P.STYLE_KICK_CRITICISM;
  if (win && tries <= 1) return P.STYLE_WON_UGLY;
  if (kickHeavy && tries <= 1) return P.STYLE_KICK_CRITICISM;
  return null;
}

function buildStyleStory(rng: Rng, ctx: MediaMatchContext, pool: readonly string[]): { subject: string; body: string } {
  const body = fill(pick(rng, pool), ctx);
  const subject = pick(rng, [`The ${ctx.clubName} way under the microscope`, `Style watch: ${ctx.clubName}`, `What kind of side are ${ctx.clubName}?`]);
  return { subject, body };
}

// ---- Crowd ----

function buildCrowdStory(rng: Rng, ctx: MediaMatchContext, fillRate: number): { subject: string; body: string } {
  const n = ctx.attendance != null ? ctx.attendance.toLocaleString() : 'a sparse crowd';
  if (fillRate >= 0.97) {
    return { subject: `${ctx.stadium} packed to the rafters`, body: fill(pick(rng, P.CROWD_GREAT), ctx, { n }) };
  }
  let body = fill(pick(rng, P.CROWD_POOR), ctx, { n });
  if (chance(rng, 0.4)) body += ' ' + fill(pick(rng, P.CROWD_COST), ctx, { n });
  return { subject: `Empty seats at ${ctx.stadium}`, body };
}

// ---- Manager pressure ----

function buildManagerStory(rng: Rng, ctx: MediaMatchContext): { subject: string; body: string } {
  const body = fill(pick(rng, P.MANAGER_PRESSURE), ctx) + ' ' + fill(pick(rng, P.MANAGER_PRESSURE_TAIL), ctx);
  return { subject: `Pressure mounting at ${ctx.clubName}`, body };
}

// ---- Persona wrap ----

function wrap(rng: Rng, persona: Persona, subject: string, body: string): { subject: string; body: string } {
  const opener = pick(rng, OPENERS[persona.register]);
  const signoff = chance(rng, 0.6) ? ' ' + pick(rng, SIGNOFFS[persona.register]) : '';
  const lead = persona.outlet === 'X' ? `${persona.byline} on X: ` : `${persona.byline}, ${persona.outlet}: `;
  return {
    subject,
    body: `${lead}${opener} ${body}${signoff}`,
  };
}

// ---- Entry points ----

export function generateMatchStory(ctx: MediaMatchContext): MediaStory {
  const rng = makeRng(ctx.seed);

  // Standout / flop among the club's players this match.
  const sorted = [...ctx.players].sort((a, b) => b.rating - a.rating);
  const standout = sorted[0];
  const flop = sorted[sorted.length - 1];
  const standoutEdge = standout ? Math.max(0, standout.rating - 7.0) : 0;
  const flopEdge = flop ? Math.max(0, 6.2 - flop.rating) : 0;

  const losses = ctx.recentForm.slice(-3).filter(r => r === 'L').length;
  const lostThis = ctx.teamScore < ctx.oppScore;
  const style = styleKind(rng, ctx);
  const fillRate = ctx.attendance != null && ctx.capacity ? ctx.attendance / ctx.capacity : null;
  const crowdNotable = ctx.isHome && fillRate != null && (fillRate >= 0.97 || fillRate < 0.65);

  // Weighted archetype menu. Result is always eligible as the floor.
  const menu: { kind: string; weight: number }[] = [
    { kind: 'result', weight: 3 },
    { kind: 'player', weight: Math.round((standoutEdge + flopEdge) * 6) },
    { kind: 'style', weight: style ? 4 : 0 },
    { kind: 'crowd', weight: crowdNotable ? 4 : 0 },
    { kind: 'manager', weight: lostThis && losses >= 2 ? 7 : 0 },
  ].filter(m => m.weight > 0);

  const total = menu.reduce((s, m) => s + m.weight, 0);
  let roll = rng() * total;
  let chosen = 'result';
  for (const m of menu) { roll -= m.weight; if (roll < 0) { chosen = m.kind; break; } }

  let built: { subject: string; body: string };
  switch (chosen) {
    case 'player': {
      const positive = standoutEdge >= flopEdge;
      built = buildPlayerStory(rng, ctx, positive ? standout : flop, positive);
      break;
    }
    case 'style':  built = buildStyleStory(rng, ctx, style!); break;
    case 'crowd':  built = buildCrowdStory(rng, ctx, fillRate!); break;
    case 'manager': built = buildManagerStory(rng, ctx); break;
    default:        built = buildResultStory(rng, ctx); break;
  }

  const persona = pick(rng, PERSONAS);
  const wrapped = wrap(rng, persona, built.subject, built.body);
  return {
    id: `media:${ctx.round}:${ctx.clubShort}:${chosen}`,
    round: ctx.round,
    subject: wrapped.subject,
    body: wrapped.body,
    outlet: persona.outlet === 'X' ? `${persona.byline} · X` : persona.outlet,
  };
}

export function generateSeasonPrediction(ctx: MediaPredictionContext): MediaStory {
  const rng = makeRng(ctx.seed);
  const pool = ctx.tier === 'title' ? P.PREDICT_TITLE
    : ctx.tier === 'playoffs' ? P.PREDICT_PLAYOFFS
    : ctx.tier === 'midtable' ? P.PREDICT_MIDTABLE
    : P.PREDICT_STRUGGLE;
  const persona = pick(rng, PERSONAS);
  const opener = pick(rng, OPENERS[persona.register]);
  const body = pool[Math.floor(rng() * pool.length)].replace(/\{club\}/g, ctx.clubName);
  const lead = persona.outlet === 'X' ? `${persona.byline} on X: ` : `${persona.byline}, ${persona.outlet}: `;
  return {
    id: `media:prediction:${ctx.clubName}`,
    round: 0,
    subject: 'The pundits have their say',
    body: `${lead}${opener} ${body}`,
    outlet: persona.outlet === 'X' ? `${persona.byline} · X` : persona.outlet,
  };
}
