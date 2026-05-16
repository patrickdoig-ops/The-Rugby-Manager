export function buildAppShell(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div id="scoreboard">
      <div id="score-home">
        <span class="team-name" id="home-name">Home</span>
        <span class="score" id="home-score">0</span>
      </div>
      <div id="match-clock">
        <span id="clock-display">0'</span>
        <span id="phase-display" class="phase-badge"></span>
      </div>
      <div id="score-away">
        <span class="score" id="away-score">0</span>
        <span class="team-name" id="away-name">Away</span>
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
        <div class="panel-header" style="margin-top:8px;">Player Fatigue</div>
        <div id="fatigue-content"></div>
      </div>
    </div>
    <div id="sim-controls">
      <button id="btn-play" class="ctrl-btn primary">▶ Play</button>
      <button id="btn-pause" class="ctrl-btn" disabled>⏸ Pause</button>
      <label class="speed-label">
        <span class="speed-text">Speed</span>
        <input type="range" id="speed-slider" min="100" max="2000" value="600" step="100">
        <span id="speed-display">600ms</span>
      </label>
    </div>
    <div id="modal-overlay" class="hidden">
      <div id="modal-box"></div>
    </div>
  `;
}
