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
  /** Path served at runtime. Vite base is /Rugby-Simulator-/; files live in public/audio/. */
  file: string;
  channel: AudioChannel;
  /** True for continuous beds (crowd, music) played on a looping channel. */
  loop: boolean;
  priority: AudioPriority;
  /** What sets it off. */
  trigger: AudioTrigger;
  /** Sound-design brief — what the asset should actually sound like. */
  description: string;
  /**
   * How many interchangeable takes to source so repeats don't fatigue the ear.
   * 1 = single file; N = round-robin / random pick at play time. Omit ⇒ 1.
   */
  variants?: number;
}

const AUDIO_DIR = '/Rugby-Simulator-/audio';

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
  },
  {
    id: 'whistle.try',
    file: `${AUDIO_DIR}/whistle/try.mp3`,
    channel: 'whistle',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'TRY_SCORED' },
    description: 'Long single blast + arm-aloft signal feel. Plays under/just before the try roar.',
  },
  {
    id: 'whistle.half_time',
    file: `${AUDIO_DIR}/whistle/half-time.mp3`,
    channel: 'whistle',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'HALF_TIME_REACHED' },
    description: 'Two/three sharp blasts to end the half.',
  },
  {
    id: 'whistle.full_time',
    file: `${AUDIO_DIR}/whistle/full-time.mp3`,
    channel: 'whistle',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'MATCH_ENDED' },
    description: 'Long triple blast — the final whistle. Bigger, more conclusive than half-time.',
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
  },
  {
    id: 'crowd.bed.engaged',
    file: `${AUDIO_DIR}/crowd/bed-engaged.mp3`,
    channel: 'crowd-bed',
    loop: true,
    priority: 1,
    trigger: { on: 'state', description: 'Open play in progress (PhasePlay / FirstPhase / KickReturn).' },
    description: 'Seamless loop. Mid-level engaged murmur with occasional shouts. Cross-faded in during open play.',
  },
  {
    id: 'crowd.bed.tension',
    file: `${AUDIO_DIR}/crowd/bed-tension.mp3`,
    channel: 'crowd-bed',
    loop: true,
    priority: 1,
    trigger: { on: 'state', description: 'Attack inside opposition 22, goal-line defence, kick at goal run-up, or clock-in-red.' },
    description: 'Seamless loop. Rising anticipatory swell — building "ooooh" energy. Cross-faded in for high-pressure passages.',
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
  },
  {
    id: 'crowd.goal.success',
    file: `${AUDIO_DIR}/crowd/goal-success.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KICK_AT_GOAL_RESOLVED', when: 'success === true (conversion / penalty goal made)' },
    description: 'Cheer + applause as the kick sails over. Also fires for CONVERSION_KICKED / PENALTY_GOAL_KICKED success.',
  },
  {
    id: 'crowd.goal.miss',
    file: `${AUDIO_DIR}/crowd/goal-miss.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KICK_AT_GOAL_RESOLVED', when: 'success === false (kick missed)' },
    description: 'Collective groan / deflation as the kick drifts wide.',
  },
  {
    id: 'crowd.surge.linebreak',
    file: `${AUDIO_DIR}/crowd/surge-linebreak.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'CARRY_RESOLVED', when: "outcome === 'line_break'" },
    description: 'Rising "ooooh!" surge as the line is broken. Also good for INTERCEPTION.',
  },
  {
    id: 'crowd.cheer.turnover',
    file: `${AUDIO_DIR}/crowd/cheer-turnover.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'TURNOVER_AT_BREAKDOWN' },
    description: 'Sharp appreciative cheer for a jackal turnover / steal.',
  },
  {
    id: 'crowd.oooh.bighit',
    file: `${AUDIO_DIR}/crowd/oooh-bighit.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'CARRY_RESOLVED', when: "outcome === 'dominant_tackle'" },
    description: 'Crowd "ooooh" for a big dominant tackle / collision.',
  },
  {
    id: 'crowd.groan',
    file: `${AUDIO_DIR}/crowd/groan.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'HANDLING_ERROR' },
    description: 'Disappointed groan for a handling error / knock-on by the home side. Lower-key than the goal-miss groan.',
  },
  {
    id: 'crowd.clap_build',
    file: `${AUDIO_DIR}/crowd/clap-build.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'kicker_steps_up' },
    description: 'Rhythmic anticipatory clap/hush as the kicker steps up (KICK_AT_GOAL_STARTED). Settles into a hush before the strike.',
  },
  {
    id: 'crowd.gasp.card',
    file: `${AUDIO_DIR}/crowd/gasp-card.mp3`,
    channel: 'crowd-reaction',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'CARD_ISSUED' },
    description: 'Gasp turning to boos/jeers as the card comes out. Use a heavier mix for red_20 than yellow.',
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
  },
  {
    id: 'impact.scrum.collapse',
    file: `${AUDIO_DIR}/impact/scrum-collapse.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'SCRUM_RESOLVED', when: "outcome ∈ {attacking_dominant_penalty, defending_dominant_penalty, wheel}" },
    description: 'Scrum buckling / collapsing — grunts and a slump. Precedes the penalty whistle.',
  },
  {
    id: 'impact.maul.drive',
    file: `${AUDIO_DIR}/impact/maul-drive.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'MAUL_RESOLVED', when: "outcome === 'maul_won'" },
    description: 'Grinding forward drive — collective effort grunt, studs churning turf.',
  },
  {
    id: 'impact.boot.punt',
    file: `${AUDIO_DIR}/impact/boot-punt.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KICK_FROM_HAND' },
    description: 'Clean leather thump of boot on ball — a punt/clearance/territory kick.',
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
  },
  {
    id: 'impact.post',
    file: `${AUDIO_DIR}/impact/post.mp3`,
    channel: 'impact',
    loop: false,
    priority: 1,
    trigger: { on: 'matchEvent', type: 'KICK_AT_GOAL_RESOLVED', when: 'optional flavour on a narrow miss' },
    description: 'Hollow "clank" of ball off the upright. Optional colour — only on near-miss goal kicks.',
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
  },
  {
    id: 'stinger.tmo.no_card',
    file: `${AUDIO_DIR}/stinger/tmo-no-card.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'tmo_decision_no_card' },
    description: 'Relief resolution — soft "play on" release. Crowd murmur settles.',
  },
  {
    id: 'stinger.tmo.yellow',
    file: `${AUDIO_DIR}/stinger/tmo-yellow.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'tmo_decision_yellow' },
    description: 'Tense verdict accent for a yellow. Pairs with crowd.gasp.card.',
  },
  {
    id: 'stinger.tmo.red',
    file: `${AUDIO_DIR}/stinger/tmo-red.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 1,
    trigger: { on: 'narrationKey', key: 'tmo_decision_red_20' },
    description: 'Heavier, darker verdict accent for a red_20. The most dramatic in-match sting.',
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
  },
  {
    id: 'ui.click.back',
    file: `${AUDIO_DIR}/ui/click-back.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'back / cancel navigation' },
    description: 'Softer, lower-pitched click for back/cancel — distinct from forward actions.',
  },
  {
    id: 'ui.toggle',
    file: `${AUDIO_DIR}/ui/toggle.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'toggle / tab switch (marquee star, filter chip, tactics tab)' },
    description: 'Light tick for on/off toggles and tab switches.',
  },
  {
    id: 'ui.slider',
    file: `${AUDIO_DIR}/ui/slider.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'slider step (volume, speed, tactics dials)' },
    description: 'Very short detent tick. Throttle so a drag fires it sparsely.',
  },
  {
    id: 'ui.confirm',
    file: `${AUDIO_DIR}/ui/confirm.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'commit action (Kick Off, save, submit bid, confirm squad)' },
    description: 'Positive two-note confirm. Heavier than a plain click — signals a committed decision.',
  },
  {
    id: 'ui.error',
    file: `${AUDIO_DIR}/ui/error.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'ui', action: 'blocked action (bid over budget, invalid squad)' },
    description: 'Soft "denied" tone — not harsh. Signals an action was rejected.',
  },
  {
    id: 'ui.notify',
    file: `${AUDIO_DIR}/ui/notify.mp3`,
    channel: 'ui',
    loop: false,
    priority: 2,
    trigger: { on: 'gameEvent', name: 'game:weekAdvanced (badge: expiring contracts / injuries)' },
    description: 'Gentle notification ping for badges / new-info moments. Use sparingly.',
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
  },
  {
    id: 'music.hub',
    file: `${AUDIO_DIR}/music/hub.mp3`,
    channel: 'music',
    loop: true,
    priority: 2,
    trigger: { on: 'screen', id: 'hub' },
    description: 'Calm, focused planning bed. Covers the in-season management screens (hub, fixtures, league, squad, training, contracts).',
  },
  {
    id: 'music.prematch',
    file: `${AUDIO_DIR}/music/prematch.mp3`,
    channel: 'music',
    loop: true,
    priority: 2,
    trigger: { on: 'screen', id: 'pre-match' },
    description: 'Anticipatory build — tunnel walk energy. Hands over to the crowd bed on Kick Off.',
  },
  {
    id: 'music.result.win',
    file: `${AUDIO_DIR}/music/result-win.mp3`,
    channel: 'music',
    loop: false,
    priority: 2,
    trigger: { on: 'screen', id: 'match-result (player won)' },
    description: 'Upbeat victory sting on the result screen when the managed side won.',
  },
  {
    id: 'music.result.loss',
    file: `${AUDIO_DIR}/music/result-loss.mp3`,
    channel: 'music',
    loop: false,
    priority: 2,
    trigger: { on: 'screen', id: 'match-result (player lost)' },
    description: 'Subdued / reflective sting when the managed side lost or drew.',
  },
  {
    id: 'music.transfer',
    file: `${AUDIO_DIR}/music/transfer.mp3`,
    channel: 'music',
    loop: true,
    priority: 2,
    trigger: { on: 'screen', id: 'transfer-market' },
    description: 'Busy "deadline-day" bed — ticking, purposeful. Covers transfer-market, renewals, signing-results, contracts.',
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
  },
  {
    id: 'stinger.champion',
    file: `${AUDIO_DIR}/stinger/champion.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game:seasonComplete (championTeamId crowned)' },
    description: 'Triumphant orchestral fanfare — the title-won moment on EndOfSeasonScreen.',
  },
  {
    id: 'stinger.award',
    file: `${AUDIO_DIR}/stinger/award.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'screen', id: 'end-of-season (MVP / top scorer reveal)' },
    description: 'Short celebratory flourish for individual award reveals.',
  },
  {
    id: 'stinger.budget.up',
    file: `${AUDIO_DIR}/stinger/budget-up.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'screen', id: 'budget-reveal (positive delta)' },
    description: 'Positive cash/ledger sting — budget increased.',
  },
  {
    id: 'stinger.budget.down',
    file: `${AUDIO_DIR}/stinger/budget-down.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'screen', id: 'budget-reveal (negative delta)' },
    description: 'Deflating sting — budget cut.',
  },
  {
    id: 'stinger.takeover',
    file: `${AUDIO_DIR}/stinger/takeover.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'screen', id: 'takeover-reveal' },
    description: 'Big-money "new investment" sting — dramatic, optimistic.',
  },
  {
    id: 'stinger.signing.success',
    file: `${AUDIO_DIR}/stinger/signing-success.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game: bid won (CONTRACT_SIGNED / BID_RESOLVED won)' },
    description: 'Satisfying "deal done" chime on SigningResultsScreen for a won target.',
  },
  {
    id: 'stinger.bid.lost',
    file: `${AUDIO_DIR}/stinger/bid-lost.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game: bid lost (BID_RESOLVED lost)' },
    description: 'Deflating tone for a target lost to a rival club.',
  },
  {
    id: 'stinger.retired',
    file: `${AUDIO_DIR}/stinger/retired.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'gameEvent', name: 'game:seasonRolledOver (PLAYER_RETIRED)' },
    description: 'Wistful, respectful sting for a player retiring — surfaced on RolloverScreen.',
  },
  {
    id: 'stinger.injury',
    file: `${AUDIO_DIR}/stinger/injury.mp3`,
    channel: 'stinger',
    loop: false,
    priority: 3,
    trigger: { on: 'matchEvent', type: 'PLAYER_INJURED_IN_MATCH' },
    description: 'Brief concern stinger as a player goes down injured. Low, not alarming.',
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
// Format: 44.1kHz MP3 (broad support; add .ogg/.webm fallbacks later if needed).
//  - One-shots: trim leading silence so they hit on-beat; mono is fine.
//  - loop:true beds (crowd-bed, music): author as SEAMLESS loops, stereo.
//  - Normalise one-shots to a consistent peak; keep beds well under reactions.
//
// Licensing: web-deployed game ⇒ only use assets cleared for commercial
// distribution. Favour CC0 (Freesound CC0 filter) or a paid royalty-free
// licence (Soundsnap / Epidemic / Artlist). Avoid unclear-licence rips.
//
// Wiring (separate task — SoundManager upgrade): the current SoundManager
// (src/ui/SoundManager.ts) is one-shot only with a single global volume and no
// event-bus link. To consume this manifest it needs: (1) per-channel GainNodes
// (Web Audio) for the mix buses above; (2) a looping/cross-fade path for
// crowd-bed + music; (3) a single subscriber on engine:event / game:* that maps
// triggers → ids instead of the scattered playCue(...) calls in CommentaryFeed /
// MatchResultScreen / EndOfSeasonScreen / TakeoverRevealScreen / main.ts.
// ─────────────────────────────────────────────────────────────────────────────
