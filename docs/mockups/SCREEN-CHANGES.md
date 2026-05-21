# Rugby Simulator — Screen UI Changes (Updated)
**Design system:** Match Day Editorial v2  
**Mockups:** `mockups/` folder — one polished HTML file per screen  
**Note:** Rating colour scheme updated per DESIGN.md — gold (stat-3) = elite, NOT a bug.

---

## ⚠️ Rating Colour Clarification (NOT a bug)

The stat heatmap in the updated DESIGN.md is explicit:

| Token | Hue | Rating tier |
|---|---|---|
| `--rm-stat-3` | Gold | **Top** — ≥ 7.5 / 88+ attr |
| `--rm-stat-4` | Pitch green | Strong — 5.5–7.5 / 78–87 |
| `--rm-stat-5` | Cyan | Above avg — 3.5–5.5 / 65–77 |
| `--rm-stat-2` | Amber | Poor — < 3.5 / 50–64 |
| `--rm-stat-1` | Red | Very poor / error signal |

Gold tops the scale so elite numbers draw the eye. This is intentional design — do **not** "fix" `.rating-high { color: var(--rm-stat-3) }` or `statColor()` in PreMatchScreen. The previously flagged Bugs 1 and 2 are **not bugs**.

---

## 🔴 One Remaining Bug

### MOTM ★ emoji + hardcoded `#ffce4f`
**Files:** `src/ui/MatchResultScreen.ts` · `style/matchresult.css`

Violates two DESIGN.md rules: no emoji or Unicode symbols; no hardcoded colour outside the CTA/ball spec.

```ts
// src/ui/MatchResultScreen.ts — renderRatingsBlock()
// BEFORE:
${isMotm ? '<span class="mr-player-motm" title="Top rated">★</span>' : '...'}

// AFTER — Heroicons star solid:
${isMotm
  ? `<span class="mr-player-motm">
       <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
         <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.637 1.55.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.755-.415-2.211.749-2.305l5.404-.434 2.082-5.005z"/>
       </svg>
     </span>`
  : '<span class="mr-player-motm"></span>'}
```

```css
/* style/matchresult.css */
.mr-player-motm {
  display: flex;
  align-items: center;
  color: var(--rm-amber);   /* replaces hardcoded #ffce4f */
}
```

---

## Polish system applied to all screens

All v2 mockups apply these cross-cutting upgrades over the v1 mockups. Apply these patterns throughout when implementing.

### Card elevation
Every panel, tile, and card gets multi-layer shadows:
```css
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.055),  /* inner top highlight */
  0 2px 8px  rgba(0,0,0,0.55),             /* close shadow */
  0 8px 28px rgba(0,0,0,0.35);             /* ambient lift */
```

### Crest glow
Every team crest tile gets a team-colour radial glow:
```js
// In JS where crests are built (Scoreboard.ts, HubScreen.ts, etc.):
`box-shadow: 0 0 18px color-mix(in oklch, ${team.color} 40%, transparent),
             inset 0 1px 0 rgba(255,255,255,0.18),
             0 6px 20px rgba(0,0,0,0.5)`
```

### CTA pulse animation
All primary CTAs pulse subtly to signal interactivity:
```css
@keyframes ctaPulse {
  0%,100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.25),
                        0 8px 24px color-mix(in oklch, var(--rm-pitch) 30%, transparent); }
  50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,0.25),
                        0 8px 36px color-mix(in oklch, var(--rm-pitch) 55%, transparent); }
}
/* Apply to #start-game-btn, #hub-play-next, #mr-continue, #pm-start, #rr-continue */
.cta-primary { animation: ctaPulse 2.4s ease-in-out infinite; }
```

### Atmospheric hero backgrounds
Screens with a team-identity hero (Hub, Match Result) get a radial wash:
```css
/* Use the team's colour, set as a CSS variable from JS: */
background-image: radial-gradient(ellipse 110% 42% at 50% 0%,
  color-mix(in oklch, var(--team-color) 16%, transparent) 0%,
  transparent 70%);
```

