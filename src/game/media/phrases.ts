// Media-story phrase bank. Pure data — no logic. Every pool is a flat
// readonly array so the bank can grow indefinitely without touching the
// assembler (src/game/media/mediaManager.ts). Authentic UK rugby-media
// register: tabloid back-pages, broadsheet analysis, TV punditry, podcasts,
// YouTubers, journalists on X.
//
// Token convention used throughout:
//   {club} {clubShort} {opp}   team names
//   {player} {pos}             the focus player and their position
//   {n}                        a count (attendance, points shipped)
//   {margin} {score}           result numbers
//   {stadium}                  the home ground
//
// Most player-cliché fragments are written to read after a dash or colon, so
// the assembler can chain two or three of them onto a framing sentence:
//   "{player} was the star of the show — a coach on the pitch, ice in his veins."

// ---------------------------------------------------------------------------
// PLAYER CLICHÉS — keyed by performance flavour. Positive pools read after a
// favourable frame; negative pools after a damning one.
// ---------------------------------------------------------------------------

// Physicality / fitness / work-rate (forwards, big carriers)
export const CLICHE_PHYSICAL = [
  'a big engine on him',
  'an engine for days',
  'a man-mountain in the loose',
  'an absolute unit',
  'built like a brick outhouse',
  'carrying like a runaway train',
  'a wrecking ball every time he touched it',
  'the engine room of this pack',
  'getting through a mountain of work',
  'first to every breakdown',
  'covering every blade of grass',
  'a human battering ram',
  'winning the collision time and again',
  'bending the gain-line at will',
  'a proper old-fashioned grafter',
  'still motoring when others were blowing',
  'doing the ugly stuff brilliantly',
  'a colossus in the tight',
  'a beast in the loose',
  'topping both the tackle count and the carry count',
] as const;

// Pace / footwork / elusiveness / finishing (backs)
export const CLICHE_PACE = [
  'serious wheels',
  'gas to burn',
  'greased lightning in the open',
  'electric off the mark',
  'a turn of foot that frightened them',
  'dancing feet in the contact',
  'a sidestep off either foot',
  'a clean pair of heels',
  'leaving defenders grasping at thin air',
  'a poacher’s nose for the line',
  'a finisher of the highest order',
  'gliding through the gap',
  'a shimmy and he was gone',
  'the afterburners well and truly on',
  'carving them open down the short side',
  'too hot to handle out wide',
] as const;

// Temperament / composure / big-game mentality (kickers, playmakers)
export const CLICHE_COMPOSURE = [
  'ice in his veins',
  'nerves of steel',
  'a genuine Iceman off the tee',
  'a cool head amid the chaos',
  'unflappable from first whistle to last',
  'the calm in the eye of the storm',
  'composure beyond his years',
  'the temperament to match the talent',
  'as cool as you like under the cosh',
  'a clutch operator when it mattered most',
  'never letting the moment get too big',
  'the steadiest of hands in the cauldron',
] as const;

// Game intelligence / decision-making / kicking / game-management (10/9/12/15)
export const CLICHE_RUGBY_IQ = [
  'a coach on the pitch',
  'reading the game two phases ahead',
  'conducting the orchestra',
  'pulling the strings out wide',
  'a high rugby IQ on full display',
  'the general out there',
  'controlling the tempo beautifully',
  'an educated boot, putting it on a sixpence',
  'kicking the corners with surgical precision',
  'dictating exactly where this game was played',
  'a metronome off the tee',
  'playing what was in front of him',
  'pure game-management from start to finish',
  'seeing the picture before anyone else',
  'the orchestrator-in-chief',
] as const;

// Set-piece / breakdown / contact-area
export const CLICHE_SETPIECE = [
  'a jackal of the highest order',
  'a turnover machine over the ball',
  'pilfering ball on the deck for fun',
  'an immovable object at the scrum',
  'a lineout operating like clockwork off his throw',
  'stealing ball clean against the throw',
  'living in the opposition breakdown',
  'a thunderous presence at the ruck',
  'winning collisions and slowing their ball',
  'dart-straight at the lineout all afternoon',
] as const;

// Defence
export const CLICHE_DEFENCE = [
  'a brick wall in midfield',
  'line speed off the charts',
  'cutting them down at the ankles all day',
  'the last line of defence standing firm',
  'a try-saving tackle in the corner',
  'never missing one-on-one',
  'soaking up wave after wave',
  'bodies on the line and not a chink in the wall',
  'a dominant tackle that swung the momentum',
] as const;

