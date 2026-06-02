// Half-time team talk panel — full-screen overlay over the match screen.
// Subscribes to `engine:paused { type: 'team_talk_choice' }` and renders
// the dressing room UI without going through ScreenRouter (it lives on top
// of #app). The user picks a tone, then taps "Start Second Half" which
// calls onChoice and hides the panel.

import { eventBus } from '../utils/eventBus';
import type { TeamTalkTone } from '../types/engine';
import type { TalkArgs } from '../types/ui';
import { TEAM_TALK } from '../engine/balance';

function moraleLabel(avgMorale: number): { label: string; dots: string; cls: string } {
  if (avgMorale >= TEAM_TALK.flyingThreshold) {
    return { label: 'Flying', dots: '●●●●●', cls: 'ht-mood--flying' };
  } else if (avgMorale >= TEAM_TALK.flatThreshold) {
    return { label: 'Steady', dots: '●●●○○', cls: 'ht-mood--steady' };
  } else {
    return { label: 'Flat',   dots: '●●○○○', cls: 'ht-mood--flat' };
  }
}

function toneDescription(tone: TeamTalkTone, avgMorale: number): string {
  const isFlat   = avgMorale < TEAM_TALK.flatThreshold;
  const isFlying = avgMorale >= TEAM_TALK.flyingThreshold;
  switch (tone) {
    case 'calm':       return 'Hold your shape. Patience wins today.';
    case 'encourage':  return isFlat ? 'Worth a try — but this squad needs a lift.' : 'Trust the system. Your best form is in there.';
    case 'demand':     return isFlat ? 'Warning: pushing a fragile squad too hard can backfire.' : isFlying ? 'The squad is flying — go for the jugular.' : 'Clear the decks. Every mistake costs.';
    case 'single_out': return 'Call on a leader. The game goes through them today.';
  }
}

function computeTalkArgs(tone: TeamTalkTone, avgMorale: number, targetPlayerId?: number): TalkArgs {
  const isFlat = avgMorale < TEAM_TALK.flatThreshold;
  switch (tone) {
    case 'calm':
      return { attack: TEAM_TALK.calm.attack, defend: TEAM_TALK.calm.defend, decayMinutes: TEAM_TALK.calm.decayMinutes };
    case 'encourage': {
      const mul = isFlat ? TEAM_TALK.encourageFlatMultiplier : 1;
      return { attack: TEAM_TALK.encourage.attack * mul, defend: TEAM_TALK.encourage.defend * mul, decayMinutes: TEAM_TALK.encourage.decayMinutes };
    }
    case 'demand':
      if (isFlat) return { attack: TEAM_TALK.demandFlatAttack, defend: TEAM_TALK.demandFlatDefend, decayMinutes: TEAM_TALK.demand.decayMinutes };
      return { attack: TEAM_TALK.demand.attack, defend: TEAM_TALK.demand.defend, decayMinutes: TEAM_TALK.demand.decayMinutes };
    case 'single_out':
      return {
        attack: TEAM_TALK.singleOut.attack,
        defend: TEAM_TALK.singleOut.defend,
        decayMinutes: TEAM_TALK.singleOut.decayMinutes,
        singleOut: targetPlayerId !== undefined ? { playerId: targetPlayerId, bonus: TEAM_TALK.singleOut.playerBonus } : undefined,
      };
  }
}