### Frosted glass ctrl-bar
```css
#ctrl-bar {
  background: color-mix(in oklch, var(--rm-surface-2) 88%, transparent);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 4px 24px rgba(0,0,0,0.55);
}
```

---

## 01 — Home Screen
**Mockup:** `mockups/01-HomeScreen.html`  
**Files:** `src/ui/HomeScreen.ts` · `style/homescreen.css`

### HIGH — Continue button: show save context
```ts
// HomeScreen.ts — load and format save state for display:
const save = loadSave();
const contextLine = save
  ? `${save.player.teamName} · Wk ${save.calendar.week} / ${totalRounds} · ${rankLabel} · ${pts} pts`
  : '';

// In button HTML:
`<button id="continue-game-btn">
  <div class="continue-btn-row">
    <span>Continue</span>
    ${arrowIcon()}
  </div>
  ${contextLine ? `<span class="home-save-context">${contextLine}</span>` : ''}
</button>`
```
```css
/* style/homescreen.css: */
.home-save-context {
  font-family: var(--rm-font-mono);
  font-size: 10px; letter-spacing: 0.12em;
  color: var(--rm-pitch); text-transform: uppercase;
  display: block; margin-top: 3px; font-weight: 400;
}
#continue-game-btn {
  flex-direction: column; align-items: stretch;
  height: auto; min-height: 58px; padding: 12px 22px;
}
```

### HIGH — Overwrite warning when save exists
```ts
// HomeScreen.ts:
el.querySelector<HTMLButtonElement>('#start-game-btn')!.addEventListener('click', () => {
  if (hasSave) {
    showConfirm({
      title: 'Start New Game?',
      body: `This will delete your save — ${teamName}, Week ${week}, ${rankLabel}. Cannot be undone.`,
      confirmLabel: 'New Game',
      cancelLabel: 'Cancel',
      onConfirm: onStart,
    });
  } else {
    onStart();
  }
});
```

### MEDIUM — Pitch lines: landscape orientation
```ts
// HomeScreen.ts — pitchLinesSvg(): change to landscape viewBox
// viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice"
// Halfway line at x=195 (vertical), 22m lines at y=211 and y=633
// Centre circle at cx=195 cy=422 r=90
```

---

## 02 — Hub Screen
**Mockup:** `mockups/02-HubScreen.html`  
**Files:** `src/ui/HubScreen.ts` · `style/hub.css`

### HIGH — League standing widget in hero
```ts
// HubScreen.ts — render():
import { sortStandings } from '../game/leagueTable';
const sorted = sortStandings(state.league.standings);
const rankIdx = sorted.findIndex(s => s.teamId === playerTeam.id);
const standing = rankIdx >= 0 ? sorted[rankIdx] : null;
const rank = rankIdx + 1;

// Add to #hub-hero after team name:
`<div id="hub-standing">
  <div class="hub-standing-item">
    <span class="hub-standing-val">${rank}${ordinalSuffix(rank)}</span>
    <span class="hub-standing-label">Position</span>
  </div>
  <div class="hub-standing-item">
    <span class="hub-standing-val hub-standing-val--chalk">${standing?.leaguePoints ?? 0}</span>
    <span class="hub-standing-label">Points</span>
  </div>
  <div class="hub-standing-item">
    <span class="hub-standing-val hub-standing-val--chalk" style="font-size:20px">
      ${standing?.won ?? 0}W–${standing?.lost ?? 0}L
    </span>
    <span class="hub-standing-label">Record</span>
  </div>
</div>`
```

```css
/* style/hub.css: */
#hub-standing { display: flex; align-items: center; }
.hub-standing-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 0 14px;
  border-right: 1px solid var(--rm-hairline);
}
.hub-standing-item:last-child { border-right: none; }
.hub-standing-val {
  font-family: var(--rm-font-display); font-size: 28px; line-height: 1;
  /* Colour set inline to team colour */
}
.hub-standing-val--chalk { color: var(--rm-chalk); }
.hub-standing-label {
  font-family: var(--rm-font-mono); font-size: 8px;
  letter-spacing: 0.16em; color: var(--rm-text-dim); text-transform: uppercase;
}
```

