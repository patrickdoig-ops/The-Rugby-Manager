// Wage-offer bottom-sheet. Lets the manager negotiate a salary when
// bidding / renewing, then resolves the chosen wage (or null on cancel).
// confirmModal only resolves a boolean, so this is its sibling for the
// one extra thing it needs: a numeric value.
//
// Reuses the shared .rm-confirm-* sheet shell (style/saves.css) and adds
// .rm-wage-* content: a stepped range slider, a live wage readout, a
// budget line, and an acceptance chip. The acceptance read + budget line
// are computed by the CALLER from the same engine helpers the resolver
// uses (wageSatisfaction / midseasonAcceptanceProbability), so the chip
// the user sees is a faithful predictor of the outcome.

import { WAGE_ROUNDING_UNIT } from '../../engine/balance/transfers';
import { acceptanceLabel } from '../../game/midseasonSigningResolver';

export type WageReadTone = 'good' | 'warn' | 'bad' | 'neutral';
export interface WageRead { label: string; tone: WageReadTone; }
export interface WageBudgetLine { text: string; status: 'ok' | 'tight' | 'over'; }

// Shared budget readout for any negotiation modal: same tight/over
// thresholds + "{x} left / {x} over" wording everywhere. Callers pass
// the projected total (they compute it differently — FA adds the bid,
// retention/renewal add the net delta) and the cap.
export function budgetLineFor(projected: number, budgetCap: number): WageBudgetLine {
  const remaining = budgetCap - projected;
  const status = projected > budgetCap ? 'over' : projected > budgetCap * 0.95 ? 'tight' : 'ok';
  return { text: remaining >= 0 ? `${fmtWage(remaining)} left` : `${fmtWage(-remaining)} over`, status };
}

// Shared acceptance chip for the probability-driven windows (mid-season
// FA + renewals). `badLabel` lets a screen tune the unlikely-case copy
// ("Unlikely" vs "May walk"); the likely/uncertain copy is uniform.
export function readFromProbability(prob: number, badLabel = 'Unlikely'): WageRead {
  const label = acceptanceLabel(prob);
  if (label === 'likely') return { label: 'Likely to accept', tone: 'good' };
  if (label === 'uncertain') return { label: 'Uncertain', tone: 'warn' };
  return { label: badLabel, tone: 'bad' };
}

export interface WageOfferOptions {
  playerName: string;
  askingWage: number;
  minWage: number;
  maxWage: number;
  step?: number;
  initialWage?: number;
  confirmLabel?: string;
  // Live acceptance read for a given offered wage. Called on every move.
  read: (wage: number) => WageRead;
  // Optional remaining-budget readout for a given offered wage. When it
  // reports 'over', the confirm button is disabled.
  budgetLine?: (wage: number) => WageBudgetLine;
}

function fmtWage(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${n}`;
}

function checkIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m4.5 12.75 6 6 9-13.5"/></svg>`;
}
function xIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
}

export function wageOfferModal(opts: WageOfferOptions): Promise<number | null> {
  return new Promise((resolve) => {
    const step = opts.step ?? WAGE_ROUNDING_UNIT;
    // Clamp the initial value into [min, max] and snap to the step.
    const snap = (w: number): number =>
      Math.max(opts.minWage, Math.min(opts.maxWage, Math.round(w / step) * step));
    let wage = snap(opts.initialWage ?? opts.askingWage);

    const backdrop = document.createElement('div');
    backdrop.className = 'rm-confirm-backdrop';
    backdrop.innerHTML = `
      <div class="rm-confirm" role="dialog" aria-modal="true">
        <div class="rm-confirm-handle"></div>
        <div class="rm-confirm-title">Offer to ${opts.playerName}</div>
        <div class="rm-wage-asks">Asks <strong>${fmtWage(opts.askingWage)}</strong> / yr</div>
        <div class="rm-wage-value" id="rm-wage-value">${fmtWage(wage)}</div>
        <input class="rm-wage-slider" id="rm-wage-slider" type="range"
          min="${opts.minWage}" max="${opts.maxWage}" step="${step}" value="${wage}" />
        <div class="rm-wage-meta">
          <span class="rm-wage-chip" id="rm-wage-chip"></span>
          <span class="rm-wage-budget" id="rm-wage-budget"></span>
        </div>
        <div class="rm-confirm-actions">
          <button class="rm-confirm-btn rm-confirm-cancel" type="button">
            ${xIcon()} Cancel
          </button>
          <button class="rm-confirm-btn rm-confirm-proceed" id="rm-wage-confirm" type="button">
            ${checkIcon()} ${opts.confirmLabel ?? 'Make Offer'}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const valueEl = backdrop.querySelector<HTMLElement>('#rm-wage-value')!;
    const chipEl = backdrop.querySelector<HTMLElement>('#rm-wage-chip')!;
    const budgetEl = backdrop.querySelector<HTMLElement>('#rm-wage-budget')!;
    const slider = backdrop.querySelector<HTMLInputElement>('#rm-wage-slider')!;
    const confirmBtn = backdrop.querySelector<HTMLButtonElement>('#rm-wage-confirm')!;

    const refresh = (): void => {
      valueEl.textContent = fmtWage(wage);
      const r = opts.read(wage);
      chipEl.textContent = r.label;
      chipEl.className = `rm-wage-chip rm-wage-chip--${r.tone}`;
      if (opts.budgetLine) {
        const b = opts.budgetLine(wage);
        budgetEl.textContent = b.text;
        budgetEl.className = `rm-wage-budget rm-wage-budget--${b.status}`;
        confirmBtn.disabled = b.status === 'over';
      }
    };
    refresh();

    slider.addEventListener('input', () => {
      wage = snap(Number(slider.value));
      refresh();
    });

    const close = (result: number | null): void => {
      backdrop.remove();
      resolve(result);
    };
    backdrop.querySelector<HTMLButtonElement>('.rm-confirm-cancel')!
      .addEventListener('click', () => close(null));
    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      close(wage);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });
  });
}
