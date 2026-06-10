// Save-slot management. Three fixed, renameable slots. Reachable from the Home
// screen ("Manage Saves") and from Settings (in-game, via Hub → Settings), so
// the player can snapshot the live career into a named slot mid-season.
//
// Autosave always targets the *active* slot (see SaveManager's active-slot
// wrappers); this screen is where the player switches the active slot, makes
// manual saves, renames / deletes, and exports / imports for iCloud backup.
//
// Like Settings, this screen registers no game:* subscriptions and is re-
// initialised on each navigation — it reads the live engine through a getter.

import type { GameCoordinator } from '../game/GameCoordinator';
import type { RawTeamInput } from '../types/teamData';
import {
  listSlots, saveToSlot, clearSlot, renameSlot, setActiveSlot, getActiveSlot,
  type SlotId, type SlotInfo,
} from './SaveManager';
import { exportSlot, importToSlot, listBackups, restoreBackup } from './saveBackup';
import { buildSaveContext, ordinalSuffix } from '../game/saveSummary';
import { confirmModal } from './components/confirmModal';
import { showToast } from './Toast';
import { helpButtonHtml } from './help/helpButton';

interface SavesScreenDeps {
  allTeams: RawTeamInput[];
  getGameEngine: () => GameCoordinator | null;
  onLoad: () => void;     // active slot is set first; caller resumes it
  onNewGame: () => void;  // active slot is set first; caller goes to team select
  onBack: () => void;
}

let deps: SavesScreenDeps | null = null;
let editingSlot: SlotId | null = null;
let fileInput: HTMLInputElement | null = null;
let pendingImportSlot: SlotId | null = null;

function backIcon(): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>`;
}

function relativeTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function slotCardHtml(info: SlotInfo, activeId: SlotId, gameLive: boolean): string {
  const isActive = info.id === activeId;
  const ctx = info.save ? buildSaveContext(info.save, deps!.allTeams) : null;
  const editing = editingSlot === info.id;

  const titleHtml = editing
    ? `<input class="saves-name-input" id="saves-name-${info.id}" value="${info.name.replace(/"/g, '&quot;')}" maxlength="24" />`
    : `<span class="saves-slot-name">${info.name}</span>`;

  const meta = ctx
    ? `
      <div class="saves-slot-body">
        <span class="saves-slot-team">${ctx.teamName}</span>
        <div class="saves-slot-stats">
          ${ctx.rank > 0 ? `<span class="saves-chip">${ctx.rank}${ordinalSuffix(ctx.rank)}</span>` : ''}
          <span class="saves-chip">${ctx.pts} pts</span>
          <span class="saves-chip">Wk ${ctx.week} / ${ctx.totalRounds}</span>
        </div>
        <div class="saves-slot-sub">${ctx.seasonLabel}${info.savedAt ? ` · saved ${relativeTime(info.savedAt)}` : ''}</div>
      </div>`
    : `<div class="saves-slot-body saves-slot-empty">Empty slot</div>`;

  // Action buttons differ for occupied vs empty slots.
  const occupied = info.save !== null;
  const actions = occupied
    ? `
      <button class="saves-act saves-act--primary" data-act="load" data-slot="${info.id}">Load &amp; Play</button>
      ${gameLive ? `<button class="saves-act" data-act="save" data-slot="${info.id}">Save here</button>` : ''}
      <button class="saves-act" data-act="rename" data-slot="${info.id}">Rename</button>
      <button class="saves-act" data-act="restore" data-slot="${info.id}">Restore backup</button>
      <button class="saves-act" data-act="export" data-slot="${info.id}">Export</button>
      <button class="saves-act" data-act="import" data-slot="${info.id}">Import</button>
      <button class="saves-act saves-act--danger" data-act="delete" data-slot="${info.id}">Delete</button>`
    : `
      <button class="saves-act saves-act--primary" data-act="new" data-slot="${info.id}">Start new game here</button>
      ${gameLive ? `<button class="saves-act" data-act="save" data-slot="${info.id}">Save here</button>` : ''}
      <button class="saves-act" data-act="import" data-slot="${info.id}">Import</button>`;

  return `
    <section class="saves-slot${isActive ? ' saves-slot--active' : ''}">
      <div class="saves-slot-head">
        ${titleHtml}
        ${isActive ? '<span class="saves-active-badge">Active</span>' : ''}
      </div>
      ${meta}
      <div class="saves-slot-actions">${actions}</div>
    </section>`;
}

function render(): void {
  if (!deps) return;
  const el = document.getElementById('saves');
  if (!el) return;

  const slots = listSlots();
  const activeId = getActiveSlot();
  const gameLive = deps.getGameEngine() !== null;

  el.innerHTML = `
    <div class="app-header">
      <div class="app-topbar">
        <button id="saves-back" class="app-back" aria-label="Back">
          ${backIcon()}
          <span>Back</span>
        </button>
        <span class="app-title">Saves</span>
        <div class="app-topbar-spacer">${helpButtonHtml('saves')}</div>
      </div>
    </div>

    <div id="saves-body">
      <p class="saves-intro">Three save slots. Your game autosaves to the <strong>active</strong> slot. Switch slots by loading one, or snapshot your current game into another with <strong>Save here</strong>. Export a slot to back it up to iCloud / Files.</p>
      ${slots.map(s => slotCardHtml(s, activeId, gameLive)).join('')}
    </div>
  `;

  el.querySelector<HTMLButtonElement>('#saves-back')!.addEventListener('click', () => deps!.onBack());

  // If a slot is mid-rename, focus its input and wire commit-on-blur/Enter.
  if (editingSlot !== null) {
    const input = el.querySelector<HTMLInputElement>(`#saves-name-${editingSlot}`);
    if (input) {
      const slot = editingSlot;
      input.focus();
      input.select();
      const commit = (): void => {
        renameSlot(slot, input.value);
        editingSlot = null;
        render();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { editingSlot = null; render(); }
      });
      input.addEventListener('blur', commit);
    }
  }

  el.querySelectorAll<HTMLButtonElement>('.saves-act').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = Number(btn.dataset.slot) as SlotId;
      void handleAction(btn.dataset.act ?? '', slot);
    });
  });
}