### HIGH — Season progress bar
```ts
// HubScreen.ts:
const totalRounds = state.league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
const pct = totalRounds > 0 ? (state.calendar.week / totalRounds * 100).toFixed(1) : '0';

// Eyebrow: `${seasonLabel} · WK ${week} / ${totalRounds}`
// Add: `<div id="hub-progress"><div id="hub-progress-fill" style="width:${pct}%"></div></div>`
```
```css
/* style/hub.css: */
#hub-progress { width:180px; height:3px; background:var(--rm-surface-2); border-radius:2px; overflow:hidden; }
#hub-progress-fill { height:100%; background:linear-gradient(90deg, var(--rm-pitch-deep), var(--rm-pitch)); border-radius:2px; transition:width 0.4s ease; box-shadow:0 0 8px color-mix(in oklch,var(--rm-pitch) 60%,transparent); }
```

### HIGH — Dim stub tiles
```ts
// HubScreen.ts — add stub: true to Training, Contracts, Transfers in TILES array.
// In tile HTML: class="hub-tile${t.stub ? ' hub-tile--stub' : ''}" disabled=${t.stub}
// Skip event listener for stub tiles.
```
```css
/* style/hub.css: */
.hub-tile { position: relative; }
.hub-tile--stub { opacity: 0.32; cursor: default; pointer-events: none; }
.hub-tile-soon {
  position: absolute; top: 8px; right: 8px;
  font-family: var(--rm-font-mono); font-size: 7px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--rm-text-dim);
  background: var(--rm-surface-2); border: 1px solid var(--rm-border-soft);
  border-radius: 4px; padding: 1px 6px;
}
```

### MEDIUM — Match difficulty indicator
```ts
// In nextMatchHtml(): import matchSpread, formAdjustment, computeOverallRating
// Compute spread and add beneath .hub-nm-meta:
`<div class="hub-nm-spread">${spreadLabel}</div>`
```

---

## 03 — Team Selector
**Mockup:** `mockups/03-TeamSelector.html`  
**Files:** `src/ui/TeamSelectorScreen.ts` · `style/teamselector.css`

### HIGH — OVR heatmap colour (per updated DESIGN.md scale)
```ts
// TeamSelectorScreen.ts:
function ovrColor(r: number): string {
  if (r >= 85) return 'var(--rm-stat-3)'; // gold — elite
  if (r >= 78) return 'var(--rm-stat-4)'; // green — good
  if (r >= 70) return 'var(--rm-stat-5)'; // cyan — above avg
  if (r >= 62) return 'var(--rm-stat-2)'; // amber — below avg
  return 'var(--rm-stat-1)';              // red — poor
}
// Apply as inline style on .ts-card-ovr-value
// Add gold text-shadow for elite: text-shadow: 0 0 14px color-mix(in oklch, var(--rm-stat-3) 55%, transparent)
```

### MEDIUM — Enlarge .ts-card-info tap target
```css
/* style/teamselector.css: */
.ts-card-info { width: 44px; height: 44px; margin: -6px -6px 0 0; }
```

---

## 04 — Pre-Match
**Mockup:** `mockups/04-PreMatch.html`  
**Files:** `src/ui/PreMatchScreen.ts` · `style/prematch.css`

### HIGH — Pitch formation: rich mow-stripe background
```css
/* style/prematch.css — .pm-pitch-formation: */
.pm-pitch-formation {
  background: repeating-linear-gradient(180deg,
    color-mix(in oklch, var(--rm-pitch-deep) 58%, var(--rm-bg-deep)) 0,
    color-mix(in oklch, var(--rm-pitch-deep) 58%, var(--rm-bg-deep)) 22px,
    color-mix(in oklch, var(--rm-pitch-deep) 74%, var(--rm-bg-deep)) 22px,
    color-mix(in oklch, var(--rm-pitch-deep) 74%, var(--rm-bg-deep)) 44px);
  border-top: 1px solid color-mix(in oklch, var(--rm-pitch) 25%, transparent);
  overflow: hidden;
  box-shadow: inset 0 0 60px rgba(0,0,0,0.3);
}
/* Add radial vignette via ::before */
```

