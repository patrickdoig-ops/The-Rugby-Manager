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
  cover_tackle: [
    '…but {secondary} sweeps across and hauls {primary} down before the line!',
    '{secondary} closes the gap and makes the saving tackle on {primary}.',
    '{primary} is finally brought down by {secondary} — last line of defence holds.',
    'Tremendous recovery tackle from {secondary} — he stops {primary} in his tracks.',
  ],
  line_break_try: [
    'TRY! {primary} finds the line and goes over! {side} have their points!',
    'TRY! {primary} is through and touches down — {side} score!',
    'TRY! {primary} beats the cover and goes over in the corner!',
    'TRY! {primary} races clear and there\'s no stopping him — {side} score!',
  ],
  dominant_carry_try: [
    'TRY! {primary} crashes over the line with {secondary} dragged along — {side} score!',
    'TRY! {primary} bashes through the last tackle and grounds it — {side} have it!',
    'TRY! {primary} drives over from close range — {side} score in the carry!',
    'TRY! {primary} powers through {secondary} and touches down — {side} score!',
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
  pick_and_go_play_on: [
    '{primary} picks from the base and drives into contact.',
    '{primary} takes it short off the ruck — quick recycle for {side}.',
    '{primary} picks and goes, dragging in defenders.',
    'Forward pod work from {side}: {primary} drives a metre or two.',
  ],
  pick_and_go_dominant_carry: [
    '{primary} picks at the base and crashes over the gain line — strong carry.',
    '{primary} drives 2-3 metres from a pick-and-go. Front-foot ball for {side}.',
    'Powerful pick from {primary}, defenders dragged back behind the ruck.',
    '{primary} picks and goes hard — {side} on the front foot.',
  ],
  pick_and_go_dominant_tackle: [
    '{secondary} wraps {primary} up at the ruck edge — no momentum on the pick.',
    '{secondary} reads the pick-and-go and stops {primary} dead.',
    '{primary} picks but {secondary} is straight in to lock him up.',
    '{secondary} drives {primary} back at the base — {defside} win the collision.',
  ],
  high_tackle_penalty: [
    // Templates avoid referencing {primary} / {secondary} — both are
    // already named in the preceding carry-outcome step, and the
    // CommentaryFeed dedupe pass strips repeated names to "he",
    // which mangled "goes in high on he" output. {side} is the attacking
    // team (the penalty recipient); {defside} (the offender) is omitted.
    'That looked high! The whistle blows immediately — penalty {side}.',
    'High! The referee\'s arm is straight up — penalty to {side}.',
    'No arms, high contact — referee comes back for the penalty. {side} get it.',
    'Arm swings high around the head. {side} have the penalty.',
  ],
  obstruction_penalty: [
    '{primary} steps into the defender as the ball goes out the back — obstruction! Penalty {side}.',
    'The referee spots the block from {primary} on the wide screen — obstruction. {side} get the penalty.',
    'Crossing! {primary} runs the decoy line straight into the cover. {side} have the penalty.',
    '{primary} drifts across the defender as the ball is shipped wide. Obstruction — {side} are awarded the penalty.',
  ],
  interception: [
    'INTERCEPTION! {primary} reads the pass from {secondary} and picks it off!',
    '{primary} jumps the line — intercepts the pass from {secondary}! He\'s away!',
    'Picked off! {secondary} throws it straight to {primary} — and the cover is way back!',
    '{primary} steps into the channel and snatches it out of the air!',
  ],
  offload_attempt: [
    '{primary} gets the offload away to {secondary} in the tackle!',
    'Out of contact — {primary} pops it up to {secondary} before going to ground!',
    '{primary} keeps the ball alive, finding {secondary} on the shoulder!',
    'Brilliant hands from {primary} — offload in the tackle to {secondary}!',
  ],
  offload_knock_on: [
    '{primary} can\'t take the offload from {secondary}! Knock-on — scrum awarded.',
    'The offload doesn\'t stick — {primary} fumbles it after {secondary} unloads. Knock-on.',
    '{secondary} gets the offload away but {primary} spills it forward. Scrum to the opposition.',
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
  cover_tackle: [
    '…but {secondary} scrambles across to drag {primary} down short of the line!',
    'Brilliant cover defence from {secondary} — he finishes the tackle on {primary}.',
    '{primary} is hauled in by {secondary} — the last line of defence does its job.',
    '{secondary} reads the danger and makes the cover tackle on {primary}.',
  ],
  line_break_try: [
    'TRY! {primary} explodes off the set piece and goes over! {side} score!',
    'TRY! First-phase perfection from {side} — {primary} touches down!',
    'TRY! {primary} breaks the line from the set piece and scores!',
    'TRY! {side} carve through with their first-phase play — {primary} goes over!',
  ],
  dominant_carry_try: [
    'TRY! {primary} crashes through {secondary} off the set piece — {side} score!',
    'TRY! Strike move pays off — {primary} bashes over the line!',
    'TRY! {primary} powers across the chalk from close range — {side} have it!',
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
  high_tackle_penalty: [
    // See PHASE_PLAY / high_tackle_penalty comment — names are stripped
    // mid-clause by the CommentaryFeed dedupe when the preceding carry
    // step already mentioned both players.
    'High tackle off the set piece! Straight to the penalty for {side}.',
    'Caught high on the first-phase tackle — referee blows it up. {side} have the penalty.',
    'No wrap, high contact! {side} get the penalty from the set-piece play.',
  ],
  obstruction_penalty: [
    '{primary} blocks the inside cover on the first-phase strike move — obstruction! Penalty {side}.',
    'The pre-rehearsed strike runs a forward into the defender — referee spots {primary}. Penalty {side}.',
    'Crossing off the set piece — {primary} drifts into the defender\'s line. {side} have it.',
    '{primary} screens for the receiver and takes a defender out illegally. Obstruction — {side} get the penalty.',
  ],
  interception: [
    'INTERCEPTION off the set piece! {primary} reads {secondary}\'s pass perfectly and picks it off!',
    '{primary} jumps the line on the first-phase strike — intercepts {secondary}\'s pass!',
    'The pre-rehearsed move is read by {primary} — he gets in front of the receiver and snatches the ball!',
  ],
  offload_attempt: [
    '{primary} gets the offload away to {secondary} off the set-piece strike!',
    'Out of the tackle — {primary} finds {secondary} with a clever offload!',
    '{primary} keeps the move alive, offloading to {secondary} on the run!',
  ],
  offload_knock_on: [
    '{primary} drops the offload from {secondary} — knock-on off the set piece!',
    'The first-phase offload doesn\'t stick — {primary} spills it forward. Scrum.',
    '{secondary} pops it up but {primary} can\'t hold on. Knock-on.',
  ],
};

const KICK_RETURN: PhaseBank = {
  kick_decision: [
    '{side} opt to kick rather than run from the return.',
    '{side} choose to kick it on from the return rather than carry.',
    'Rather than attack from the return, {side} look to kick for field position.',
  ],
  kick_decision_regather: [
    '{side} kick again immediately after regathering.',
    'No attempt to carry — {side} kick on after collecting their own kick.',
    '{side} recycle possession straight back into the air.',
  ],
  line_break: [
    '{primary} is through! He\'s turned the return into a full counter-attack!',
    'Superb counter from {primary} — he\'s broken the cover and he\'s running into space!',
    '{primary} makes a line break from the return! {side} are flying!',
    '{primary} sidesteps the first chaser and bursts clear! The return has turned into something special!',
  ],
  cover_tackle: [
    '…but the last chaser, {secondary}, gets across and brings {primary} down!',
    '{secondary} tracks back and makes the saving tackle on {primary}.',
    'The cover from {defside} arrives — {secondary} hauls {primary} to ground.',
    '{primary} is dragged down by {secondary} — the counter-attack is halted.',
  ],
  line_break_try: [
    'TRY! {primary} turns the return into points — an outstanding counter-attack!',
    'TRY! Counter-attack brilliance from {primary} — they\'ve scored from nothing!',
    'TRY! {primary} beats the cover on the return and goes over! {side} score!',
    'TRY! {primary} is untouchable on the return — he races clear and touches down!',
  ],
  dominant_carry_try: [
    'TRY! {primary} bulldozes through {secondary} on the return and grounds it!',
    'TRY! {primary} carries hard from the kick return and powers over the line!',
    'TRY! {primary} drives over from the return — {side} cap the counter with points!',
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
  high_tackle_penalty: [
    // See PHASE_PLAY / high_tackle_penalty comment — keep these
    // free of player-name backrefs.
    'A chaser flies in high on the returner! Penalty {side} — the arm swung up.',
    'Reckless chase, contact around the neck on the return. Penalty {side}.',
    'High tackle on the kick return! Hit above the line — {side} get the penalty.',
  ],
  offload_attempt: [
    '{primary} offloads out of contact on the return — {secondary} takes it on!',
    'Counter-attack rolls on — {primary} pops it to {secondary} in the tackle!',
    '{primary} keeps the return alive with an offload to {secondary}!',
  ],
  offload_knock_on: [
    '{primary} drops the offload on the return! Knock-on — scrum awarded.',
    'The offload doesn\'t stick — {primary} fumbles it from {secondary}. Scrum.',
    '{secondary} unloads but {primary} can\'t handle it on the counter. Knock-on.',
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
    'The kick-off is gathered neatly by {primary}. Great start for {defside}.',
    'Superb hands from {primary} — {defside} are in possession and ready to attack.',
  ],
  knock_on: [
    '{primary} drops the kick-off — a knock-on! Scrum to the kicking team.',
    'Oh no! {primary} fumbles the catch — knock-on! The kicking side wins the scrum.',
    '{primary} can\'t hold it under pressure — knock-on! Scrum awarded to the kicking side.',
  ],
  poor_kick: [
    '{primary}\'s kick-off falls short of the 10-metre line — scrum to {defside} at halfway.',
    'The kick-off from {primary} doesn\'t travel 10 metres. Scrum awarded to {defside}.',
    'Short kick-off from {primary} fails the 10-metre test — {defside} get the scrum at halfway.',
  ],
  short_kick_retain: [
    'Clever short kick-off and {primary} wins it back! {side} retain possession!',
    'What a restart! The short kick catches the opposition flat — {primary} regathers!',
    '{primary} chases the short kick and claims it — a perfectly executed restart!',
  ],
};

const DROP_OUT_22: PhaseBank = {
  announce: [
    '{primary} drops back to the 22 to restart play.',
    '{side} take the drop-out from their own 22 — {primary} on the boot.',
    '{primary} sets himself on the 22 for the drop-out.',
  ],
  clean_receive: [
    '{primary} takes the drop-out cleanly — {defside} have possession in good field position.',
    'The drop-out hangs in the air and {primary} pouches it. Strong attacking platform for {defside}.',
    'Lovely catch from {primary} off the drop-out — {defside} look to attack.',
  ],
  knock_on: [
    '{primary} drops the catch off the drop-out — knock-on! Scrum to the kicking side.',
    'Spilled by {primary} under pressure from {secondary} — knock-on from the drop-out.',
    '{primary} can\'t hold it — the drop-out is fumbled and the kicking team get the scrum.',
  ],
  poor_kick: [
    '{primary}\'s drop-out fails to clear the 22 — scrum to {defside} for the infringement.',
    'A poor drop-kick from {primary} doesn\'t make the 22m line. {defside} get the put-in.',
    'Shanked drop-out from {primary} — doesn\'t travel far enough. Scrum to {defside}.',
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
    'Turnover! {secondary} wins the jackal and {defside} have possession!',
    'Brilliant work at the breakdown from {secondary} — it\'s a steal!',
    '{secondary} is over the ball brilliantly — referee says good turnover!',
  ],
  penalty_defending: [
    'Penalty! The referee spots the infringement at the ruck — {defside} awarded.',
    '{primary} is caught holding on — penalty to {defside}!',
    'Hands in the ruck! Penalty awarded to {defside} for the infringement.',
  ],
  not_rolling_away_penalty: [
    '{primary} can\'t get out of the way after the tackle — penalty {side}.',
    'Not rolling away! {primary} is stuck in the tackle zone. Referee blows it up — penalty {side}.',
    '{primary} hangs on after the tackle. Whistle goes — {side} have the penalty.',
    'The tackler is slow to release — penalty {side} for not rolling away.',
  ],
  offside_at_ruck_penalty: [
    'Offside! {primary} is ahead of the last foot as the ball comes back — penalty {side}.',
    'The referee spots {primary} creeping up offside at the ruck. Penalty {side}.',
    'Up too quickly off the line! {primary} is penalised for offside at the breakdown — {side} get it.',
    '{primary} is off his feet and offside — referee\'s arm goes up. Penalty {side}.',
  ],
  dangerous_cleanout_penalty: [
    '{primary} goes in dangerously at the clear-out — off his feet and at the head. Whistle blown.',
    'Reckless clear-out from {primary}! Penalty — and they\'ll want a look at this one.',
    '{primary} hits the jackal late and high in the clean-out. Penalty {defside} — the referee is going upstairs.',
    'The cleanout from {primary} was straight off the legs! Referee blows the whistle and signals to the TMO.',
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
};

const MAUL: PhaseBank = {
  maul_won: [
    '{side} drive the maul forward — big work from the pack with {primary} at the back.',
    'The maul is set and it\'s rumbling on! {side} gain valuable ground.',
    'Powerful drive from {side} — the defending pack can\'t halt the momentum.',
    '{primary} controls at the back as the maul trundles up the pitch.',
  ],
  maul_held: [
    '{defside} stop the maul dead in its tracks — ball locked in, scrum turnover!',
    'The maul collapses to a halt — referee calls "use it" but the ball isn\'t there. Turnover scrum.',
    'Brilliant defensive work — {primary} and his pack hold the maul up and earn the turnover scrum.',
  ],
  maul_collapse_penalty: [
    'The maul is brought down illegally! {primary} is cited — penalty to the attacking side.',
    'Referee\'s arm goes up — {primary} pulled the maul down. Penalty awarded.',
    'Cynical play from {primary} — collapsing the maul under pressure. Penalty.',
  ],
  maul_try: [
    'Over they go! {primary} grounds it at the back of a driving maul!',
    'TRY! {primary} crashes over from the back of the maul!',
    'The maul rumbles over the line — {primary} touches down for the try!',
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
  box_kick_to_touch: [
    'Lovely touch-finder from {primary} — deep into opposition territory.',
    '{primary} angles the box kick into touch — pressure off, territory gained.',
    'Smart exit from {primary} — finds touch and the danger is cleared.',
  ],
  defend_knock_on: [
    '{secondary} chases hard and forces the fumble — knock-on! Scrum to {side}.',
    '{secondary} gets right under the kick — the ball is spilled! Scrum to {side}.',
    'Brilliant chasing from {secondary} forces the error — scrum to {side}.',
  ],
  defend_catch_contested: [
    '{secondary} claims {primary}\'s box kick under real pressure — {defside} turn it over.',
    'Good hands from {secondary} despite the chase — {defside} collect and clear.',
    '{secondary} takes the contested ball cleanly — {defside} win possession.',
  ],
  defend_catch: [
    '{primary}\'s box kick is gathered comfortably by {secondary} — possession to {defside}.',
    'The box kick from {primary} lacks depth — {secondary} collects easily. {defside} in possession.',
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
    'The kick doesn\'t find touch — {secondary} gathers and {defside} are in possession.',
    '{primary}\'s kick is taken on the full by {secondary}. {defside} look to counter.',
    'Gathered by {secondary} — {defside} come away with the ball.',
  ],
  fifty_twenty_two_attempt_failed_touch: [
    '{primary} was looking for the 50:22 but the kick lands in touch short of the 22 — {defside} get the throw.',
    'Aimed at the corner for the 50:22, {primary}\'s kick finds touch but not where they wanted.',
    'Good kick from {primary} but the 50:22 doesn\'t come off — the lineout\'s the wrong way round.',
  ],
  fifty_twenty_two_attempt_failed_caught: [
    '{primary} goes for the 50:22 but {secondary} is in position and gathers it in.',
    'The 50:22 attempt from {primary} comes up short — {secondary} fields it cleanly.',
    'Brilliant cover from {secondary} — {primary}\'s 50:22 attempt is caught, and the counter-attack is on.',
  ],
  cross_field_caught: [
    'Cross-field kick from {primary} — and {secondary} climbs to take it! {side} are in space!',
    'Beautiful cross-field ball from {primary} and {secondary} reels it in! Huge opportunity!',
    '{primary} sends it cross-field for {secondary} — gathered cleanly on the wing!',
  ],
  cross_field_contested: [
    'Cross-field kick from {primary} but {secondary} reads it and gathers safely.',
    '{secondary} times the jump well to claim {primary}\'s cross-field ball.',
    'The cross-field doesn\'t come off — {secondary} is in position and brings it down.',
  ],
  cross_field_dead: [
    'The cross-field from {primary} goes into touch — opposition lineout.',
    '{primary} overcooks the cross-field — it sails out without anyone in chase.',
    'Knocked on in the contest — the cross-field from {primary} ends in a scrum.',
  ],
  grubber_regathered: [
    'Clever grubber from {primary} — and {secondary} pounces on it!',
    '{primary} threads a grubber through the line, gathered by {secondary} — that\'s class!',
    'Grubber from {primary}, perfect weight — {secondary} picks it up at full pace.',
  ],
  grubber_collected: [
    'Grubber from {primary} but {secondary} fields it tidily.',
    'The grubber sits up nicely for {secondary} — turnover.',
    '{primary}\'s grubber doesn\'t skip past the cover — {secondary} collects.',
  ],
  grubber_dead: [
    'Grubber from {primary} runs dead — scrum to the opposition.',
    'The grubber bounces awkwardly and is knocked on. Scrum down.',
    '{primary}\'s grubber finds no chaser and rolls out of play.',
  ],
};

const TRY_SCORED: PhaseBank = {
  try_lead: [
    '{primary} touches down — and {side} take the lead!',
    'What a score from {primary}! {side} are in front!',
    '{primary} crashes over — {side} snatch the lead!',
  ],
  try_extend_lead: [
    '{primary} crashes over — {side} extending their advantage!',
    '{primary} touches down — the lead is growing for {side}!',
    'More misery for the opposition as {primary} goes over!',
  ],
  try_level: [
    '{primary} touches down — and {side} draw level!',
    'A brilliant finish from {primary}! The scores are level!',
    '{primary} scores and it\'s all square! This match is wide open!',
  ],
  try_trail: [
    '{primary} goes over — {side} still pulling one back!',
    'A much needed score from {primary}! {side} cutting the deficit!',
    '{primary} crashes over — {side} giving themselves a chance!',
    '{primary} squeezes over! {side} closing the gap!',
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
    '{primary} finds touch beautifully — {side} have a lineout up the field.',
  ],
  kick_to_touch_close: [
    'Great kick from {primary} — only {metres}m from the opposition try line.',
    '{primary} finds touch superbly — the lineout is just {metres}m from the line.',
    'What a touch-finder from {primary}! {side} have a lineout {metres}m out.',
    'Excellent kick by {primary} — {side} are only {metres}m from the try line.',
  ],
  kick_to_touch_long: [
    'Into touch from {primary} — still {metres}m to go.',
    '{primary} finds touch, but {side} still have {metres}m to cover.',
    'The kick finds touch — the lineout is {metres}m from the opposition line.',
    '{primary} gets the ball into touch — {metres}m from the try line from here.',
  ],
  kick_to_touch_missed: [
    '{primary} aims for touch but the ball stays in field — counter on!',
    'Sliced kick from {primary} — the ball doesn\'t make touch and the opposition gather.',
    '{primary}\'s touch kick falls short — the opposition can run it back.',
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
  [MatchPhase.DropOut22]:      DROP_OUT_22,
  [MatchPhase.PhasePlay]:      PHASE_PLAY,
  [MatchPhase.FirstPhase]:     FIRST_PHASE,
  [MatchPhase.KickReturn]:     KICK_RETURN,
  [MatchPhase.Breakdown]:      BREAKDOWN,
  [MatchPhase.Scrum]:          SCRUM,
  [MatchPhase.Lineout]:        LINEOUT,
  [MatchPhase.Maul]:           MAUL,
  [MatchPhase.BoxKick]:        BOX_KICK,
  [MatchPhase.TacticalKick]:   TACTICAL_KICK,
  [MatchPhase.TryScored]:      TRY_SCORED,
  [MatchPhase.ConversionKick]: CONVERSION_KICK,
  [MatchPhase.Penalty]:        PENALTY,
};
