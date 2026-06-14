// Referee personality dials — the ±15 % band within which authored referees
// shift penalty base rates and card-escalation thresholds.
//
// strictness      — multiplied against every penalty base-rate roll (all
//                   offences equally). A strict referee sees more stoppages;
//                   a lenient one lets the game flow.
// cardThreshold   — multiplied against every yellow / red-escalation
//                   probability (TMO outcome weights, team-22 auto-card,
//                   maul-collapse yellow). High values mean the referee
//                   is quicker to reach for the card.
//
// Both sit in [1 − RANGE, 1 + RANGE]. 1.0 is neutral (no effect).
export const REFEREE_STRICTNESS_RANGE    = 0.15 as const;
export const REFEREE_CARD_THRESHOLD_RANGE = 0.15 as const;