// Skills — good
export const CLICHE_SKILLS_GOOD = [
  'soft hands in the contact',
  'a sublime offload out of the tackle',
  'a flat, fast pass off either hand',
  'an audacious flick out the back',
  'the timing of his passing exquisite',
  'a sumptuous miss-pass to put the winger in',
  'a one-handed offload of pure class',
  'the basics done brilliantly',
] as const;

// Young-player hype
export const CLICHE_HYPE = [
  'the next big thing, no question',
  'a star in the making',
  'the real deal',
  'the rugby world at his feet',
  'a future Test star',
  'a future Lion if he keeps his head',
  'a captain in waiting',
  'a generational talent',
  'the brightest prospect in the country',
  'one for the future and the present',
  'tipped for the very top',
  'the find of the season',
  'born for the big stage',
  'as good as he wants to be',
  'already knocking the door down',
] as const;

// Maturity belying age (young + good)
export const CLICHE_MATURITY = [
  'a wise head on young shoulders',
  'playing amongst men and bossing them',
  'belying his years',
  'playing like a ten-year veteran',
  'composure you simply can’t coach at his age',
  'making seasoned pros look ordinary',
  'no respecter of reputations',
  'unfazed by the step up',
] as const;

// Young-player off-field distraction (light, snarky — used on young + poor,
// or as a cheeky caveat). Keep it PG: haircuts, socials, brand deals.
export const CLICHE_DISTRACTION = [
  'spending more time on Instagram than the training paddock',
  'a different barber every week and not much else to show for it',
  'busier building the brand than the game',
  'more followers than tackles',
  'the haircut getting more column inches than the rugby',
  'a marketing department’s dream and a coach’s headache',
  'chasing likes instead of line-breaks',
  'reminded that the boot deal won’t win you a lineout',
  'in need of less time at fashion week and more in the gym',
  'all gloss and not much graft just yet',
] as const;
export const DISTRACTION_NUDGE = [
  'He could do with putting the phone down and the boots on.',
  'The talent is obvious; the focus needs to follow.',
  'A word in his ear about the off-field circus wouldn’t go amiss.',
  'Keep his feet on the ground and the sky is the limit.',
  'Less noise, more nuts and bolts — and he’ll be some player.',
] as const;

// Sceptical counterpoint for a TALENTED young player — ego, hype, humility,
// "the boring stuff". Mixed into positive young stories so the coverage isn't
// pure gushing praise even on a good afternoon. Distinct from DISTRACTION_NUDGE
// (off-field circus) — this is about attitude and keeping the head right.
export const EGO_CAVEAT = [
  'The talent is undeniable — now he just needs to keep the ego in check.',
  'There’s a fine line between confident and getting too big for his boots.',
  'Brilliant, yes — but he’d do well not to believe his own hype just yet.',
  'The gifts are obvious; whether his feet stay on the ground is the question.',
  'One to keep grounded — that swagger can tip into arrogance if he’s not careful.',
  'Now comes the hard part: doing it week in, week out without getting carried away.',
  'He’d be wise to let the rugby do the talking rather than the celebrations.',
  'Plenty of substance — just don’t let the hype go to his head.',
  'Reputations are earned over seasons, not single afternoons — he’d do well to remember it.',
  'The real test now is the boring stuff: the basics, the graft, the humility.',
  'A star turn, but the game has a habit of humbling those who get ahead of themselves.',
  'Talk is cheap at this level; the great ones save the noise for the pitch.',
] as const;

// Match-stat callouts, one pool per highlight. `{n}` is the count. Multiple
// variants so a player who repeatedly tops a stat (a breakdown jackal winning
// turnovers every week) doesn't read the same line each time.
export const STAT_TWO_TRIES = [
  'Two tries to show for it — a real poacher’s afternoon.',
  'A brace, both finished with aplomb.',
  'Two on the scoresheet — a born finisher.',
  'A two-try haul that turned the game.',
] as const;
export const STAT_ONE_TRY = [
  'A deserved try, too.',
  'Got his name on the scoresheet as well.',
  'Capped it with a try of real quality.',
  'A well-taken try the icing on the cake.',
] as const;
export const STAT_BREAKS = [
  'A return of {n} clean breaks told the story.',
  '{n} line breaks — defences simply couldn’t live with him.',
  'He sliced through for {n} clean breaks.',
  '{n} times he split the defence wide open.',
] as const;
export const STAT_TURNOVERS = [
  'He plundered {n} turnovers — a one-man wrecking crew at the breakdown.',
  '{n} turnovers won — a nuisance over the ball all afternoon.',
  'A breakdown menace, pilfering {n} turnovers.',
  '{n} steals at the ruck that swung the momentum.',
  'Lived on the floor, nicking {n} turnovers.',
  'His {n} turnovers were worth their weight in gold.',
] as const;
export const STAT_TACKLES = [
  'A mighty {n} tackles and not a backward step.',
  '{n} tackles — he put his body on the line all day.',
  'Topped the count with {n} bone-rattling tackles.',
  '{n} hits made, and not one of them soft.',
] as const;

