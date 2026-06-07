// Telemetry Explorer App Logic

let rawData = null;
let aggs = [];
let totalFixtures = 0;
let combinedClubs = {};
let combinedPlayers = [];

// DOM Elements
const loadingState = document.getElementById('loading-state');
const runInfo = document.getElementById('run-info');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Init
async function init() {
  try {
    const res = await fetch('./latest.json?t=' + Date.now());
    if (!res.ok) throw new Error('Failed to load latest.json');
    rawData = await res.json();
    
    processData();
    setupEventListeners();
    
    // Initial render
    renderOverview();
    renderClubs();
    renderPlayers();
    renderTactics();
    renderPhases();
    
    // Hide loading, show first tab
    loadingState.style.display = 'none';
    document.getElementById('tab-overview').classList.remove('hidden');
    
    runInfo.textContent = `Generated: ${new Date(rawData.timestamp).toLocaleString()} (${rawData.elapsedMs}ms)`;
  } catch (err) {
    console.error(err);
    loadingState.innerHTML = `<div style="color:var(--danger)">Error loading data: ${err.message}. Make sure you've run 'npm run telemetry'.</div>`;
  }
}

// Data Processing
function processData() {
  aggs = rawData.aggs;
  totalFixtures = aggs.reduce((sum, a) => sum + a.matchCount, 0);
  
  // Combine Clubs
  const teamIds = Object.keys(aggs[0].clubs);
  teamIds.forEach(id => {
    combinedClubs[id] = { id };
    const fields = Object.keys(aggs[0].clubs[id]);
    fields.forEach(f => {
      if (typeof aggs[0].clubs[id][f] === 'number') {
        combinedClubs[id][f] = aggs.reduce((sum, a) => sum + (a.clubs[id][f] || 0), 0);
      }
    });
    // Calc league points
    combinedClubs[id].leaguePoints = combinedClubs[id].wins * 4 + combinedClubs[id].draws * 2 + combinedClubs[id].tryBonusPoints + combinedClubs[id].losingBonusPoints;
  });

  // Combine Players
  const playerMap = new Map();
  aggs.forEach(a => {
    Object.values(a.players).forEach(p => {
      const key = `${p.teamId}|${p.name}`;
      if (!playerMap.has(key)) {
        playerMap.set(key, { ...p });
      } else {
        const existing = playerMap.get(key);
        Object.keys(p).forEach(k => {
          if (typeof p[k] === 'number') {
            existing[k] += p[k];
          }
        });
      }
    });
  });
  combinedPlayers = Array.from(playerMap.values());
}

// Tab Navigation
function setupEventListeners() {
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.add('hidden'));
      
      btn.classList.add('active');
      const targetId = `tab-${btn.dataset.tab}`;
      document.getElementById(targetId).classList.remove('hidden');
    });
  });

  document.getElementById('club-stat-select').addEventListener('change', renderClubs);
  document.getElementById('leaderboard-select').addEventListener('change', renderPlayers);
  document.getElementById('player-search').addEventListener('input', renderPlayers);
}

// Renderers
function renderOverview() {
  // Standings
  const sortedClubs = Object.values(combinedClubs).sort((a, b) => b.leaguePoints - a.leaguePoints);
  const tbody = document.querySelector('#standings-table tbody');
  tbody.innerHTML = sortedClubs.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td>${c.games}</td>
      <td>${c.wins}</td>
      <td>${c.draws}</td>
      <td>${c.losses}</td>
      <td>${c.pointsFor}</td>
      <td>${c.pointsAgainst}</td>
      <td><strong>${c.leaguePoints}</strong></td>
    </tr>
  `).join('');

  // Global Stats
  let totalTries = sortedClubs.reduce((s, c) => s + c.tries, 0);
  let totalPens = sortedClubs.reduce((s, c) => s + c.penaltiesConceded, 0);
  let totalKnockOns = sortedClubs.reduce((s, c) => s + c.knockOns, 0);
  let totalYc = sortedClubs.reduce((s, c) => s + c.yellowCards, 0);
  
  document.getElementById('global-stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${totalFixtures}</div>
      <div class="stat-label">Total Fixtures</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${(totalTries / totalFixtures).toFixed(1)}</div>
      <div class="stat-label">Tries / Match</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${(totalPens / totalFixtures).toFixed(1)}</div>
      <div class="stat-label">Pens / Match</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${(totalKnockOns / totalFixtures).toFixed(1)}</div>
      <div class="stat-label">Knock-Ons / Match</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${(totalYc / totalFixtures).toFixed(2)}</div>
      <div class="stat-label">Yellows / Match</div>
    </div>
  `;
}

