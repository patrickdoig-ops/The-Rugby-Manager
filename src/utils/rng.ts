function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let outcomeRand: () => number = mulberry32(1);
let formRand: () => number = mulberry32(2);
let commentaryRand: () => number = mulberry32(3);
let transferRand: () => number = mulberry32(4);
let positioningRand: () => number = mulberry32(5);
let transferCallCount = 0;

export function setMatchSeed(seed: number): void {
  const s = seed >>> 0;
  outcomeRand = mulberry32(s ^ 0x9E3779B9);
  formRand = mulberry32(s ^ 0x85EBCA6B);
  commentaryRand = mulberry32(s ^ 0xC2B2AE35);
  positioningRand = mulberry32(s ^ 0xAFED3E9D);
}

// Career-scope RNG. Reset once when a GameCoordinator is initialised (new
// season or load); kept independent of setMatchSeed so a per-fixture seed
// derivation cannot perturb season-scope outcomes (rollover, contracts,
// transfers).
export function setCareerSeed(seed: number): void {
  const s = seed >>> 0;
  transferRand = mulberry32(s ^ 0x27D4EB2F);
  transferCallCount = 0;
}

export function getTransferCallCount(): number {
  return transferCallCount;
}

// Fast-forward the career stream to position n. Used by fromSave() to resume
// a mid-season stream at the same offset it was at when the game was saved.
export function advanceTransferTo(n: number): void {
  while (transferCallCount < n) {
    transferRand();
    transferCallCount++;
  }
}

// The only Math.random() call in the engine. Used when MatchCoordinator
// is constructed without an explicit seed.
export function generateSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

export function rng(min: number, max: number): number {
  return Math.floor(outcomeRand() * (max - min + 1)) + min;
}

// Positioning stream — every new lateral (Y-axis) draw: open-play sweep pass
// distances, kick launch angles, kick-off side bias. Reset by setMatchSeed.
// Independent of the outcome stream so adding lateral movement cannot perturb
// any in-play outcome roll.
export function rngPosition(min: number, max: number): number {
  return Math.floor(positioningRand() * (max - min + 1)) + min;
}

function rngNormal(): number {
  let u1: number;
  do { u1 = formRand(); } while (u1 === 0);
  const u2 = formRand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Raw standard-normal draw (mean 0, σ 1) on the form stream. Consumes two
// formRand() values per call. The form model in src/engine/MatchCoordinator
// scales and clamps this into the final integer modifier; the deterministic
// bias is computed separately (src/game/playerForm.ts) and added on top.
export function rngFormRaw(): number {
  return rngNormal();
}

export function pickRandom<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pickRandom called on an empty array');
  return arr[Math.floor(commentaryRand() * arr.length)];
}

export function commentaryChance(pct: number): boolean {
  return commentaryRand() * 100 < pct;
}

export function rngTransferRaw(): number {
  transferCallCount++;
  return transferRand();
}

export function rngTransfer(min: number, max: number): number {
  transferCallCount++;
  return Math.floor(transferRand() * (max - min + 1)) + min;
}

// Standalone seeded generator, independent of the four shared streams. Used by
// the media-story manager (src/game/media), which must be fully deterministic
// per fixture WITHOUT consuming the career stream — a media draw cannot be
// allowed to perturb transfer / injury / rollover outcomes (or season
// determinism would break). Callers derive a stable seed via `hashSeed` and
// own the returned closure for the lifetime of one story.
export function makeRng(seed: number): () => number {
  return mulberry32(seed >>> 0);
}

// Cheap deterministic hash of mixed number/string parts into a 32-bit seed.
// Order-sensitive. Used to derive a stable media seed from (rootSeed, round,
// clubId) so the same fixture always yields the same story.
export function hashSeed(...parts: (number | string)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = typeof part === 'number' ? String(part) : part;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}
