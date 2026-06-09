// Advanced tactics editor — tabbed, one screen per zone. A tab bar across the
// top switches between the four pitch zones (each: kicking game + with-ball +
// defending controls) and an "Overall" tab (the whole-match effort sliders).
// Only the active tab's controls are rendered, so there's no long scroll.
// Operates on a working copy of AdvancedTactics and calls onChange on every
// edit; the host (TacticsMenu) merges it into the team tactics and emits
// ui:tacticsChange. The advanced on/off toggle lives in the TacticsMenu header.

import type {
  AdvancedTactics, AdvancedKicking, ZoneKickProfile, ZoneOf,
} from '../types/team';

type Zone = keyof AdvancedKicking;
type Family = keyof ZoneKickProfile['types'];

const ZONE_META: { key: Zone; label: string; desc: string }[] = [
  { key: 'own22',   label: 'Own 22',          desc: 'Deep in your own territory.' },
  { key: 'ownHalf', label: 'Own Half',        desc: 'Your half, outside the 22.' },
  { key: 'oppHalf', label: 'Opposition Half',  desc: "Their half, outside their 22." },
  { key: 'opp22',   label: 'Opposition 22',   desc: 'Attacking, inside their 22.' },
];

// Tab bar: the four zones (short labels) + the whole-match Overall tab.
const TABS: { key: string; label: string }[] = [
  { key: 'own22',   label: 'Own 22' },
  { key: 'ownHalf', label: 'Own Half' },
  { key: 'oppHalf', label: 'Opp Half' },
  { key: 'opp22',   label: 'Opp 22' },
  { key: 'overall', label: 'Overall' },
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

const ZONE_SLIDERS = [
  { dim: 'attackingStyle',  label: 'Attacking style', lo: 'Tight',    hi: 'Wide' },
  { dim: 'offloadStrategy', label: 'Offload',         lo: 'Cautious', hi: 'Free' },
] as const;

type DiscreteDim = 'attackingBreakdown' | 'defendingBreakdown' | 'backfieldDefence' | 'defensiveLine';
const DISCRETE_DIMS: { dim: DiscreteDim; label: string; group: 'ball' | 'defend'; options: [string, string][] }[] = [
  { dim: 'attackingBreakdown', label: 'Breakdown', group: 'ball',   options: [['commit_numbers', 'Commit'], ['balanced', 'Balanced'], ['minimal_ruck', 'Minimal']] },
  { dim: 'defendingBreakdown', label: 'Breakdown', group: 'defend', options: [['jackal', 'Jackal'], ['counter_ruck', 'Counter'], ['shadow', 'Shadow']] },
  { dim: 'backfieldDefence',   label: 'Backfield', group: 'defend', options: [['one_back', '1 Back'], ['two_back', '2 Back'], ['three_back', '3 Back']] },
  { dim: 'defensiveLine',      label: 'Line',      group: 'defend', options: [['blitz', 'Blitz'], ['hybrid', 'Hybrid'], ['drift', 'Drift']] },
];

const SINGLE_SLIDERS = [
  { dim: 'intensity',  label: 'Intensity',  lo: 'Light',    hi: 'High' },
  { dim: 'discipline', label: 'Discipline', lo: 'Cautious', hi: 'Risky' },
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

function overallHTML(a: AdvancedTactics): string {
  return `
    <div class="advk-card">
      <div class="advk-card-head">
        <span class="advk-zone-label">Overall</span>
        <span class="advk-zone-desc">Whole-match effort — applies across the pitch.</span>
      </div>
      <div class="advt-group">${SINGLE_SLIDERS.map(s =>
        sliderRowHTML(`data-kind="single" data-dim="${s.dim}"`, a[s.dim] as number, s.label, s.lo, s.hi)).join('')}</div>
    </div>`;
}

export function renderAdvancedTactics(
  container: HTMLElement,
  advanced: AdvancedTactics,
  onChange: (next: AdvancedTactics) => void,
): void {
  const working = clone(advanced);
  let tab = 'own22';

  container.innerHTML = `
    <div class="advt-wrapper">
      <div class="advt-tabs">
        ${TABS.map(t => `<button type="button" class="advt-tab" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div class="advt-tab-content"></div>
    </div>`;
  const contentEl = container.querySelector<HTMLElement>('.advt-tab-content')!;

  function refreshKickCard(zone: Zone): void {
    const z = working.kicking[zone];
    contentEl.querySelector<HTMLElement>('[data-freq-kick]')!.textContent = `${z.frequency}%`;
    contentEl.querySelector<HTMLElement>('[data-freq-hand]')!.textContent = `${100 - z.frequency}%`;
    for (const fk of ZONE_FAMILIES[zone]) {
      contentEl.querySelector<HTMLElement>(`[data-type-pct="${fk}"]`)!.textContent = typePct(z, fk);
    }
  }

  function bindContent(): void {
    contentEl.querySelectorAll<HTMLInputElement>('input.advk-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        const kind = slider.dataset.kind;
        const value = Number(slider.value);
        if (kind === 'single') {
          if (slider.dataset.dim === 'intensity') working.intensity = value;
          else working.discipline = value;
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

    contentEl.querySelectorAll<HTMLButtonElement>('.advt-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dim = btn.dataset.dim as DiscreteDim;
        const zone = btn.dataset.zone as Zone;
        (working[dim] as ZoneOf<string>)[zone] = btn.dataset.val!;
        btn.parentElement!.querySelectorAll('.advt-pick-btn').forEach(b => b.classList.toggle('active', b === btn));
        onChange(clone(working));
      });
    });
  }

  function renderContent(): void {
    contentEl.innerHTML = tab === 'overall'
      ? overallHTML(working)
      : zoneCardHTML(working, ZONE_META.find(m => m.key === tab)!);
    bindContent();
    container.querySelectorAll<HTMLButtonElement>('.advt-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  }

  container.querySelectorAll<HTMLButtonElement>('.advt-tab').forEach(btn => {
    btn.addEventListener('click', () => { tab = btn.dataset.tab!; renderContent(); });
  });
  renderContent();
}
