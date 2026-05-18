export function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rngNormal(): number {
  let u1: number;
  do { u1 = Math.random(); } while (u1 === 0);
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function rngForm(): number {
  return Math.max(-10, Math.min(10, Math.round(rngNormal() * 5)));
}
