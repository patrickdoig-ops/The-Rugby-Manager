import { MatchPhase } from '../../../types/engine';
import type { PhaseOutcomeKey } from '../../../types/narration';

// Per-phase template banks. Keyed by MatchPhase → PhaseOutcomeKey → string[].
// Templates use {primary}, {secondary}, {side}, {defside} tokens — the renderer
// interpolates them.

export const FALLBACK_GENERIC: readonly string[] = [
  'Play continues.',
  'The match moves on.',
  'Action resumes.',
];

type PhaseBank = Partial<Record<PhaseOutcomeKey, readonly string[]>>;

const PHASE_PLAY: PhaseBank = {
  kick_decision: [
    '{side} elect to kick from the phase rather than take contact.',
    'Quick switch from {side} — they go to the boot instead of carrying.',
    '{side} change the point of attack with a kick from the breakdown.',
  ],
  out_the_back: [
    '{primary} draws the defender and goes out the back to {secondary}, who attacks the line.',
    '{primary} offloads to {secondary} — the ball moves quickly through the phase.',
    'Clever hands from {primary}, finding {secondary} in space out wide.',
    '{primary} pulls it back for {secondary}, who accelerates into the channel.',
  ],
  knock_on: [
    '{primary} loses the ball forward! Knock-on — scrum awarded.',
    'Handling error from {primary} — the ball squirts forward and the referee calls it.',
    '{primary} fumbles under pressure. Knock-on — scrum to the opposition.',
  ],
  line_break: [
    '{primary} finds the gap and he\'s through! {side} have broken {defside}\'s line!',
    'Sensational carry from {primary} — he\'s stepped the cover and he\'s running!',
    '{primary} punches a hole through {defside}\'s defence! A major gain in open play!',
    '{primary} bursts clear! {defside}\'s defensive line is broken — {side} are on the move!',
  ],
  line_break_try: [
    'TRY! {primary} finds the line and goes over! {side} have their points!',
    'TRY! {primary} is through and touches down — {side} score!',
    'TRY! {primary} beats the cover and goes over in the corner!',
    'TRY! {primary} races clear and there\'s no stopping him — {side} score!',
  ],
  dominant_carry: [
    '{primary} drives hard into contact, dragging defenders with him.',
    '{primary} takes it at the line and wins the collision — forward momentum for {side}.',
    'Physical carry from {primary}. He makes good metres and stays on his feet.',
    '{primary} crashes into contact and drives forward. Strong work.',
  ],
  dominant_tackle: [
    'Big read by {secondary}! He drives {primary} backwards — a dominant tackle.',
    '{secondary} cleans up {primary} with a thunderous hit. No gain there.',
    '{defside} win this one — {secondary} stops {primary} dead and drives him back.',
    '{secondary} times the tackle perfectly and {primary} goes nowhere.',
  ],
  play_on: [
    '{primary} takes contact and the ruck forms quickly.',
    '{secondary} brings {primary} down — {side} recycle and go again.',
    'Hard carry from {primary}. He earns a few metres before {secondary} makes the tackle.',
    '{primary} goes to ground after contact. The ball is available.',
  ],
};

