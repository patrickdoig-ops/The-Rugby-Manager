import { MatchPhase } from '../types/engine';
import type { GameEvent } from '../types/match';

type Templates = Record<string, string[]>;

const TEMPLATES: Partial<Record<MatchPhase, Templates>> & { default: Templates } = {
  [MatchPhase.KickOff]: {
    announce: [
      '{primary} steps up to kick off. The referee blows his whistle — here we go!',
      '{side} restart from the halfway line. {primary} prepares to kick.',
      '{primary} sets the ball on the tee. {side} about to kick off.',
      'Play resumes — {primary} will kick off for {side}.',
    ],
    coin_toss: [
      '{side} win the coin toss and will kick off!',
      'The referee flips the coin — {side} take the toss and elect to kick!',
      'Coin toss goes to {side}. They\'ll start with the kick-off.',
    ],
    clean_receive: [
      '{primary} takes the kick cleanly and looks to set up the first phase.',
      'The kick-off is gathered neatly by {primary}. Great start for {side}.',
      'Superb hands from {primary} — {side} are in possession and ready to attack.',
    ],
    knock_on: [
      '{primary} drops the kick-off — a knock-on! Scrum to the kicking team.',
      'Disaster for {side}! The ball is fumbled by {primary}. The kicking team wins a scrum.',
      '{primary} can\'t hold it under pressure — knock-on! Scrum awarded to the kicking side.',
    ],
    contested: [
      'Tremendous contest in the air! {primary} and {secondary} challenge for the ball.',
      'Both sides up for the kick — {primary} manages to secure it under pressure.',
      'Chaos at the kick-off! {primary} and {secondary} compete fiercely for possession.',
    ],
    poor_kick: [
      'The kick barely travels 10 metres — {primary} re-kicks from the restart zone.',
      'A poor kick-off from {primary}, not reaching the 10-metre line.',
    ],
  },
  [MatchPhase.OpenPlay]: {
    kick_decision: [
      '{side} elect to kick rather than take contact.',
      'Quick thinking from {side} — the ball is kicked rather than carried.',
      '{side} go to the boot, looking to change the point of attack.',
    ],
    knock_on: [
      '{primary} knocks on under pressure! Scrum to {secondary}\'s team.',
      'Unforced error from {primary} — the ball squirts forward. Scrum awarded.',
      'Handling error! {primary} fails to collect and the referee calls knock-on.',
    ],
    line_break: [
      '{primary} breaks through the line! A huge gain for {side}!',
      'Sensational play from {primary} — the defence is beaten completely!',
      '{primary} is through! Nothing but open space ahead!',
    ],
    dominant_carry: [
      '{primary} drives hard into contact, making great ground.',
      'Powerful carry from {primary}, gaining metres against the defence.',
      '{primary} charges forward and the defence is forced back.',
    ],
    dominant_tackle: [
      'Huge hit by {secondary}! He drives {primary} back and wins the collision.',
      '{secondary} absolutely smashes {primary}! No gain there whatsoever.',
      'Monster tackle from {secondary} — {primary} is stopped dead in his tracks.',
    ],
    play_on: [
      '{primary} takes contact and goes to ground. A ruck forms.',
      '{secondary} brings {primary} down — both sides arrive quickly.',
      'Solid carry from {primary} before being tackled. Play continues.',
    ],
  },
  [MatchPhase.Breakdown]: {
    clean_ball: [
      'Quick ball from the ruck! {side} move it wide immediately.',
      'Clean possession secured — {side} on the front foot now.',
      'The ruck is won comfortably — {primary} snipers from the base.',
    ],
    slow_ball: [
      'Slow ball from the breakdown — the defence has time to reset.',
      '{primary} has to be patient at the ruck. Slow ball emerges.',
      'The ball trickles back slowly — {side} will need to recycle.',
    ],
    turnover: [
      'Turnover! {secondary} wins the jackal and {side} have possession!',
      'Brilliant work at the breakdown from {secondary} — it\'s a steal!',
      '{secondary} is over the ball brilliantly — referee says good turnover!',
    ],
    penalty_defending: [
      'Penalty! The referee spots the infringement at the ruck — {side} awarded.',
      '{primary} is caught holding on — penalty to {side}!',
      'Hands in the ruck! Penalty awarded to {side} for the infringement.',
    ],
  },
  [MatchPhase.Scrum]: {
    stable_win: [
      '{side} win clean scrum ball — {primary} picks and goes.',
      'Solid platform from the scrum — good possession for {side}.',
      'The scrum holds firm and {primary} feeds the backs.',
    ],
    wheel: [
      'The scrum wheels! The referee blows the whistle and orders a reset.',
      'A powerful wheel by the defending pack — we\'ll have a reset scrum.',
    ],
    dominant_penalty: [
      'Penalty! The scrum collapses — referee signals against {side}.',
      'The defending pack dominates — {primary} is penalised for going to ground.',
    ],
  },
  [MatchPhase.Lineout]: {
    clean_catch: [
      'Straight ball from the lineout — {primary} takes it cleanly at the tail.',
      'Perfect throw from {secondary}! {primary} claims it above the defenders.',
      'Superb lineout execution — {side} have possession and drive.',
    ],
    steal: [
      '{secondary} steals the lineout! Incredible work against the throw!',
      'Turnover at the lineout — {secondary} outjumps the opposition!',
      'The throw is misjudged — {secondary} gratefully takes possession.',
    ],
    scrappy_knock_on: [
      'Scrappy lineout — the ball is knocked on and {side} lose possession.',
      'The jumper can\'t hold it — knock-on awarded, scrum to the opposition.',
    ],
  },
  [MatchPhase.BoxKick]: {
    announce: [
      '{primary} picks up from the back of the ruck — he\'s going to box kick!',
      '{primary} shapes to hoist it — box kick going up!',
      'Slow ball at the ruck — {primary} is set, he\'s going to box kick upfield!',
      '{primary} at the base — up it goes! A box kick from the scrum-half!',
    ],
    attack_retain: [
      '{secondary} wins the aerial contest! Superb kick from {primary} — possession retained!',
      '{secondary} outjumps the fullback — {primary}\'s box kick pays off! {side} keep the ball.',
      'What a chase from {secondary}! The ball is claimed and {side} stay in possession!',
    ],
    defend_knock_on: [
      'The fullback fumbles under pressure from {secondary}! Knock-on — scrum to {side}.',
      '{secondary} gets right in the fullback\'s face — the ball is spilled! Scrum to {side}.',
      'Brilliant chasing from {secondary}! The fullback spills it — {side} win a scrum.',
    ],
    defend_catch_contested: [
      'The fullback claims {primary}\'s box kick under real pressure — {side} turn it over.',
      'Good hands from the fullback despite the chase — {side} collect and clear.',
      'The fullback takes the contested ball cleanly — {side} win possession.',
    ],
    defend_catch: [
      '{primary}\'s box kick is gathered comfortably by the fullback — possession to {side}.',
      'The box kick from {primary} lacks depth — the fullback collects easily. {side} in possession.',
      'Safe hands from the fullback — {primary}\'s box kick turns over.',
    ],
    knock_on: [
      'The fullback spills {primary}\'s box kick! Knock-on — scrum to {side}!',
      '{primary}\'s kick bounces awkwardly — the fullback can\'t hold on! Scrum ball.',
      'Disaster for the fullback — {primary}\'s box kick wrong-foots them completely! Scrum to {side}.',
    ],
  },
  [MatchPhase.TacticalKick]: {
    good_kick: [
      '{primary} finds the right corner — excellent tactical kick to pin them back.',
      'Lovely kick from {primary}, finding touch upfield.',
      'A deep kick from {primary} finds touch — putting pressure on the opposition.',
    ],
    out_on_the_full: [
      'Disaster! {primary} kicks directly out on the full. The lineout comes all the way back.',
      'A poor kick from {primary} goes straight out on the full. Costly mistake.',
      '{primary} slices the kick out on the full! No ground gained.',
    ],
    fifty_twenty_two: [
      'Brilliant! A 50:22 from {primary}! It bounces into touch and {side} retain the throw-in!',
      'What a kick from {primary}! A perfect 50:22 — {side} get the lineout deep in enemy territory.',
      'Incredible vision from {primary} to find the 50:22! An attacking lineout for {side}.',
    ],
    poor_kick: [
      'The kick from {primary} doesn\'t find touch — easy ball for the fullback.',
      'Poor execution from {primary} — the kick falls straight to {secondary}.',
    ],
    knock_on_catch: [
      '{secondary} drops the catch under pressure — knock-on! Scrum to {side}.',
      'The high ball beats {secondary}! A knock-on and scrum to {side}.',
    ],
    kick_caught: [
      'The kick doesn\'t find touch — {secondary} gathers and {side} are in possession.',
      '{primary}\'s kick is taken on the full by {secondary}. {side} look to counter.',
      'Gathered by {secondary} — {side} come away with the ball.',
    ],
  },
  [MatchPhase.TryScored]: {
    try: [
      'TRY! {primary} crashes over in the corner! Magnificent score!',
      'TRY! {primary} touches down! The crowd erupts!',
      'TRY! What a finish from {primary} — {side} take the lead!',
      'TRY! {primary} squeezes over in the corner! Superb support play!',
    ],
  },
  [MatchPhase.ConversionKick]: {
    success: [
      '{primary} steps up and slots the conversion — 7 points on the board!',
      'Right between the posts from {primary}! Excellent kicking.',
      'Straight through the uprights — {primary} adds the extras!',
    ],
    miss: [
      '{primary}\'s conversion drifts wide — only 5 points from that score.',
      'Just wide! {primary} fails to add the conversion.',
    ],
  },
  [MatchPhase.Penalty]: {
    kick_for_goal: [
      '{primary} lines up the kick at goal... it\'s good! Three points!',
      'The penalty is slotted between the posts by {primary}. Three more!',
    ],
    kick_to_touch: [
      '{primary} kicks to the corner — {side} opt for the lineout.',
      'Into touch from {primary} — the lineout is set deep in opposition territory.',
    ],
    tap_and_go: [
      '{primary} taps and goes — {side} opt to run it!',
      'Quick tap taken — {side} are looking to exploit space.',
    ],
    miss: [
      'Oh! {primary}\'s penalty attempt falls short — no score from that.',
      'The kick is wide! {primary} fails to add the points.',
    ],
  },
  [MatchPhase.HalfTime]: {
    whistle: [
      'That\'s the half-time whistle! The teams head into the dressing rooms.',
      'Half time! Both sides regroup as the referee calls a halt to proceedings.',
    ],
  },
  [MatchPhase.FullTime]: {
    whistle: [
      'Full time! What a match — the final whistle brings proceedings to a close.',
      'The referee blows for full time! An incredible 80 minutes of rugby.',
    ],
  },
  default: {
    generic: [
      'Play continues.',
      'The match moves on.',
      'Action resumes.',
    ],
  },
};

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function interpolate(template: string, event: GameEvent): string {
  return template
    .replace(/{primary}/g,   event.primaryPlayer?.name   ?? 'the player')
    .replace(/{secondary}/g, event.secondaryPlayer?.name ?? 'the defender')
    .replace(/{side}/g,      event.sideName);
}

export function getCommentary(event: GameEvent, key: string): string {
  const phaseTemplates = TEMPLATES[event.phase] ?? TEMPLATES.default;
  const bank = phaseTemplates[key] ?? TEMPLATES.default.generic;
  return interpolate(pick(bank), event);
}
