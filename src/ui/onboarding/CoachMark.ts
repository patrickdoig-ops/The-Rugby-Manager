// The onboarding coach mark: a spotlight ring around a target element plus an
// anchored tooltip card. Styled in style/onboarding.css with the shared theme
// tokens so it inherits dark / light / colour-blind themes for free.
//
// Key behaviours, by design:
//  - The overlay is pointer-events:none EXCEPT the card, so the player can still
//    click the real UI behind it (learn-by-doing) and can never be soft-locked.
//  - The spotlight uses the classic box-shadow halo to dim everything except the
//    target — no separate backdrop layer needed.
//  - Buttons sit in a FIXED position on the card. The advance target never moves
//    around the screen (the FM26 "Whac-A-Mole continue" anti-pattern).

export interface CoachButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface CoachMarkSpec {
  eyebrow: string;
  title: string;
  body: string;
  buttons: CoachButton[];
  target?: string;          // CSS selector to spotlight; omit for a centred card
  onSkip?: () => void;      // renders a "Skip tour" link when provided
  placement?: 'center' | 'bottom';  // untargeted-card position (default 'center', dimmed)
}

let root: HTMLElement | null = null;
let repositionFn: (() => void) | null = null;
let observer: MutationObserver | null = null;

export function hideCoachMark(): void {
  if (repositionFn) {
    window.removeEventListener('resize', repositionFn);
    window.removeEventListener('scroll', repositionFn, true);
    repositionFn = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  root?.remove();
  root = null;
}

export function showCoachMark(spec: CoachMarkSpec): void {
  hideCoachMark();

  root = document.createElement('div');
  root.className = 'rm-onb';

  const spot = document.createElement('div');
  spot.className = 'rm-onb-spot';

  const card = document.createElement('div');
  card.className = 'rm-onb-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', `${spec.title} — guided tour`);
  card.innerHTML = `
    <span class="rm-onb-eyebrow">${spec.eyebrow}</span>
    <h2 class="rm-onb-title">${spec.title}</h2>
    <p class="rm-onb-body">${spec.body}</p>
    <div class="rm-onb-actions">
      ${spec.onSkip ? '<button type="button" class="rm-onb-skip">Skip tour</button>' : '<span></span>'}
      <div class="rm-onb-btns"></div>
    </div>`;

  const btnWrap = card.querySelector<HTMLElement>('.rm-onb-btns')!;
  for (const b of spec.buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `rm-onb-btn${b.primary ? ' rm-onb-btn--primary' : ''}`;
    btn.textContent = b.label;
    btn.addEventListener('click', b.onClick);
    btnWrap.appendChild(btn);
  }
  if (spec.onSkip) {
    card.querySelector<HTMLButtonElement>('.rm-onb-skip')!.addEventListener('click', spec.onSkip);
  }

  root.appendChild(spot);
  root.appendChild(card);
  document.body.appendChild(root);

  const place = (): void => {
    const target = spec.target
      ? document.querySelector<HTMLElement>(spec.target)
      : null;
    const rect = target?.getBoundingClientRect();
    // A target that is missing or not yet laid out (zero-size) falls back to a
    // centred card with no spotlight — the tour never breaks on a bad selector.
    if (rect && rect.width > 0 && rect.height > 0) {
      const pad = 6;
      spot.style.display = 'block';
      spot.style.left = `${rect.left - pad}px`;
      spot.style.top = `${rect.top - pad}px`;
      spot.style.width = `${rect.width + pad * 2}px`;
      spot.style.height = `${rect.height + pad * 2}px`;
      // Card opposite the target: below if the target sits in the top half,
      // above if it sits in the bottom half — so the card never covers it.
      const inBottomHalf = rect.top + rect.height / 2 > window.innerHeight / 2;
      card.dataset.pos = inBottomHalf ? 'top' : 'bottom';
    } else {
      // No spotlight: either a dimmed centre card (default) or a bottom-anchored
      // card with no dim, so the screen behind stays visible and selectable.
      spot.style.display = 'none';
      card.dataset.pos = spec.placement === 'bottom' ? 'bottom' : 'center';
    }
  };
  place();

  repositionFn = place;
  window.addEventListener('resize', repositionFn);
  window.addEventListener('scroll', repositionFn, true);

  // Spotlighted screens (e.g. squad management) rewrite their innerHTML on every
  // selection / swap, replacing the target node. Re-measure on DOM mutations,
  // rAF-throttled, so the ring stays glued to a target that lives at the same
  // selector. Skipped for centred cards — they have nothing to track.
  if (spec.target) {
    let queued = false;
    observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; place(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