### MEDIUM — Tabs: use shortName to prevent overflow
```ts
// PreMatchScreen.ts — #pm-tabs:
`<button class="pm-tab active">${playerTeam.shortName}</button>`
`<button class="pm-tab">${oppTeam.shortName}</button>`
```

### MEDIUM — Active swap hint: amber colour signal
```css
/* style/prematch.css: */
.pm-bench-hint--active { color: var(--rm-amber); font-weight: 700; }
```

---

## 05 — Live Match
**Mockup:** `mockups/05-LiveMatch.html`  
**Files:** `src/ui/AppShell.ts` · `src/ui/SimController.ts` · `style/main.css`

### HIGH — Speed presets replace slider
```ts
// AppShell.ts — replace .speed-label block:
`<div class="speed-presets">
  <button class="speed-btn" data-ms="3000">½×</button>
  <button class="speed-btn speed-btn--active" data-ms="1500">1×</button>
  <button class="speed-btn" data-ms="600">2×</button>
  <button class="speed-btn" data-ms="200">4×</button>
</div>`

// SimController.ts — replace slider listener:
ctrlBar.querySelectorAll<HTMLButtonElement>('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    ctrlBar.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('speed-btn--active'));
    btn.classList.add('speed-btn--active');
    setTickInterval(Number(btn.dataset.ms));
  });
});
```
```css
/* style/main.css — add: */
.speed-presets { display:flex; gap:3px; margin-left:auto; }
.speed-btn { font-family:var(--rm-font-mono); font-size:11px; font-weight:700; padding:0 9px; height:32px; border-radius:8px; background:var(--rm-surface-2); border:1px solid var(--rm-border-soft); color:var(--rm-text-dim); cursor:pointer; }
.speed-btn--active { background:color-mix(in oklch,var(--rm-pitch) 20%,var(--rm-surface-2)); border-color:var(--rm-pitch); color:var(--rm-chalk); box-shadow:0 0 10px color-mix(in oklch,var(--rm-pitch) 25%,transparent); }
```

### HIGH — View toggle: add text labels
```ts
// AppShell.ts — each .view-btn:
`<button id="btn-view-dashboard" class="view-btn active">
  ${squaresIcon}
  <span class="view-btn-label">Dashboard</span>
</button>`
// … repeat for Commentary, Stats, Players
```
```css
/* style/main.css — update .view-btn: */
.view-btn { flex-direction: column; gap: 3px; padding: 8px 0; border-bottom: 2px solid transparent; }
.view-btn.active { border-bottom-color: var(--rm-pitch); background: color-mix(in oklch, var(--rm-pitch) 5%, transparent); }
.view-btn-label { font-family:var(--rm-font-mono); font-size:8px; letter-spacing:0.10em; text-transform:uppercase; line-height:1; }
```

### MEDIUM — Subs button pending badge
```ts
// AppShell.ts — add badge inside #btn-subs:
`<button id="btn-subs" class="ctrl-btn">
  ${subsIcon}
  <span class="ctrl-btn-badge" id="subs-badge" hidden></span>
</button>`

// SimController.ts — call when pending changes:
function updateSubsBadge(n: number): void {
  const b = document.getElementById('subs-badge') as HTMLSpanElement;
  if (!b) return;
  b.textContent = String(n);
  b.hidden = n === 0;
}
```
```css
/* style/main.css: */
.ctrl-btn { position: relative; }
.ctrl-btn-badge {
  position:absolute; top:-5px; right:-5px;
  width:17px; height:17px; border-radius:50%;
  background:var(--rm-amber); color:var(--rm-bg-deep);
  font-family:var(--rm-font-mono); font-size:9px; font-weight:700;
  display:flex; align-items:center; justify-content:center;
  border:2px solid var(--rm-bg-deep);
  box-shadow:0 0 8px color-mix(in oklch,var(--rm-amber) 55%,transparent);
}
```

