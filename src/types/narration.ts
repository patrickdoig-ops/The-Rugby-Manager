import type { Player } from './player';
import type { MatchPhase } from './engine';
import type { BackfieldDefence } from './team';

// Structured narration emitted by the engine and rendered to text by
// src/commentary/CommentaryRenderer.ts. The engine never composes text — it
// describes WHAT happened (steps) and the surrounding tactical context.

export type PhaseOutcomeKey =
  // KickOff
  | 'announce' | 'coin_toss'
  | 'clean_receive' | 'poor_kick' | 'short_kick_retain' | 'knock_on'
  // PhasePlay / FirstPhase / KickReturn shared
  | 'kick_decision' | 'out_the_back' | 'crash_ball'
  | 'line_break' | 'line_break_try' | 'cover_tackle'
  | 'dominant_carry' | 'dominant_carry_try' | 'dominant_tackle' | 'play_on'
  | 'pick_and_go_play_on' | 'pick_and_go_dominant_carry' | 'pick_and_go_dominant_tackle'
  | 'high_tackle_penalty' | 'obstruction_penalty'
  | 'interception'
  | 'offload_attempt' | 'offload_knock_on'
  // Breakdown
  | 'clean_ball' | 'slow_ball' | 'turnover' | 'penalty_defending'
  | 'offside_at_ruck_penalty' | 'not_rolling_away_penalty' | 'dangerous_cleanout_penalty'
  // Scrum
  | 'stable_win' | 'wheel'
  | 'attacking_dominant_penalty' | 'defending_dominant_penalty'
  // Lineout
  | 'clean_catch' | 'crooked_throw' | 'steal' | 'scrappy_knock_on'
  // Maul
  | 'maul_won' | 'maul_held' | 'maul_collapse_penalty' | 'maul_try'
  // BoxKick
  | 'attack_retain' | 'defend_knock_on'
  | 'defend_catch_contested' | 'defend_catch'
  | 'box_kick_to_touch'
  // TacticalKick
  | 'good_kick' | 'out_on_the_full' | 'fifty_twenty_two' | 'kick_caught'
  | 'fifty_twenty_two_attempt_failed_touch' | 'fifty_twenty_two_attempt_failed_caught'
  // Attacking kicks (cross-field aerial, grubber through the line)
  | 'cross_field_caught' | 'cross_field_contested' | 'cross_field_dead'
  | 'grubber_regathered' | 'grubber_collected' | 'grubber_dead'
  // TryScored — TryScoredEvent picks one of these from the pre/post-try lead.
  | 'try_lead' | 'try_extend_lead' | 'try_level' | 'try_trail'
  // ConversionKick & Penalty
  | 'success' | 'miss'
  | 'kick_for_goal' | 'kick_to_touch' | 'kick_to_touch_close' | 'kick_to_touch_long' | 'kick_to_touch_missed' | 'tap_and_go' | 'tap_and_kick_dead';

export type TacticNoteCause =
  | 'line_break_backfield_thin'
  | 'breakdown_commit_numbers_clean'
  | 'breakdown_shadow_clean'
  | 'breakdown_jackal_clean'
  | 'breakdown_minimal_ruck_slow'
  | 'breakdown_counter_ruck_slow'
  | 'breakdown_jackal_turnover'
  | 'breakdown_counter_ruck_turnover'
  | 'breakdown_minimal_ruck_turnover'
  | 'breakdown_commit_numbers_penalty'
  | 'breakdown_minimal_ruck_penalty'
  | 'breakdown_jackal_penalty'
  | 'boxkick_backfield_caught'
  | 'fifty_twenty_two_one_back'
  | 'kick_caught_return_bonus'
  | 'blitz_dominant_tackle'
  | 'drift_shepherd_to_touch'
  | 'blitz_line_break_punished'
  | 'blitz_pressure_knockon'
  | 'blitz_interception'
  | 'occasion_error_pressure'
  | 'occasion_rising_to_occasion'
  | 'occasion_clock_in_red'
  // Lateral play — flavour keyed off the per-phase sweep (src/engine/Lateral.ts).
  | 'switch_to_open_side'
  | 'worked_back_blind'
  | 'pinned_on_touchline';