// Bottom-sheet picker listing a slot's backup generations (newest first).
// Resolves the chosen savedAt, or null on cancel / backdrop tap. Reuses the
// confirmModal sheet styling (style/saves.css .rm-confirm-*).
function pickBackup(entries: { savedAt: number }[]): Promise<number | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'rm-confirm-backdrop';
    const rows = entries.map(e =>
      `<button class="saves-act saves-backup-row" type="button" data-at="${e.savedAt}">${relativeTime(e.savedAt)}</button>`
    ).join('');
    backdrop.innerHTML = `
      <div class="rm-confirm" role="dialog" aria-modal="true">
        <div class="rm-confirm-handle"></div>
        <div class="rm-confirm-title">Restore a backup</div>
        <div class="rm-confirm-body">Pick an earlier snapshot to roll this slot back to. Your current save will be replaced.</div>
        <div class="saves-backup-list">${rows}</div>
        <div class="rm-confirm-actions">
          <button class="rm-confirm-btn rm-confirm-cancel" type="button">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const close = (result: number | null): void => { backdrop.remove(); resolve(result); };
    backdrop.querySelectorAll<HTMLButtonElement>('.saves-backup-row').forEach(btn =>
      btn.addEventListener('click', () => close(Number(btn.dataset.at))));
    backdrop.querySelector<HTMLButtonElement>('.rm-confirm-cancel')!
      .addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
  });
}

async function handleAction(act: string, slot: SlotId): Promise<void> {
  if (!deps) return;
  switch (act) {
    case 'load':
      setActiveSlot(slot);
      deps.onLoad();
      break;

    case 'new':
      setActiveSlot(slot);
      deps.onNewGame();
      break;

    case 'save': {
      const eng = deps.getGameEngine();
      if (!eng) return;
      const occupied = listSlots().find(s => s.id === slot)?.save !== null;
      if (occupied) {
        const ok = await confirmModal({
          title: 'Overwrite this slot?',
          body: 'This will replace the save currently in this slot with your current game. This cannot be undone.',
          confirmLabel: 'Overwrite',
          danger: true,
        });
        if (!ok) return;
      }
      try {
        saveToSlot(slot, eng.toSavePayload());
        setActiveSlot(slot);
        showToast('Game saved', 'success');
      } catch {
        showToast('Save failed — storage full', 'danger');
      }
      render();
      break;
    }

    case 'rename':
      editingSlot = slot;
      render();
      break;

    case 'delete': {
      const ok = await confirmModal({
        title: 'Delete this save?',
        body: 'This permanently deletes the save in this slot. This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      clearSlot(slot);
      showToast('Save deleted', 'info');
      render();
      break;
    }

    case 'restore': {
      const entries = await listBackups(slot);
      if (entries.length === 0) {
        showToast('No backups for this slot yet', 'info');
        return;
      }
      const chosen = await pickBackup(entries);
      if (chosen === null) return;
      const ok = await confirmModal({
        title: 'Restore this backup?',
        body: 'This replaces the save currently in this slot with the chosen snapshot. This cannot be undone.',
        confirmLabel: 'Restore',
        danger: true,
      });
      if (!ok) return;
      if (await restoreBackup(slot, chosen)) {
        setActiveSlot(slot);
        showToast('Backup restored', 'success');
      } else {
        showToast('Couldn’t restore that backup', 'danger');
      }
      render();
      break;
    }

    case 'export':
      try {
        await exportSlot(slot);
        showToast('Save exported', 'success');
      } catch {
        showToast('Nothing to export', 'danger');
      }
      break;

    case 'import':
      pendingImportSlot = slot;
      fileInput?.click();
      break;
  }
}

async function onFilePicked(): Promise<void> {
  if (!fileInput || pendingImportSlot === null) return;
  const file = fileInput.files?.[0];
  const slot = pendingImportSlot;
  pendingImportSlot = null;
  fileInput.value = '';
  if (!file) return;

  const occupied = listSlots().find(s => s.id === slot)?.save !== null;
  if (occupied) {
    const ok = await confirmModal({
      title: 'Overwrite this slot?',
      body: 'Importing will replace the save currently in this slot. This cannot be undone.',
      confirmLabel: 'Import',
      danger: true,
    });
    if (!ok) return;
  }
  try {
    await importToSlot(slot, file);
    showToast('Save imported', 'success');
  } catch {
    showToast('Invalid save file', 'danger');
  }
  render();
}

export function initSavesScreen(d: SavesScreenDeps): void {
  deps = d;
  editingSlot = null;
  // One hidden file input, created lazily and reused across renders.
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => void onFilePicked());
    document.body.appendChild(fileInput);
  }
  render();
}