### POLISH — TRY commentary entry: left-border highlight
```css
/* style/commentary.css — add to .event-try: */
.event-try {
  background: color-mix(in oklch, var(--rm-amber) 6%, transparent);
  border-left: 2px solid color-mix(in oklch, var(--rm-amber) 55%, transparent);
  padding-left: 8px;
}
```

---

## 06 — Match Result
**Mockup:** `mockups/06-MatchResult.html`  
**Files:** `src/ui/MatchResultScreen.ts` · `style/matchresult.css`

### BUG — MOTM ★ emoji (see top of document)

### HIGH — Add try scorers section
```ts
// MatchResultScreen.ts — add before renderStatsCard(state):
function renderScorers(state: MatchState): string {
  function lines(team: Team): string {
    const all = [...team.players, ...team.substitutedOff];
    return all
      .filter(p => p.matchStats.tries > 0 || p.matchStats.kicksMade > 0)
      .map(p => {
        const ev: string[] = [];
        if (p.matchStats.tries) ev.push(`${p.matchStats.tries > 1 ? p.matchStats.tries + '×' : ''}T`);
        if (p.matchStats.kicksMade) ev.push(`${p.matchStats.kicksMade}C`);
        return `<div class="mr-scorer-row">
          <span class="mr-scorer-name">${shortName(p)}</span>
          <span class="mr-scorer-events">${ev.join(' · ')}</span>
        </div>`;
      }).join('') || '<span class="mr-no-scorers">—</span>';
  }
  return `<section class="mr-card">
    <h2 class="mr-card-title">Try Scorers</h2>
    <div class="mr-scorers-grid">
      <div class="mr-scorers-team">
        <div class="mr-scorers-team-label" style="color:${teamTextColor(state.homeTeam.color)}">${state.homeTeam.shortName}</div>
        ${lines(state.homeTeam)}
      </div>
      <div class="mr-scorers-divider"></div>
      <div class="mr-scorers-team">
        <div class="mr-scorers-team-label" style="color:${teamTextColor(state.awayTeam.color)}">${state.awayTeam.shortName}</div>
        ${lines(state.awayTeam)}
      </div>
    </div>
  </section>`;
}
```

### HIGH — Result verdict headline
```ts
// MatchResultScreen.ts:
function matchVerdict(home: number, away: number, side: 'home' | 'away'): string {
  const margin = Math.abs(home - away);
  if (home === away) return 'A hard-fought draw.';
  const won = side === 'home' ? home > away : away > home;
  const mag = margin >= 20 ? 'Convincing' : margin >= 8 ? 'Comfortable' : 'Narrow';
  return won ? `${mag} victory — ${margin} points to the good.`
             : `${mag} defeat — lost by ${margin} points.`;
}
// Add <p class="mr-verdict"> beneath .mr-eyebrow
```
```css
/* style/matchresult.css: */
.mr-verdict {
  font-family: var(--rm-font-editor); font-style: italic;
  font-size: 17px; color: var(--rm-text-muted); margin-top: 5px; line-height: 1.45;
}
```

### MEDIUM — Score size: winner bigger
```ts
// MatchResultScreen.ts — scoreline:
const hw = score.home >= score.away;
`<span class="mr-score mr-score--${hw ? 'winner' : 'loser'}">${score.home}</span>`
`<span class="mr-score mr-score--${!hw ? 'winner' : 'loser'}">${score.away}</span>`
```
```css
.mr-score--winner { font-size: 68px; line-height: 1; color: var(--rm-chalk); }
.mr-score--loser  { font-size: 44px; line-height: 1; color: var(--rm-text-muted); }
```

---

## 07 — Round Results
**Mockup:** `mockups/07-RoundResults.html`  
**Files:** `src/ui/RoundResultsScreen.ts` · `style/roundresults.css`