// Veteran resurgence (veteran + good)
export const CLICHE_RESURGENCE = [
  'rolling back the years',
  'vintage stuff from the old warhorse',
  'proving there’s life in the old legs yet',
  'a masterclass from the elder statesman',
  'ageing like a fine claret',
  'proving form is temporary and class permanent',
  'the wily veteran picking his moments perfectly',
  'as sharp as ever between the ears',
  'shepherding the young guns round the park',
  'defying the calendar once again',
  'the heartbeat of this side, even now',
  'turning back the clock',
] as const;

// Veteran decline (veteran + poor)
export const CLICHE_DECLINE = [
  'a yard off the pace',
  'the legs, sadly, look to have gone',
  'chasing shadows out there',
  'looking every one of his years',
  'being left in the slipstream',
  'a passenger for long stretches',
  'the burst of pace now just a memory',
  'getting found out for pace every time',
  'the body writing cheques it can’t cash',
  'treading water against the tempo',
  'a reputation doing the tackling for him',
  'one season too many, you’d fear',
] as const;
export const DECLINE_VERDICT = [
  'Father Time, as ever, remains unbeaten.',
  'Time waits for no man, not even one this decorated.',
  'You wonder how many more big afternoons are left in those legs.',
  'A sad watch for those who remember him in his pomp.',
  'The spirit is willing, but the body is starting to say no.',
] as const;

// Generic poor-performance criticism (mid-career flop)
export const CLICHE_CRITICISM = [
  'anonymous out there',
  'never getting into the game',
  'off the pace from the first whistle',
  'guilty of the killer error',
  'the weak link they targeted all day',
  'a day to forget',
  'second to every loose ball',
  'well below his own standards',
  'caught napping at the back',
  'on the wrong end of a chasing',
] as const;

// Generic in-form praise (mid-career, good)
export const CLICHE_INFORM = [
  'in the form of his life',
  'simply undroppable right now',
  'red-hot and getting better',
  'every touch turning to gold',
  'a class act on this evidence',
  'leading from the front',
  'the standout in a fine team display',
  'making it all look effortless',
] as const;

// ---------------------------------------------------------------------------
// RESULT REACTION
// ---------------------------------------------------------------------------

export const RESULT_UPSET = [
  'Nobody saw this coming.',
  'Rip up the form book — {club} have pulled off the shock of the round.',
  'A genuine giant-killing as {club} felled {opp}.',
  '{club} defied the odds and the bookies to stun {opp}.',
  'A result that sends shockwaves through the league.',
  'The minnows put the big boys to the sword.',
] as const;

export const RESULT_STATEMENT = [
  '{club} have laid down a marker.',
  'Make no mistake — this was a statement of intent from {club}.',
  '{club} served notice to the rest of the league.',
  'The kind of win that wins leagues.',
  '{club} announced themselves as genuine contenders.',
  'A championship-calibre performance from {club}.',
] as const;

export const RESULT_THRASHING = [
  '{club} ran up a cricket score against a hapless {opp}.',
  'A chastening afternoon for {opp}, blown away by a rampant {club}.',
  '{club} racked up {n} points in a one-sided rout.',
  'The wheels came off spectacularly for {opp}.',
  'A humbling to forget for {opp}, well beaten and then some.',
] as const;

export const RESULT_NARROW = [
  '{club} edged a nail-biter against {opp}.',
  'A win that owed everything to character from {club}.',
  '{club} held on by their fingertips.',
  '{club} weathered the storm and nicked it at the death.',
  'Backs-to-the-wall stuff, but {club} got the job done the hard way.',
] as const;

export const RESULT_CAPITULATION = [
  'A second-half capitulation from {club} that will worry the coaches.',
  '{club} collapsed like a house of cards against {opp}.',
  'A no-show of the highest order from {club}.',
  '{club} were well beaten by {opp}, and it could have been more.',
  'The handbrake stayed on and {club} paid the price.',
] as const;

export const RESULT_GALLANT_LOSS = [
  '{club} went down swinging against {opp}.',
  'No disgrace in defeat for {club}, who dug in to the last.',
  '{club} can hold their heads high despite coming up short.',
  'A gallant effort from {club}, but {opp} had just enough.',
] as const;

// ---------------------------------------------------------------------------
// STYLE / DNA COMMENTARY
// ---------------------------------------------------------------------------

