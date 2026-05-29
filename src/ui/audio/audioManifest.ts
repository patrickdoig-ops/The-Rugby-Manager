// Audio asset manifest — the single source of truth for every sound the game
// wants to play and the in-game moment that fires it.
//
// This is a *spec*, not a player. It exists so (a) a sound designer / asset
// sourcing pass has an exact shopping list with a brief per file, and (b) a
// future SoundManager upgrade can drive playback straight off this table
// instead of scattering hard-coded `playCue(...)` calls.
//
// Triggers reference the real engine taxonomy: `MatchEvent['type']` and the
// `MatchPhase` enum are imported so a renamed event/phase breaks the build
// here rather than silently orphaning a cue. Narration keys, game:* events,
// and screen ids are string literals (no exported union to bind to today).
//
// Each asset carries an `elevenLabsPrompt` — paste it straight into ElevenLabs'
// text-to-sound-effects to generate the cue. Set the ElevenLabs duration to a
// short value for one-shots; for loop:true beds use ElevenLabs' looping option
// and a longer duration.
//
// Nothing imports this yet — see docs at the bottom for the wiring plan.

import { MatchPhase } from '../../types/engine';
import type { MatchEvent } from '../../types/matchEvent';

// ── Channels (future mix buses) ────────────────────────────────────────────
// A rich mix needs independent gain control per family, not one global volume.
//   whistle         — referee, dry, cuts through everything
//   crowd-bed       — continuous looping atmosphere, cross-faded by game state
//   crowd-reaction  — one-shot crowd swells layered over the bed
//   impact          — close-mic'd pitch sounds (tackle, scrum, boot)
//   ui              — interface feedback
//   stinger         — short musical/dramatic accents (cards, TMO, season beats)
//   music           — looping screen themes
export type AudioChannel =
  | 'whistle'
  | 'crowd-bed'
  | 'crowd-reaction'
  | 'impact'
  | 'ui'
  | 'stinger'
  | 'music';

// Sourcing priority. 1 = match-day core (build these first — the match feels
// broken without them); 2 = UI feedback + screen atmosphere; 3 = season /
// narrative flourishes.
export type AudioPriority = 1 | 2 | 3;

// What fires the cue. Discriminated so a future audio router can switch on `on`.
export type AudioTrigger =
  // A MatchEvent passes through applyMatchEvent / the engine:event bus. `when`
  // narrows on a discriminating field of that event (outcome / success / kind).
  | { on: 'matchEvent'; type: MatchEvent['type']; when?: string }
  // A phase transition (PHASE_CHANGED → state.phase). Coarser than matchEvent.
  | { on: 'phase'; phase: MatchPhase }
  // A narration step key (PhaseOutcomeKey / AnnouncementKey) on the GameEvent —
  // the finest grain, matches what CommentaryFeed already reads.
  | { on: 'narrationKey'; key: string }
  // A season-scope event on the bus (game:* — see GameCoordinator).
  | { on: 'gameEvent'; name: string }
  // Screen entry (ScreenRouter.show(id)) — drives music / ambience beds.
  | { on: 'screen'; id: string }
  // Generic UI interaction (button/tile click, toggle, slider).
  | { on: 'ui'; action: string }
  // A derived game-state condition the bed layer cross-fades on (no single
  // event — e.g. "ball inside defending 22 under pressure"). Descriptive only.
  | { on: 'state'; description: string };

export interface AudioAsset {
  /** Stable cue id. Becomes the SoundManager key; also the asset filename stem. */
  id: string;
  /** Path served at runtime, prefixed with the Vite base. Files live in public/audio/. */
  file: string;
  channel: AudioChannel;
  /** True for continuous beds (crowd, music) played on a looping channel. */
  loop: boolean;
  priority: AudioPriority;
  /** What sets it off. */
  trigger: AudioTrigger;
  /** Sound-design brief — what the asset should actually sound like. */
  description: string;
  /** Generation-ready prompt to paste into ElevenLabs text-to-sound-effects. */
  elevenLabsPrompt: string;
  /**
   * How many interchangeable takes to source so repeats don't fatigue the ear.
   * 1 = single file; N = round-robin / random pick at play time. Omit ⇒ 1.
   */
  variants?: number;
}