function renderClubs() {
  const mode = document.getElementById('club-stat-select').value;
  const sortedClubs = Object.values(combinedClubs).sort((a, b) => b.leaguePoints - a.leaguePoints);
  const thead = document.querySelector('#clubs-table thead');
  const tbody = document.querySelector('#clubs-table tbody');
  
  if (mode === 'attacking') {
    thead.innerHTML = `<tr><th>Club</th><th>Carries/g</th><th>Metres/Carry</th><th>Line Breaks/g</th><th>Def Beaten/g</th><th>Passes/g</th><th>Kicks/g</th></tr>`;
    tbody.innerHTML = sortedClubs.map(c => `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${(c.carries / c.games).toFixed(1)}</td>
        <td>${(c.metresCarried / Math.max(1, c.carries)).toFixed(2)}</td>
        <td>${(c.lineBreaks / c.games).toFixed(1)}</td>
        <td>${(c.defendersBeaten / c.games).toFixed(1)}</td>
        <td>${(c.passes / c.games).toFixed(1)}</td>
        <td>${(c.kicksFromHand / c.games).toFixed(1)}</td>
      </tr>
    `).join('');
  } else if (mode === 'defence') {
    thead.innerHTML = `<tr><th>Club</th><th>Tackles Att/g</th><th>Tackles Made/g</th><th>Tackle %</th><th>Turnovers/g</th></tr>`;
    tbody.innerHTML = sortedClubs.map(c => `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${(c.tacklesAttempted / c.games).toFixed(1)}</td>
        <td>${(c.tacklesMade / c.games).toFixed(1)}</td>
        <td>${((c.tacklesMade / Math.max(1, c.tacklesAttempted)) * 100).toFixed(1)}%</td>
        <td>${(c.turnoversWon / c.games).toFixed(1)}</td>
      </tr>
    `).join('');
  } else if (mode === 'setpiece') {
    thead.innerHTML = `<tr><th>Club</th><th>Lineout Win %</th><th>Lineout Steals/g</th><th>Scrum Win %</th><th>Scrum Pens Won/g</th></tr>`;
    tbody.innerHTML = sortedClubs.map(c => `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${((c.ownLineoutsWon / Math.max(1, c.ownLineoutsThrown)) * 100).toFixed(1)}%</td>
        <td>${(c.lineoutSteals / c.games).toFixed(1)}</td>
        <td>${((c.ownScrumsWon / Math.max(1, c.ownScrumsPutIn)) * 100).toFixed(1)}%</td>
        <td>${(c.scrumPenaltiesWon / 3 / c.games).toFixed(1)}</td>
      </tr>
    `).join('');
  } else if (mode === 'discipline') {
    thead.innerHTML = `<tr><th>Club</th><th>Pens Conceded/g</th><th>Yellow Cards</th><th>Red Cards</th></tr>`;
    tbody.innerHTML = sortedClubs.map(c => `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${(c.penaltiesConceded / c.games).toFixed(1)}</td>
        <td>${c.yellowCards}</td>
        <td>${c.redCards}</td>
      </tr>
    `).join('');
  }
}

