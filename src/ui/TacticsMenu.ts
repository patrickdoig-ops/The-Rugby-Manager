import { eventBus } from '../utils/eventBus';
import type { TeamTactics, PresetTacticDim, AttackingGamePlan, AttackingStyle, AttackingBreakdown, DefendingBreakdown, BackfieldDefence, DefensiveLine, OffloadStrategy, Intensity, Discipline } from '../types/team';
import { seedAdvancedTactics } from '../engine/advancedTactics';
import { renderAdvancedTactics } from './AdvancedTacticsPanel';

interface OptionDef<T> {
  value: T;
  label: string;
  desc: string;
}

const ATTACK_PLAN_OPTIONS: OptionDef<AttackingGamePlan>[] = [
  { value: 'kicking',    label: 'Territorial', desc: 'Frequent tactical kicking to play the game in opposition territory.' },
  { value: 'balanced',   label: 'Balanced',    desc: 'Mixed kick/carry approach adapting dynamically to pitch zone.' },
  { value: 'possession', label: 'Possession',  desc: 'Patient phase play, minimal kicking, keep ball in hand.' },
];

const ATTACKING_STYLE_OPTIONS: OptionDef<AttackingStyle>[] = [
  { value: 'keep_it_tight', label: 'Keep It Tight', desc: 'Crash the ball up with the forwards. Strong carriers hit the line direct.' },
  { value: 'balanced',      label: 'Balanced',      desc: 'Mix of hard carries and wide distribution depending on the situation.' },
  { value: 'wide_wide',     label: 'Wide Wide',     desc: 'Get the ball to the outside backs at every opportunity.' },
];

const ATTACK_RUCK_OPTIONS: OptionDef<AttackingBreakdown>[] = [
  { value: 'commit_numbers', label: 'Commit Numbers', desc: 'Commit 3–4 forwards to rucks to ensure clean ball delivery.' },
  { value: 'balanced',       label: 'Balanced Ruck', desc: 'Standard 2–3 forwards supporting the breakdown.' },
  { value: 'minimal_ruck',   label: 'Minimal Ruck', desc: 'Minimal ruck commit (1–2) to keep extra attackers in the backline.' },
];

const DEFEND_RUCK_OPTIONS: OptionDef<DefendingBreakdown>[] = [
  { value: 'jackal',       label: 'Jackal Steal', desc: 'Rely on individual back-row specialists for turnover steals.' },
  { value: 'counter_ruck', label: 'Counter Ruck', desc: 'Commit pack forwards to blow through the ruck and disrupt ball.' },
  { value: 'shadow',       label: 'Shadow Line',  desc: 'Concede ruck ball to maintain a perfectly set defensive line.' },
];

const BACKFIELD_OPTIONS: OptionDef<BackfieldDefence>[] = [
  { value: 'one_back',   label: 'One Back',   desc: 'Standard fullback only. Maximum players in the front defensive line.' },
  { value: 'two_back',   label: 'Two Back',   desc: 'Fullback + one wing. Balanced kick cover and front-line strength.' },
  { value: 'three_back', label: 'Three Back', desc: 'Full back three deployed deep. Strong kick defence, thinner front line.' },
];

const DEFENSIVE_LINE_OPTIONS: OptionDef<DefensiveLine>[] = [
  { value: 'blitz',  label: 'Blitz',  desc: 'Aggressive line speed. Push the attacker behind the gain line. Higher risk: bigger line breaks against, more offsides.' },
  { value: 'hybrid', label: 'Hybrid', desc: 'Mix of push and slide. Numerically neutral middle ground between blitz and drift.' },
  { value: 'drift',  label: 'Drift',  desc: 'Lateral slide that channels the attack toward touch. Safer: fewer line breaks. Concedes more metres on inside carries.' },
];

const OFFLOAD_STRATEGY_OPTIONS: OptionDef<OffloadStrategy>[] = [
  { value: 'cautious',       label: 'Cautious',       desc: 'Keep the ball off the deck — carriers go to ground rather than risk the offload. Fewer knock-ons.' },
  { value: 'balanced',       label: 'Balanced',       desc: 'Offload when it\'s on, recycle when it isn\'t. The default tempo.' },
  { value: 'offload_freely', label: 'Offload Freely', desc: 'Keep the ball alive in contact. More metres and broken-field chances, more knock-ons.' },
];

