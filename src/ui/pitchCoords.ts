// Shared coordinate mapping for the 2D pitch view. The ball, the painted lines,
// and the player dots ALL map ball-x/y → screen % through these constants, so
// they must come from one source — never copy the numbers.
//
// The 100m field of play occupies the 8%–92% band of the field height; the
// 0–8% / 92–100% margins are the in-goal areas. x=100 → 8% (one try line),
// x=0 → 92% (the other).
//
// Y (lateral): touchlines sit at y=0 and y=100 in engine coords. The pitch
// element shows ~2.5m of grass beyond each touchline, so y=0 maps to 3.5% and
// y=100 maps to 96.5%. The touchline visual lines sit at those positions.
export const INGOAL_PCT = 8;
export const PLAY_SPAN = 84;

export const TOUCH_MARGIN = 3.5;           // % of element width beyond each touchline
const PLAY_WIDTH_PCT = 100 - 2 * TOUCH_MARGIN;  // 93

export const toTop  = (ballX: number): number => INGOAL_PCT + ((100 - ballX) / 100) * PLAY_SPAN;
export const toLeft = (ballY: number): number => TOUCH_MARGIN + (ballY / 100) * PLAY_WIDTH_PCT;
