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
      <canvas id="pitch-canvas"></canvas>
    </div>
    <div id="panel-bottom">
      <div id="tab-bar">
        <button class="tab-btn active" data-target="panel-commentary">📻 Commentary</button>
        <button class="tab-btn" data-target="panel-stats">📊 Stats</button>
      </div>
      <div id="panel-commentary" class="tab-panel tab-active">
        <div class="panel-header">Commentary</div>
        <div id="commentary-feed"></div>
      </div>
      <div id="panel-stats" class="tab-panel">
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

  // Tab switching
  const tabBtns = app.querySelectorAll<HTMLButtonElement>('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target!;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      app.querySelectorAll<HTMLElement>('.tab-panel').forEach(panel => {
        panel.classList.toggle('tab-active', panel.id === targetId);
      });
    });
  });
}