// Base-relative so cues resolve under both the GitHub Pages sub-path
// (/Rugby-Simulator-/) and the Capacitor native origin (capacitor://localhost).
const AUDIO_DIR = `${import.meta.env.BASE_URL}audio`;

// ════════════════════════════════════════════════════════════════════════════
// TIER 1 — MATCH-DAY CORE
// ════════════════════════════════════════════════════════════════════════════

const WHISTLE: AudioAsset[] = [
  {
    id: 'whistle.stoppage',
    file: `${AUDIO_DIR}/whistle/stoppage.mp3`,
    channel: 'whistle',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KNOCK_ON' },
    description: 'Short single pip. Generic stoppage — knock-on, forward pass, scrum reset. The workhorse whistle.',
    elevenLabsPrompt: 'A single short, sharp pip of a metal pea referee whistle, dry and close, outdoors on a grass sports pitch, no echo or reverb tail',
    variants: 2,
  },
  {
    id: 'whistle.penalty',
    file: `${AUDIO_DIR}/whistle/penalty.mp3`,
    channel: 'whistle',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'PENALTY_AWARDED' },
    description: 'Firm single blast, slightly longer/harder than a stoppage pip — the "that\'s a penalty" tone.',
    elevenLabsPrompt: 'A single firm, authoritative blast of a referee whistle, slightly drawn out and decisive, outdoor stadium, clean and dry',
  },
  {
    id: 'whistle.try',
    file: `${AUDIO_DIR}/whistle/try.mp3`,
    channel: 'whistle',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'TRY_SCORED' },
    description: 'Long single blast + arm-aloft signal feel. Plays under/just before the try roar.',
    elevenLabsPrompt: 'One long, emphatic blast of a referee whistle signalling a score, confident and sustained, outdoor rugby stadium',
  },
  {
    id: 'whistle.half_time',
    file: `${AUDIO_DIR}/whistle/half-time.mp3`,
    channel: 'whistle',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'HALF_TIME_REACHED' },
    description: 'Two/three sharp blasts to end the half.',
    elevenLabsPrompt: 'Two quick sharp blasts of a referee whistle in succession ending a half of play, dry, outdoor pitch',
  },
  {
    id: 'whistle.full_time',
    file: `${AUDIO_DIR}/whistle/full-time.mp3`,
    channel: 'whistle',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'MATCH_ENDED' },
    description: 'Long triple blast — the final whistle. Bigger, more conclusive than half-time.',
    elevenLabsPrompt: 'A long, conclusive triple blast of a referee whistle signalling the end of a match, emphatic and final, outdoor stadium',
  },
];

const CROWD_BED: AudioAsset[] = [
  {
    id: 'crowd.bed.idle',
    file: `${AUDIO_DIR}/crowd/bed-idle.mp3`,
    channel: 'crowd-bed',
    loop: true,
    priority: 1,
    trigger: { on: 'phase', phase: MatchPhase.KickOff },
    description: 'Seamless ~30-60s loop. Low ambient stadium murmur — the baseline bed running the whole match. Cross-faded up to "engaged"/"tension" by state.',
    elevenLabsPrompt: 'A large outdoor stadium crowd at a low idle murmur, tens of thousands of distant voices blended into a gentle continuous hum, occasional faint shout, calm seamless looping background ambience, no music',
  },
  {
    id: 'crowd.bed.engaged',
    file: `${AUDIO_DIR}/crowd/bed-engaged.mp3`,
    channel: 'crowd-bed',
    loop: true,
    priority: 1,
    trigger: { on: 'state', description: 'Open play in progress (PhasePlay / FirstPhase / KickReturn).' },
    description: 'Seamless loop. Mid-level engaged murmur with occasional shouts. Cross-faded in during open play.',
    elevenLabsPrompt: 'A large rugby stadium crowd engaged and attentive during play, mid-level continuous murmur with scattered encouraging shouts and light claps, energetic but not peaking, seamless looping ambience',
  },
  {
    id: 'crowd.bed.tension',
    file: `${AUDIO_DIR}/crowd/bed-tension.mp3`,
    channel: 'crowd-bed',
    loop: true,
    priority: 1,
    trigger: { on: 'state', description: 'Attack inside opposition 22, goal-line defence, kick at goal run-up, or clock-in-red.' },
    description: 'Seamless loop. Rising anticipatory swell — building "ooooh" energy. Cross-faded in for high-pressure passages.',
    elevenLabsPrompt: 'A large stadium crowd rising in nervous anticipation, a sustained building collective "ooooh", expectant tension swelling and holding, seamless looping ambience',
  },
];

