import type { InboxItem } from '../game/inbox';

const KEY = 'rugby-manager-inbox-read';

type ReadMap = Record<string, string[]>;

function load(): ReadMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return {};
    return parsed as ReadMap;
  } catch {
    return {};
  }
}

function save(map: ReadMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // localStorage disabled / quota exceeded — silent
  }
}

export function loadReadIds(saveKey: string): Set<string> {
  const map = load();
  return new Set(map[saveKey] ?? []);
}

export function markRead(saveKey: string, ids: string[]): void {
  const map = load();
  const existing = new Set(map[saveKey] ?? []);
  for (const id of ids) existing.add(id);
  map[saveKey] = [...existing];
  save(map);
}

export function countUnread(saveKey: string, items: InboxItem[]): number {
  const read = loadReadIds(saveKey);
  return items.filter(i => !read.has(i.id)).length;
}
