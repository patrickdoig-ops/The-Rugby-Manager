const KEY = 'rugby-manager-inbox-dismissed';

type DismissMap = Record<string, string[]>;

function load(): DismissMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return {};
    return parsed as DismissMap;
  } catch {
    return {};
  }
}

function save(map: DismissMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — silent
  }
}

export function loadDismissed(saveKey: string): Set<string> {
  return new Set(load()[saveKey] ?? []);
}

export function dismissItem(saveKey: string, id: string): void {
  const map = load();
  const existing = new Set(map[saveKey] ?? []);
  existing.add(id);
  map[saveKey] = [...existing];
  save(map);
}
