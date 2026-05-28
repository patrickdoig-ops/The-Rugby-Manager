// Shared toggle for the two runtime tripwires (src/engine/invariants.ts and
// src/game/seasonInvariants.ts). Defaults to ON so live play and the
// determinism harnesses keep their always-on safety net. The tuning scripts
// (telemetry first) opt out at startup to skip the per-event structural sweep,
// which would otherwise dominate their runtime.

let enabled = true;

export function setInvariantsEnabled(on: boolean): void {
  enabled = on;
}

export function invariantsEnabled(): boolean {
  return enabled;
}
