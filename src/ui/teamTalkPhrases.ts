// Rotating phrase library for team talk tone buttons.
// pickPhrase() uses Math.random() (UI-layer only — not engine RNG).

export const CALM_PHRASES = [
  'Hold Your Shape',
  'Keep It Tight',
  'Play Your Percentages',
  'Trust the Set Piece',
  'Back Yourself',
  'Patience Wins Games',
  'Stick to the Gameplan',
  'Manage the Collision',
  'Play in Front of You',
  'Keep the Ball Off the Floor',
  'Slow the Game Down',
  'Control What You Can Control',
  'Be Clinical',
  'Win Your Battles',
  'Build It Phase by Phase',
] as const;

export const ENCOURAGE_PHRASES = [
  'Believe in the System',
  'This Is What We Trained For',
  "We've Got the Players to Win This",
  'Back Your Mate',
  'Play with Freedom',
  "You're Better Than You Think",
  'Trust Each Other',
  'Express Yourselves Out There',
  "We've Earned This Moment",
  'Nothing to Fear — Let Them Worry About You',
  'Play Your Game',
  'Together We Win',
  'Show Them What You\'re Made Of',
  'Play with Heart',
  'Give Everything You Have',
] as const;

export const DEMAND_PHRASES = [
  'Leave Nothing on the Pitch',
  'No Excuses Today',
  'Every Carry, Every Tackle — Maximum Effort',
  'Earn Every Metre',
  'I Want Your Everything',
  'Fight for the Shirt',
  'This Is Not a Day for Passengers',
  'Dominate the Collision',
  'Put Your Body on the Line',
  'These Eighty Minutes Define Your Season',
  'Take No Prisoners',
  'Die for Each Other Out There',
  'Make Them Regret Turning Up',
  'No Half-Measures — Go to War',
  'Rip It Out of Them',
] as const;

export const SINGLE_OUT_PHRASES = [
  'Give [Name] the Ball',
  '[Name] Runs This Game Today',
  'Everything Goes Through [Name]',
  'Back [Name] in Every Carry',
  '[Name] — This Is Your Match',
  'Find [Name] Early and Often',
  '[Name] Sets the Tone',
  'Trust [Name] — Give Them Time and Space',
  'Get [Name] on the Ball',
  '[Name] Carries, You Support',
  'Let [Name] Pull the Strings',
  'Get Ball to [Name] — They\'ll Do the Rest',
] as const;

export function pickPhrase(phrases: readonly string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
}
