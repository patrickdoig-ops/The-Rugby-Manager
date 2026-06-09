// Advanced tactics editor (zone-major). For each pitch zone (Own 22 / Own Half
// / Opp Half / Opp 22) the manager calibrates: the kicking game (frequency +
// kick-type mix), the with-ball play (attacking style + offload sliders,
// attacking-breakdown pick) and the defending shape (defending-breakdown,
// backfield, defensive-line picks). Two whole-match effort sliders (intensity,
// discipline) sit outside the zone cards. Operates on a working copy of
// AdvancedTactics and calls onChange on every edit; the host (TacticsMenu)
// merges it into the team tactics and emits ui:tacticsChange.

import type {
  AdvancedTactics, AdvancedKicking, ZoneKickProfile, ZoneOf,
  AttackingBreakdown, DefendingBreakdown, BackfieldDefence, DefensiveLine,
} from '../types/team';

type Zone = keyof AdvancedKicking;
type Family = keyof ZoneKickProfile['types'];

const ZONE_META: { key: Zone; label: string; desc: string }[] = [
  { key: 'own22',   label: 'Own 22',         desc: 'Deep in your own territory.' },
  { key: 'ownHalf', label: 'Own Half',       desc: 'Your half, outside the 22.' },
  { key: 'oppHalf', label: 'Opposition Half', desc: "Their half, outside their 22." },
  { key: 'opp22',   label: 'Opposition 22',  desc: 'Attacking, inside their 22.' },
];

const FAMILY_LABEL: Record<Family, string> = {
  clearance: 'Clearance',
  territory: 'Kick to Compete',
  fifty_22:  '50:22',
  attacking: 'Cross Field/Grubber',
};

// Clearance and 50:22 are only relevant in your own territory, so the
// opposition half / 22 expose just the "Kick to Compete" + "Cross
// Field/Grubber" dials. Hidden families stay at their seeded weight (0).
const ZONE_FAMILIES: Record<Zone, Family[]> = {
  own22:   ['clearance', 'territory', 'fifty_22', 'attacking'],
  ownHalf: ['clearance', 'territory', 'fifty_22', 'attacking'],
  oppHalf: ['territory', 'attacking'],
  opp22:   ['territory', 'attacking'],
};

// Per-zone continuous sliders (0–100), grouped under "with ball".
const ZONE_SLIDERS = [
  { dim: 'attackingStyle',  label: 'Attacking style', lo: 'Tight',    hi: 'Wide' },
  { dim: 'offloadStrategy', label: 'Offload',         lo: 'Cautious', hi: 'Free' },
] as const;

// Per-zone discrete picks. Grouped: attacking breakdown is read with ball; the
// other three are defensive (this zone = defending in that part of the pitch).
type DiscreteDim = 'attackingBreakdown' | 'defendingBreakdown' | 'backfieldDefence' | 'defensiveLine';
const DISCRETE_DIMS: { dim: DiscreteDim; label: string; group: 'ball' | 'defend'; options: [string, string][] }[] = [
  { dim: 'attackingBreakdown', label: 'Breakdown',     group: 'ball',   options: [['commit_numbers', 'Commit'], ['balanced', 'Balanced'], ['minimal_ruck', 'Minimal']] },
  { dim: 'defendingBreakdown', label: 'Breakdown',     group: 'defend', options: [['jackal', 'Jackal'], ['counter_ruck', 'Counter'], ['shadow', 'Shadow']] },
  { dim: 'backfieldDefence',   label: 'Backfield',     group: 'defend', options: [['one_back', '1 Back'], ['two_back', '2 Back'], ['three_back', '3 Back']] },
  { dim: 'defensiveLine',      label: 'Line',          group: 'defend', options: [['blitz', 'Blitz'], ['hybrid', 'Hybrid'], ['drift', 'Drift']] },
];

const SINGLE_SLIDERS = [
  { dim: 'gamePlan',   label: 'Game plan',  lo: 'Possession', hi: 'Kicking' },
  { dim: 'intensity',  label: 'Intensity',  lo: 'Light',      hi: 'High' },
  { dim: 'discipline', label: 'Discipline', lo: 'Cautious',   hi: 'Risky' },
] as const;