### HIGH — Home/away venue pill
```ts
// RoundResultsScreen.ts — row HTML, add to home side:
`<span class="rr-venue-pill">H</span>`
```
```css
/* style/roundresults.css: */
.rr-venue-pill {
  font-family:var(--rm-font-mono); font-size:7px; font-weight:700; letter-spacing:0.12em;
  padding:1px 5px; border-radius:4px; flex-shrink:0;
  background:color-mix(in oklch,var(--rm-pitch) 14%,transparent);
  border:1px solid color-mix(in oklch,var(--rm-pitch) 30%,transparent);
  color:var(--rm-pitch);
}
```

### MEDIUM — Score magnitude bar
```ts
// RoundResultsScreen.ts — add beneath each row:
const t = result ? result.homeScore + result.awayScore : 0;
const hp = t > 0 ? ((result!.homeScore / t) * 100).toFixed(1) : '50';
`<div class="rr-margin-bar">
  <div style="width:${hp}%;background:${home.color}"></div>
  <div style="flex:1;background:${away.color};opacity:0.45"></div>
</div>`
```

### LOW — Pending pulse animation
```css
/* style/roundresults.css: */
.rr-pending { animation: rmPulse 1.8s ease-in-out infinite; color: var(--rm-text-dim); letter-spacing:0.2em; }
/* rmPulse already defined in style/main.css */
```

---

## 08 — League Table
**Mockup:** `mockups/08-LeagueTable.html`  
**Files:** `src/ui/LeagueTableScreen.ts` · `style/leaguetable.css`

### HIGH — Form column (last 5 results)
```ts
// LeagueTableScreen.ts:
import { recentForm } from '../game/teamStats';

// In render(), pass results:
const results = state.league.results;

// Update standingsRow to accept results param, compute form:
const form = recentForm(s.teamId, results);
const formHtml = form.map(r => {
  if (!r) return `<span class="lt-fp lt-fp--empty">–</span>`;
  return `<span class="lt-fp lt-fp--${r.toLowerCase()}">${r}</span>`;
}).join('');
// Add <div class="lt-form">${formHtml}</div> as last cell
// Add 76px to grid-template-columns
// Add "Form" to .lt-head
```
```css
/* style/leaguetable.css: */
.lt-form { display:flex; align-items:center; justify-content:flex-end; gap:2px; }
.lt-fp { width:12px; height:12px; border-radius:2px; display:flex; align-items:center; justify-content:center; font-family:var(--rm-font-mono); font-size:7px; font-weight:700; }
.lt-fp--w { background:color-mix(in oklch,var(--rm-stat-4) 22%,transparent); color:var(--rm-stat-4); }
.lt-fp--l { background:color-mix(in oklch,var(--rm-stat-1) 22%,transparent); color:var(--rm-stat-1); }
.lt-fp--d { background:color-mix(in oklch,var(--rm-text-dim) 18%,transparent); color:var(--rm-text-dim); }
```

### MEDIUM — Playoff zone separator
```ts
// LeagueTableScreen.ts:
const PLAYOFF_SPOTS = 4;
// On row at rank === PLAYOFF_SPOTS + 1, add class lt-row--zone-break
```
```css
/* style/leaguetable.css: */
.lt-row--zone-break { border-top: 2px solid color-mix(in oklch, var(--rm-stat-1) 42%, transparent) !important; }
```

### LOW — Column header tooltips
```ts
// Add title attributes to all .lt-head span elements:
// P="Played" W="Won" D="Drawn" L="Lost" PD="Points difference" Pts="League points" Form="Last 5 results"
```

---

## Implementation order

1. **Fix MOTM bug** — 5-minute fix, two files
2. **Match Result** — scorers + verdict + score sizes (most emotional impact)
3. **Hub** — standing widget + stub tiles + progress bar (most-visited screen)
4. **Live Match** — speed presets + view labels + subs badge
5. **League Table** — form column (recentForm already exists)
6. **Home** — save context + overwrite warning
7. **Pre-Match** — pitch formation background + tab shortNames
8. **Round Results** — venue pill + magnitude bar
9. **Team Selector** — OVR colour + tap target
10. **Polish pass** — card shadows, crest glows, CTA pulse animations