const CROWD_REACTION: AudioAsset[] = [
  {
    id: 'crowd.try.routine',
    file: `${AUDIO_DIR}/crowd/try-routine.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'TRY_SCORED' },
    description: 'Big celebratory roar for a try. Default try reaction (replaces the current single crowdRoar cue).',
    elevenLabsPrompt: 'A large rugby crowd erupting into a big celebratory roar with cheering and applause as a try is scored, thousands of joyful fans, swelling then sustaining',
    variants: 2,
  },
  {
    id: 'crowd.try.huge',
    file: `${AUDIO_DIR}/crowd/try-huge.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'try_level' },
    description: 'Eruption — bigger and longer than the routine roar. For lead-changing / equalising tries (try_level, try_trail→lead, try_extend_lead). Pick over routine when the score context is dramatic.',
    elevenLabsPrompt: 'A massive stadium eruption, deafening ecstatic roar and wild cheering as a crucial last-gasp try is scored, tens of thousands of fans on their feet, louder and longer than an ordinary cheer',
  },
  {
    id: 'crowd.goal.success',
    file: `${AUDIO_DIR}/crowd/goal-success.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KICK_AT_GOAL_RESOLVED', when: 'success === true (conversion / penalty goal made)' },
    description: 'Cheer + applause as the kick sails over. Also fires for CONVERSION_KICKED / PENALTY_GOAL_KICKED success.',
    elevenLabsPrompt: 'A stadium crowd cheering and breaking into applause as a goal kick sails between the posts, relieved and happy, swelling clapping',
  },
  {
    id: 'crowd.goal.miss',
    file: `${AUDIO_DIR}/crowd/goal-miss.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KICK_AT_GOAL_RESOLVED', when: 'success === false (kick missed)' },
    description: 'Collective groan / deflation as the kick drifts wide.',
    elevenLabsPrompt: 'A large crowd letting out a collective disappointed groan and sigh as a goal kick drifts wide of the posts, a deflating "awww"',
  },
  {
    id: 'crowd.surge.linebreak',
    file: `${AUDIO_DIR}/crowd/surge-linebreak.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'CARRY_RESOLVED', when: "outcome === 'line_break'" },
    description: 'Rising "ooooh" surge as the line is broken. Also good for INTERCEPTION.',
    elevenLabsPrompt: 'A rugby crowd letting out a rising excited "ooooh" surge as the defensive line is broken, anticipation building rapidly toward a roar',
  },
  {
    id: 'crowd.cheer.turnover',
    file: `${AUDIO_DIR}/crowd/cheer-turnover.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'TURNOVER_AT_BREAKDOWN' },
    description: 'Sharp appreciative cheer for a jackal turnover / steal.',
    elevenLabsPrompt: 'A sharp, sudden appreciative cheer from a rugby crowd as the ball is stolen back at the breakdown, an approving roar with quick claps',
  },
  {
    id: 'crowd.oooh.bighit',
    file: `${AUDIO_DIR}/crowd/oooh-bighit.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'CARRY_RESOLVED', when: "outcome === 'dominant_tackle'" },
    description: 'Crowd "ooooh" for a big dominant tackle / collision.',
    elevenLabsPrompt: 'A crowd reacting with a sharp collective "ooooh" to a huge bone-crunching tackle, impressed and wincing in unison',
  },
  {
    id: 'crowd.groan',
    file: `${AUDIO_DIR}/crowd/groan.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'HANDLING_ERROR' },
    description: 'Disappointed groan for a handling error / knock-on by the home side. Lower-key than the goal-miss groan.',
    elevenLabsPrompt: 'A large crowd letting out a low, brief disappointed groan after a fumbled handling mistake, a subdued collective sigh',
  },
  {
    id: 'crowd.clap_build',
    file: `${AUDIO_DIR}/crowd/clap-build.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'kicker_steps_up' },
    description: 'Rhythmic anticipatory clap/hush as the kicker steps up (KICK_AT_GOAL_STARTED). Settles into a hush before the strike.',
    elevenLabsPrompt: 'A stadium crowd doing a rhythmic slow handclap that builds anticipation then falls away into an expectant hush, as a goal kicker prepares to strike',
  },
  {
    id: 'crowd.gasp.card',
    file: `${AUDIO_DIR}/crowd/gasp-card.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'CARD_ISSUED' },
    description: 'Gasp turning to boos/jeers as the card comes out. Use a heavier mix for red_20 than yellow.',
    elevenLabsPrompt: 'A crowd reacting with a sharp collective gasp that turns into scattered boos and jeers as a referee shows a card, outdoor stadium',
    variants: 2,
  },
];

