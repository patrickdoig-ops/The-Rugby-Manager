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
  SLOT_IDS, setSlotWriteHook, getRawSlot, setRawSlot, parseRawSave, slotInfo,
  type SlotId,
} from './SaveManager';

function slotPath(id: SlotId): string {
  return `saves/slot-${id}.json`;
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

async function writeDisk(id: SlotId, raw: string): Promise<void> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  await Filesystem.writeFile({
    path: slotPath(id),
    data: raw,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

async function deleteDisk(id: SlotId): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  try {
    await Filesystem.deleteFile({ path: slotPath(id), directory: Directory.Documents });
  } catch {
    // File may not exist — fine.
  }
}

async function readDisk(id: SlotId): Promise<string | null> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  try {
    const res = await Filesystem.readFile({
      path: slotPath(id),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return typeof res.data === 'string' ? res.data : null;
  } catch {
    return null;
  }
}

// Register the SaveManager write hook so every slot write mirrors to disk.
// Call once at boot. No-op on web.
export function installBackupMirror(): void {
  if (!Capacitor.isNativePlatform()) return;
  setSlotWriteHook((id, raw) => {
    void (raw === '' ? deleteDisk(id) : writeDisk(id, raw));
  });
}

// At boot, restore any slot that exists on disk but is missing (or stale) in
// localStorage. Awaited before the first Home render. No-op on web.
export async function reconcileBackups(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  for (const id of SLOT_IDS) {
    try {
      const disk = await readDisk(id);
      if (!disk || !parseRawSave(disk)) continue;
      const local = getRawSlot(id);
      const localAt = local ? savedAtOf(local) : -1;
      if (!local || savedAtOf(disk) > localAt) {
        setRawSlot(id, disk);
      }
    } catch {
      // Best-effort per slot — a bad file never blocks boot.
    }
  }
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
