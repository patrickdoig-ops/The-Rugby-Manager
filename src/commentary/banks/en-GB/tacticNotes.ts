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
  const fullbackName = params.fullback?.lastName ?? 'the fullback';

  switch (cause) {
    case 'line_break_backfield_thin':
      return [
        `The backfield commitment is leaving ${def} short in the defensive line — and they've been cut through.`,
        `Three in the backfield means only twelve in the line for ${def} — and there's the gap.`,
      ];

    case 'breakdown_commit_numbers_clean':
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

    case 'breakdown_minimal_ruck_slow':
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

    case 'breakdown_minimal_ruck_turnover':
      return [
        `The wide game plan leaves too few at the ruck and ${att} have paid the price — possession gone.`,
        "That's the danger with going wide — not enough bodies to secure that ball.",
      ];

    case 'breakdown_commit_numbers_penalty':
      return [
        "Flooding the ruck with forwards is aggressive but they've gone too far — penalty given away.",
        'Too many bodies piling in and the referee has had enough — a penalty against them at the breakdown.',
      ];

    case 'breakdown_minimal_ruck_penalty':
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

    case 'blitz_dominant_tackle':
      return [
        `The blitz pays off — ${def} hit ${att} behind the gain line.`,
        `Line speed from ${def} kills the carry — driven back on contact.`,
        `That's the reward for the rush — ${def} eat the metres up before the receiver can build any momentum.`,
      ];

    case 'drift_shepherd_to_touch':
      return [
        `${def}'s drift defence works as designed — the touchline does the rest.`,
        `Shepherded across the field by ${def} — no inside support and the cover stays organised.`,
        `Lateral coverage from ${def} closes the space — ${att} run out of room.`,
      ];

    case 'blitz_line_break_punished':
      return [
        `Blitz beaten! ${att} into the space behind the rush — cover is way back.`,
        `That's the blitz risk — once it's broken, ${def} have nobody between the runner and the posts.`,
        `${def}'s line came up so hard there's a hole the size of a barn — ${att} take it.`,
      ];

    case 'blitz_pressure_knockon':
      return [
        `${def}'s line speed forces the spill — receiver had no time to settle.`,
        `Hurried into the pass! The blitz pressure pays off for ${def}.`,
        `${def} arrive so fast that ${att} can't get hands on it — the ball is spilled.`,
      ];

    case 'blitz_interception':
      return [
        `${def}'s line speed pays off — they were in the channel before the receiver could move.`,
        `That's what the blitz is designed to do — read the pass and pick it off.`,
        `Pressure from ${def} forces the loose pass and they punish it!`,
      ];

    case 'occasion_error_pressure':
      return [
        'The occasion may be getting to them — handling errors at this level can prove costly.',
        "You wonder if the big stage is affecting concentration. That's a costly spill.",
        'Small margins in occasion matches — that kind of handling error can change the game.',
        'These moments define big matches — composure is everything on days like this.',
      ];

    case 'occasion_rising_to_occasion':
      return [
        'Rising to the occasion — exactly the kind of performance the big stage demands.',
        "There's something to be said for the big moment — that's a player stepping up when it matters.",
        'Big matches produce big moments. The occasion is bringing the best out of this side.',
        "The occasion doesn't seem to be affecting this side — they're growing into the match.",
      ];

    case 'occasion_clock_in_red':
      return [
        'Every point counts now — this is where big matches are decided.',
        'The knockout pressure, the crowd, the clock — it all comes together in moments like this.',
        'This is what occasion rugby looks like in the dying stages — nerves of steel required.',
      ];

    case 'switch_to_open_side':
      return [
        `${att} swing it to the open side, looking for space away from the touch.`,
        `Good width from ${att} — they shift the point of attack to the open side.`,
        `${att} move it to the open side, where the numbers are.`,
      ];

    case 'worked_back_blind':
      return [
        `Out of room on that flank — ${att} work it back against the grain to the blind side.`,
        `Pinned to the touchline, ${att} bring it back infield to find a new angle.`,
        `${att} hit the edge and switch back the other way, hunting space on the short side.`,
      ];

    case 'pinned_on_touchline':
      return [
        `${att} are pinned out near the touchline with precious little room to work.`,
        `Not much space for ${att} out here — backs to the sideline.`,
        `The touchline is doing the defence's job — ${att} have run themselves close to the paint.`,
      ];
  }
}