const IMPACT: AudioAsset[] = [
  {
    id: 'impact.tackle.soft',
    file: `${AUDIO_DIR}/impact/tackle-soft.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'CARRY_RESOLVED', when: "outcome === 'play_on'" },
    description: 'Routine tackle contact — thud + grass. The common-case carry impact.',
    elevenLabsPrompt: 'A routine rugby tackle impact, body hitting body with a muffled thud, a brief grunt and studs scuffing grass, close and dry',
    variants: 3,
  },
  {
    id: 'impact.tackle.hard',
    file: `${AUDIO_DIR}/impact/tackle-hard.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'CARRY_RESOLVED', when: "outcome === 'dominant_carry' | 'dominant_tackle'" },
    description: 'Heavy bone-on-bone collision. Pairs with crowd.oooh.bighit on dominant tackles.',
    elevenLabsPrompt: 'A heavy bone-crunching rugby tackle, hard body-on-body collision with a sharp impact thud and forceful grunt, powerful and close-miked',
    variants: 2,
  },
  {
    id: 'impact.scrum.engage',
    file: `${AUDIO_DIR}/impact/scrum-engage.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'phase', phase: MatchPhase.Scrum },
    description: 'Front-row crunch on engagement — "crouch, bind, set" hit. Plays as the scrum phase resolves.',
    elevenLabsPrompt: 'Two rugby scrum packs crashing together on engagement, a heavy thud of bodies binding and a collective straining grunt, close-miked, outdoor pitch',
  },
  {
    id: 'impact.scrum.collapse',
    file: `${AUDIO_DIR}/impact/scrum-collapse.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'SCRUM_RESOLVED', when: "outcome ∈ {attacking_dominant_penalty, defending_dominant_penalty, wheel}" },
    description: 'Scrum buckling / collapsing — grunts and a slump. Precedes the penalty whistle.',
    elevenLabsPrompt: 'A rugby scrum buckling and collapsing to the ground, straining grunts and the heavy slump of bodies dropping into turf, effortful and close',
  },
  {
    id: 'impact.maul.drive',
    file: `${AUDIO_DIR}/impact/maul-drive.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'MAUL_RESOLVED', when: "outcome === 'maul_won'" },
    description: 'Grinding forward drive — collective effort grunt, studs churning turf.',
    elevenLabsPrompt: 'A rugby maul grinding slowly forward, collective straining grunts and boots churning wet turf, sustained heavy collective effort',
  },
  {
    id: 'impact.boot.punt',
    file: `${AUDIO_DIR}/impact/boot-punt.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KICK_FROM_HAND' },
    description: 'Clean leather thump of boot on ball — a punt/clearance/territory kick.',
    elevenLabsPrompt: 'A clean, powerful thump of a boot striking a leather rugby ball for a long kick, sharp leather impact with a brief whoosh, close',
    variants: 2,
  },
  {
    id: 'impact.lineout.throw',
    file: `${AUDIO_DIR}/impact/lineout-throw.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'LINEOUT_THROWN' },
    description: 'Hooker call + ball-in-flight whoosh, jumpers lifted. Light, brief.',
    elevenLabsPrompt: 'A rugby lineout: a short sharp called code word followed by the whoosh of a ball thrown in a flat arc, brief and light, outdoor pitch',
  },
  {
    id: 'impact.post',
    file: `${AUDIO_DIR}/impact/post.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KICK_AT_GOAL_RESOLVED', when: 'optional flavour on a narrow miss' },
    description: 'Hollow "clank" of ball off the upright. Optional colour — only on near-miss goal kicks.',
    elevenLabsPrompt: 'A hollow metallic clank of a rugby ball striking the aluminium goal upright, resonant ringing thud, brief, outdoor',
  },
];