export function initHalfTimeTalkPanel(panelEl: HTMLElement): void {
  eventBus.on('engine:paused', ({ payload }) => {
    if (payload.type !== 'team_talk_choice') return;
    const { state, averageMorale, onChoice } = payload;

    let selectedTone: TeamTalkTone | null = null;
    let selectedPlayerId: number | undefined;

    const mood = moraleLabel(averageMorale);
    const homeScore = state.score.home;
    const awayScore = state.score.away;
    const homeName = state.homeTeam.shortName ?? state.homeTeam.name;
    const awayName = state.awayTeam.shortName ?? state.awayTeam.name;

    // First-half stats summary
    const poss = state.stats.possession;
    const total = (poss.home + poss.away) || 1;
    const possHome = Math.round((poss.home / total) * 100);
    const terr = state.stats.territory;
    const terrTotal = (terr.home + terr.away) || 1;
    const terrHome = Math.round((terr.home / terrTotal) * 100);
    const triesHome = state.stats.tries.home;
    const triesAway = state.stats.tries.away;

    const TONES: { tone: TeamTalkTone; label: string }[] = [
      { tone: 'calm',       label: 'Hold Your Shape' },
      { tone: 'encourage',  label: 'Believe in the System' },
      { tone: 'demand',     label: 'Leave Nothing on the Pitch' },
      { tone: 'single_out', label: 'Give [Name] the Ball' },
    ];

    // Build player list from the human side's on-field players
    const humanSide = state.engine.humanSide;
    const humanTeam = humanSide === 'home' ? state.homeTeam : state.awayTeam;
    const starters = humanTeam.players.slice(0, 15);

    function renderTones(): string {
      return TONES.map(({ tone, label }) => {
        const isActive = selectedTone === tone;
        const isWarn = tone === 'demand' && averageMorale < TEAM_TALK.flatThreshold;
        const isGood = tone === 'demand' && averageMorale >= TEAM_TALK.flyingThreshold && !isWarn;
        let displayLabel = label;
        if (tone === 'single_out' && selectedPlayerId !== undefined) {
          const p = starters.find(s => s.id === selectedPlayerId);
          if (p) displayLabel = `Give ${p.firstName} ${p.lastName} the Ball`;
        }
        return `<button class="ht-tone-btn${isActive ? ' ht-tone-btn--active' : ''}${isWarn ? ' ht-tone-btn--warn' : ''}${isGood ? ' ht-tone-btn--good' : ''}" data-tone="${tone}">
          <span class="ht-tone-label">${displayLabel}</span>
          <span class="ht-tone-desc">${toneDescription(tone, averageMorale)}</span>
        </button>`;
      }).join('');
    }

    function renderPlayerList(): string {
      return `<div class="ht-player-list" id="ht-player-list">
        ${starters.map(p => `
          <button class="ht-player-item${p.id === selectedPlayerId ? ' ht-player-item--active' : ''}" data-player-id="${p.id}">
            <span class="ht-player-pos">${p.position.substring(0, 3).toUpperCase()}</span>
            <span class="ht-player-name">${p.firstName} ${p.lastName}</span>
          </button>
        `).join('')}
      </div>`;
    }

    function render(): void {
      const canStart = selectedTone !== null && (selectedTone !== 'single_out' || selectedPlayerId !== undefined);
      panelEl.innerHTML = `
        <div class="ht-panel">
          <div class="ht-header">
            <span class="ht-phase-label">&#9679; HALF TIME</span>
          </div>
          <div class="ht-scoreline">
            <span class="ht-team-name">${homeName}</span>
            <span class="ht-score">${homeScore} – ${awayScore}</span>
            <span class="ht-team-name">${awayName}</span>
          </div>
          <div class="ht-stats">
            <span>Possession ${possHome}%</span>
            <span class="ht-stats-dot">·</span>
            <span>Territory ${terrHome}%</span>
            <span class="ht-stats-dot">·</span>
            <span>Tries ${triesHome} – ${triesAway}</span>
          </div>
          <div class="ht-divider"></div>
          <div class="ht-dressing-label">DRESSING ROOM</div>
          <div class="ht-mood ${mood.cls}">
            <span class="ht-mood-dots">${mood.dots}</span>
            <span class="ht-mood-label">Squad mood: <strong>${mood.label}</strong></span>
          </div>
          <div class="ht-tones" id="ht-tones">
            ${renderTones()}
          </div>
          ${selectedTone === 'single_out' ? renderPlayerList() : ''}
          ${canStart ? `<div class="ht-footer">
            <button class="ht-start-btn" id="ht-start-btn">Start Second Half &rarr;</button>
          </div>` : ''}
        </div>
      `;

      document.querySelectorAll<HTMLButtonElement>('.ht-tone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tone = btn.dataset.tone as TeamTalkTone;
          selectedTone = tone;
          if (tone !== 'single_out') selectedPlayerId = undefined;
          render();
        });
      });

      document.querySelectorAll<HTMLButtonElement>('.ht-player-item').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedPlayerId = Number(btn.dataset.playerId);
          render();
        });
      });

      const startBtn = document.getElementById('ht-start-btn') as HTMLButtonElement | null;
      if (startBtn && canStart) {
        startBtn.addEventListener('click', () => {
          if (selectedTone === null) return;
          const args = computeTalkArgs(selectedTone, averageMorale, selectedPlayerId);
          panelEl.classList.add('hidden');
          onChoice(args);
        }, { once: true });
      }
    }

    panelEl.classList.remove('hidden');
    render();
  });
}
