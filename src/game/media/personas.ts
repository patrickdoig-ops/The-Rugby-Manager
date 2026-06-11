// The recurring (fictional) media cast. Each persona has a register that
// shapes how a story reads: a tabloid columnist puns and shouts, a broadsheet
// writer analyses, a YouTuber gushes in caps, an X journalist fires one-liners.
// Same underlying take, rendered through a persona = another freshness
// multiplier on top of the phrase bank. All names invented.

export type Register = 'tabloid' | 'broadsheet' | 'tv' | 'podcast' | 'youtuber' | 'x';

export interface Persona {
  byline: string;   // the writer / show / handle
  outlet: string;   // the masthead it appears under
  register: Register;
}

export const PERSONAS: readonly Persona[] = [
  { byline: 'Macca’s Verdict',        outlet: 'The Daily Ruck',        register: 'tabloid' },
  { byline: 'Trevor Lock',            outlet: 'The Sunday Touchline',  register: 'tabloid' },
  { byline: 'Diana Pemberton-Hyde',   outlet: 'The Broadsheet',        register: 'broadsheet' },
  { byline: 'Geoff Hartley',          outlet: 'The Rugby Quarterly',   register: 'broadsheet' },
  { byline: 'Baz & Lol',              outlet: 'The Breakdown Podcast',  register: 'podcast' },
  { byline: 'The Ruck Room',          outlet: 'Touchline Talk',         register: 'podcast' },
  { byline: 'Will “Big Hits” Hmodson', outlet: 'RugbyReactsTV',         register: 'youtuber' },
  { byline: 'Sam on the Sideline',    outlet: 'TryLine Clips',         register: 'youtuber' },
  { byline: 'Dickie Voss, ex-Test centre', outlet: 'matchday analysis', register: 'tv' },
  { byline: 'Coach’s Corner',         outlet: 'the studio',            register: 'tv' },
  { byline: '@rugby_whispers',        outlet: 'X',                     register: 'x' },
  { byline: '@TheBootRoomRU',         outlet: 'X',                     register: 'x' },
] as const;

// Per-register opener fragments. {byline} is the persona's voice. These wrap
// the body so the same take feels different from a tabloid vs a podcast.
export const OPENERS: Record<Register, readonly string[]> = {
  tabloid: [
    'Well, well, well.',
    'Stop the presses.',
    'Hold the back page.',
    'Crouch, touch, pause… and what a turn-up.',
  ],
  broadsheet: [
    'There was much to ponder this weekend.',
    'Beneath the scoreline lies a more interesting story.',
    'For all the noise, the picture is clear.',
    'Let the record show one thing.',
  ],
  tv: [
    'I’ll tell you what.',
    'Let’s be honest about this one.',
    'Let’s call it as it is.',
    'You don’t need the replay to see it —',
  ],
  podcast: [
    'Right, controversial opinion incoming…',
    'Okay, can we just talk about this?',
    'So we were buzzing about this all weekend —',
    'Hot take, and we’ll stand by it:',
  ],
  youtuber: [
    'OKAY that was actually INSANE.',
    'Right guys, we NEED to talk about this.',
    'Nobody is talking about this enough —',
    'I was SCREAMING at my telly:',
  ],
  x: [
    'Told you.',
    'Right then.',
    'Said it before, I’ll say it again:',
    'File this one away:',
  ],
};

// Per-register sign-offs. Optional flavour tail.
export const SIGNOFFS: Record<Register, readonly string[]> = {
  tabloid: [
    'You read it here first.',
    'Back to the drawing board.',
    'The pun writes itself.',
  ],
  broadsheet: [
    'A talking point for the weeks ahead.',
    'One suspects this conversation is far from over.',
    'The table, in time, will tell.',
  ],
  tv: [
    'Simple as that.',
    'That’s the difference at this level.',
    'You can’t coach that.',
  ],
  podcast: [
    'Anyway — smash that subscribe.',
    'Fight us in the comments.',
    'We’ll be unpacking this all week.',
  ],
  youtuber: [
    'LIKE and SUBSCRIBE if you saw it coming.',
    'Drop your hot takes below 👇',
    'Wild scenes. Absolutely wild.',
  ],
  x: [
    'That’s the post.',
    'Ratio me, I dare you.',
    'No notes.',
  ],
};