const TMO: AudioAsset[] = [
  {
    id: 'stinger.tmo.review',
    file: `${AUDIO_DIR}/stinger/tmo-review.mp3`,
    channel: 'stinger',
    loop: true,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'TMO_REVIEW_STARTED' },
    description: 'Low suspense drone, loops across the 3-tick review window. Stop on TMO_REVIEW_RESOLVED.',
    elevenLabsPrompt: 'A low suspenseful droning tension bed, deep sustained synth hum with a subtle slow pulse, ominous anticipation, seamless looping, no melody',
  },
  {
    id: 'stinger.tmo.no_card',
    file: `${AUDIO_DIR}/stinger/tmo-no-card.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'tmo_decision_no_card' },
    description: 'Relief resolution — soft "play on" release. Crowd murmur settles.',
    elevenLabsPrompt: 'A soft reassuring musical resolution, a gentle warm chord releasing built-up tension, a brief "all clear" tone',
  },
  {
    id: 'stinger.tmo.yellow',
    file: `${AUDIO_DIR}/stinger/tmo-yellow.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'tmo_decision_yellow' },
    description: 'Tense verdict accent for a yellow. Pairs with crowd.gasp.card.',
    elevenLabsPrompt: 'A tense short musical sting, an uneasy rising tone capped with a sharp dramatic accent, signalling a serious caution',
  },
  {
    id: 'stinger.tmo.red',
    file: `${AUDIO_DIR}/stinger/tmo-red.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'tmo_decision_red_20' },
    description: 'Heavier, darker verdict accent for a red_20. The most dramatic in-match sting.',
    elevenLabsPrompt: 'A dark, heavy dramatic musical sting, a deep ominous brass-like hit with a foreboding low rumble, serious and final',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// TIER 2 — UI FEEDBACK & SCREEN ATMOSPHERE
// ════════════════════════════════════════════════════════════════════════════

const UI: AudioAsset[] = [
  {
    id: 'ui.click.primary',
    file: `${AUDIO_DIR}/ui/click-primary.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'button / tile / card click (global handler in main.ts)' },
    description: 'Crisp primary click/tap. Replaces the current single uiClick cue.',
    elevenLabsPrompt: 'A crisp clean digital UI click, a short tactile tap, modern bright and minimal, no reverb',
  },
  {
    id: 'ui.click.back',
    file: `${AUDIO_DIR}/ui/click-back.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'back / cancel navigation' },
    description: 'Softer, lower-pitched click for back/cancel — distinct from forward actions.',
    elevenLabsPrompt: 'A soft low-pitched digital UI click for a back or cancel action, a gentle muted tap, minimal',
  },
  {
    id: 'ui.toggle',
    file: `${AUDIO_DIR}/ui/toggle.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'toggle / tab switch (marquee star, filter chip, tactics tab)' },
    description: 'Light tick for on/off toggles and tab switches.',
    elevenLabsPrompt: 'A light digital toggle tick, a short subtle switch flip sound, clean and crisp, minimal',
  },
  {
    id: 'ui.slider',
    file: `${AUDIO_DIR}/ui/slider.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'slider step (volume, speed, tactics dials)' },
    description: 'Very short detent tick. Throttle so a drag fires it sparsely.',
    elevenLabsPrompt: 'A very short subtle detent tick, a tiny soft digital click like a slider notch, minimal',
  },
  {
    id: 'ui.confirm',
    file: `${AUDIO_DIR}/ui/confirm.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'commit action (Kick Off, save, submit bid, confirm squad)' },
    description: 'Positive two-note confirm. Heavier than a plain click — signals a committed decision.',
    elevenLabsPrompt: 'A positive two-note confirmation chime, bright ascending tones, satisfying and brief, clean digital',
  },
  {
    id: 'ui.error',
    file: `${AUDIO_DIR}/ui/error.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'blocked action (bid over budget, invalid squad)' },
    description: 'Soft "denied" tone — not harsh. Signals an action was rejected.',
    elevenLabsPrompt: 'A soft denied error tone, a gentle low two-note buzz, non-harsh negative UI feedback, brief',
  },
  {
    id: 'ui.notify',
    file: `${AUDIO_DIR}/ui/notify.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'gameEvent', name: 'game:weekAdvanced (badge: expiring contracts / injuries)' },
    description: 'Gentle notification ping for badges / new-info moments. Use sparingly.',
    elevenLabsPrompt: 'A gentle notification ping, a soft single bell-like chime, pleasant clean and brief',
  },
];