const INTENSITY_OPTIONS: OptionDef<Intensity>[] = [
  { value: 'high',     label: 'High',     desc: 'Empty the tank — extra physical effort wins more at the breakdown, but the whole team tires noticeably faster.' },
  { value: 'balanced', label: 'Balanced', desc: 'Sustainable work rate across the eighty minutes. The default tempo.' },
  { value: 'light',    label: 'Light',    desc: 'Ease off to protect legs and condition. Slower to tire, but cedes a little edge at the contest. Useful when the game is won or lost.' },
];

const DISCIPLINE_OPTIONS: OptionDef<Discipline>[] = [
  { value: 'risky',    label: 'Risky',    desc: 'Take chances at the breakdown to steal more turnovers — at the price of conceding more penalties (and the cards that follow).' },
  { value: 'balanced', label: 'Balanced', desc: 'Compete hard but stay on the right side of the referee. The default.' },
  { value: 'cautious', label: 'Cautious', desc: 'Stay squeaky clean — far fewer penalties given away, but you surrender the edge at the contest.' },
];

interface CategoryMeta {
  title: string;
  options: OptionDef<string>[];
}
const META: Record<PresetTacticDim, CategoryMeta> = {
  attackingGamePlan:  { title: 'Attacking Game Plan',  options: ATTACK_PLAN_OPTIONS      as OptionDef<string>[] },
  attackingStyle:     { title: 'Attacking Style',      options: ATTACKING_STYLE_OPTIONS  as OptionDef<string>[] },
  attackingBreakdown: { title: 'Attacking Breakdown',  options: ATTACK_RUCK_OPTIONS      as OptionDef<string>[] },
  offloadStrategy:    { title: 'Offload Strategy',     options: OFFLOAD_STRATEGY_OPTIONS as OptionDef<string>[] },
  intensity:          { title: 'Intensity',            options: INTENSITY_OPTIONS        as OptionDef<string>[] },
  defendingBreakdown: { title: 'Defending Breakdown',  options: DEFEND_RUCK_OPTIONS      as OptionDef<string>[] },
  backfieldDefence:   { title: 'Backfield Defence',    options: BACKFIELD_OPTIONS        as OptionDef<string>[] },
  defensiveLine:      { title: 'Defensive Line',       options: DEFENSIVE_LINE_OPTIONS   as OptionDef<string>[] },
  discipline:         { title: 'Discipline',           options: DISCIPLINE_OPTIONS       as OptionDef<string>[] },
};

