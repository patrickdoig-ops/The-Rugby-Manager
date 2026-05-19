import type { TacticNoteCause, TacticNoteParams } from '../../../types/narration';

// Returns the line set for a tactic-note cause. The renderer rolls the chance
// gate (commentary stream) and picks one line from the returned list.
// Strings are copied verbatim from the inline `tacticNote(...)` calls that
// previously lived in src/engine/events/*.ts (BreakdownEvent, OpenPlayEvent,
// FirstPhaseEvent, KickReturnEvent, BoxKickEvent, TacticalKickEvent).

export function getTacticNoteLines(
  cause: TacticNoteCause,
  params: TacticNoteParams = {},
): readonly string[] {
  const att = params.attackTeamName ?? 'the attacking team';
  const def = params.defendTeamName ?? 'the opposition';
  const fullbackName = params.fullback?.name ?? 'the fullback';

  switch (cause) {
    case 'line_break_backfield_thin':
      return [
        `The backfield commitment is leaving ${def} short in the defensive line — and they've been cut through.`,
        `Three in the backfield means only twelve in the line for ${def} — and there's the gap.`,
      ];

    case 'breakdown_pick_and_drive_clean':
      return [
        'Committing numbers to the ruck is working — the forwards dominate the clearout and win clean ball.',
        "That's the reward for flooding the ruck — quick, clean ball.",
      ];

    case 'breakdown_shadow_clean':
      return [
        `The shadow defence is giving ${def} a platform — they were already set before the ball arrived.`,
        `Conceding the ruck but giving nothing else — ${def}'s defensive line is already organised.`,
      ];

    case 'breakdown_jackal_clean':
      return [
        `The jackal threat is still there even when ${def} can't get the turnover — slowing things down.`,
      ];

    case 'breakdown_wide_play_slow':
      return [
        `The wide game plan is leaving ${att} thin at the ruck — they're having to work hard for this ball.`,
        'A price to pay for the wide-play approach: not enough bodies to secure quick ball there.',
      ];

    case 'breakdown_counter_ruck_slow':
      return [
        'The counter-ruck is making a mess of things at the breakdown — the attack is struggling to get away.',
        "That's what the counter-ruck does: wins the physical battle and slows everything down.",
      ];

    case 'breakdown_jackal_turnover':
      return [
        `That's the jackal game paying off — huge work-rate at the breakdown and ${def} have stolen possession.`,
        `Exactly what the jackal strategy is designed for — patience at the breakdown and ${def} come away with the ball.`,
      ];

    case 'breakdown_counter_ruck_turnover':
      return [
        `The counter-ruck overwhelms the opposition and ${def} have turned it over — sheer forward power.`,
      ];

    case 'breakdown_wide_play_turnover':
      return [
        `The wide game plan leaves too few at the ruck and ${att} have paid the price — possession gone.`,
        "That's the danger with going wide — not enough bodies to secure that ball.",
      ];

    case 'breakdown_pick_and_drive_penalty':
      return [
        "Flooding the ruck with forwards is aggressive but they've gone too far — penalty given away.",
        'Too many bodies piling in and the referee has had enough — a penalty against them at the breakdown.',
      ];

    case 'breakdown_wide_play_penalty':
      return [
        `With so few at the ruck ${att} struggled to stay legal — and the referee penalises them.`,
      ];

    case 'breakdown_jackal_penalty':
      return [
        'The jackal is a high-risk strategy and here it backfires — penalty for not releasing.',
        "That's the danger of the jackal — get it slightly wrong and the referee penalises you.",
      ];

    case 'boxkick_backfield_caught':
      return [
        `The backfield numbers are making the difference — ${fullbackName} had plenty of cover and took that cleanly.`,
        params.backfieldDefence === 'three_back'
          ? `Three in the backfield: the box kick had no chance, ${def} had the numbers to deal with it comfortably.`
          : 'The extra cover in the backfield paid off — that kick never had a chance of being contested.',
      ];

    case 'fifty_twenty_two_one_back':
      return [
        "Only one player in the backfield — they didn't have the numbers to cover that kick to the corner.",
        'The 50:22 exploits the shallow backfield — there was simply nobody to chase it down.',
      ];

    case 'kick_caught_return_bonus':
      return [
        "The backfield presence pays dividends — plenty of runners in support and they're coming back at pace.",
        "That's the reward for committing to the backfield — the return is structured and dangerous.",
        params.backfieldDefence === 'three_back'
          ? "Three in the backfield and they've turned defence into attack in an instant — devastating counter."
          : "Two in the backfield and they've got the numbers to make something of this — good return.",
      ];
  }
}
