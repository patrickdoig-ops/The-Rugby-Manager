// Post-match press conference — trigger detection and question/answer builder.
// Pure: no state mutations; GameCoordinator.applyPressEffects() owns mutations.

import type { GameState } from '../types/gameState';
import { recentForm, type FormResult } from './teamStats';
import { PRESS_TRIGGER, PRESS_ANSWER_EFFECTS } from '../engine/balance/press';
import { RIVALRY_PAIRS } from '../engine/balance/season';

export type AnswerTone = 'positive' | 'measured' | 'blunt';

export interface PressAnswer {
  tone: AnswerTone;
  label: string;
  text: string;
  boardDelta: number;
  moraleDelta: number;
}

export interface PressQuestion {
  context: string;
  text: string;
  answers: [PressAnswer, PressAnswer, PressAnswer];
}

export interface Presser {
  clubName: string;
  oppName: string;
  myScore: number;
  oppScore: number;
  questions: [PressQuestion, PressQuestion];
}

type Trigger = 'heavy_win' | 'heavy_loss' | 'board_heat' | 'loss_run' | 'win_run' | 'rival_win' | 'rival_loss';

function answer(tone: AnswerTone, label: string, text: string): PressAnswer {
  return { tone, label, text, ...PRESS_ANSWER_EFFECTS[tone] };
}

function getRival(teamId: string): string | null {
  for (const [a, b] of RIVALRY_PAIRS) {
    if (a === teamId) return b;
    if (b === teamId) return a;
  }
  return null;
}

const QUESTION_BANK: Record<Trigger | 'generic', PressQuestion> = {
  heavy_win: {
    context: 'On the performance',
    text: 'That was a statement result. What clicked for you today?',
    answers: [
      answer('positive', 'Upbeat',    "The players were outstanding — they delivered everything we'd worked on all week. Days like this are what you play for."),
      answer('measured', 'Measured',  "We executed well and took our chances when they came. Good result — the focus turns to next week."),
      answer('blunt',    'Demanding', "We've been capable of this all season. Took us long enough. I'll make sure that becomes the new standard."),
    ],
  },
  heavy_loss: {
    context: 'On the defeat',
    text: "A difficult afternoon. How do you reflect on today's result?",
    answers: [
      answer('positive', 'Supportive', "Credit to the opposition — they were better today. I back this squad completely and we'll come back from this."),
      answer('measured', 'Measured',   "There are areas we need to fix. I'll review everything before I say more publicly."),
      answer('blunt',    'Honest',     "We were second-best in every department. I won't dress it up. The players know what's required."),
    ],
  },
  board_heat: {
    context: 'On your position',
    text: "There's growing speculation about your future. How do you respond to that?",
    answers: [
      answer('positive', 'Confident',   "I have full confidence in this group. Every manager faces difficult periods — I've been through them before and come out stronger."),
      answer('measured', 'Measured',    "My focus is entirely on this squad and the next fixture. Results will answer those questions better than I can."),
      answer('blunt',    'Accountable', "I understand why people are asking. The performances haven't been good enough — and that starts with me."),
    ],
  },
  loss_run: {
    context: 'On recent form',
    text: "It's been a tough run. What's your diagnosis of where things have gone wrong?",
    answers: [
      answer('positive', 'Positive', "We haven't lost confidence. We know exactly what we need to fix — it's a matter of execution. This group will turn it around."),
      answer('measured', 'Measured', "In sport these patches happen. The key is how you respond, and I trust this group to respond."),
      answer('blunt',    'Direct',   "We've been poor and I won't dress it up. I've made that very clear to the players. This has to change."),
    ],
  },
  win_run: {
    context: 'On the winning run',
    text: 'Three wins on the bounce. Can this side maintain that level through the business end of the season?',
    answers: [
      answer('positive', 'Bullish',   "Why not? We've built something here. The group are united and playing with real confidence — I want us to ride that."),
      answer('measured', 'Grounded',  "It's been a good run. We'll keep preparing the same way and take each game as it comes."),
      answer('blunt',    'Demanding', "Three wins is a start, not a statement. I won't let this squad get carried away — there's a lot more to do."),
    ],
  },
  rival_win: {
    context: 'On the derby win',
    text: "The supporters will be talking about that one for a while. What does a result like this mean to the club?",
    answers: [
      answer('positive', 'Celebratory', "It means everything. These are the games supporters live for — when you see that reaction in the stands you know exactly why you got into this game."),
      answer('measured', 'Grounded',    "Derby wins are special and the players know it. Enjoy it tonight — focus returns tomorrow."),
      answer('blunt',    'Demanding',   "The fans deserved that. We owed them a performance in this fixture and we delivered. Now the standard is set."),
    ],
  },
  rival_loss: {
    context: 'On the derby defeat',
    text: "The supporters will feel this one deeply. How do you reflect on losing to your rivals today?",
    answers: [
      answer('positive', 'Supportive', "It's a painful day for everyone connected to this club. I feel for our supporters — they came here and deserved better. We'll make sure we put it right."),
      answer('measured', 'Measured',   "Derby defeats hurt more than most. The players know that. We'll go back to work and make sure we give the supporters something to cheer next time."),
      answer('blunt',    'Honest',     "We let our supporters down today and I won't dress that up. In these fixtures that's unacceptable. The players know what's expected."),
    ],
  },
  generic: {
    context: 'Looking ahead',
    text: 'Any final thoughts going into the week ahead?',
    answers: [
      answer('positive', 'Positive', "Lots to be positive about. The group are in good shape and we'll be ready for the next challenge."),
      answer('measured', 'Grounded', "There's plenty to work on. We'll reflect on this week and prepare properly for what's next."),
      answer('blunt',    'Direct',   "This game is behind us — what matters is what we do next. I'll hold this squad to that standard."),
    ],
  },
};