function renderPlayers() {
  const metric = document.getElementById('leaderboard-select').value;
  const search = document.getElementById('player-search').value.toLowerCase();
  
  let pool = combinedPlayers.filter(p => p.name.toLowerCase().includes(search));
  
  // Custom sorting and formatting
  let sortFn, formatFn;
  switch (metric) {
    case 'tries': sortFn = p => p.tries; formatFn = p => p.tries; break;
    case 'carries': sortFn = p => p.carries; formatFn = p => p.carries; break;
    case 'metres': sortFn = p => p.metresCarried; formatFn = p => p.metresCarried; break;
    case 'lineBreaks': sortFn = p => p.lineBreaks; formatFn = p => p.lineBreaks; break;
    case 'defendersBeaten': sortFn = p => p.defendersBeaten; formatFn = p => p.defendersBeaten; break;
    case 'tackles': sortFn = p => p.tacklesMade; formatFn = p => p.tacklesMade; break;
    case 'dominantTackles': sortFn = p => p.dominantTackles; formatFn = p => p.dominantTackles; break;
    case 'turnovers': sortFn = p => p.turnoversWon; formatFn = p => p.turnoversWon; break;
    case 'kickMetres': sortFn = p => p.kickMetres; formatFn = p => p.kickMetres; break;
    case 'kickingAccuracy': 
      pool = pool.filter(p => p.kicksAtGoal >= 10);
      sortFn = p => p.kicksMade / p.kicksAtGoal; 
      formatFn = p => `${((p.kicksMade / p.kicksAtGoal) * 100).toFixed(1)}% (${p.kicksMade}/${p.kicksAtGoal})`;
      break;
    case 'rating':
      pool = pool.filter(p => p.appearances >= 9);
      sortFn = p => p.ratingSum / p.appearances;
      formatFn = p => (p.ratingSum / p.appearances).toFixed(2);
      break;
    case 'offloads': sortFn = p => p.offloadsCompleted; formatFn = p => `${p.offloadsCompleted} / ${p.offloadsAttempted}`; break;
  }

  const sorted = pool.sort((a, b) => sortFn(b) - sortFn(a)).slice(0, 50);
  
  const tbody = document.querySelector('#players-table tbody');
  tbody.innerHTML = sorted.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${p.name}</strong></td>
      <td>${p.teamId}</td>
      <td>${p.position}</td>
      <td>${p.appearances}</td>
      <td style="color: var(--accent-color); font-weight: bold;">${formatFn(p)}</td>
    </tr>
  `).join('');
}

function renderTactics() {
  function sumTacticAgg(aggName) {
    const combined = {};
    aggs.forEach(a => {
      Object.keys(a[aggName] || {}).forEach(k => {
        if (!combined[k]) combined[k] = { ...a[aggName][k] };
        else {
          Object.keys(a[aggName][k]).forEach(f => {
            if (typeof a[aggName][k][f] === 'number') combined[k][f] += a[aggName][k][f];
          });
        }
      });
    });
    return combined;
  }

  const planAgg = sumTacticAgg('planAgg');
  document.querySelector('#tactics-plan-table tbody').innerHTML = Object.keys(planAgg).map(k => `
    <tr>
      <td>${k}</td>
      <td>${planAgg[k].games}</td>
      <td>${planAgg[k].games ? (planAgg[k].tries / planAgg[k].games).toFixed(2) : 0}</td>
      <td>${planAgg[k].games ? (planAgg[k].possessionPct / planAgg[k].games).toFixed(1) : 0}%</td>
    </tr>
  `).join('');

  const bdAgg = sumTacticAgg('bdAgg');
  document.querySelector('#tactics-bd-table tbody').innerHTML = Object.keys(bdAgg).map(k => `
    <tr>
      <td>${k}</td>
      <td>${bdAgg[k].games}</td>
      <td>${bdAgg[k].games ? (bdAgg[k].carries / bdAgg[k].games).toFixed(1) : 0}</td>
      <td>${bdAgg[k].games ? (bdAgg[k].turnoversWon / bdAgg[k].games).toFixed(1) : 0}</td>
    </tr>
  `).join('');

  const dlAgg = sumTacticAgg('dlAgg');
  document.querySelector('#tactics-dl-table tbody').innerHTML = Object.keys(dlAgg).map(k => `
    <tr>
      <td>${k}</td>
      <td>${dlAgg[k].games}</td>
      <td>${dlAgg[k].games ? (dlAgg[k].concededLineBreaks / dlAgg[k].games).toFixed(2) : 0}</td>
      <td>${dlAgg[k].games ? (dlAgg[k].dominantTacklesMade / dlAgg[k].games).toFixed(1) : 0}</td>
    </tr>
  `).join('');

  const offAgg = sumTacticAgg('offAgg');
  document.querySelector('#tactics-off-table tbody').innerHTML = Object.keys(offAgg).map(k => `
    <tr>
      <td>${k}</td>
      <td>${offAgg[k].games}</td>
      <td>${offAgg[k].games ? (offAgg[k].offloadsAttempted / offAgg[k].games).toFixed(1) : 0}</td>
      <td>${offAgg[k].games ? (offAgg[k].tries / offAgg[k].games).toFixed(2) : 0}</td>
    </tr>
  `).join('');
}

let phaseChartInst = null;
let tryChartInst = null;

function renderPhases() {
  const combinedPhases = {};
  const combinedOrigin = {};
  
  aggs.forEach(a => {
    Object.keys(a.phaseCount || {}).forEach(k => {
      combinedPhases[k] = (combinedPhases[k] || 0) + a.phaseCount[k];
    });
    Object.keys(a.tryOrigin || {}).forEach(k => {
      combinedOrigin[k] = (combinedOrigin[k] || 0) + a.tryOrigin[k];
    });
  });

  const pData = Object.entries(combinedPhases).sort((a,b) => b[1]-a[1]).slice(0, 10);
  const oData = Object.entries(combinedOrigin).sort((a,b) => b[1]-a[1]).slice(0, 8);

  const colors = [
    'rgba(59, 130, 246, 0.8)', 'rgba(139, 92, 246, 0.8)', 'rgba(236, 72, 153, 0.8)',
    'rgba(244, 63, 94, 0.8)', 'rgba(245, 158, 11, 0.8)', 'rgba(16, 185, 129, 0.8)',
    'rgba(14, 165, 233, 0.8)', 'rgba(99, 102, 241, 0.8)', 'rgba(217, 70, 239, 0.8)',
    'rgba(249, 115, 22, 0.8)'
  ];

  if (phaseChartInst) phaseChartInst.destroy();
  phaseChartInst = new Chart(document.getElementById('phase-chart'), {
    type: 'bar',
    data: {
      labels: pData.map(d => d[0]),
      datasets: [{ label: 'Occurrences', data: pData.map(d => d[1]), backgroundColor: colors }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { color: '#94a3b8' } },
        x: { ticks: { color: '#94a3b8' } }
      }
    }
  });

  if (tryChartInst) tryChartInst.destroy();
  tryChartInst = new Chart(document.getElementById('try-chart'), {
    type: 'pie',
    data: {
      labels: oData.map(d => d[0]),
      datasets: [{ data: oData.map(d => d[1]), backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { color: '#f8fafc' } }
      }
    }
  });
}

init();
