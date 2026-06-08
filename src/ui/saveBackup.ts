// Durable backup layer for the save slots. Two concerns, both no-ops on web
// where localStorage is the store of record:
//
//   (A) Device backup — on native (Capacitor/iOS) every slot write is mirrored
//       to a file in Directory.Documents (saves/slot-{id}.json). The Documents
//       directory is included in the device's iCloud Backup and is not evicted
//       under storage pressure, unlike the WKWebView localStorage sandbox. On
//       boot, reconcileBackups() hydrates localStorage from disk when a slot is
//       missing locally but present on disk (the reinstall / OS-eviction
//       restore path).
//
//   (B) Export / import — exportSlot() hands a slot's JSON to the iOS Share
//       Sheet (native) or triggers a Blob download (web), so the user can drop
//       it in iCloud Drive / Files. importToSlot() restores from a picked file
//       on both platforms (the <input type=file> opens Files inside WKWebView).
//
// The hot game loop stays synchronous; disk mirroring is fire-and-forget.

import { Capacitor } from '@capacitor/core';
import {
  SLOT_IDS, setSlotWriteHook, setBakWriteHook, getRawSlot, setRawSlot,
  getRawBak, setRawBak, parseRawSave, slotInfo,
  type SlotId,
} from './SaveManager';

// A rolling history of spaced generations is kept per slot on disk (native).
// Capped, and throttled so a burst of autosaves (e.g. a pre-season market
// loop) doesn't evict meaningful older history — generations are at least
// HISTORY_MIN_INTERVAL_MS apart, giving roughly one snapshot per play session.
const HISTORY_CAP = 8;
const HISTORY_MIN_INTERVAL_MS = 20 * 60_000;

function slotPath(id: SlotId): string {
  return `saves/slot-${id}.json`;
}
function slotBakPath(id: SlotId): string {
  return `saves/slot-${id}-bak.json`;
}
function historyDir(id: SlotId): string {
  return `saves/slot-${id}`;
}
function historyPath(id: SlotId, savedAt: number): string {
  return `${historyDir(id)}/${savedAt}.json`;
}

function savedAtOf(raw: string): number {
  try {
    const v = (JSON.parse(raw) as { savedAt?: unknown }).savedAt;
    return typeof v === 'number' ? v : -1;
  } catch {
    return -1;
  }
}

// ── (A) Native device-backup mirror ─────────────────────────────────────────

async function writeDiskPath(path: string, raw: string): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  await Filesystem.writeFile({
    path, data: raw, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true,
  });
}

async function deleteDiskPath(path: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Documents });
  } catch {
    // File may not exist — fine.
  }
}

async function readDiskPath(path: string): Promise<string | null> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.Documents, encoding: Encoding.UTF8 });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

// savedAt of each history generation on disk, newest-first. Empty if the dir
// is absent.
async function historyEntries(id: SlotId): Promise<number[]> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  try {
    const res = await Filesystem.readdir({ path: historyDir(id), directory: Directory.Documents });
    return (res.files as Array<string | { name: string }>)
      .map((f: string | { name: string }) => Number((typeof f === 'string' ? f : f.name).replace(/\.json$/, '')))
      .filter((n: number) => Number.isFinite(n) && n > 0)
      .sort((a: number, b: number) => b - a);
  } catch {
    return [];
  }
}

// In-memory throttle clock per slot — avoids a readdir on every autosave. The
// first save of a session always lands a generation (the map starts empty).
const lastHistAt: Record<number, number> = {};

async function appendHistory(id: SlotId, raw: string): Promise<void> {
  const at = savedAtOf(raw);
  if (at <= 0) return;
  if (at - (lastHistAt[id] ?? 0) < HISTORY_MIN_INTERVAL_MS) return;
  lastHistAt[id] = at;
  await writeDiskPath(historyPath(id, at), raw);
  const entries = await historyEntries(id);
  for (const old of entries.slice(HISTORY_CAP)) {
    await deleteDiskPath(historyPath(id, old));
  }
}

// Remove every disk artefact for a slot (primary, bak, history) on clear.
async function clearDisk(id: SlotId): Promise<void> {
  await deleteDiskPath(slotPath(id));
  await deleteDiskPath(slotBakPath(id));
  for (const at of await historyEntries(id)) await deleteDiskPath(historyPath(id, at));
}

// Register the SaveManager write hooks so every slot write mirrors to disk.
// Call once at boot. No-op on web.
export function installBackupMirror(): void {
  if (!Capacitor.isNativePlatform()) return;
  setSlotWriteHook((id, raw) => {
    if (raw === '') { void clearDisk(id); return; }
    void writeDiskPath(slotPath(id), raw);
    void appendHistory(id, raw);
  });
  setBakWriteHook((id, raw) => {
    void (raw === '' ? deleteDiskPath(slotBakPath(id)) : writeDiskPath(slotBakPath(id), raw));
  });
}