// Priority order when selecting which triggers produce questions.
const TRIGGER_PRIORITY: (Trigger | 'generic')[] = [
  'board_heat', 'heavy_loss', 'heavy_win', 'rival_loss', 'rival_win', 'loss_run', 'win_run', 'generic',
];

export function shouldFirePresser(state: GameState): boolean {
  const board = state.player.board;
  if (!board) return false;

  const teamId = state.player.teamId;
  const results = state.league.results;
  const lastResult = [...results].reverse().find(r => r.homeId === teamId || r.awayId === teamId);
  if (!lastResult) return false;

  const oppId    = lastResult.homeId === teamId ? lastResult.awayId : lastResult.homeId;
  const myScore  = lastResult.homeId === teamId ? lastResult.homeScore : lastResult.awayScore;
  const oppScore = lastResult.homeId === teamId ? lastResult.awayScore : lastResult.homeScore;
  const margin   = Math.abs(myScore - oppScore);

  const form = recentForm(teamId, results, 3).filter((r): r is FormResult => r !== null);
  const lossCount = form.filter(r => r === 'L').length;
  const winCount  = form.filter(r => r === 'W').length;

  const rival = getRival(teamId);

  return (
    margin >= PRESS_TRIGGER.marginHeavy ||
    board.confidence <= PRESS_TRIGGER.boardHeat ||
    lossCount >= PRESS_TRIGGER.lossRun ||
    (winCount >= PRESS_TRIGGER.winRun && form.length >= 3) ||
    (rival !== null && oppId === rival)
  );
}

export function buildPresser(state: GameState, getTeamName: (id: string) => string): Presser {
  const teamId = state.player.teamId;
  const results = state.league.results;
  const board = state.player.board;

  const lastResult = [...results].reverse().find(r => r.homeId === teamId || r.awayId === teamId)!;
  const isHome   = lastResult.homeId === teamId;
  const oppId    = isHome ? lastResult.awayId : lastResult.homeId;
  const myScore  = isHome ? lastResult.homeScore : lastResult.awayScore;
  const oppScore = isHome ? lastResult.awayScore : lastResult.homeScore;
  const margin   = Math.abs(myScore - oppScore);
  const isWin    = myScore > oppScore;

  const form = recentForm(teamId, results, 3).filter((r): r is FormResult => r !== null);
  const lossCount = form.filter(r => r === 'L').length;
  const winCount  = form.filter(r => r === 'W').length;

  const rival = getRival(teamId);

  const active = new Set<Trigger>();
  if (margin >= PRESS_TRIGGER.marginHeavy)                    active.add(isWin ? 'heavy_win' : 'heavy_loss');
  if (board && board.confidence <= PRESS_TRIGGER.boardHeat)   active.add('board_heat');
  if (lossCount >= PRESS_TRIGGER.lossRun)                     active.add('loss_run');
  if (winCount >= PRESS_TRIGGER.winRun && form.length >= 3)   active.add('win_run');
  if (rival !== null && oppId === rival)                       active.add(isWin ? 'rival_win' : 'rival_loss');

  // Pick 2 questions in priority order; fill with generic when < 2 triggers.
  const chosen: (Trigger | 'generic')[] = [];
  for (const t of TRIGGER_PRIORITY) {
    if (chosen.length >= 2) break;
    if (t === 'generic' || active.has(t)) chosen.push(t);
  }
  while (chosen.length < 2) chosen.push('generic');

  const q1 = QUESTION_BANK[chosen[0]!];
  // Avoid showing the same question key twice (edge case: zero active triggers).
  const q2key = chosen[1] === chosen[0] ? 'generic' : chosen[1]!;
  const q2 = QUESTION_BANK[q2key];

  const clubName = getTeamName(isHome ? lastResult.homeId : lastResult.awayId);
  const oppName  = getTeamName(isHome ? lastResult.awayId : lastResult.homeId);

  return { clubName, oppName, myScore, oppScore, questions: [q1, q2] };
}
