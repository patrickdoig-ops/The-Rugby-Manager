export function buildAppShell(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div id="scoreboard">
      <div id="score-home">
        <div class="team-crest" id="home-crest"><span></span></div>
        <div id="home-score-block">
          <div class="team-code" id="home-code"></div>
          <span class="score" id="home-score">00</span>
        </div>
      </div>
      <div id="match-clock">
        <span id="clock-display">0′</span>
        <span id="phase-display" class="phase-badge"></span>
      </div>
      <div id="score-away">
        <div id="away-score-block">
          <div class="team-code" id="away-code"></div>
          <span class="score" id="away-score">00</span>
        </div>
        <div class="team-crest" id="away-crest"><span></span></div>
      </div>
    </div>
    <div id="panel-pitch">
      <div id="pitch-wrapper">
        <span class="end-label" id="home-end-label">HOME</span>
        <div id="pitch-field">
          <div class="field-zone zone-home-try"></div>
          <div class="field-zone zone-home-22"></div>
          <div class="field-zone zone-midfield"></div>
          <div class="field-zone zone-away-22"></div>
          <div class="field-zone zone-away-try"></div>
          <div class="pitch-line line-home-22"></div>
          <div class="pitch-line line-halfway"></div>
          <div class="pitch-line line-away-22"></div>
          <div id="ball-marker"></div>
        </div>
        <span class="end-label" id="away-end-label">AWAY</span>
      </div>
      <div id="attack-label-row">
        <span id="attack-label"></span>
      </div>
    </div>
    <div id="panel-bottom">
      <div id="panel-commentary">
        <div class="panel-header">Commentary</div>
        <div id="commentary-feed"></div>
      </div>
      <div id="panel-stats">
        <div class="panel-header">Match Stats</div>
        <div id="stats-content"></div>
        <div class="panel-header" style="margin-top:6px;">Player Stats</div>
        <div id="player-stats-content"></div>
      </div>
    </div>
    <div id="sim-controls">
      <div id="ctrl-bar">
        <button id="btn-play" class="ctrl-btn primary" title="Play" aria-label="Play">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clip-rule="evenodd"/></svg>
        </button>
        <button id="btn-pause" class="ctrl-btn" disabled title="Pause" aria-label="Pause">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clip-rule="evenodd"/></svg>
        </button>
        <button id="btn-tactics" class="ctrl-btn" title="Tactics" aria-label="Tactics">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"/></svg>
        </button>
        <button id="btn-subs" class="ctrl-btn" title="Substitutions" aria-label="Substitutions">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
        </button>
        <label class="speed-label">
          <span class="speed-text">Speed</span>
          <input type="range" id="speed-slider" min="100" max="2000" value="1500" step="100">
          <span id="speed-display">600ms</span>
        </label>
      </div>
    </div>
    <div id="modal-overlay" class="hidden">
      <div id="modal-box"></div>
    </div>
  `;
}
