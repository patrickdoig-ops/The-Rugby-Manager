// Shared player-name link helper. Renders the player's name as inline
// text and attaches a `data-roster-id` attribute that callers wire up to
// a click handler — either by querying the rendered tree
// (`querySelectorAll('[data-roster-id]')`) or by registering a delegated
// listener on the parent container.
//
// Two helpers cover the two integration shapes seen in this codebase:
//   - `playerLinkHtml(name, rosterId)` returns a string for screens
//     that build their innerHTML via template literals. The caller then
//     wires up click + keyboard handlers in the same render pass.
//   - `wirePlayerLinks(root, onClick)` is the matching helper that
//     attaches the handlers in one shot — equivalent to the existing
//     pattern used by LeagueTableScreen / PlayerStatsScreen for
//     `data-team-id` clicks.
//
// Visual treatment lives in style/main.css (`.player-link` class — a
// muted link that highlights on hover / focus). The class is added on
// the rendered span so untransformed names remain visually distinct.

export function playerLinkHtml(name: string, rosterId: number): string {
  const safeName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const label = `View ${safeName}'s profile`;
  return `<span class="player-link" role="button" tabindex="0" data-roster-id="${rosterId}" aria-label="${label}">${safeName}</span>`;
}

// Scoped to .player-link so callers that already use data-roster-id on
// other elements (e.g. ContractsScreen rows, SquadManagement player
// rows) aren't accidentally wired up.
//
// Idempotent on the same element via `data-link-wired="1"` — a screen
// that re-renders without recreating its DOM subtree calls
// wirePlayerLinks again, and the second pass skips already-wired
// links instead of stacking duplicate click handlers (which would
// fire the callback N times per click).
export function wirePlayerLinks(root: ParentNode, onClick: (rosterId: number) => void): void {
  root.querySelectorAll<HTMLElement>('.player-link[data-roster-id]').forEach(el => {
    if (el.dataset.linkWired === '1') return;
    const rid = Number(el.dataset.rosterId);
    if (!Number.isFinite(rid)) return;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick(rid);
    });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        onClick(rid);
      }
    });
    el.dataset.linkWired = '1';
  });
}