const INFO_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><circle cx="12" cy="7.75" r="0.6" fill="currentColor" stroke="none"></circle></svg>`;

const ATTACK_KEYS:  PresetTacticDim[] = ['attackingGamePlan', 'attackingStyle', 'attackingBreakdown', 'offloadStrategy', 'intensity'];
const DEFENCE_KEYS: PresetTacticDim[] = ['defendingBreakdown', 'backfieldDefence', 'defensiveLine', 'discipline'];

export function renderTacticsMenu(
  container: HTMLElement,
  initialTactics: TeamTactics,
  teamId: 'home' | 'away' = 'home',
  isModal = false,
  onResume?: () => void,
  oppTactics?: TeamTactics,
): void {
  let currentTactics: TeamTactics = { ...initialTactics };
  const showToggle = isModal && oppTactics != null;
  let activeTab: 'mine' | 'opp' = 'mine';
  // Advanced mode is sticky: if the saved tactics already carry an advanced
  // override, the menu opens straight into the advanced editor.
  let view: 'presets' | 'advanced' = currentTactics.advanced ? 'advanced' : 'presets';

  function renderCategory(key: PresetTacticDim, tactics: TeamTactics, readOnly: boolean): string {
    const meta = META[key];
    const selected = tactics[key] as string;
    return `
      <div class="tactics-category" data-cat="${key}">
        <div class="tactics-cat-header">
          <h3 class="tactics-cat-title">${meta.title}</h3>
          <button class="tactics-info-btn" data-info="${key}" aria-label="${meta.title} info" type="button">${INFO_ICON_SVG}</button>
        </div>
        <div class="tactics-options-grid">
          ${meta.options.map(opt => `
            <button class="tactics-opt-btn ${selected === opt.value ? 'active' : ''} ${readOnly ? 'readonly' : ''}" data-cat="${key}" data-val="${opt.value}" type="button">
              <span class="tactics-opt-label">${opt.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderSection(title: string, keys: PresetTacticDim[], tactics: TeamTactics, readOnly: boolean): string {
    return `
      <div class="tactics-section">
        <h2 class="tactics-section-title">${title}</h2>
        ${keys.map(k => renderCategory(k, tactics, readOnly)).join('')}
      </div>
    `;
  }

  function categoriesHTML(tactics: TeamTactics, readOnly: boolean): string {
    return renderSection('Attacking', ATTACK_KEYS, tactics, readOnly)
      + renderSection('Defensive', DEFENCE_KEYS, tactics, readOnly);
  }

  container.innerHTML = `
    <div class="tactics-menu-wrapper ${isModal ? 'modal-view' : ''}">
      <div class="tactics-header">
        ${isModal
          ? `<h2 class="tactics-main-title"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" style="vertical-align:-3px;margin-right:8px"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/></svg>Tactical Adjustments</h2>`
          : `<span class="tactics-header-spacer"></span>`}
        <label class="adv-switch" id="adv-switch">
          <span class="adv-switch-label">Advanced</span>
          <input type="checkbox" class="adv-switch-input" aria-label="Advanced tactics">
          <span class="adv-switch-track"><span class="adv-switch-thumb"></span></span>
        </label>
      </div>
      ${showToggle ? `
        <div class="tactics-team-toggle">
          <button class="tactics-team-toggle__btn tactics-team-toggle__btn--active" data-tab="mine" type="button">My Team</button>
          <button class="tactics-team-toggle__btn" data-tab="opp" type="button">Opposition</button>
        </div>
      ` : ''}
      <div class="tactics-categories-container"></div>
      ${isModal ? `
        <div class="tactics-modal-footer">
          <button id="btn-resume-match" class="tactics-resume-btn">Save</button>
        </div>
      ` : ''}
    </div>
  `;

  function applySelection(cat: keyof TeamTactics, val: string): void {
    currentTactics = { ...currentTactics, [cat]: val } as TeamTactics;
    eventBus.emit('ui:tacticsChange', { teamId, tactics: currentTactics });
    const siblings = container.querySelectorAll<HTMLButtonElement>(`.tactics-opt-btn[data-cat="${cat}"]`);
    siblings.forEach(sib => sib.classList.toggle('active', sib.dataset.val === val));
  }

  // Fill an EXISTING advanced override that's missing dimensions (e.g. a
  // kicking-only save from an earlier version), preserving its existing edits.
  // No-op when there's no override, or it's already complete.
  function ensureAdvancedComplete(): void {
    const adv = currentTactics.advanced;
    if (adv && adv.attackingStyle === undefined) {
      currentTactics = { ...currentTactics, advanced: { ...seedAdvancedTactics(currentTactics), ...adv } };
      eventBus.emit('ui:tacticsChange', { teamId, tactics: currentTactics });
    }
  }

  // The top-right toggle turns advanced tactics on/off. On → seed from the
  // current preset (if not already advanced) and open the advanced editor;
  // off → drop the override and return to the presets.
  function setAdvanced(on: boolean): void {
    if (on) {
      if (!currentTactics.advanced) {
        currentTactics = { ...currentTactics, advanced: seedAdvancedTactics(currentTactics) };
        eventBus.emit('ui:tacticsChange', { teamId, tactics: currentTactics });
      } else {
        ensureAdvancedComplete();
      }
      view = 'advanced';
    } else {
      currentTactics = { ...currentTactics };
      delete currentTactics.advanced;
      eventBus.emit('ui:tacticsChange', { teamId, tactics: currentTactics });
      view = 'presets';
    }
    renderBody();
    syncToggle();
  }

  // The toggle applies to your own team only; hide it while viewing opposition.
  function syncToggle(): void {
    const sw = container.querySelector<HTMLElement>('#adv-switch');
    const input = container.querySelector<HTMLInputElement>('.adv-switch-input');
    if (!sw || !input) return;
    sw.style.display = activeTab === 'mine' ? '' : 'none';
    input.checked = currentTactics.advanced != null;
  }

  function renderBody(): void {
    const el = container.querySelector<HTMLElement>('.tactics-categories-container');
    if (!el) return;

    if (view === 'advanced' && activeTab === 'mine' && currentTactics.advanced) {
      renderAdvancedTactics(el, currentTactics.advanced, next => {
        currentTactics = { ...currentTactics, advanced: next };
        eventBus.emit('ui:tacticsChange', { teamId, tactics: currentTactics });
      });
      return;
    }

    const readOnly = activeTab === 'opp';
    const tactics = readOnly ? oppTactics! : currentTactics;
    el.innerHTML = categoriesHTML(tactics, readOnly);
    bindInteraction();
  }

  function bindInteraction(): void {
    container.querySelectorAll<HTMLButtonElement>('.tactics-opt-btn:not(.readonly)').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat as keyof TeamTactics;
        const val = btn.dataset.val as string;
        applySelection(cat, val);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('.tactics-info-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.info as PresetTacticDim;
        const readOnly = activeTab === 'opp';
        const tactics = readOnly ? oppTactics! : currentTactics;
        openInfoModal(container, cat, tactics[cat] as string, readOnly ? undefined : v => applySelection(cat, v), readOnly);
      });
    });
  }

  function switchTab(tab: 'mine' | 'opp'): void {
    activeTab = tab;
    renderBody();
    syncToggle();
    container.querySelectorAll<HTMLButtonElement>('.tactics-team-toggle__btn').forEach(btn => {
      btn.classList.toggle('tactics-team-toggle__btn--active', btn.dataset.tab === tab);
    });
  }

  ensureAdvancedComplete();  // normalise a sticky/partial advanced override on open
  renderBody();
  syncToggle();
  container.querySelector<HTMLInputElement>('.adv-switch-input')
    ?.addEventListener('change', e => setAdvanced((e.target as HTMLInputElement).checked));

  if (showToggle) {
    container.querySelectorAll<HTMLButtonElement>('.tactics-team-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab as 'mine' | 'opp'));
    });
  }

  if (isModal && onResume) {
    let committing = false;
    container.querySelector('#btn-resume-match')?.addEventListener('click', async () => {
      if (committing) return;
      committing = true;
      // Snap back to My Team so the change-flash targets the correct rows.
      if (activeTab === 'opp') switchTab('mine');
      const changedKeys = (Object.keys(currentTactics) as (keyof TeamTactics)[])
        .filter(k => currentTactics[k] !== initialTactics[k]);
      changedKeys.forEach(k => {
        container.querySelector<HTMLElement>(`.tactics-category[data-cat="${k}"]`)
          ?.classList.add('row-just-changed');
      });
      const activeBtns = container.querySelectorAll<HTMLButtonElement>('.tactics-opt-btn.active');
      activeBtns.forEach(b => b.classList.add('committing'));
      await new Promise(r => setTimeout(r, changedKeys.length > 0 ? 500 : 240));
      onResume();
    });
  }
}

function openInfoModal(
  container: HTMLElement,
  cat: PresetTacticDim,
  currentValue: string,
  onSelect: ((val: string) => void) | undefined,
  readOnly = false,
): void {
  const meta = META[cat];
  if (!meta) return;

  const modal = document.createElement('div');
  modal.className = 'tactics-info-modal';
  modal.innerHTML = `
    <div class="tactics-info-backdrop"></div>
    <div class="tactics-info-card" role="dialog" aria-modal="true" aria-label="${meta.title} options">
      <div class="tactics-info-header">
        <h3 class="tactics-info-title">${meta.title}</h3>
        <button class="tactics-info-close" aria-label="Close" type="button">&times;</button>
      </div>
      <div class="tactics-info-options">
        ${meta.options.map(opt => {
          const isActive = opt.value === currentValue;
          return `
            <button class="tactics-info-opt ${isActive ? 'active' : ''} ${readOnly ? 'readonly' : ''}" data-val="${opt.value}" type="button">
              <span class="tactics-info-opt-label">${opt.label}${isActive ? `<span class="tactics-info-opt-tick" aria-hidden="true">✓</span>` : ''}</span>
              <span class="tactics-info-opt-desc">${opt.desc}</span>
            </button>
          `;
        }).join('')}
      </div>
      <button class="tactics-info-done" type="button">Done</button>
    </div>
  `;
  container.appendChild(modal);

  function close(): void {
    modal.remove();
  }

  modal.querySelector('.tactics-info-backdrop')?.addEventListener('click', close);
  modal.querySelector('.tactics-info-close')?.addEventListener('click', close);
  modal.querySelector('.tactics-info-done')?.addEventListener('click', close);

  if (!readOnly) {
    modal.querySelectorAll<HTMLButtonElement>('.tactics-info-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.val;
        if (val !== undefined && onSelect) onSelect(val);
        close();
      });
    });
  }
}
