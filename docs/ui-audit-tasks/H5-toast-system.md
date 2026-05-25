# H5-toast-system — Introduce shared showToast helper and emit on key actions

> **Severity:** High
> **Audit reference:** `Design Review.html` → Issues → H5-toast-system

## Files to edit

- `style/main.css`
- `src/ui/Toast.ts (new file)`
- `src/ui/SquadManagementScreen.ts`
- `src/ui/TransferMarketScreen.ts`
- `src/ui/RenewalsScreen.ts`

## Problem

Saving a squad, signing a free agent, and confirming a renewal all complete silently. No confirmation, no animation, no state change. Football Manager provides clear feedback for every meaningful action. This is one of the most visible polish gaps in the product.

## Fix

**Step 1 — Create `src/ui/Toast.ts`:**

```ts
let toastEl: HTMLElement | null = null;
let dismissTimer: number | null = null;

export function showToast(message: string, variant: 'success' | 'info' | 'danger' = 'success') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'rm-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.className = `rm-toast rm-toast--${variant}`;
  toastEl.textContent = message;
  toastEl.classList.add('rm-toast--visible');

  if (dismissTimer) window.clearTimeout(dismissTimer);
  dismissTimer = window.setTimeout(() => {
    toastEl?.classList.remove('rm-toast--visible');
  }, 1800);

  toastEl.onclick = () => {
    if (dismissTimer) window.clearTimeout(dismissTimer);
    toastEl?.classList.remove('rm-toast--visible');
  };
}
```

**Step 2 — Add CSS to `style/main.css`:**

```css
.rm-toast {
  position: fixed;
  left: 50%;
  bottom: calc(var(--safe-bottom) + 16px);
  transform: translateX(-50%) translateY(20px);
  z-index: 1000;
  padding: 11px 22px;
  border-radius: 999px;
  background: var(--rm-surface-3);
  color: var(--rm-chalk);
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
  border: 1px solid var(--rm-pitch);
  box-shadow: var(--rm-card-shadow);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.rm-toast--visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}
.rm-toast--danger { border-color: var(--rm-danger); }
.rm-toast--info { border-color: var(--rm-stat-5); }
```

**Step 3 — Emit on key actions:**

In `SquadManagementScreen.ts` — after a successful squad save:
```ts
import { showToast } from './Toast';
// ... after save handler completes
showToast('Squad saved');
```

In `TransferMarketScreen.ts` — after a free agent signs:
```ts
showToast(`${player.name} signed`);
```

In `RenewalsScreen.ts` — after a renewal confirms:
```ts
showToast(`${player.name} renewed`);
```

Use `showToast(message, 'danger')` for failed actions (e.g. cap exceeded).

## Expected result

On squad save, a pill slides up from the bottom, displays for 1.8s, then fades. Same on signing and renewal. Tapping the toast dismisses it immediately. The toast respects safe-area on iOS.

## Acceptance

- [ ] Only the files listed above are modified
- [ ] `pnpm typecheck` passes (or equivalent for the toolchain)
- [ ] No new console warnings in browser devtools
- [ ] Visual check matches the "Expected result" block above
- [ ] No regression on other screens that share affected tokens or files
- [ ] `grep` checks (if listed in the fix) return the expected counts

## Suggested commit message

```
feat(toast): introduce showToast helper and shared component (#H5)
```
