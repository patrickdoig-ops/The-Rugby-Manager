export function buildAppShell(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div id="scoreboard">
      <div id="score-home">
        <div class="team-crest" id="home-crest">
          <span></span>
          <div class="card-stack" id="home-cards"></div>
        </div>
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
        <div class="team-crest" id="away-crest">
          <span></span>
          <div class="card-stack" id="away-cards"></div>
        </div>
      </div>
      <div id="pitch-wrapper">
        <span class="end-label" id="home-end-label">HOME</span>
        <div id="pitch-field">
          <div class="pitch-line line-home-try"></div>
          <div class="pitch-line line-home-22"></div>
          <div class="pitch-line line-halfway"></div>
          <div class="pitch-line line-away-22"></div>
          <div class="pitch-line line-away-try"></div>
          <div id="ball-marker"></div>
          <span id="attack-label"></span>
        </div>
        <span class="end-label" id="away-end-label">AWAY</span>
      </div>
    </div>
    <div id="view-toggle-bar">
      <button id="btn-view-dashboard" class="view-btn active" title="Dashboard" aria-label="Dashboard">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M3 6a3 3 0 013-3h2.25a3 3 0 013 3v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm9.75 0a3 3 0 013-3H18a3 3 0 013 3v2.25a3 3 0 01-3 3h-2.25a3 3 0 01-3-3V6zM3 15.75a3 3 0 013-3h2.25a3 3 0 013 3V18a3 3 0 01-3 3H6a3 3 0 01-3-3v-2.25zm9.75 0a3 3 0 013-3H18a3 3 0 013 3V18a3 3 0 01-3 3h-2.25a3 3 0 01-3-3v-2.25z" clip-rule="evenodd"/></svg>
        <span class="view-btn-label">Dashboard</span>
      </button>
      <button id="btn-view-commentary" class="view-btn" title="Commentary" aria-label="Commentary">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M12 2.25c-2.429 0-4.817.178-7.152.521C2.87 3.061 1.5 4.795 1.5 6.741v6.018c0 1.946 1.37 3.68 3.348 3.97.877.129 1.761.234 2.652.316V21a.75.75 0 001.28.53l4.184-4.183a.39.39 0 01.266-.112c2.006-.05 3.982-.22 5.922-.506 1.978-.29 3.348-2.023 3.348-3.97V6.741c0-1.946-1.37-3.68-3.348-3.97A49.145 49.145 0 0012 2.25zM8.25 8.625a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zm2.625 1.125a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875-1.125a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z" clip-rule="evenodd"/></svg>
        <span class="view-btn-label">Commentary</span>
      </button>
      <button id="btn-view-stats" class="view-btn" title="Match Stats" aria-label="Match Stats">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z"/></svg>
        <span class="view-btn-label">Stats</span>
      </button>
      <button id="btn-view-players" class="view-btn" title="Player Stats" aria-label="Player Stats">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clip-rule="evenodd"/><path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.487l-.115.04c-.567.2-1.156.349-1.764.441z"/></svg>
        <span class="view-btn-label">Players</span>
      </button>
    </div>
    <div id="panel-bottom" class="view-dashboard">
      <div id="latest-commentary"></div>
      <div id="panel-commentary">
        <div class="panel-header">Commentary</div>
        <div id="commentary-feed"></div>
      </div>
      <div id="panel-stats">
        <div class="panel-header">Match Stats</div>
        <div id="stats-content"></div>
      </div>
      <div id="panel-players">
        <div class="panel-header">Player Stats</div>
        <div id="player-stats-content"></div>
        <div id="player-detail-content"></div>
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
          <span class="ctrl-btn-badge" id="subs-badge" hidden></span>
        </button>
        <div class="speed-presets" role="group" aria-label="Simulation speed">
          <button class="speed-btn" data-ms="3000" aria-label="Half speed">½×</button>
          <button class="speed-btn speed-btn--active" data-ms="1500" aria-label="Normal speed">1×</button>
          <button class="speed-btn" data-ms="600" aria-label="Double speed">2×</button>
          <button class="speed-btn" data-ms="200" aria-label="Quadruple speed">4×</button>
        </div>
      </div>
    </div>
    <div id="modal-overlay" class="hidden">
      <div id="modal-box"></div>
    </div>
  `;
}
