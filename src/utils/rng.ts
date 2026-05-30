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
let transferCallCount = 0;

export function setMatchSeed(seed: number): void {
  const s = seed >>> 0;
  outcomeRand = mulberry32(s ^ 0x9E3779B9);
  formRand = mulberry32(s ^ 0x85EBCA6B);
  commentaryRand = mulberry32(s ^ 0xC2B2AE35);
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

function rngNormal(): number {
  let u1: number;
  do { u1 = formRand(); } while (u1 === 0);
  const u2 = formRand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function rngForm(): number {
  return Math.max(-10, Math.min(10, Math.round(rngNormal() * 5)));
}

export function pickRandom<T>(arr: readonly T[]): T {
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