const MUSIC: AudioAsset[] = [
  {
    id: 'music.home',
    file: `${AUDIO_DIR}/music/home.mp3`,
    channel: 'music',
    loop: true,
    priority: 2,
    trigger: { on: 'screen', id: 'home' },
    description: 'Signature title theme — grand, aspirational, broadcast-rugby feel. Seamless loop.',
    elevenLabsPrompt: 'An aspirational grand orchestral sports anthem, uplifting strings and brass with a broadcast rugby theme feel, hopeful and epic, seamless looping instrumental',
  },
  {
    id: 'music.hub',
    file: `${AUDIO_DIR}/music/hub.mp3`,
    channel: 'music',
    loop: true,
    priority: 2,
    trigger: { on: 'screen', id: 'hub' },
    description: 'Calm, focused planning bed. Covers the in-season management screens (hub, fixtures, league, squad, training, contracts).',
    elevenLabsPrompt: 'A calm focused ambient underscore, gentle pulsing synth pads with soft piano, contemplative management-game planning mood, unobtrusive seamless looping instrumental',
  },
  {
    id: 'music.prematch',
    file: `${AUDIO_DIR}/music/prematch.mp3`,
    channel: 'music',
    loop: true,
    priority: 2,
    trigger: { on: 'screen', id: 'pre-match' },
    description: 'Anticipatory build — tunnel walk energy. Hands over to the crowd bed on Kick Off.',
    elevenLabsPrompt: 'An anticipatory building instrumental, driving percussion and rising strings, pre-match tunnel-walk tension and adrenaline, energetic seamless looping',
  },
  {
    id: 'music.result.win',
    file: `${AUDIO_DIR}/music/result-win.mp3`,
    channel: 'music',
    loop: false,
    priority: 2,
    trigger: { on: 'screen', id: 'match-result (player won)' },
    description: 'Upbeat victory sting on the result screen when the managed side won.',
    elevenLabsPrompt: 'A short triumphant victory musical sting, uplifting brass and strings flourish, celebratory and bright, resolving cleanly',
  },
  {
    id: 'music.result.loss',
    file: `${AUDIO_DIR}/music/result-loss.mp3`,
    channel: 'music',
    loop: false,
    priority: 2,
    trigger: { on: 'screen', id: 'match-result (player lost)' },
    description: 'Subdued / reflective sting when the managed side lost or drew.',
    elevenLabsPrompt: 'A short subdued reflective musical sting, melancholy soft strings and piano, dignified disappointment, gentle fade',
  },
  {
    id: 'music.transfer',
    file: `${AUDIO_DIR}/music/transfer.mp3`,
    channel: 'music',
    loop: true,
    priority: 2,
    trigger: { on: 'screen', id: 'transfer-market' },
    description: 'Busy "deadline-day" bed — ticking, purposeful. Covers transfer-market, renewals, signing-results, contracts.',
    elevenLabsPrompt: 'A busy purposeful instrumental bed with a steady ticking clock pulse and tense muted strings, transfer deadline-day urgency, focused seamless looping',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// TIER 3 — SEASON & NARRATIVE STINGERS
// ════════════════════════════════════════════════════════════════════════════

const SEASON_STINGERS: AudioAsset[] = [
  {
    id: 'stinger.playoff_reveal',
    file: `${AUDIO_DIR}/stinger/playoff-reveal.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game:bracketSeeded' },
    description: 'Dramatic reveal sting as the top-4 playoff bracket is seeded.',
    elevenLabsPrompt: 'A dramatic cinematic reveal sting, a powerful orchestral hit with rising tension and a deep boom, high-stakes announcement, epic and brief',
  },
  {
    id: 'stinger.champion',
    file: `${AUDIO_DIR}/stinger/champion.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game:seasonComplete (championTeamId crowned)' },
    description: 'Triumphant orchestral fanfare — the title-won moment on EndOfSeasonScreen.',
    elevenLabsPrompt: 'A triumphant orchestral fanfare, soaring brass and strings with a cymbal crash and timpani, celebratory championship victory, grand and emphatic',
  },
  {
    id: 'stinger.award',
    file: `${AUDIO_DIR}/stinger/award.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'screen', id: 'end-of-season (MVP / top scorer reveal)' },
    description: 'Short celebratory flourish for individual award reveals.',
    elevenLabsPrompt: 'A short celebratory musical flourish, a bright sparkling chime with a brass accent, individual award reveal, positive and brief',
  },
  {
    id: 'stinger.budget.up',
    file: `${AUDIO_DIR}/stinger/budget-up.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'screen', id: 'budget-reveal (positive delta)' },
    description: 'Positive cash/ledger sting — budget increased.',
    elevenLabsPrompt: 'A positive financial reveal sting, a bright shimmering chime with a subtle cash-register sparkle, prosperous and upbeat, brief',
  },
  {
    id: 'stinger.budget.down',
    file: `${AUDIO_DIR}/stinger/budget-down.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'screen', id: 'budget-reveal (negative delta)' },
    description: 'Deflating sting — budget cut.',
    elevenLabsPrompt: 'A deflating downward financial sting, descending muted tones with a soft thud, disappointing and subdued, brief',
  },
  {
    id: 'stinger.takeover',
    file: `${AUDIO_DIR}/stinger/takeover.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'screen', id: 'takeover-reveal' },
    description: 'Big-money "new investment" sting — dramatic, optimistic.',
    elevenLabsPrompt: 'A big optimistic cinematic sting suggesting major new investment, a swelling grand orchestral build resolving to a bright confident chord, dramatic and hopeful',
  },
  {
    id: 'stinger.signing.success',
    file: `${AUDIO_DIR}/stinger/signing-success.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game: bid won (CONTRACT_SIGNED / BID_RESOLVED won)' },
    description: 'Satisfying "deal done" chime on SigningResultsScreen for a won target.',
    elevenLabsPrompt: 'A satisfying "deal done" confirmation chime, a bright positive musical accent with a confident upward flourish, brief and clean',
  },
  {
    id: 'stinger.bid.lost',
    file: `${AUDIO_DIR}/stinger/bid-lost.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game: bid lost (BID_RESOLVED lost)' },
    description: 'Deflating tone for a target lost to a rival club.',
    elevenLabsPrompt: 'A deflating disappointed sting, a short descending minor-key tone, a missed-out letdown feeling, subdued and brief',
  },
  {
    id: 'stinger.retired',
    file: `${AUDIO_DIR}/stinger/retired.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game:seasonRolledOver (PLAYER_RETIRED)' },
    description: 'Wistful, respectful sting for a player retiring — surfaced on RolloverScreen.',
    elevenLabsPrompt: 'A wistful respectful musical sting, gentle warm strings with a touch of nostalgia and a soft piano note, a dignified farewell, brief',
  },
  {
    id: 'stinger.injury',
    file: `${AUDIO_DIR}/stinger/injury.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'matchEvent', type: 'PLAYER_INJURED_IN_MATCH' },
    description: 'Brief concern stinger as a player goes down injured. Low, not alarming.',
    elevenLabsPrompt: 'A brief tense concern sting, a low subtle uneasy tone with a soft minor swell, worried but not alarming, short',
  },
];

