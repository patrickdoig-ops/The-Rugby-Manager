// Advanced kicking editor (Phase 1 of advanced numeric tactics). Renders the
// per-zone kick calibration the manager opted into: one kick-frequency slider
// and four kick-type weight sliders per pitch zone. Operates on a working copy
// of AdvancedTactics and calls onChange on every edit; the host (TacticsMenu)
// merges it into the team tactics and emits ui:tacticsChange.

import type { AdvancedTactics, AdvancedKicking, ZoneKickProfile } from '../types/team';

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

// Which kick types are tunable in each zone. Clearance and 50:22 are only
// relevant in your own territory, so the opposition half / 22 expose just the
// "Kick to Compete" and "Cross Field/Grubber" dials. Hidden families stay at
// their seeded weight (0 in these zones), so the engine mix is unaffected.
const ZONE_FAMILIES: Record<Zone, Family[]> = {
  own22:   ['clearance', 'territory', 'fifty_22', 'attacking'],
  ownHalf: ['clearance', 'territory', 'fifty_22', 'attacking'],
  oppHalf: ['territory', 'attacking'],
  opp22:   ['territory', 'attacking'],
};

function cloneAdvanced(a: AdvancedTactics): AdvancedTactics {
  const k = {} as AdvancedKicking;
  for (const { key } of ZONE_META) {
    const z = a.kicking[key];
    k[key] = { frequency: z.frequency, types: { ...z.types } };
  }
  return { kicking: k };
}

function typeTotal(z: ZoneKickProfile): number {
  return z.types.clearance + z.types.territory + z.types.fifty_22 + z.types.attacking;
}

function typePct(z: ZoneKickProfile, family: Family): string {
  const total = typeTotal(z);
  return total > 0 ? `${Math.round((z.types[family] / total) * 100)}%` : '—';
}

function zoneCardHTML(z: ZoneKickProfile, meta: { key: Zone; label: string; desc: string }): string {
  const freq = z.frequency;
  return `
    <div class="advk-card" data-zone="${meta.key}">
      <div class="advk-card-head">
        <span class="advk-zone-label">${meta.label}</span>
        <span class="advk-zone-desc">${meta.desc}</span>
      </div>
      <div class="advk-freq">
        <div class="advk-row-head">
          <span class="advk-row-title">Kick frequency</span>
          <span class="advk-freq-val"><strong data-freq-kick>${freq}%</strong> kick · <span data-freq-hand>${100 - freq}%</span> ball in hand</span>
        </div>
        <input type="range" class="advk-slider advk-slider--freq" min="0" max="100" step="5" value="${freq}" data-zone="${meta.key}" data-field="frequency" aria-label="${meta.label} kick frequency">
      </div>
      <div class="advk-types">
        <span class="advk-row-title">When kicking — kick-type mix</span>
        ${ZONE_FAMILIES[meta.key].map(fk => `
          <div class="advk-type-row">
            <span class="advk-type-label">${FAMILY_LABEL[fk]}</span>
            <input type="range" class="advk-slider advk-slider--type" min="0" max="100" step="5" value="${z.types[fk]}" data-zone="${meta.key}" data-field="type" data-family="${fk}" aria-label="${meta.label} ${FAMILY_LABEL[fk]} weight">
            <span class="advk-type-pct" data-type-pct="${fk}">${typePct(z, fk)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderAdvancedKicking(
  container: HTMLElement,
  advanced: AdvancedTactics,
  onChange: (next: AdvancedTactics) => void,
  onBack: () => void,
): void {
  const working = cloneAdvanced(advanced);

  container.innerHTML = `
    <div class="advk-wrapper">
      <div class="advk-toolbar">
        <button class="advk-back" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Presets</span>
        </button>
        <span class="advk-title">Advanced Kicking</span>
      </div>
      <p class="advk-intro">Calibrate how often you kick — and what kind of kick — in each zone of the pitch. Slow ruck ball and the closing minutes still adjust these on top.</p>
      <div class="advk-cards">
        ${ZONE_META.map(m => zoneCardHTML(working.kicking[m.key], m)).join('')}
      </div>
    </div>
  `;

  container.querySelector<HTMLButtonElement>('.advk-back')?.addEventListener('click', onBack);

  function refreshCard(zone: Zone): void {
    const z = working.kicking[zone];
    const card = container.querySelector<HTMLElement>(`.advk-card[data-zone="${zone}"]`);
    if (!card) return;
    card.querySelector<HTMLElement>('[data-freq-kick]')!.textContent = `${z.frequency}%`;
    card.querySelector<HTMLElement>('[data-freq-hand]')!.textContent = `${100 - z.frequency}%`;
    for (const fk of ZONE_FAMILIES[zone]) {
      card.querySelector<HTMLElement>(`[data-type-pct="${fk}"]`)!.textContent = typePct(z, fk);
    }
  }

  container.querySelectorAll<HTMLInputElement>('.advk-slider').forEach(slider => {
    slider.addEventListener('input', () => {
      const zone = slider.dataset.zone as Zone;
      const value = Number(slider.value);
      const z = working.kicking[zone];
      if (slider.dataset.field === 'frequency') {
        z.frequency = value;
      } else {
        z.types[slider.dataset.family as Family] = value;
      }
      refreshCard(zone);
      onChange(cloneAdvanced(working));
    });
  });
}