function clone(a: AdvancedTactics): AdvancedTactics {
  const k = {} as AdvancedKicking;
  for (const { key } of ZONE_META) k[key] = { frequency: a.kicking[key].frequency, types: { ...a.kicking[key].types } };
  return {
    kicking: k,
    attackingStyle:     { ...a.attackingStyle! },
    offloadStrategy:    { ...a.offloadStrategy! },
    attackingBreakdown: { ...a.attackingBreakdown! },
    defendingBreakdown: { ...a.defendingBreakdown! },
    backfieldDefence:   { ...a.backfieldDefence! },
    defensiveLine:      { ...a.defensiveLine! },
    intensity:          a.intensity!,
    discipline:         a.discipline!,
    gamePlan:           a.gamePlan!,
  };
}

function typeTotal(z: ZoneKickProfile): number {
  return z.types.clearance + z.types.territory + z.types.fifty_22 + z.types.attacking;
}
function typePct(z: ZoneKickProfile, family: Family): string {
  const total = typeTotal(z);
  return total > 0 ? `${Math.round((z.types[family] / total) * 100)}%` : '—';
}

function sliderRowHTML(attrs: string, value: number, label: string, lo: string, hi: string): string {
  return `
    <div class="advt-slider-row">
      <div class="advt-slider-head"><span class="advt-slider-label">${label}</span><span class="advt-slider-ends">${lo} · ${hi}</span></div>
      <input type="range" class="advk-slider" min="0" max="100" step="5" value="${value}" ${attrs} aria-label="${label}">
    </div>`;
}

function pickRowHTML(dim: DiscreteDim, zone: Zone, value: string, label: string, options: [string, string][]): string {
  return `
    <div class="advt-pick-row">
      <span class="advt-pick-label">${label}</span>
      <div class="advt-pick-opts">
        ${options.map(([val, lbl]) => `
          <button type="button" class="advt-pick-btn ${val === value ? 'active' : ''}" data-kind="pick" data-dim="${dim}" data-zone="${zone}" data-val="${val}">${lbl}</button>
        `).join('')}
      </div>
    </div>`;
}

function zoneCardHTML(a: AdvancedTactics, meta: { key: Zone; label: string; desc: string }): string {
  const zone = meta.key;
  const z = a.kicking[zone];
  const kickTypes = ZONE_FAMILIES[zone].map(fk => `
    <div class="advk-type-row">
      <span class="advk-type-label">${FAMILY_LABEL[fk]}</span>
      <input type="range" class="advk-slider advk-slider--type" min="0" max="100" step="5" value="${z.types[fk]}" data-kind="type" data-zone="${zone}" data-family="${fk}" aria-label="${meta.label} ${FAMILY_LABEL[fk]} weight">
      <span class="advk-type-pct" data-type-pct="${fk}">${typePct(z, fk)}</span>
    </div>`).join('');

  const ballSliders = ZONE_SLIDERS.map(s =>
    sliderRowHTML(`data-kind="zone" data-dim="${s.dim}" data-zone="${zone}"`, (a[s.dim] as ZoneOf<number>)[zone], s.label, s.lo, s.hi)).join('');
  const ballPicks = DISCRETE_DIMS.filter(d => d.group === 'ball').map(d =>
    pickRowHTML(d.dim, zone, (a[d.dim] as ZoneOf<string>)[zone], d.label, d.options)).join('');
  const defendPicks = DISCRETE_DIMS.filter(d => d.group === 'defend').map(d =>
    pickRowHTML(d.dim, zone, (a[d.dim] as ZoneOf<string>)[zone], d.label, d.options)).join('');

  return `
    <div class="advk-card" data-zone="${zone}">
      <div class="advk-card-head">
        <span class="advk-zone-label">${meta.label}</span>
        <span class="advk-zone-desc">${meta.desc}</span>
      </div>
      <div class="advk-freq">
        <div class="advk-row-head">
          <span class="advk-row-title">Kick frequency</span>
          <span class="advk-freq-val"><strong data-freq-kick>${z.frequency}%</strong> kick · <span data-freq-hand>${100 - z.frequency}%</span> ball in hand</span>
        </div>
        <input type="range" class="advk-slider advk-slider--freq" min="0" max="100" step="5" value="${z.frequency}" data-kind="freq" data-zone="${zone}" aria-label="${meta.label} kick frequency">
      </div>
      <div class="advk-types"><span class="advk-row-title">When kicking — kick-type mix</span>${kickTypes}</div>
      <div class="advt-group"><span class="advt-group-title">With ball</span>${ballSliders}${ballPicks}</div>
      <div class="advt-group"><span class="advt-group-title">Defending here</span>${defendPicks}</div>
    </div>`;
}