const FIRST_PHASE: PhaseBank = {
  kick_decision: [
    '{side} choose to kick rather than attack from the set piece.',
    'Off the top and they kick — {side} looking for field position.',
    '{side} go to the boot off the set piece, looking to change the game.',
  ],
  crash_ball: [
    '{primary} fixes the first defender and drives it short to {secondary}.',
    'Crash ball! {primary} plays it tight to {secondary}, who takes it at pace.',
    '{primary} sets {secondary} on a hard line — straight into the defensive channel.',
    '{secondary} receives from {primary} and hits the gain line hard.',
  ],
  out_the_back: [
    '{primary} sweeps it wide to {secondary} — {side} going for width off the set piece.',
    '{primary} finds {secondary} out the back and the ball moves quickly.',
    'Gone wide! {primary} releases {secondary} into space.',
    '{primary} goes to width — {secondary} catches and attacks the line.',
  ],
  knock_on: [
    '{primary} loses it forward off the set piece! Scrum awarded.',
    'Knock-on at the first phase — {primary} can\'t hold the pass. Scrum.',
    'Poor hands from {primary} and the ball goes forward! Scrum to the opposition.',
  ],
  line_break: [
    '{primary} bursts through off the top of a set piece! A brilliant running line!',
    'First-phase gold from {side} — {primary} punches through for a line break!',
    '{primary} finds the space and he\'s gone! The set piece has created a huge opportunity!',
    '{primary} splits {defside}\'s defence wide open! Outstanding first-phase execution from {side}!',
  ],
  line_break_try: [
    'TRY! {primary} explodes off the set piece and goes over! {side} score!',
    'TRY! First-phase perfection from {side} — {primary} touches down!',
    'TRY! {primary} breaks the line from the set piece and scores!',
    'TRY! {side} carve through with their first-phase play — {primary} goes over!',
  ],
  dominant_carry: [
    '{primary} takes the ball at pace and drives hard into the defensive line.',
    'Powerful carry from {primary} straight off the set piece — good metres gained.',
    '{primary} hits the gain line and wins the contact. {side} on the front foot.',
    '{primary} crashes into the line and drives forward. Hard to stop.',
  ],
  dominant_tackle: [
    '{secondary} reads the set-piece play perfectly and drives {primary} back.',
    '{defside} hold at the gain line — {secondary} wins the collision with {primary}.',
    'Excellent defensive read from {secondary}. {primary} is stopped before he can get going.',
    'Dominant tackle from {secondary} — the first phase goes nowhere for {side}.',
  ],
  play_on: [
    '{primary} takes contact at the gain line. Both sides compete at the ruck.',
    '{secondary} makes the tackle and {primary} goes to ground. Ball available.',
    'First phase earns a few metres — {primary} goes to ground and {side} recycle.',
    '{primary} carries into contact and {secondary} brings him down. Ruck forms.',
  ],
};

const KICK_RETURN: PhaseBank = {
  kick_decision: [
    '{side} opt to kick rather than run from the return.',
    '{side} choose to kick it on from the return rather than carry.',
    'Rather than attack from the return, {side} look to kick for field position.',
  ],
  line_break: [
    '{primary} is through! He\'s turned the return into a full counter-attack!',
    'Superb counter from {primary} — he\'s broken the cover and he\'s running into space!',
    '{primary} makes a line break from the return! {side} are flying!',
    '{primary} sidesteps the first chaser and bursts clear! The return has turned into something special!',
  ],
  line_break_try: [
    'TRY! {primary} turns the return into points — an outstanding counter-attack!',
    'TRY! Counter-attack brilliance from {primary} — they\'ve scored from nothing!',
    'TRY! {primary} beats the cover on the return and goes over! {side} score!',
    'TRY! {primary} is untouchable on the return — he races clear and touches down!',
  ],
  dominant_carry: [
    '{primary} picks a strong line and drives well into opposition territory on the return.',
    'Powerful return from {primary} — he takes the contact and wins it.',
    '{primary} runs a hard line off the kick return. Great metres for {side}.',
    '{primary} carries hard on the return and comes out on top of the collision.',
  ],
  dominant_tackle: [
    '{secondary} lines up {primary} on the return and drives him back — a dominant tackle.',
    'Big defensive play from {secondary}! He stops {primary}\'s return dead.',
    '{secondary} wins the physical contest and {primary} is driven back. {side} contained.',
    '{primary} meets a wall of resistance — {secondary} puts him down emphatically on the return.',
  ],
  play_on: [
    '{primary} makes ground on the return before {secondary} brings him down.',
    'Good metres from {primary} on the kick return. {secondary} makes the tackle.',
    '{primary} runs it back well before the cover arrives. Ruck forms.',
    '{secondary} makes the tackle on {primary} — solid return but {side} held up.',
  ],
};

