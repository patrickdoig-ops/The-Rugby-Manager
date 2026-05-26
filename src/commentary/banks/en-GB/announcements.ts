import type { AnnouncementKey, AnnouncementParams } from '../../../types/narration';
import { pickRandom } from '../../../utils/rng';

// Templates for narration steps with kind 'announcement' — clock/period
// transitions, substitutions, fatigue lines, set-piece awards. The renderer
// invokes getAnnouncementTemplate(key, params) to obtain a single picked
// template; the renderer then interpolates {primary}/{secondary}/{side}/
// {defside} tokens. Params that embed literal scores or names (full-time
// summary, set-piece award) are baked into the returned string here.

const CLOCK_IN_RED_FIRST_HALF: readonly string[] = [
  "That's the 40 minutes — the clock is in the red! Play on until the ball is dead.",
  "Forty minutes up — we're into added time. The clock is in the red.",
  'The half-time whistle is ready, but the clock is in the red — play continues.',
];

const CLOCK_IN_RED_SECOND_HALF: readonly string[] = [
  "That's 80 minutes — the clock is in the red! The game isn't over until the ball is dead.",
  'Eighty minutes on the clock — we\'re into overtime. The clock is in the red.',
  'Full time on the clock, but the ball is still in play — the clock is in the red!',
];

const HALF_TIME_WHISTLE: readonly string[] = [
  'Half time! The teams head to the dressing rooms to regroup.',
];

const FATIGUE_TIREDNESS: readonly string[] = [
  '{primary} is starting to look tired out there — the legs are going.',
  '{primary} is looking leggy. The fatigue is setting in.',
  'You can see the wear on {primary} — the energy is fading.',
  '{primary} is running on empty now — the effort is starting to show.',
  '{primary} looks worn out — the pace is dropping off.',
  'The tank is emptying for {primary} — that\'s the fatigue biting.',
];

const SUBSTITUTION: readonly string[] = [
  '{primary} comes on to replace {secondary}.',
  '{primary} is introduced, replacing {secondary}.',
  'A change for {teamName}: {secondary} makes way for {primary}.',
  '{secondary} is replaced by {primary}.',
];

const TRY_LOCATION_CENTRAL: readonly string[] = [
  'Right under the posts — a routine conversion to come.',
  "Touched down between the sticks — the kicker won't ask for an easier one.",
  'Grounded under the uprights — kindly placed for the conversion.',
];

const TRY_LOCATION_CLOSE: readonly string[] = [
  'Close to the posts — comfortable kick for the conversion.',
  'Just off-centre — should be a routine two more.',
  'Inside the 15-metre channel — the kicker will fancy it.',
];

const TRY_LOCATION_WIDE: readonly string[] = [
  "Out wide — that's a tougher conversion in front of the kicker.",
  'Wide of the posts — no gimme for the kicker.',
  'Scored out toward the touchline — testing angle for the conversion.',
];

const TRY_LOCATION_CORNER: readonly string[] = [
  'Right in the corner — an enormous ask for the kicker.',
  'Touched down at the corner flag — the conversion is almost impossible from there.',
  'In the corner — the kicker will need every bit of range and angle.',
];

const TMO_INTERVENES: readonly string[] = [
  'The TMO is in the referee\'s ear — they want to take a closer look at that tackle.',
  'TMO check! The official upstairs has flagged a concern with the tackle technique.',
  '"Sir, hold on — we need to review this." The TMO interjects.',
  'TMO intervention. The referee pauses play to consult.',
];

const TMO_REVIEWING: readonly string[] = [
  'The referee is at the screen now, watching the replay frame by frame.',
  'Big screen footage running back — the official is checking head contact.',
  'They\'re looking at the point of contact in slow motion.',
  'Replay rolling — referee and TMO going through it together.',
];

const TMO_DECISION_NO_CARD: readonly string[] = [
  'No head contact in the view of the referee — just the penalty.',
  '"Play on after the penalty — no further action." Clean technique on review.',
  'Referee waves it away — just the penalty, no card.',
];

const TMO_DECISION_YELLOW: readonly string[] = [
  '"Head contact, mitigation — yellow card." Ten minutes in the bin.',
  'Yellow card on review — illegal but mitigated. Off for ten minutes.',
  'The referee shows yellow — ten in the bin for the tackler.',
];

const TMO_DECISION_RED_20: readonly string[] = [
  '"Head contact, no mitigation — 20-minute red." A serious blow for the team.',
  'Twenty-minute red! Referee says no mitigation. The team can replace after twenty.',
  'It\'s a 20-minute red card — off the field, replacement available after twenty.',
];

const CARD_YELLOW: readonly string[] = [
  'Yellow card for {primary} — ten minutes in the sin bin.',
  '{primary} is off to the bin — ten-minute yellow.',
  'Sin bin for {primary}. Ten minutes off.',
];

const CARD_RED_20: readonly string[] = [
  '20-minute red for {primary} — off the field. {teamName} can replace after the twenty.',
  '{primary} is given a 20-minute red. No return, but the team can sub after twenty.',
  'Red card — 20-minute version — for {primary}. Off, replacement to come.',
];

const CARD_RED_FULL: readonly string[] = [
  'Red card! {primary} is sent off for the rest of the match. {teamName} down to fourteen.',
  '{primary} sees red — gone for the rest of the game. A serious blow.',
];

const SIN_BIN_RETURNED: readonly string[] = [
  '{primary} returns to the field — the ten minutes are up.',
  '{primary} is back on. {teamName} are at full strength again.',
  'Ten minutes done — {primary} re-joins the action.',
];

