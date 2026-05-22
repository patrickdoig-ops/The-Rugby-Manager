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
  | 'line_break' | 'line_break_try'
  | 'dominant_carry' | 'dominant_tackle' | 'play_on'
  | 'high_tackle_penalty'
  // Breakdown
  | 'clean_ball' | 'slow_ball' | 'turnover' | 'penalty_defending'
  // Scrum
  | 'stable_win' | 'wheel'
  | 'attacking_dominant_penalty' | 'defending_dominant_penalty'
  // Lineout
  | 'clean_catch' | 'crooked_throw' | 'steal' | 'scrappy_knock_on'
  // BoxKick
  | 'attack_retain' | 'defend_knock_on'
  | 'defend_catch_contested' | 'defend_catch'
  // TacticalKick
  | 'good_kick' | 'out_on_the_full' | 'fifty_twenty_two' | 'kick_caught'
  // TryScored (try_lead / try_extend_lead / try_level / try_trail templates exist
  // in CommentaryEngine but TryScoredEvent currently emits no commentary)
  | 'try_lead' | 'try_extend_lead' | 'try_level' | 'try_trail'
  // ConversionKick & Penalty
  | 'success' | 'miss'
  | 'kick_for_goal' | 'kick_to_touch' | 'tap_and_go' | 'tap_and_kick_dead';

export type TacticNoteCause =
  | 'line_break_backfield_thin'
  | 'breakdown_pick_and_drive_clean'
  | 'breakdown_shadow_clean'
  | 'breakdown_jackal_clean'
  | 'breakdown_wide_play_slow'
  | 'breakdown_counter_ruck_slow'
  | 'breakdown_jackal_turnover'
  | 'breakdown_counter_ruck_turnover'
  | 'breakdown_wide_play_turnover'
  | 'breakdown_pick_and_drive_penalty'
  | 'breakdown_wide_play_penalty'
  | 'breakdown_jackal_penalty'
  | 'boxkick_backfield_caught'
  | 'fifty_twenty_two_one_back'
  | 'kick_caught_return_bonus';

// Card-system announcement keys live in their own union so CardHandler
// can type its emitter against the same set the renderer keys off,
// without the two having to stay in lockstep by hand.
export type CardAnnouncementKey =
  | 'tmo_intervenes'   | 'tmo_reviewing'
  | 'tmo_decision_no_card' | 'tmo_decision_yellow' | 'tmo_decision_red_20'
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
  | CardAnnouncementKey;

export interface TacticNoteParams {
  defendTeamName?: string;
  attackTeamName?: string;
  fullback?: Player;
  backfieldDefence?: BackfieldDefence;
}

export interface AnnouncementParams {
  phaseName?: string;
  teamName?: string;
  homeName?: string;
  awayName?: string;
  homeScore?: number;
  awayScore?: number;
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
