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
    case 'try_location_central':
      return pickRandom(TRY_LOCATION_CENTRAL);
    case 'try_location_close':
      return pickRandom(TRY_LOCATION_CLOSE);
    case 'try_location_wide':
      return pickRandom(TRY_LOCATION_WIDE);
    case 'try_location_corner':
      return pickRandom(TRY_LOCATION_CORNER);
  }
}
