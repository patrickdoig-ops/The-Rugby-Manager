// Play SELECTION (Upgrade.md § 7.1; WP6) — the layer that decides whether a carry
// runs a named playbook play, and which one. It sits inside the WP5 carrier/playmaker
// decision: the handler has already read the defence (the wide-vs-hard call) and
// picked the carrier; selectPlay then offers a set move on a fraction of carries,
// weighted by the team's effective attackingStyle (the "default playbook") and damped
// by per-match familiarity so the attack varies its moves.
//
// DETERMINISM: the fire gate + weighted pick draw on the OUTCOME rng() stream — a
// selected play shapes the carry outcome, so the draws belong on the same seeded
// stream as every other in-play roll (CLAUDE.md § 7). This is why adding selection
// re-baselines the golden + § 13 bands.
//
// PURE: no state mutation. The caller emits PLAY_SELECTED (the recency bump goes
// through applyMatchEvent) and passes the returned play + pre-bump familiarity into
// runCarrySim. CONTENT vs TUNING: the play definitions are content in
// src/data/playbook/; every weight/threshold here reads from PLAY_SELECTION.

import { PLAYBOOK } from '../data/playbook';
import type { Play, PlayChannel, PlayPhase } from '../data/playbook/types';
import type { AttackingStyle } from '../types/team';
import { PLAY_SELECTION } from './balance';
import { rng } from '../utils/rng';

export interface PlaySelectInput {
  phase: PlayPhase;
  // The lateral channel the carry is heading for — derived from the wide-vs-hard
  // decision + available space (selectChannel below).
  channel: PlayChannel;
  // Metres from the mark to the open touchline — gates wide strikes (minSpaceWide).
  spaceWide: number;
  // The attacking side's effective attackingStyle — biases which play surfaces.
  style: AttackingStyle;
  // state.playRecency[attackSide] — the per-play "the defence has seen this lately"
  // scalars (read-only here; the bump is applied via PLAY_SELECTED).
  recency: Record<string, number>;
}

// Resolve the carry's lateral channel from the wide-vs-hard call + open-side space.
// A hard carry is a tight channel; a wide call opens to the wide channel only when
// there is room, else it stays mid. The channel is the play-trigger gate.
export function selectChannel(goWide: boolean, spaceWide: number): PlayChannel {
  if (!goWide) return 'tight';
  return spaceWide >= PLAY_SELECTION.wideChannelSpace ? 'wide' : 'mid';
}

// Offer a play for this carry, or null when none fires. Returns the chosen play and
// the PRE-bump familiarity (0..1) for the overlay's abort scaling — the recency the
// defence carries into THIS carry; the bump (via PLAY_SELECTED) reads on the next one.
export function selectPlay(input: PlaySelectInput): { play: Play; familiarity: number } | null {
  if (rng(1, 100) > PLAY_SELECTION.firePct) return null;

  const eligible = PLAYBOOK.filter(p =>
    p.trigger.phases.includes(input.phase) &&
    (!p.trigger.channels || p.trigger.channels.includes(input.channel)) &&
    (p.trigger.minSpaceWide == null || input.spaceWide >= p.trigger.minSpaceWide));
  if (eligible.length === 0) return null;

  const affinity = PLAY_SELECTION.styleAffinity[input.style];
  const weights: number[] = [];
  let total = 0;
  for (const p of eligible) {
    // A play's style weight is the MAX affinity over the channels it is built for
    // (a wide-or-mid play takes whichever channel the style favours more).
    const chans: readonly PlayChannel[] = p.trigger.channels ?? ['tight', 'mid', 'wide'];
    let chanAff = 0;
    for (const c of chans) if (affinity[c] > chanAff) chanAff = affinity[c];
    const fam = input.recency[p.id] ?? 0;
    const w = chanAff * (1 - PLAY_SELECTION.familiarityWeightDrop * fam);
    weights.push(w);
    total += w;
  }
  if (total <= 0) return null;

  // Weighted pick on the outcome stream (rng returns an integer; scale to a fine
  // fraction of `total`). The last index is the cumulative-rounding fallback.
  let r = (rng(0, 9999) / 10000) * total;
  let idx = eligible.length - 1;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r < 0) { idx = i; break; }
  }
  const play = eligible[idx];
  return { play, familiarity: input.recency[play.id] ?? 0 };
}