// At boot, restore any slot that exists on disk but is missing (or stale) in
// localStorage. Awaited before the first Home render. No-op on web.
export async function reconcileBackups(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  for (const id of SLOT_IDS) {
    try {
      const disk = await readDiskPath(slotPath(id));
      if (disk && parseRawSave(disk)) {
        const local = getRawSlot(id);
        const localAt = local && parseRawSave(local) ? savedAtOf(local) : -1;
        if (localAt < 0 || savedAtOf(disk) > localAt) setRawSlot(id, disk);
      }
      // Mirror the disk `.bak` into localStorage when it's missing there
      // (reinstall / eviction restores the corruption fallback too).
      if (!getRawBak(id)) {
        const diskBak = await readDiskPath(slotBakPath(id));
        if (diskBak && parseRawSave(diskBak)) setRawBak(id, diskBak);
      }
      // Corruption repair: if the local primary still won't parse, hydrate it
      // from the newest parseable source — disk `.bak`, then disk history.
      const localNow = getRawSlot(id);
      if (!localNow || !parseRawSave(localNow)) {
        const bak = getRawBak(id);
        if (bak && parseRawSave(bak)) { setRawSlot(id, bak); continue; }
        for (const at of await historyEntries(id)) {
          const gen = await readDiskPath(historyPath(id, at));
          if (gen && parseRawSave(gen)) { setRawSlot(id, gen); break; }
        }
      }
    } catch {
      // Best-effort per slot — a bad file never blocks boot.
    }
  }
}

// ── Rolling-history restore (for the Saves screen) ───────────────────────────

export interface BackupEntry { savedAt: number; }

// List the restorable backup generations for a slot, newest-first, excluding
// the one identical to the current primary (restoring that is a no-op). On
// native this is the on-disk rolling history; on web it's the single
// last-known-good `.bak`.
export async function listBackups(id: SlotId): Promise<BackupEntry[]> {
  const local = getRawSlot(id);
  const currentAt = local ? savedAtOf(local) : -1;
  if (Capacitor.isNativePlatform()) {
    const ats = await historyEntries(id);
    return ats.filter(at => at !== currentAt).map(at => ({ savedAt: at }));
  }
  const bak = getRawBak(id);
  if (!bak) return [];
  const at = savedAtOf(bak);
  return at > 0 && at !== currentAt ? [{ savedAt: at }] : [];
}

// Restore a backup generation into the slot as the new primary. Validates the
// payload first, re-stamps savedAt so it sorts as the current save, and writes
// through setRawSlot (which mirrors to disk + lands a fresh history entry).
// Returns false if the generation is missing or unusable.
export async function restoreBackup(id: SlotId, savedAt: number): Promise<boolean> {
  let raw: string | null;
  if (Capacitor.isNativePlatform()) {
    raw = await readDiskPath(historyPath(id, savedAt));
  } else {
    raw = getRawBak(id);
  }
  if (!raw || !parseRawSave(raw)) return false;
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }
  env.savedAt = Date.now();
  setRawSlot(id, JSON.stringify(env));
  return true;
}

// ── (B) Export / import ──────────────────────────────────────────────────────

function exportFilename(id: SlotId): string {
  const name = slotInfo(id).name.replace(/[^a-z0-9\-_ ]/gi, '').trim().replace(/\s+/g, '-') || `slot-${id}`;
  const date = new Date().toISOString().slice(0, 10);
  return `rugby-save-${name}-${date}.json`;
}

// Share / download a slot's JSON. Throws if the slot is empty.
export async function exportSlot(id: SlotId): Promise<void> {
  const raw = getRawSlot(id);
  if (!raw) throw new Error('empty slot');
  const filename = exportFilename(id);

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    await Filesystem.writeFile({
      path: filename,
      data: raw,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: 'Rugby Manager save', files: [uri], dialogTitle: 'Export save' });
    return;
  }

  // Web — Blob download.
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Import a picked file into a slot. Validates the payload first; throws on a
// malformed file so the caller can show an error. The slot's name takes the
// imported envelope's name when present.
export async function importToSlot(id: SlotId, file: File): Promise<void> {
  const text = await file.text();
  if (!parseRawSave(text)) throw new Error('invalid save file');
  // Re-stamp savedAt so the imported slot sorts as freshly written, but keep
  // the rest of the envelope (including version + an imported slotName) intact.
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('invalid save file');
  }
  envelope.savedAt = Date.now();
  if (typeof envelope.slotName !== 'string' || !(envelope.slotName as string).trim()) {
    envelope.slotName = `Save ${id}`;
  }
  setRawSlot(id, JSON.stringify(envelope));
}