export function renderAdvancedTactics(
  container: HTMLElement,
  advanced: AdvancedTactics,
  onChange: (next: AdvancedTactics) => void,
  onBack: () => void,
): void {
  const working = clone(advanced);

  const singleHTML = SINGLE_SLIDERS.map(s =>
    sliderRowHTML(`data-kind="single" data-dim="${s.dim}"`, working[s.dim] as number, s.label, s.lo, s.hi)).join('');

  container.innerHTML = `
    <div class="advk-wrapper">
      <div class="advk-toolbar">
        <button class="advk-back" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Presets</span>
        </button>
        <span class="advk-title">Advanced Tactics</span>
      </div>
      <p class="advk-intro">Calibrate every dimension by zone of the pitch. Defending picks apply when defending in that zone. Match state (slow ball, the closing minutes) still adjusts on top.</p>
      <div class="advt-single">
        <span class="advt-group-title">Effort — whole match</span>
        ${singleHTML}
      </div>
      <div class="advk-cards">
        ${ZONE_META.map(m => zoneCardHTML(working, m)).join('')}
      </div>
    </div>
  `;

  container.querySelector<HTMLButtonElement>('.advk-back')?.addEventListener('click', onBack);

  function refreshKickCard(zone: Zone): void {
    const z = working.kicking[zone];
    const card = container.querySelector<HTMLElement>(`.advk-card[data-zone="${zone}"]`);
    if (!card) return;
    card.querySelector<HTMLElement>('[data-freq-kick]')!.textContent = `${z.frequency}%`;
    card.querySelector<HTMLElement>('[data-freq-hand]')!.textContent = `${100 - z.frequency}%`;
    for (const fk of ZONE_FAMILIES[zone]) {
      card.querySelector<HTMLElement>(`[data-type-pct="${fk}"]`)!.textContent = typePct(z, fk);
    }
  }

  container.querySelectorAll<HTMLInputElement>('input.advk-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const kind = slider.dataset.kind;
      const value = Number(slider.value);
      if (kind === 'single') {
        if (slider.dataset.dim === 'intensity') working.intensity = value;
        else if (slider.dataset.dim === 'discipline') working.discipline = value;
        else working.gamePlan = value;
      } else if (kind === 'zone') {
        (working[slider.dataset.dim as 'attackingStyle' | 'offloadStrategy'] as ZoneOf<number>)[slider.dataset.zone as Zone] = value;
      } else {
        const zone = slider.dataset.zone as Zone;
        if (kind === 'freq') working.kicking[zone].frequency = value;
        else working.kicking[zone].types[slider.dataset.family as Family] = value;
        refreshKickCard(zone);
      }
      onChange(clone(working));
    });
  });

  container.querySelectorAll<HTMLButtonElement>('.advt-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dim = btn.dataset.dim as DiscreteDim;
      const zone = btn.dataset.zone as Zone;
      const val = btn.dataset.val!;
      (working[dim] as ZoneOf<string>)[zone] = val;
      btn.parentElement!.querySelectorAll('.advt-pick-btn').forEach(b => b.classList.toggle('active', b === btn));
      onChange(clone(working));
    });
  });
}