export const STYLE_EXPANSIVE_PRAISE = [
  'champagne rugby of the highest order from {club}.',
  '{club} played with the handbrake off and it was a joy to watch.',
  'Ball-in-hand, width and ambition — this was {club} at their thrilling best.',
  'The kind of free-flowing rugby that gets supporters off their seats.',
  '{club} attacked from everywhere and were rewarded with a hatful of tries.',
] as const;

export const STYLE_KICK_CRITICISM = [
  'Death by box-kick from {club} — it bored the crowd to tears.',
  '{club} kicked away possession with alarming regularity.',
  'A turgid, low-risk afternoon of kick-tennis that satisfied nobody.',
  '{club} were one-dimensional and predictable, with no plan B.',
  'Territory-and-pressure rugby taken to a soulless extreme by {club}.',
] as const;

export const STYLE_LOST_IDENTITY = [
  'Where has the {club} we fell in love with gone?',
  '{club} have strayed a long way from their attacking roots.',
  'An identity crisis is playing out before our eyes at {club}.',
  '{club} are no longer recognisable as the side that lit up the league.',
  'The swagger has drained out of {club}, and it is a worry.',
] as const;

export const STYLE_WON_UGLY = [
  '{club} won ugly, but they won.',
  '{club} ground out a result the hard way — not one for the highlight reel.',
  'A proper blue-collar, backs-against-the-wall win for {club}.',
  '{club} rolled up their sleeves and bullied their way to victory up front.',
] as const;

export const STYLE_REDISCOVERED = [
  '{club} are back to playing the {club} way, and the swagger is back.',
  'A return to the values that defined {club} — the old expansive game is flowing again.',
  '{club} stripped it back, trusted their strengths and looked their old selves.',
] as const;

// ---------------------------------------------------------------------------
// CROWD / ATTENDANCE
// ---------------------------------------------------------------------------

export const CROWD_POOR = [
  'Acres of empty plastic at {stadium} told their own story.',
  'A paltry {n} rattled around a {stadium} built for far more.',
  '{stadium} felt more like a library than a rugby ground.',
  'The faithful are voting with their feet, and who can blame them?',
  'A steady exodus from {stadium} began long before the final whistle.',
  'Just {n} turned up — the home support is deserting in numbers.',
] as const;

export const CROWD_GREAT = [
  '{stadium} was a cauldron of noise from the first whistle.',
  'A sold-out {stadium} roared {club} home.',
  'Not an empty seat in the house as {n} packed into {stadium}.',
  'The home faithful were in full voice and lifted the roof.',
  '{club} were carried over the line on a wall of sound.',
] as const;

export const CROWD_COST = [
  'Supporters are being priced out of the game they love.',
  'The cost-of-living squeeze is biting hard at the turnstiles.',
  'A family day out at {stadium} has become a luxury few can justify.',
] as const;

// ---------------------------------------------------------------------------
// MANAGER PRESSURE
// ---------------------------------------------------------------------------

export const MANAGER_PRESSURE = [
  'The natives are getting restless at {club}.',
  'The pressure is mounting on the {club} head coach.',
  'Serious questions are being asked of {club}’s management.',
  'Another defeat that piles the heat on the {club} hot seat.',
  'The honeymoon period at {club} is well and truly over.',
  'The {club} faithful have started to turn.',
] as const;

export const MANAGER_PRESSURE_TAIL = [
  'A response is needed, and quickly.',
  'The boardroom will be watching nervously.',
  'The clock is starting to tick on this tenure.',
  'Results like this won’t ease the scrutiny.',
  'Something has to give before the season unravels.',
] as const;

// ---------------------------------------------------------------------------
// PRE-SEASON PREDICTION (by board ambition)
// ---------------------------------------------------------------------------

export const PREDICT_TITLE = [
  '{club} are installed as pre-season favourites and tipped to lift the trophy.',
  'Many are backing {club} for the title — anything less will be a disappointment.',
  '{club} carry the weight of expectation as one of the sides to beat.',
] as const;

export const PREDICT_PLAYOFFS = [
  '{club} are fancied for a top-four finish and a serious playoff push.',
  'The pundits have {club} pegged as dark horses for the knockouts.',
  '{club} are many people’s outside bet to gatecrash the title race.',
] as const;

export const PREDICT_MIDTABLE = [
  '{club} are tipped for a mid-table campaign with an eye on climbing.',
  'A season of consolidation is forecast for {club}.',
  '{club} are earmarked as a side that could surprise a few.',
] as const;

export const PREDICT_STRUGGLE = [
  '{club} are among the bookies’ tips for a relegation scrap.',
  'Few are giving {club} much chance — written off before a ball is kicked.',
  '{club} have been backed to be in the thick of the drop fight, with a big point to prove.',
] as const;
