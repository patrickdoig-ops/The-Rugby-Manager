// Pre-match dressing room screen. Routes through ScreenRouter after
// PreMatchScreen (post-tactics step), before the engine starts. The human
// manager picks one of four tones; the result is passed as TalkArgs to
// MatchCoordinator's humanPreTalk option.

import type { TeamTalkTone } from '../types/engine';
import type { TalkArgs } from '../types/ui';
import { TEAM_TALK } from '../engine/balance';
import {
  CALM_PHRASES, ENCOURAGE_PHRASES, DEMAND_PHRASES, SINGLE_OUT_PHRASES, pickPhrase,
} from './teamTalkPhrases';

function moraleLabel(avgMorale: number): { label: string; dots: string; cls: string } {
  if (avgMorale >= TEAM_TALK.flyingThreshold) {
    return { label: 'Flying', dots: '●●●●●', cls: 'tt-mood--flying' };
  } else if (avgMorale >= TEAM_TALK.flatThreshold) {
    return { label: 'Steady', dots: '●●●○○', cls: 'tt-mood--steady' };
  } else {
    return { label: 'Flat',   dots: '●●○○○', cls: 'tt-mood--flat' };
  }
}

function toneDescription(tone: TeamTalkTone, avgMorale: number): string {
  const isFlat    = avgMorale < TEAM_TALK.flatThreshold;
  const isFlying  = avgMorale >= TEAM_TALK.flyingThreshold;
  switch (tone) {
    case 'calm':      return 'Hold your shape. Patience wins today.';
    case 'encourage': return isFlat
      ? 'Worth a try — but this squad needs a confidence lift first.'
      : 'Trust the system. Your best form is in there.';
    case 'demand':    return isFlat
      ? 'Warning: pushing a fragile squad too hard can backfire.'
      : isFlying
        ? 'The squad is flying — go for the jugular.'
        : 'Clear the decks. Every mistake costs today.';
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
      return {
        attack: TEAM_TALK.encourage.attack * mul,
        defend: TEAM_TALK.encourage.defend * mul,
        decayMinutes: TEAM_TALK.encourage.decayMinutes,
      };
    }
    case 'demand':
      if (isFlat) {
        return { attack: TEAM_TALK.demandFlatAttack, defend: TEAM_TALK.demandFlatDefend, decayMinutes: TEAM_TALK.demand.decayMinutes };
      }
      return { attack: TEAM_TALK.demand.attack, defend: TEAM_TALK.demand.defend, decayMinutes: TEAM_TALK.demand.decayMinutes };
    case 'single_out':
      return {
        attack: TEAM_TALK.singleOut.attack,
        defend: TEAM_TALK.singleOut.defend,
        decayMinutes: TEAM_TALK.singleOut.decayMinutes,
        singleOut: targetPlayerId !== undefined
          ? { playerId: targetPlayerId, bonus: TEAM_TALK.singleOut.playerBonus }
          : undefined,
      };
  }
}

type Starter = { id: number; firstName: string; lastName: string; position: string };