const KICK_OFF: PhaseBank = {
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
    'Oh no! {primary} fumbles the catch — knock-on! The kicking side wins the scrum.',
    '{primary} can\'t hold it under pressure — knock-on! Scrum awarded to the kicking side.',
  ],
  poor_kick: [
    '{primary}\'s kick-off falls short of the 10-metre line — scrum to {side} at halfway.',
    'The kick-off from {primary} doesn\'t travel 10 metres. Scrum awarded to {side}.',
    'Short kick-off from {primary} fails the 10-metre test — {side} get the scrum at halfway.',
  ],
  short_kick_retain: [
    'Clever short kick-off and {primary} wins it back! {side} retain possession!',
    'What a restart! The short kick catches the opposition flat — {primary} regathers!',
    '{primary} chases the short kick and claims it — a perfectly executed restart!',
  ],
};

const BREAKDOWN: PhaseBank = {
  clean_ball: [
    'Quick ball from the ruck! {side} move it wide immediately.',
    'Clean possession secured — {side} on the front foot now.',
    'The ruck is won comfortably — {primary} snipers from the base.',
  ],
  slow_ball: [
    'Slow ball from the breakdown — the defence has time to reset.',
    '{side} have to be patient at the ruck. Slow ball emerges.',
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
};

const SCRUM: PhaseBank = {
  stable_win: [
    '{side} win clean scrum ball — solid hooking from {primary}.',
    'Solid platform from the scrum — good possession for {side}.',
    'The scrum holds firm — clean ball, {side} can move it wide.',
  ],
  wheel: [
    'The scrum wheels! The referee blows the whistle and orders a reset.',
    'A powerful wheel by the defending pack — we\'ll have a reset scrum.',
  ],
  attacking_dominant_penalty: [
    'Penalty! {primary} is penalised — {side} have driven them clean off the ball.',
    '{side} destroy the scrum — the referee awards the penalty as {primary} collapses.',
  ],
  defending_dominant_penalty: [
    'Penalty! {primary} is penalised as the scrum collapses under pressure.',
    'The defending pack dominates — {primary} is penalised for going to ground.',
  ],
};

const LINEOUT: PhaseBank = {
  clean_catch: [
    'Straight ball from the lineout — {primary} takes it cleanly at the tail.',
    'Perfect throw from {secondary}! {primary} claims it above the defenders.',
    'Superb lineout execution — {side} have possession and drive.',
  ],
  crooked_throw: [
    'Not straight from {primary}! The referee calls it immediately — scrum to the opposition.',
    '{primary} can\'t find his jumper — the ball goes in crooked. Scrum awarded.',
    'Oh no — {primary}\'s throw is crooked! A simple error hands a scrum to the opposition.',
    'Lineout ball not straight from {primary}! The referee whistles straight away.',
  ],
  steal: [
    '{primary} steals the lineout! Incredible work against the throw!',
    'Turnover at the lineout — {primary} outjumps the opposition!',
    'The throw is misjudged — {primary} gratefully takes possession.',
  ],
  scrappy_knock_on: [
    'Scrappy lineout — the ball is knocked on. Scrum to {side}.',
    '{primary} can\'t hold it — knock-on awarded. Scrum to {side}.',
  ],
};

const BOX_KICK: PhaseBank = {
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
    '{secondary} chases hard and forces the fumble — knock-on! Scrum to {side}.',
    '{secondary} gets right under the kick — the ball is spilled! Scrum to {side}.',
    'Brilliant chasing from {secondary} forces the error — scrum to {side}.',
  ],
  defend_catch_contested: [
    '{secondary} claims {primary}\'s box kick under real pressure — {side} turn it over.',
    'Good hands from {secondary} despite the chase — {side} collect and clear.',
    '{secondary} takes the contested ball cleanly — {side} win possession.',
  ],
  defend_catch: [
    '{primary}\'s box kick is gathered comfortably by {secondary} — possession to {side}.',
    'The box kick from {primary} lacks depth — {secondary} collects easily. {side} in possession.',
    'Safe hands from {secondary} — {primary}\'s box kick turns over.',
  ],
  knock_on: [
    '{secondary} spills {primary}\'s box kick! Knock-on — scrum to {side}!',
    '{primary}\'s kick bounces awkwardly — {secondary} can\'t hold on! Scrum ball.',
    'Disaster for {secondary} — {primary}\'s box kick wrong-foots them completely! Scrum to {side}.',
  ],
};

