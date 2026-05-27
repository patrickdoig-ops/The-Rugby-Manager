// Row tap-to-expand controller. Encapsulates the per-screen expand
// state + the delegated click handler so screens don't each re-invent
// the pattern. Used by ContractsScreen, SquadManagementScreen,
// TransferMarketScreen, RoundResultsScreen.
//
// **Identity convention.** Every row carries a stable id via a
// data attribute (`data-row-id`, or whatever the screen names). When
// the controller's click handler fires, it walks up from the click
// target to the nearest element with that attribute and toggles the
// id in a Set<string>. The screen's render() then reads
// `controller.isExpanded(id)` to decide whether to render the panel.
//
// **Tap-target preservation.** The click handler bails on any
// nested `<button>`, `<a>`, `.player-link`, or anything declaring
// `data-expand-skip`. Per-row chevron buttons (SquadManagement) can
// also drive the toggle manually via `controller.toggle(id)` after
// stopping propagation themselves.

export interface RowExpanderOpts {
  // The closest-ancestor selector that identifies a row container.
  rowSelector: string;
  // Attribute on the row whose VALUE is the unique id used in the
  // expanded-set. Defaults to 'data-row-id'.
  idAttr?: string;
  // Called after a toggle to trigger a re-render. The controller
  // doesn't know HOW to re-render the screen — the screen owns its
  // render function and passes it here.
  onChange: () => void;
}

export interface RowExpander {
  attach(container: HTMLElement): void;
  isExpanded(id: string): boolean;
  toggle(id: string): void;
  collapse(id: string): void;
  collapseAll(): void;
}

export function createRowExpander(opts: RowExpanderOpts): RowExpander {
  const idAttr = opts.idAttr ?? 'data-row-id';
  const expanded = new Set<string>();

  function toggle(id: string): void {
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    opts.onChange();
  }

  function attach(container: HTMLElement): void {
    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Bail when the click came from an interactive child the screen
      // owns separately (sort buttons, player-link, etc.). Buttons /
      // links inside the row's expand panel itself also bail — the
      // expand inner is responsible for stopPropagation on its own
      // controls if needed.
      if (target.closest('button, a, .player-link, [data-expand-skip]')) return;
      const row = target.closest<HTMLElement>(opts.rowSelector);
      if (!row || !container.contains(row)) return;
      const id = row.getAttribute(idAttr);
      if (!id) return;
      toggle(id);
    });
  }

  return {
    attach,
    isExpanded: (id: string) => expanded.has(id),
    toggle,
    collapse: (id: string) => {
      if (expanded.delete(id)) opts.onChange();
    },
    collapseAll: () => {
      if (expanded.size === 0) return;
      expanded.clear();
      opts.onChange();
    },
  };
}