export function initTeamTalkScreen(
  playerTeam: { name: string; shortName: string; color: string },
  oppTeam: { name: string; shortName: string; color: string },
  contextLabel: string,
  starters: Starter[],
  averageMorale: number,
  onTalkChosen: (args: TalkArgs) => void,
): void {
  const el = document.getElementById('team-talk')!;
  const mood = moraleLabel(averageMorale);

  const TONES: { tone: TeamTalkTone; label: string; category: string }[] = [
    { tone: 'calm',       label: pickPhrase(CALM_PHRASES),        category: 'Calm' },
    { tone: 'encourage',  label: pickPhrase(ENCOURAGE_PHRASES),   category: 'Encourage' },
    { tone: 'demand',     label: pickPhrase(DEMAND_PHRASES),      category: 'Demand' },
    { tone: 'single_out', label: pickPhrase(SINGLE_OUT_PHRASES),  category: 'Single Out' },
  ];

  let selectedTone: TeamTalkTone | null = null;
  let selectedPlayerId: number | undefined;

  function crestSm(letter: string, color: string): string {
    return `<div class="tt-crest" style="
      background:linear-gradient(160deg,${color} 0%,color-mix(in oklch,${color} 30%,black) 100%);
      border:1px solid color-mix(in oklch,${color} 50%,transparent);
    "><span>${letter}</span></div>`;
  }

  function renderPlayerList(): string {
    return `<div class="tt-player-list" id="tt-player-list">
      ${starters.map(p => `
        <button class="tt-player-item" data-player-id="${p.id}">
          <span class="tt-player-pos">${p.position.substring(0, 3).toUpperCase()}</span>
          <span class="tt-player-name">${p.firstName} ${p.lastName}</span>
        </button>
      `).join('')}
    </div>`;
  }

  function renderTones(): string {
    return TONES.map(({ tone, label, category }) => {
      const desc = toneDescription(tone, averageMorale);
      const isActive = selectedTone === tone;
      const isWarn = tone === 'demand' && averageMorale < TEAM_TALK.flatThreshold;
      const isGood = tone === 'demand' && averageMorale >= TEAM_TALK.flyingThreshold && !isWarn;
      let displayLabel = label;
      if (tone === 'single_out' && selectedPlayerId !== undefined) {
        const p = starters.find(s => s.id === selectedPlayerId);
        if (p) displayLabel = label.replace('[Name]', `${p.firstName} ${p.lastName}`);
      }
      return `<button class="tt-tone-btn${isActive ? ' tt-tone-btn--active' : ''}${isWarn ? ' tt-tone-btn--warn' : ''}${isGood ? ' tt-tone-btn--good' : ''}" data-tone="${tone}">
        <span class="tt-tone-label">${displayLabel}<span class="tt-tone-cat"> (${category})</span></span>
        <span class="tt-tone-desc">${desc}</span>
      </button>`;
    }).join('');
  }

  function render(): void {
    const canKickOff = selectedTone !== null && (selectedTone !== 'single_out' || selectedPlayerId !== undefined);
    el.innerHTML = `
      <div class="tt-screen">
        <div class="tt-topbar">
          <span class="tt-title">DRESSING ROOM: PRE-MATCH</span>
        </div>
        <div class="tt-versus">
          ${crestSm((playerTeam.shortName[0] ?? '?').toUpperCase(), playerTeam.color)}
          <div class="tt-versus-label">${contextLabel}</div>
          ${crestSm((oppTeam.shortName[0] ?? '?').toUpperCase(), oppTeam.color)}
        </div>
        <div class="tt-mood ${mood.cls}">
          <span class="tt-mood-dots">${mood.dots}</span>
          <span class="tt-mood-label">Squad mood: <strong>${mood.label}</strong></span>
        </div>
        <div class="tt-tones" id="tt-tones">
          ${renderTones()}
        </div>
        ${selectedTone === 'single_out' ? renderPlayerList() : ''}
        <div class="tt-footer">
          <button class="tt-kickoff-btn" id="tt-kickoff" ${canKickOff ? '' : 'disabled'}>
            Kick Off &rarr;
          </button>
        </div>
      </div>
    `;

    document.querySelectorAll<HTMLButtonElement>('.tt-tone-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tone = btn.dataset.tone as TeamTalkTone;
        selectedTone = tone;
        if (tone !== 'single_out') selectedPlayerId = undefined;
        render();
      });
    });

    document.querySelectorAll<HTMLButtonElement>('.tt-player-item').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedPlayerId = Number(btn.dataset.playerId);
        render();
      });
    });

    const kickoffBtn = document.getElementById('tt-kickoff') as HTMLButtonElement | null;
    if (kickoffBtn && canKickOff) {
      kickoffBtn.addEventListener('click', () => {
        if (selectedTone === null) return;
        const args = computeTalkArgs(selectedTone, averageMorale, selectedPlayerId);
        onTalkChosen(args);
      }, { once: true });
    }
  }

  render();
}
