// Half-time team talk panel — full-screen overlay over the match screen.
// Subscribes to `engine:paused { type: 'team_talk_choice' }` and renders
// the dressing room UI without going through ScreenRouter (it lives on top
// of #app). The user picks a tone, then taps "Start Second Half" which
// calls onChoice and hides the panel.

import { eventBus } from '../utils/eventBus';
import type { TeamTalkTone } from '../types/engine';
import type { TalkArgs } from '../types/ui';
import { TEAM_TALK } from '../engine/balance';
import {
  CALM_PHRASES, ENCOURAGE_PHRASES, DEMAND_PHRASES, SINGLE_OUT_PHRASES, pickPhrase,
} from './teamTalkPhrases';
import { moodPipSvg } from './components/moodMeter';

function moraleLabel(avgMorale: number): { label: string; filled: number; cls: string } {
  if (avgMorale >= TEAM_TALK.flyingThreshold) {
    return { label: 'Flying', filled: 5, cls: 'ht-mood--flying' };
  } else if (avgMorale >= TEAM_TALK.flatThreshold) {
    return { label: 'Steady', filled: 3, cls: 'ht-mood--steady' };
  } else {
    return { label: 'Flat',   filled: 2, cls: 'ht-mood--flat' };
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

function crestHtml(letter: string, color: string): string {
  return `<div class="ht-crest" style="background:linear-gradient(160deg,${color} 0%,color-mix(in oklch,${color} 30%,black) 100%);border:1px solid color-mix(in oklch,${color} 50%,transparent)"><span>${letter}</span></div>`;
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
    const homeLetter = (homeName[0] ?? '?').toUpperCase();
    const awayLetter = (awayName[0] ?? '?').toUpperCase();

    // First-half stats summary
    const poss = state.stats.possession;
    const total = (poss.home + poss.away) || 1;
    const possHome = Math.round((poss.home / total) * 100);
    const terr = state.stats.territory;
    const terrTotal = (terr.home + terr.away) || 1;
    const terrHome = Math.round((terr.home / terrTotal) * 100);
    const triesHome = state.stats.tries.home;
    const triesAway = state.stats.tries.away;

    const TONES: { tone: TeamTalkTone; label: string; category: string }[] = [
      { tone: 'calm',       label: pickPhrase(CALM_PHRASES),        category: 'Calm' },
      { tone: 'encourage',  label: pickPhrase(ENCOURAGE_PHRASES),   category: 'Encourage' },
      { tone: 'demand',     label: pickPhrase(DEMAND_PHRASES),      category: 'Demand' },
      { tone: 'single_out', label: pickPhrase(SINGLE_OUT_PHRASES),  category: 'Single Out' },
    ];

    const humanSide = state.engine.humanSide;
    const humanTeam = humanSide === 'home' ? state.homeTeam : state.awayTeam;
    const starters = humanTeam.players.slice(0, 15);

    function renderTones(): string {
      return TONES.map(({ tone, label, category }) => {
        const isActive = selectedTone === tone;
        const isWarn = tone === 'demand' && averageMorale < TEAM_TALK.flatThreshold;
        const isGood = isActive && tone === 'demand' && averageMorale >= TEAM_TALK.flyingThreshold && !isWarn;
        let displayLabel = label;
        if (tone === 'single_out' && selectedPlayerId !== undefined) {
          const p = starters.find(s => s.id === selectedPlayerId);
          if (p) displayLabel = label.replace('[Name]', `${p.firstName} ${p.lastName}`);
        }
        return `<button class="ht-tone-btn${isActive ? ' ht-tone-btn--active' : ''}${isWarn ? ' ht-tone-btn--warn' : ''}${isGood ? ' ht-tone-btn--good' : ''}" data-tone="${tone}">
          <span class="ht-tone-label">${displayLabel}<span class="ht-tone-cat"> (${category})</span></span>
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
          <div class="ht-topbar">
            <span class="ht-title">DRESSING ROOM: HALF-TIME</span>
          </div>
          <div class="ht-scoreline">
            ${crestHtml(homeLetter, state.homeTeam.color)}
            <span class="ht-team-name">${homeName}</span>
            <span class="ht-score">${homeScore} – ${awayScore}</span>
            <span class="ht-team-name">${awayName}</span>
            ${crestHtml(awayLetter, state.awayTeam.color)}
          </div>
          <div class="ht-stats">
            <span>Possession ${possHome}%</span>
            <span class="ht-stats-dot">·</span>
            <span>Territory ${terrHome}%</span>
            <span class="ht-stats-dot">·</span>
            <span>Tries ${triesHome} – ${triesAway}</span>
          </div>
          <div class="ht-divider"></div>
          <div class="ht-mood ${mood.cls}">
            ${moodPipSvg(mood.filled)}
            <span class="ht-mood-label">Squad mood: <strong>${mood.label}</strong></span>
          </div>
          <div class="ht-tones" id="ht-tones">
            ${renderTones()}
          </div>
          ${selectedTone === 'single_out' ? renderPlayerList() : ''}
          <div class="ht-footer">
            <button class="ht-start-btn" id="ht-start-btn" ${canStart ? '' : 'disabled'}>
              Start Second Half &rarr;
            </button>
          </div>
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