// ── The manifest ────────────────────────────────────────────────────────────
export const AUDIO_MANIFEST: readonly AudioAsset[] = [
  ...WHISTLE,
  ...CROWD_BED,
  ...CROWD_REACTION,
  ...IMPACT,
  ...TMO,
  ...UI,
  ...MUSIC,
  ...SEASON_STINGERS,
];

// ── Convenience views (for a sourcing checklist or a future loader) ──────────
export const assetsByPriority = (p: AudioPriority): AudioAsset[] =>
  AUDIO_MANIFEST.filter(a => a.priority === p);

export const assetsByChannel = (c: AudioChannel): AudioAsset[] =>
  AUDIO_MANIFEST.filter(a => a.channel === c);

// ─────────────────────────────────────────────────────────────────────────────
// SOURCING & WIRING NOTES
//
// Counts: see assetsByPriority(1|2|3). Tier 1 (match core) is the priority buy.
//
// ElevenLabs: each asset's `elevenLabsPrompt` is ready to paste into the
// text-to-sound-effects box. Set a short duration for one-shots (whistle/ui ~1s,
// reactions/impacts ~2-4s); for loop:true beds (crowd-bed, music, tmo-review)
// enable ElevenLabs' looping option and request a longer clip (~10-30s).
// Generate the `variants` count as separate takes from the same prompt.
//
// Format: 44.1kHz MP3 (broad support; add .ogg/.webm fallbacks later if needed).
//  - One-shots: trim leading silence so they hit on-beat; mono is fine.
//  - loop:true beds (crowd-bed, music): author as SEAMLESS loops, stereo.
//  - Normalise one-shots to a consistent peak; keep beds well under reactions.
//
// Licensing: web-deployed game ⇒ only use assets cleared for commercial
// distribution. ElevenLabs-generated SFX are usable per their terms; if
// sourcing elsewhere favour CC0 (Freesound CC0 filter) or a paid royalty-free
// licence. Avoid unclear-licence rips.
//
// Wiring (separate task — SoundManager upgrade): the current SoundManager
// (src/ui/SoundManager.ts) is one-shot only with a single global volume and no
// event-bus link. To consume this manifest it needs: (1) per-channel GainNodes
// (Web Audio) for the mix buses above; (2) a looping/cross-fade path for
// crowd-bed + music; (3) a single subscriber on engine:event / game:* that maps
// triggers → ids instead of the scattered playCue(...) calls in CommentaryFeed /
// MatchResultScreen / EndOfSeasonScreen / TakeoverRevealScreen / main.ts.
// ─────────────────────────────────────────────────────────────────────────────
