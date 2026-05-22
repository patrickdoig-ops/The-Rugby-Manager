import { eventBus } from '../utils/eventBus';
import type { TeamTactics, AttackingGamePlan, AttackingStyle, AttackingBreakdown, DefendingBreakdown, BackfieldDefence, DefensiveLine } from '../types/team';

interface OptionDef<T> {
  value: T;
  label: string;
  desc: string;
}

const ATTACK_PLAN_OPTIONS: OptionDef<AttackingGamePlan>[] = [
  { value: 'possession', label: 'Possession', desc: 'Patient phase play, minimal kicking, keep ball in hand.' },
  { value: 'balanced',   label: 'Balanced',   desc: 'Mixed kick/carry approach adapting dynamically to pitch zone.' },
  { value: 'kicking',    label: 'Territorial', desc: 'Frequent tactical kicking to play the game in opposition territory.' },
];

const ATTACKING_STYLE_OPTIONS: OptionDef<AttackingStyle>[] = [
  { value: 'keep_it_tight', label: 'Keep It Tight', desc: 'Crash the ball up with the forwards. Strong carriers hit the line direct.' },
  { value: 'balanced',      label: 'Balanced',      desc: 'Mix of hard carries and wide distribution depending on the situation.' },
  { value: 'wide_wide',     label: 'Wide Wide',     desc: 'Get the ball to the outside backs at every opportunity.' },
];

const ATTACK_RUCK_OPTIONS: OptionDef<AttackingBreakdown>[] = [
  { value: 'pick_and_drive', label: 'Commit Numbers', desc: 'Commit 3–4 forwards to rucks to ensure clean ball delivery.' },
  { value: 'balanced',       label: 'Balanced Ruck', desc: 'Standard 2–3 forwards supporting the breakdown.' },
  { value: 'wide_play',      label: 'Wide Play',     desc: 'Minimal ruck commit (1–2) to keep extra attackers in the backline.' },
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

export function renderTacticsMenu(
  container: HTMLElement,
  initialTactics: TeamTactics,
  teamId: 'home' | 'away' = 'home',
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
      ${isModal ? `<h2 class="tactics-main-title"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="18" height="18" style="vertical-align:-3px;margin-right:8px"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/></svg>Tactical Adjustments</h2>` : ''}
      <div class="tactics-categories-container">
        ${renderCategory('Attacking Game Plan', 'attackingGamePlan', ATTACK_PLAN_OPTIONS)}
        ${renderCategory('Attacking Style', 'attackingStyle', ATTACKING_STYLE_OPTIONS)}
        ${renderCategory('Attacking Breakdown', 'attackingBreakdown', ATTACK_RUCK_OPTIONS)}
        ${renderCategory('Defending Breakdown', 'defendingBreakdown', DEFEND_RUCK_OPTIONS)}
        ${renderCategory('Backfield Defence', 'backfieldDefence', BACKFIELD_OPTIONS)}
        ${renderCategory('Defensive Line', 'defensiveLine', DEFENSIVE_LINE_OPTIONS)}
      </div>
      ${isModal ? `
        <div class="tactics-modal-footer">
          <button id="btn-resume-match" class="tactics-resume-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="vertical-align:-1px;margin-right:6px"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd"/></svg>Resume Match</button>
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

      eventBus.emit('ui:tacticsChange', { teamId, tactics: currentTactics });

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