const TACTICAL_KICK: PhaseBank = {
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
  kick_caught: [
    'The kick doesn\'t find touch — {secondary} gathers and {side} are in possession.',
    '{primary}\'s kick is taken on the full by {secondary}. {side} look to counter.',
    'Gathered by {secondary} — {side} come away with the ball.',
  ],
};

const TRY_SCORED: PhaseBank = {
  try_lead: [
    'TRY! {primary} touches down — and {side} take the lead!',
    'TRY! What a score from {primary}! {side} are in front!',
    'TRY! {primary} crashes over — {side} snatch the lead!',
  ],
  try_extend_lead: [
    'TRY! {primary} crashes over! {side} extending their advantage!',
    'TRY! {primary} touches down — the lead is growing for {side}!',
    'TRY! More misery for the opposition as {primary} goes over!',
  ],
  try_level: [
    'TRY! {primary} touches down — and {side} draw level!',
    'TRY! A brilliant finish from {primary}! The scores are level!',
    'TRY! {primary} scores and it\'s all square! This match is wide open!',
  ],
  try_trail: [
    'TRY! {primary} goes over — {side} pulling one back but still behind!',
    'TRY! A much needed score from {primary}! {side} cutting the deficit!',
    'TRY! {primary} crashes over — {side} giving themselves a chance!',
    'TRY! {primary} squeezes over! {side} closing the gap!',
  ],
};

const CONVERSION_KICK: PhaseBank = {
  success: [
    '{primary} steps up and slots the conversion — 7 points on the board!',
    'Right between the posts from {primary}! Excellent kicking.',
    'Straight through the uprights — {primary} adds the extras!',
  ],
  miss: [
    '{primary}\'s conversion drifts wide — only 5 points from that score.',
    'Just wide! {primary} fails to add the conversion.',
  ],
};

const PENALTY: PhaseBank = {
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
  tap_and_kick_dead: [
    '{primary} taps and kicks the ball dead — {side} run the clock down.',
    'Quick tap, then into touch — {side} are happy to let the whistle blow.',
    '{primary} taps and finds touch — and that brings an end to proceedings!',
  ],
  miss: [
    'Oh! {primary}\'s penalty attempt falls short — no score from that.',
    'The kick is wide! {primary} fails to add the points.',
  ],
};

export const PHASE_BANKS: Partial<Record<MatchPhase, PhaseBank>> = {
  [MatchPhase.KickOff]:        KICK_OFF,
  [MatchPhase.PhasePlay]:      PHASE_PLAY,
  [MatchPhase.FirstPhase]:     FIRST_PHASE,
  [MatchPhase.KickReturn]:     KICK_RETURN,
  [MatchPhase.Breakdown]:      BREAKDOWN,
  [MatchPhase.Scrum]:          SCRUM,
  [MatchPhase.Lineout]:        LINEOUT,
  [MatchPhase.BoxKick]:        BOX_KICK,
  [MatchPhase.TacticalKick]:   TACTICAL_KICK,
  [MatchPhase.TryScored]:      TRY_SCORED,
  [MatchPhase.ConversionKick]: CONVERSION_KICK,
  [MatchPhase.Penalty]:        PENALTY,
};