const RED_20_REPLACEMENT_DONE: readonly string[] = [
  '{primary} comes on for the sent-off {secondary}. {teamName} back to fifteen.',
  '{teamName} use their replacement — {primary} on, {secondary}\'s twenty are up.',
  'Replacement made — {primary} on for {secondary}, who watches from the stand.',
];

const RED_20_NO_REPLACEMENT: readonly string[] = [
  '{secondary}\'s twenty minutes are up — but {teamName} have nobody on the bench. A man down for the rest of it.',
  'No replacement available for {teamName} — they finish the match with fourteen.',
];

const TEAM_22_WARNING: readonly string[] = [
  'The referee speaks to the captain — that\'s three penalties in your own 22. The next one is a card.',
  '"Captain, I\'ve seen enough. Three penalties down here — your next one\'s a yellow." A warning issued.',
  'Captain summoned — referee\'s warning over repeat infringements inside the 22.',
];

const SCRUM_RESET_CAP: readonly string[] = [
  "Three resets — the referee's lost patience. Penalty awarded.",
  "That's the limit — three wheels and the official calls it. Penalty.",
  "Referee's had enough of the resets — penalty from the third wheel.",
];

const INJURY_OFF: readonly string[] = [
  '{primary} is down — and looks to be hurt. The physio is on.',
  'Bad news for {primary} — staying down after that contact, waving for the doctor.',
  '{primary} is in trouble — the medics are sprinting on with the bag.',
  'Concern for {primary} — flat on the deck, the trainer is over.',
  '{primary} winces and goes down — that did not look right.',
];

const INJURY_REPLACEMENT_DONE: readonly string[] = [
  '{primary} comes on as a forced replacement for the injured {secondary}.',
  'Enforced change for {teamName} — {primary} on, {secondary} off and straight down the tunnel.',
  '{secondary} can\'t carry on — {primary} is on in their place.',
  'A precautionary change for {teamName}: {primary} replaces {secondary}.',
];

const INJURY_NO_REPLACEMENT: readonly string[] = [
  '{secondary} can\'t continue — but {teamName} have nobody on the bench. Down to fourteen for the rest of it.',
  'No replacement available for {teamName} — {secondary} is off, and they finish a player short.',
];

export function getAnnouncementTemplate(
  key: AnnouncementKey,
  params: AnnouncementParams = {},
): string | undefined {
  switch (key) {
    case 'clock_in_red_first_half':
      return pickRandom(CLOCK_IN_RED_FIRST_HALF);
    case 'clock_in_red_second_half':
      return pickRandom(CLOCK_IN_RED_SECOND_HALF);
    case 'half_time_whistle':
      return pickRandom(HALF_TIME_WHISTLE);
    case 'full_time_summary':
      return `Full time! ${params.homeName ?? ''} ${params.homeScore ?? 0} – ${params.awayScore ?? 0} ${params.awayName ?? ''}`;
    case 'fatigue_tiredness':
      return pickRandom(FATIGUE_TIREDNESS);
    case 'substitution': {
      const teamName = params.teamName ?? 'the team';
      return pickRandom(SUBSTITUTION).replace(/{teamName}/g, teamName);
    }
    case 'set_piece_award':
      return `${params.phaseName ?? 'Set piece'} awarded to ${params.teamName ?? 'the team'}.`;
    case 'scrum_reset_cap':
      return pickRandom(SCRUM_RESET_CAP);
    case 'try_location_central':
      return pickRandom(TRY_LOCATION_CENTRAL);
    case 'try_location_close':
      return pickRandom(TRY_LOCATION_CLOSE);
    case 'try_location_wide':
      return pickRandom(TRY_LOCATION_WIDE);
    case 'try_location_corner':
      return pickRandom(TRY_LOCATION_CORNER);
    case 'tmo_intervenes':
      return pickRandom(TMO_INTERVENES);
    case 'tmo_reviewing':
      return pickRandom(TMO_REVIEWING);
    case 'tmo_decision_no_card':
      return pickRandom(TMO_DECISION_NO_CARD);
    case 'tmo_decision_yellow':
      return pickRandom(TMO_DECISION_YELLOW);
    case 'tmo_decision_red_20':
      return pickRandom(TMO_DECISION_RED_20);
    case 'card_yellow':
      return pickRandom(CARD_YELLOW);
    case 'card_red_20': {
      const teamName = params.teamName ?? 'the team';
      return pickRandom(CARD_RED_20).replace(/{teamName}/g, teamName);
    }
    case 'card_red_full': {
      const teamName = params.teamName ?? 'the team';
      return pickRandom(CARD_RED_FULL).replace(/{teamName}/g, teamName);
    }
    case 'sin_bin_returned': {
      const teamName = params.teamName ?? 'the team';
      return pickRandom(SIN_BIN_RETURNED).replace(/{teamName}/g, teamName);
    }
    case 'red_20_replacement_done': {
      const teamName = params.teamName ?? 'the team';
      return pickRandom(RED_20_REPLACEMENT_DONE).replace(/{teamName}/g, teamName);
    }
    case 'red_20_no_replacement': {
      const teamName = params.teamName ?? 'the team';
      return pickRandom(RED_20_NO_REPLACEMENT).replace(/{teamName}/g, teamName);
    }
    case 'team_22_warning':
      return pickRandom(TEAM_22_WARNING);
    case 'injury_off':
      return pickRandom(INJURY_OFF);
    case 'injury_replacement_done': {
      const teamName = params.teamName ?? 'the team';
      return pickRandom(INJURY_REPLACEMENT_DONE).replace(/{teamName}/g, teamName);
    }
    case 'injury_no_replacement': {
      const teamName = params.teamName ?? 'the team';
      return pickRandom(INJURY_NO_REPLACEMENT).replace(/{teamName}/g, teamName);
    }
  }
}
