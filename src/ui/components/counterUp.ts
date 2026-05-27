// Counter-up tween for reward-moment headline numbers (budget, salary,
// points, OVR). Lifted from TakeoverRevealScreen's inline implementation
// so all reward screens share one easing + one reduced-motion contract.
//
// The caller owns the element; if it's removed mid-tween the rAF callback
// writes to a detached node — harmless. No timer cleanup needed.

export interface CounterUpOpts {
  duration?: number;
  delay?: number;
}

const DEFAULT_DURATION = 1200;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function animateCounter(
  el: HTMLElement,
  from: number,
  to: number,
  format: (value: number) => string,
  opts: CounterUpOpts = {},
): void {
  const duration = opts.duration ?? DEFAULT_DURATION;
  const delay = opts.delay ?? 0;

  if (prefersReducedMotion()) {
    el.textContent = format(to);
    return;
  }

  // Show the starting value immediately so the slot doesn't blank
  // between the delay and the tween start.
  el.textContent = format(from);
  const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
  const span = to - from;

  let startTime = 0;
  function tick(now: number): void {
    const t = Math.min((now - startTime) / duration, 1);
    el.textContent = format(from + span * easeOut(t));
    if (t < 1) requestAnimationFrame(tick);
  }

  window.setTimeout(() => {
    startTime = performance.now();
    requestAnimationFrame(tick);
  }, delay);
}