// Card-system announcement keys live in their own union so CardHandler
// can type its emitter against the same set the renderer keys off,
// without the two having to stay in lockstep by hand.
export type CardAnnouncementKey =
  | 'tmo_intervenes'   | 'tmo_reviewing'
  | 'tmo_ref_returns'
  | 'tmo_decision_no_card' | 'tmo_decision_yellow' | 'tmo_decision_red_20'
  | 'card_ref_summons'
  | 'card_yellow' | 'card_red_20' | 'card_red_full'
  | 'sin_bin_returned'
  | 'red_20_replacement_done' | 'red_20_no_replacement'
  | 'team_22_warning'
  // Injury system. injury_off is logged inline by OpenPlayEvent at the
  // moment of contact; injury_replacement_done / injury_no_replacement
  // mirror the red_20 lifecycle (replacement on, or play short).
  | 'injury_off'
  | 'injury_replacement_done' | 'injury_no_replacement';

export type AnnouncementKey =
  | 'clock_in_red_first_half' | 'clock_in_red_second_half'
  | 'half_time_whistle'        | 'full_time_summary'
  | 'substitution'
  | 'fatigue_tiredness'
  | 'set_piece_award'
  | 'try_location_central' | 'try_location_close'
  | 'try_location_wide'    | 'try_location_corner'
  | 'try_referee_signal'   | 'try_aftermath'
  | 'try_bonus_point'
  | 'kicker_steps_up'   | 'kicker_compose'  | 'kicks_for_touch'
  | 'maul_drive_strong'
  | 'scrum_reset_cap'
  | 'occasion_kickoff_derby'
  | 'occasion_kickoff_playoff_semi'
  | 'occasion_kickoff_final'
  | 'ai_tactics_chasing'
  | 'ai_tactics_protecting'
  | 'ai_tactics_revert'
  | CardAnnouncementKey;

export interface TacticNoteParams {
  defendTeamName?: string;
  attackTeamName?: string;
  fullback?: Player;
  backfieldDefence?: BackfieldDefence;
}

// Game context for the try_aftermath crowd reaction. Computed by
// TryScoredEvent from the (pre-try) state and the projected lead; consumed by
// getAnnouncementTemplate to pick a venue- and situation-appropriate pool so a
// home roar never fires for an away try, and "momentum is shifting" only fires
// on a genuine swing.
export interface TryAftermathContext {
  // True when the scoring side is the home team (state.possession === 'home').
  scoringSideIsHome: boolean;
  // True at a neutral venue (the playoff final) — no home/away crowd framing.
  neutralVenue: boolean;
  // True when the try meaningfully shifts the balance (took the lead, drew
  // level, or clawed the deficit back) — i.e. NOT 'try_extend_lead'. Gates the
  // momentum-shift phrasing.
  isSwing: boolean;
  // True when the post-try margin is so large the result is beyond doubt —
  // the crowd reaction is subdued regardless of who scored.
  isBlowout: boolean;
  // True when a swing try lands late in a close game — peak-noise reaction.
  isLateDrama: boolean;
}

export interface AnnouncementParams {
  phaseName?: string;
  teamName?: string;
  homeName?: string;
  awayName?: string;
  homeScore?: number;
  awayScore?: number;
  tryAftermath?: TryAftermathContext;
  minutesLeft?: number;
  scoreGap?: number;
  captainName?: string;
}

// Some announcements (sin-bin return, replacement done) need to mention a
// player by name even though they're not a phase_outcome. The bank templates
// reference {primary} / {secondary} via the optional primary/secondary on
// NarrationStep['announcement'], so no new field is needed here.

export type NarrationStep =
  | {
      kind: 'phase_outcome';
      phase: MatchPhase;
      key: PhaseOutcomeKey;
      primary?: Player;
      secondary?: Player;
      metres?: number;
    }
  | {
      kind: 'tactic_note';
      cause: TacticNoteCause;
      chancePct: number;
      params?: TacticNoteParams;
    }
  | {
      kind: 'announcement';
      key: AnnouncementKey;
      primary?: Player;
      secondary?: Player;
      params?: AnnouncementParams;
    };

export interface NarrationDescriptor {
  steps: NarrationStep[];
}
