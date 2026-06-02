// Shared coordinate mapping for the 2D pitch view. The ball, the painted lines,
// and the player dots ALL map ball-x/y → screen % through these constants, so
// they must come from one source — never copy the numbers.
//
// The 100m field of play occupies the 8%–92% band of the field height; the
// 0–8% / 92–100% margins are the in-goal areas. x=100 → 8% (one try line),
// x=0 → 92% (the other). ballY maps straight to left%.
export const INGOAL_PCT = 8;
export const PLAY_SPAN = 84;

export const toTop = (ballX: number): number => INGOAL_PCT + ((100 - ballX) / 100) * PLAY_SPAN;
