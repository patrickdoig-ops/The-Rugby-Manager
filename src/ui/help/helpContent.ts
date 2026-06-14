// Central registry of in-game help content. Every screen that mounts a help
// button (src/ui/help/helpButton.ts) keys into this map; HelpOverlay.ts renders
// the matching topic. Content lives here as data — never inline in screens — so
// rolling help out to a new screen is one entry plus one mountHelpButton() call.
//
// Each topic: a one-line `purpose` (why the screen exists), a `features` list
// (what each control/feature does), and optional `tips` (advice for new
// managers). Keep copy concise, on-brand, and accurate to the screen.

export interface HelpTopic {
  /** Sheet heading — usually the screen's own title. */
  title: string;
  /** One or two sentences: what this screen is for. */
  purpose: string;
  /** Labelled list of the screen's controls / features. */
  features: { label: string; desc: string }[];
  /** Optional new-manager advice. */
  tips?: string[];
}

const HELP_TOPICS = {
  // ─── Onboarding ───────────────────────────────────────────────
  'home': {
    title: 'Main Menu',
    purpose: 'Your starting point. Begin a new career, continue a saved one, or adjust how the game looks and plays.',
    features: [
      { label: 'New Game', desc: 'Pick a club and start a fresh career from pre-season.' },
      { label: 'Continue', desc: 'Resume your most recent save exactly where you left off.' },
      { label: 'Settings', desc: 'Sound, haptics, text size and other preferences.' },
    ],
    tips: [
      'Your career autosaves as you play — Continue picks up the latest point automatically.',
      'First time here? Start a New Game and pick a club you know to learn the ropes.',
    ],
  },
  'team-selector': {
    title: 'Choose Your Club',
    purpose: 'Pick the club you will manage. Your choice sets your squad, budget and board expectations for the season.',
    features: [
      { label: 'Club list', desc: 'Tap a club to see its details before committing.' },
      { label: 'Club strength', desc: 'Stronger clubs come with bigger budgets but higher board expectations.' },
    ],
    tips: [
      'A mid-table club is the most forgiving place to learn — fewer must-win expectations.',
      'You can always start a new career with a different club later.',
    ],
  },
  'team-info': {
    title: 'Club Details',
    purpose: 'A closer look at the club you are about to manage — squad, stadium and reputation — before you confirm.',
    features: [
      { label: 'Squad preview', desc: 'See the players you will inherit and their key strengths.' },
      { label: 'Confirm', desc: 'Lock in this club and move on to choosing how you set up your team.' },
    ],
    tips: [
      'Note where the squad is thin — that is where you will want to recruit early.',
    ],
  },
  'mode-picker': {
    title: 'Set-Up Mode',
    purpose: 'Choose how you want to start: jump straight in with the club’s real squad, or build your roster yourself.',
    features: [
      { label: 'Quick Start', desc: 'Begin immediately with the club’s authored squad, contracts and marquee player in place.' },
      { label: 'Squad Builder', desc: 'Take control of your budget and shape the roster through a pre-season signing window before kick-off.' },
    ],
    tips: [
      'New to the game? Quick Start gets you to your first match fastest.',
      'Squad Builder is the deeper experience — you set wages, sign players and pick a marquee man.',
    ],
  },

  // ─── Hub & menus ──────────────────────────────────────────────
  'hub': {
    title: 'The Hub',
    purpose: 'Your home base between matches. Everything you manage — squad, tactics, training, transfers and the club — branches from here.',
    features: [
      { label: 'Next Match card', desc: 'Shows your upcoming fixture, venue and recent form for both sides — the same format for every competition, with a colour-coded chip naming the competition (League, League Cup, European or Playoffs).' },
      { label: 'Inbox banner', desc: 'Your assistant’s briefings — injuries, expiring contracts and news that need attention.' },
      { label: 'Six tiles', desc: 'Squad, Tactics, Competitions, Training, Contracts & Transfers, and Club open the management screens.' },
      { label: 'Continue', desc: 'The main button — always reads “Continue”. Advances the game by one step, whether that’s a league match, a cup tie, a European fixture or a playoff, and starts the build-up.' },
      { label: 'Settings cog', desc: 'Top-left — preferences and the route back to the main menu.' },
    ],
    tips: [
      'Clear your inbox before each match — it flags the decisions that matter most.',
      'A number badge on a tile means something needs your action there.',
    ],
  },
  'matchday': {
    title: 'This Week',
    purpose: 'The fixtures being played this game week, across every competition. Your own games are highlighted; tap Continue to play through them.',
    features: [
      { label: 'Fixture list', desc: 'Every match in this block — league, cup, European or playoff — with a tag showing which competition each belongs to.' },
      { label: 'Your games', desc: 'Highlighted rows are your club’s fixtures. Continue takes you into the build-up for each in turn.' },
      { label: 'Cup management note', desc: 'On a League Cup week, a line tells you whether you’re managing the match or your assistant is taking charge — set this on Club → Assistant Manager.' },
      { label: 'Continue', desc: 'Plays your fixture(s) and resolves the rest of the week’s results.' },
    ],
  },
  'competitions-menu': {
    title: 'Competitions',
    purpose: 'A hub for every competition you are involved in — the league, the League Cup and the European tournaments.',
    features: [
      { label: 'League', desc: 'Standings, fixtures, and team and player stats.' },
      { label: 'League Cup', desc: 'The pre-season pool competition run alongside your league campaign.' },
      { label: 'European Cup / Shield', desc: 'Continental pool and knockout competitions, when your club has qualified.' },
    ],
  },
  'league-menu': {
    title: 'League',
    purpose: 'Everything about your domestic league season in one place.',
    features: [
      { label: 'Table', desc: 'Live standings, including playoff and European qualification cut-offs.' },
      { label: 'Fixtures', desc: 'The full season schedule with results so far.' },
      { label: 'Team & Player Stats', desc: 'League-wide leaderboards for clubs and individuals.' },
    ],
  },
  'contracts-transfers-menu': {
    title: 'Contracts & Transfers',
    purpose: 'Manage your players’ deals and bring in new ones — renewals, the transfer market, scouting and loans.',
    features: [
      { label: 'Contracts', desc: 'Review and renew the deals of players already at the club.' },
      { label: 'Transfers', desc: 'Sign free agents and target players from other clubs.' },
      { label: 'Scouting', desc: 'Build a shortlist of players you are tracking.' },
      { label: 'Loans', desc: 'Send youngsters out for development or bring in emergency cover.' },
    ],
    tips: [
      'Badges flag expiring contracts and players other clubs are circling — act before you lose them.',
    ],
  },
  'club-menu': {
    title: 'Club',
    purpose: 'Off-field management — your standing with the board, your assistant manager, backroom staff and the club’s finances.',
    features: [
      { label: 'Board Confidence', desc: 'How happy your owner is, and the factors driving it.' },
      { label: 'Assistant Manager', desc: 'Choose whether to delegate your League Cup matches to your assistant, and if so whether to rest your starters.' },
      { label: 'Staff', desc: 'Hire and release your assistant manager, fitness lead and scouts.' },
      { label: 'Finances', desc: 'Player wage budget, staff budget and the slider to move spare headroom between them.' },
      { label: 'Awards', desc: 'Season honours, trophies and career milestones.' },
      { label: 'Club History', desc: 'Season-by-season results, all-time records and the Hall of Fame.' },
    ],
  },
  'assistant-manager': {
    title: 'Assistant Manager',
    purpose: 'Decide how the League Cup is run. Set it once and it applies to every cup match until you change it — there is no longer a prompt before each round.',
    features: [
      { label: 'Who runs your cup matches?', desc: '“I’ll manage them” plays every League Cup game live; “Assistant manages” lets your assistant simulate them so you can focus on the league.' },
      { label: 'How should the assistant pick the squad?', desc: 'When delegating: “Best available” fields your strongest 23; “Rest the starters” keeps your first-choice XV fresh for the league.' },
    ],
    tips: [
      'Resting starters in the cup protects them from injury and fatigue, but a weaker side is more likely to go out early.',
      'Your choice is shown on the This Week screen whenever you have a cup game, so you always know who’s in charge.',
    ],
  },

  // ─── Squad & tactics ──────────────────────────────────────────
  'squad-management': {
    title: 'Squad Selection',
    purpose: 'Pick your matchday 23 — the starting XV and eight replacements — for the next fixture.',
    features: [
      { label: 'Making changes', desc: 'Tap a player number to select it, then tap another number to swap the two.' },
      { label: 'Player detail', desc: 'Tap a player name to open their full profile.' },
      { label: 'Quick attributes', desc: 'Tap the down arrow on a player row to see their key attributes without leaving the screen.' },
      { label: 'Player ratings', desc: 'Each player’s overall and key attributes guide your selection.' },
      { label: 'Fitness & injuries', desc: 'Tired or injured players carry a warning — rest them or risk poor performance.' },
    ],
    tips: [
      'Match each player to their best position — playing out of position hurts performance.',
      'Cover every position on the bench so you can react to injuries and sin-bins.',
    ],
  },
  'player-profile': {
    title: 'Player Profile',
    purpose: 'A full breakdown of a player — attributes, contract, form, squad role and career history.',
    features: [
      { label: 'OVR badge', desc: 'Overall rating derived from position-relevant attributes. Unscouted players show reputation instead until scouted.' },
      { label: 'Identity grid', desc: 'Contract expiry, wage, condition, reputation, morale and form at a glance. Coloured values signal when something needs attention.' },
      { label: 'Squad status', desc: 'The role assigned to this player — First-Team Regular, Fringe Player and so on — and the playing-time expectation it carries. Tap Change to reassign.' },
      { label: 'Attributes radar', desc: 'Twelve-axis chart showing overall shape at a glance. Greyed axes are less relevant to the position.' },
      { label: 'Attribute bars', desc: 'Precise values across Physical, Skill and Mental groups. Scouted players show a band rather than an exact number until accuracy reaches 100%.' },
      { label: 'Career history', desc: 'Season-by-season appearances, tries and average match rating.' },
      { label: 'Scouting', desc: 'Shown for players outside your squad. Assign one of your hired scouts to improve attribute accuracy over time.' },
    ],
    tips: [
      'Condition and morale both affect match ratings — act early if either drops.',
      'Assign a scout to a transfer target to narrow attribute bands before making an offer.',
    ],
  },
  'squad-overview': {
    title: 'Squad Overview',
    purpose: 'A full view of your roster — every player, their position, ratings and contract status at a glance.',
    features: [
      { label: 'Player rows', desc: 'Tap any player to open their detailed profile.' },
      { label: 'Sort & filter', desc: 'Order the squad by position, rating, age or contract to spot gaps.' },
      { label: 'Contract status', desc: 'See who is nearing the end of their deal.' },
    ],
    tips: [
      'Watch your age profile — too many players past their peak means a rebuild is coming.',
    ],
  },
  'tactics': {
    title: 'Tactics',
    purpose: 'Set how your team plays — choose a preset style or fine-tune individual tactical instructions.',
    features: [
      { label: 'Presets', desc: 'Ready-made styles (e.g. expansive, forward-led) for a quick set-up.' },
      { label: 'Advanced editor', desc: 'Adjust individual instructions — kicking, width, breakdown commitment and more.' },
      { label: 'Save on exit', desc: 'Your selection is committed to the team when you go back.' },
    ],
    tips: [
      'Match your tactics to your personnel — a forward-heavy plan needs a strong pack.',
      'You can also adjust tactics live during a match from the in-game controls.',
    ],
  },
  'training': {
    title: 'Training',
    purpose: 'Plan how your squad trains between matches to develop attributes, sharpen form and manage fatigue.',
    features: [
      { label: 'Training focus', desc: 'Choose what to emphasise — attack, defence, fitness, set-piece and more.' },
      { label: 'Intensity', desc: 'Harder sessions develop players faster but raise injury and fatigue risk.' },
      { label: 'Plan persists', desc: 'Your plan is saved and applied automatically as the weeks run.' },
    ],
    tips: [
      'Ease off intensity in a congested fixture run to keep players fresh.',
      'Young players gain the most from focused development sessions.',
    ],
  },

  // ─── Contracts & transfers ────────────────────────────────────
  'contracts': {
    title: 'Contracts',
    purpose: 'Review and renew the deals of players already at your club, and manage your marquee signing.',
    features: [
      { label: 'Contract list', desc: 'Every player’s wage, length and expiry date.' },
      { label: 'Offer renewal', desc: 'Extend a deal before it runs down — wages must fit your salary budget.' },
      { label: 'Marquee player', desc: 'One designated star whose wage sits outside the standard cap.' },
    ],
    tips: [
      'Renew key players early — once a contract is short, rivals can poach them.',
      'Keep an eye on your total wage bill on the Finances screen.',
    ],
  },
  'renewals': {
    title: 'Contract Renewals',
    purpose: 'Decide which expiring players to keep. Offer fresh terms now or let them leave at the end of their deal.',
    features: [
      { label: 'Expiring players', desc: 'Everyone whose contract is running out, with their value to the squad.' },
      { label: 'Offer terms', desc: 'Propose a new wage and length — the player may accept, negotiate or decline.' },
      { label: 'Let go', desc: 'Decline to renew and free up budget for new recruits.' },
    ],
    tips: [
      'Star players will reject low offers — pay what they are worth or risk losing them for nothing.',
    ],
  },
  'transfer-market': {
    title: 'Transfer Market',
    purpose: 'Strengthen your squad by signing free agents and targeting players from other clubs within your budget.',
    features: [
      { label: 'Available players', desc: 'Free agents and transfer-listed players you can pursue.' },
      { label: 'Make an offer', desc: 'Agree a wage (and fee, for contracted players) to complete a signing.' },
      { label: 'Budget check', desc: 'Offers must fit your remaining salary headroom.' },
    ],
    tips: [
      'Target the positions your squad is thinnest in, not just the biggest names.',
      'Free agents cost no transfer fee — good value when budgets are tight.',
    ],
  },
  'scouting': {
    title: 'Scouting',
    purpose: 'Build and manage a shortlist of players you are tracking for future signings.',
    features: [
      { label: 'Scouted players', desc: 'Your watchlist, with the attributes your scouts have uncovered.' },
      { label: 'Open profile', desc: 'Tap a card to see the player’s full detail.' },
      { label: 'Remove', desc: 'Swipe a card away to drop a player from your shortlist.' },
    ],
    tips: [
      'Better scouts reveal more accurate ratings — invest in your scouting staff.',
    ],
  },
  'loans': {
    title: 'Loans',
    purpose: 'Send young players out to develop with regular game time, or bring in short-term cover for an injury crisis.',
    features: [
      { label: 'Loan out', desc: 'Send a developing player to a partnership club for first-team minutes.' },
      { label: 'Emergency cover', desc: 'Bring in a player on loan when injuries leave a position bare.' },
    ],
    tips: [
      'Loaning out fringe youngsters speeds their development versus sitting on your bench.',
    ],
  },

  // ─── Club ─────────────────────────────────────────────────────
  'board-confidence': {
    title: 'Board Confidence',
    purpose: 'Track how satisfied your owner is with your management — your job security depends on it.',
    features: [
      { label: 'Confidence meter', desc: 'Your current standing with the board, from secure to at-risk.' },
      { label: 'Factors', desc: 'What is helping or hurting — results, league position and meeting season objectives.' },
      { label: 'Fan sentiment', desc: 'How supporters feel right now (0–100: Poor / Steady / Good / Excellent). Wins add to it, losses reduce it, derbies double the swing. Very low sentiment (below 30) adds pressure on the board.' },
    ],
    tips: [
      'A run of poor results drains confidence — a warning means your job is under threat.',
      'Meeting the board’s season objective is the surest way to stay in post.',
      'Keep fan sentiment high — it boosts matchday attendance and eases board pressure.',
    ],
  },
  'staff': {
    title: 'Staff',
    purpose: 'Hire and release the backroom team that supports your squad — better staff means better outcomes.',
    features: [
      { label: 'Assistant Manager', desc: 'Runs cup fixtures and advises on selection.' },
      { label: 'Fitness Lead', desc: 'Improves training gains and reduces injury risk.' },
      { label: 'Scouts', desc: 'Reveal more accurate player ratings on your shortlist.' },
    ],
    tips: [
      'Staff wages come from your staff budget — balance it against your playing squad.',
    ],
  },
  'club-finances': {
    title: 'Finances',
    purpose: 'Manage the money. See your player wage budget, your staff budget, and move spare headroom between them.',
    features: [
      { label: 'Player salary budget', desc: 'Total wages committed versus your cap — stay inside it.' },
      { label: 'Staff budget', desc: 'What you can spend on the backroom team.' },
      { label: 'Transfer slider', desc: 'Move unused player-wage headroom into the staff budget for this season.' },
    ],
    tips: [
      'The slider is one-way and resets each season — only shift what you are sure you will not need.',
    ],
  },

  'club-history': {
    title: 'Club History',
    purpose: 'A record of the club under your management — season results, all-time records and the Hall of Fame.',
    features: [
      { label: 'Season History', desc: 'Every completed season listed in reverse order — finishing position, league points and any trophies won.' },
      { label: 'Club Records', desc: 'All-time top-3 for appearances, career tries and most league points in a single season.' },
      { label: 'Hall of Fame', desc: 'Players who retired from your club having made at least 50 appearances or scored at least 20 tries.' },
    ],
    tips: [
      'Inductees are added automatically when a long-serving player retires — keep hold of your best players to build a legacy.',
    ],
  },

  // ─── League & stats ───────────────────────────────────────────
  'league-table': {
    title: 'League Table',
    purpose: 'The live standings for your league, including the playoff and European qualification places.',
    features: [
      { label: 'Standings', desc: 'Played, won, drawn, lost, points difference, bonus points and total points.' },
      { label: 'Qualification lines', desc: 'Markers show the playoff and European cut-offs.' },
      { label: 'Form view', desc: 'Toggle to a last-five-results view sorted by recent form.' },
    ],
    tips: [
      'Bonus points (four tries, or a narrow loss) can decide tight qualification races.',
    ],
  },
  'fixture-list': {
    title: 'Fixtures',
    purpose: 'The full season schedule — past results and upcoming matches for your club and the league.',
    features: [
      { label: 'Fixture rows', desc: 'Each round with kick-off dates and final scores once played.' },
      { label: 'Your matches', desc: 'Your club’s games are highlighted through the list.' },
    ],
    tips: [
      'Look ahead for fixture pile-ups and rotate your squad and training to cope.',
    ],
  },
  'season-fixtures': {
    title: 'Fixture List',
    purpose: 'Your club’s whole season in one chronological list — every competition together: League, League Cup, European Cup, European Shield and the play-offs.',
    features: [
      { label: 'All competitions', desc: 'Fixtures from every competition interleaved by calendar date, each row labelled with its competition and stage.' },
      { label: 'Results fill in', desc: 'Played matches show the score; upcoming ones show “vs”. The list refreshes as results come in.' },
      { label: 'Your next match', desc: 'The next upcoming fixture is highlighted and the list auto-scrolls to it.' },
      { label: 'Grows with the season', desc: 'Cup knockouts, European knockouts and the league play-offs appear automatically once their brackets are drawn.' },
    ],
    tips: [
      'Use it to spot fixture congestion across competitions and plan rotation and training.',
    ],
  },
  'team-stats': {
    title: 'Team Stats',
    purpose: 'League-wide team leaderboards — see how your club ranks for attack, defence and discipline.',
    features: [
      { label: 'Stat categories', desc: 'Seven views: Attack, Carry, Defence, Kicking, Set Piece, Possession and Discipline.' },
      { label: 'Your club', desc: 'Your row is highlighted so you can benchmark against the rest of the league.' },
      { label: 'Sorting', desc: 'Tap any column header to re-sort; tap again to reverse the direction.' },
      { label: 'Team detail', desc: 'Tap a team row to open their full club information.' },
    ],
    tips: [
      'The chip bar scrolls horizontally — swipe it to reach Possession and Discipline.',
    ],
  },
  'player-stats': {
    title: 'Player Stats',
    purpose: 'Individual leaderboards across the league — top scorers, try-scorers, tacklers and more.',
    features: [
      { label: 'Leaderboards', desc: 'Ranked lists for each statistical category.' },
      { label: 'Open profile', desc: 'Tap a player to see their full season detail.' },
    ],
  },
  'achievements': {
    title: 'Awards & Achievements',
    purpose: 'A record of the honours and milestones you and your players have earned — match feats, season results, European runs and career landmarks.',
    features: [
      { label: 'Match', desc: 'Feats from a single game — first win, big scorelines, shut-outs.' },
      { label: 'Season', desc: 'League and European milestones — playoffs, finals, titles.' },
      { label: 'Career', desc: 'Long-term landmarks across multiple seasons.' },
    ],
    tips: [
      'European achievements unlock as your club progresses — qualifying, reaching the knockout stage, the final, and winning.',
    ],
  },

  // ─── Cups & Europe ────────────────────────────────────────────
  'cup-fixtures': {
    title: 'League Cup',
    purpose: 'A pool competition played as ordinary game weeks before the season and during the two international breaks. Choose whether to manage your cup matches yourself or let your assistant take over.',
    features: [
      { label: 'Manage them yourself', desc: 'Pick the squad and play each cup match live from the Hub, week by week — with its own training session.' },
      { label: 'Let the assistant take over', desc: 'Simulate your cup matches, choosing best-available or resting your first-choice XV.' },
      { label: 'Internationals away', desc: 'Your called-up players are on international duty during the cup weeks, so it’s a chance to rotate.' },
      { label: 'Pool fixtures', desc: 'Your group’s matches and results.' },
    ],
    tips: ['Your choice is remembered, but you can switch it each block on this screen.'],
  },
  'cup-results': {
    title: 'League Cup Results',
    purpose: 'How the League Cup round played out — your result and the rest of the pool.',
    features: [
      { label: 'Results', desc: 'Scores from your fixtures and the other pool matches.' },
      { label: 'Standings', desc: 'Where your club sits in the group.' },
    ],
  },
  'european-cup': {
    title: 'European Cup',
    purpose: 'The premier continental competition — pool stage followed by knockout rounds to the final.',
    features: [
      { label: 'Pools', desc: 'Your group, fixtures and standings.' },
      { label: 'Knockouts', desc: 'The bracket from the round of 16 through to the final.' },
    ],
    tips: [
      'Qualify by finishing high in your domestic league the previous season.',
    ],
  },
  'european-shield': {
    title: 'European Shield',
    purpose: 'The secondary continental competition — pool stage and knockouts for clubs outside the top European tier.',
    features: [
      { label: 'Pools', desc: 'Your group, fixtures and standings.' },
      { label: 'Knockouts', desc: 'The bracket through to the Shield final.' },
    ],
  },
  'european-round': {
    title: 'European Round',
    purpose: 'Results and standings for the current round of the European competition.',
    features: [
      { label: 'Results', desc: 'Scores from across this round.' },
      { label: 'Progression', desc: 'Who advances and how it affects your club.' },
    ],
  },

  // ─── International ─────────────────────────────────────────────
  'intl-callups': {
    title: 'International Call-Ups',
    purpose: 'See which of your players have been called up for international duty during the break.',
    features: [
      { label: 'Called-up players', desc: 'Your squad members away on international duty.' },
      { label: 'Impact', desc: 'They miss training and risk returning tired or injured.' },
    ],
    tips: [
      'Plan your squad around the break — capped players may not be sharp on return.',
    ],
  },
  'international-break': {
    title: 'International Break',
    purpose: 'The mid-season pause for internationals. Your called-up players return, with any knocks or fatigue.',
    features: [
      { label: 'Returning players', desc: 'Who is back, and their fitness after international duty.' },
      { label: 'News', desc: 'Any injuries or form changes picked up while away.' },
      { label: 'Inbox stories', desc: 'After the break, your inbox receives 1—2 media stories about your returning internationals — standout performances, injuries on duty, or a general squad update.' },
    ],
    tips: [
      'Check the inbox after each break — it flags any players who came back injured or with a rest obligation.',
    ],
  },

  // ─── Match-day ────────────────────────────────────────────────
  'pre-match': {
    title: 'Match Preview',
    purpose: 'Review your line-up, scout the opposition, and finalise your tactics before kick-off.',
    features: [
      { label: 'Line-up (step 1)', desc: 'Your starting XV and bench. Expand any row to see condition, form and season stats. Tap a player name to open their profile. Tap C to set or clear the captain.' },
      { label: 'Referee', desc: 'The assigned official and their tendencies — strict or lenient on penalties and cards.' },
      { label: 'Scout Report (step 2)', desc: 'Opposition recent form, head-to-head record, predicted approach and players to watch.' },
      { label: 'Tactics (step 3)', desc: 'Set or adjust your game plan before the match. Your selection is committed when you tap Start Match.' },
      { label: 'Edit Squad', desc: 'Jumps to Squad Management so you can make last-minute changes — use the back arrow to return here.' },
    ],
    tips: [
      'Check the referee tendencies — a card-happy official rewards disciplined play.',
      'The scout report shows season trends, not just today\'s likely approach — factor in their set-piece percentages.',
    ],
  },
  'match-result': {
    title: 'Full-Time Result',
    purpose: 'The match summary — final score, Man of the Match, scorers, and full player ratings.',
    features: [
      { label: 'Score & teams', desc: 'Final score with winning team highlighted.' },
      { label: 'Man of the Match', desc: 'Shown when a player rated 7.5 or above stands out — with a summary of their key stats.' },
      { label: 'Scorers', desc: 'Tries, conversions and penalties for both sides.' },
      { label: 'Player ratings', desc: 'Animated reveal of every player\'s match rating, colour-coded by performance tier.' },
      { label: 'Key Stats', desc: 'Possession, territory, tries and tackle % by default. Expand to see carries, kicks, set-piece and discipline.' },
      { label: 'Up Next', desc: 'Preview of your next fixture — tap to jump to the league table.' },
      { label: 'Continue', desc: 'Advances to post-match training and the next game week. Becomes active after a brief result review.' },
    ],
    tips: [
      'Player ratings update each player\'s season average — a string of low-rated performances affects form.',
      'Use the "Show all stats" toggle to compare carry metres and lineout success in depth.',
    ],
  },

  // ─── System ─────────────────────────────────────────────────  // ─── System ───────────────────────────────────────────────────
  'inbox': {
    title: 'Inbox',
    purpose: 'Your assistant’s briefings — the decisions and news that need your attention between matches.',
    features: [
      { label: 'Messages', desc: 'Injuries, expiring contracts, poach threats, board notes and media stories.' },
      { label: 'Action buttons', desc: 'Some items carry decision buttons — speak to a player, promise game time, grant or reject a transfer request, or respond to a national-team release request (Release: morale +3; Refuse: morale —2 and a small board note).' },
      { label: 'International release request', desc: 'Once per season (autumn break) the national coaching staff may request an out-of-window release for your highest-capped player. Your choice affects morale and, if refused, board confidence.' },
      { label: 'Quick links', desc: 'Many items jump straight to the screen where you can act.' },
      { label: 'Read & dismiss', desc: 'Clear items once handled to keep the unread count meaningful.' },
    ],
    tips: [
      'Check the inbox before every match — it surfaces what matters most right now.',
      'Releasing a capped player for international duty earns morale — refuse only if you need them for a big fixture.',
    ],
  },
  'settings': {
    title: 'Settings',
    purpose: 'Tune how the game looks, sounds and feels to your preference.',
    features: [
      { label: 'Sound & haptics', desc: 'Toggle audio and vibration feedback.' },
      { label: 'Light theme', desc: 'Switch between the default dark theme and a light theme. Your choice is saved across sessions.' },
      { label: 'Colour-blind dot shapes', desc: 'When enabled, home team player dots on the pitch become triangles (away stay as circles) so the two sides are distinguishable by shape, not just colour. Saved across sessions.' },
      { label: 'Text size', desc: 'Scale the interface text for comfort.' },
      { label: 'Main menu', desc: 'Return to the home screen from here.' },
    ],
  },
  'saves': {
    title: 'Saves',
    purpose: 'Manage your saved careers — load a slot, see its details, or restore a backup.',
    features: [
      { label: 'Save slots', desc: 'Each career’s club, season and progress.' },
      { label: 'Load', desc: 'Resume a chosen save.' },
      { label: 'Restore backup', desc: 'Recover an earlier copy if a save is lost or corrupted.' },
    ],
    tips: [
      'The game keeps a backup of each slot automatically — restore it if a save will not load.',
    ],
  },
} as const satisfies Record<string, HelpTopic>;

export type HelpTopicId = keyof typeof HELP_TOPICS;

export function getHelpTopic(id: HelpTopicId): HelpTopic {
  return HELP_TOPICS[id];
}
