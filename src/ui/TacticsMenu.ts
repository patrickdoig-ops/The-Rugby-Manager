import { eventBus } from '../utils/eventBus';
import type { TeamTactics, KickOffStrategy, AttackingGamePlan, AttackingBreakdown, DefendingBreakdown, BackfieldDefence } from '../types/team';

interface OptionDef<T> {
  value: T;
  label: string;
  desc: string;
}

const KICKOFF_OPTIONS: OptionDef<KickOffStrategy>[] = [
  { value: 'high_ball',  label: '🏉 High Ball',   desc: 'Deep kick with hang time to allow chasers to contest cleanly.' },
  { value: 'short_kick', label: '⚡ Short Kick',  desc: 'Just crosses the 10m line for an aggressive aerial contest.' },
  { value: 'grubber',    label: '🎳 Grubber',    desc: 'Low hard kick along the ground to force handling errors.' },
];

const ATTACK_PLAN_OPTIONS: OptionDef<AttackingGamePlan>[] = [
  { value: 'possession', label: '🤲 Possession', desc: 'Patient phase play, minimal kicking, keep ball in hand.' },
  { value: 'balanced',   label: '⚖️ Balanced',   desc: 'Mixed kick/carry approach adapting dynamically to pitch zone.' },
  { value: 'kicking',    label: '🥾 Territorial',desc: 'Frequent tactical kicking to play the game in opposition territory.' },
];

const ATTACK_RUCK_OPTIONS: OptionDef<AttackingBreakdown>[] = [
  { value: 'pick_and_drive', label: '🛡️ Heavy Commit',  desc: 'Commit 3–4 forwards to rucks to ensure clean ball delivery.' },
  { value: 'balanced',       label: '⚖️ Balanced Ruck', desc: 'Standard 2–3 forwards supporting the breakdown.' },
  { value: 'wide_play',      label: '🏃 Wide Play',     desc: 'Minimal ruck commit (1–2) to keep extra attackers in the backline.' },
];

const DEFEND_RUCK_OPTIONS: OptionDef<DefendingBreakdown>[] = [
  { value: 'jackal',       label: '🪝 Jackal Steal', desc: 'Rely on individual back-row specialists for turnover steals.' },
  { value: 'counter_ruck', label: '💥 Counter Ruck', desc: 'Commit pack forwards to blow through the ruck and disrupt ball.' },
  { value: 'shadow',       label: '🧱 Shadow Line',  desc: 'Concede ruck ball to maintain a perfectly set defensive line.' },
];

const BACKFIELD_OPTIONS: OptionDef<BackfieldDefence>[] = [
  { value: 'one_back',   label: '1️⃣ One Back',   desc: 'Standard fullback only. Maximum players in the front defensive line.' },
  { value: 'two_back',   label: '2️⃣ Two Back',   desc: 'Fullback + one wing. Balanced kick cover and front-line strength.' },
  { value: 'three_back', label: '3️⃣ Three Back',  desc: 'Full back three deployed deep. Strong kick defence, thinner front line.' },
];

export function renderTacticsMenu(
  container: HTMLElement,
  initialTactics: TeamTactics,
  isModal = false,
  onResume?: () => void,
): void {
  let currentTactics: TeamTactics = { ...initialTactics };

  function renderCategory<T extends string>(
    title: string,
    key: keyof TeamTactics,
    options: OptionDef<T>[],
  ): string {
    const selected = currentTactics[key];
    return `
      <div class="tactics-category">
        <h3 class="tactics-cat-title">${title}</h3>
        <div class="tactics-options-grid">
          ${options.map(opt => `
            <button class="tactics-opt-btn ${selected === opt.value ? 'active' : ''}" data-cat="${key}" data-val="${opt.value}">
              <span class="tactics-opt-label">${opt.label}</span>
              <span class="tactics-opt-desc">${opt.desc}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="tactics-menu-wrapper ${isModal ? 'modal-view' : ''}">
      ${isModal ? `<h2 class="tactics-main-title">📋 Tactical Adjustments</h2>` : ''}
      <div class="tactics-categories-container">
        ${renderCategory('Kick-Off Strategy', 'kickOffStrategy', KICKOFF_OPTIONS)}
        ${renderCategory('Attacking Game Plan', 'attackingGamePlan', ATTACK_PLAN_OPTIONS)}
        ${renderCategory('Attacking Breakdown', 'attackingBreakdown', ATTACK_RUCK_OPTIONS)}
        ${renderCategory('Defending Breakdown', 'defendingBreakdown', DEFEND_RUCK_OPTIONS)}
        ${renderCategory('Backfield Defence', 'backfieldDefence', BACKFIELD_OPTIONS)}
      </div>
      ${isModal ? `
        <div class="tactics-modal-footer">
          <button id="btn-resume-match" class="tactics-resume-btn">▶ Resume Match</button>
        </div>
      ` : ''}
    </div>
  `;

  const buttons = container.querySelectorAll<HTMLButtonElement>('.tactics-opt-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat as keyof TeamTactics;
      const val = btn.dataset.val as string;

      currentTactics = {
        ...currentTactics,
        [cat]: val,
      };

      eventBus.emit('ui:tacticsChange', { teamId: 'home', tactics: currentTactics });

      // Update active classes within this category
      const siblings = container.querySelectorAll<HTMLButtonElement>(`.tactics-opt-btn[data-cat="${cat}"]`);
      siblings.forEach(sib => sib.classList.toggle('active', sib.dataset.val === val));
    });
  });

  if (isModal && onResume) {
    container.querySelector('#btn-resume-match')?.addEventListener('click', () => {
      onResume();
    });
  }
}
