// Estado persistente simple (localStorage). Todo vive en el teléfono.
export type Theme = 'auto' | 'dark' | 'light';
export interface Settings { apiKey: string; theme: Theme }

const SETTINGS_KEY = 'finagent.settings.v2';
const WATCH_KEY = 'finagent.watchlist.v1';
const RECENT_KEY = 'finagent.recent.v1';

function readObject<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}
function readList(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

const listeners = new Set<() => void>();
export const subscribe = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach((f) => f());

export const getSettings = (): Settings => ({ apiKey: '', theme: 'auto', ...readObject<Partial<Settings>>(SETTINGS_KEY, {}) });
export function saveSettings(patch: Partial<Settings>): void {
  write(SETTINGS_KEY, { ...getSettings(), ...patch });
  notify();
}

export const getWatchlist = (): string[] => readList(WATCH_KEY);
export const isWatched = (sym: string): boolean => getWatchlist().includes(sym.toUpperCase());
/** Agrega o quita de favoritos. Devuelve true si quedó agregado. */
export function toggleWatch(sym: string): boolean {
  const s = sym.toUpperCase();
  const list = getWatchlist();
  const i = list.indexOf(s);
  if (i >= 0) list.splice(i, 1); else list.unshift(s);
  write(WATCH_KEY, list.slice(0, 60));
  notify();
  return i < 0;
}
export function clearWatchlist(): void { write(WATCH_KEY, []); notify(); }

export const getRecent = (): string[] => readList(RECENT_KEY);
export function pushRecent(sym: string): void {
  const s = sym.toUpperCase();
  write(RECENT_KEY, [s, ...getRecent().filter((x) => x !== s)].slice(0, 8));
}

/** Borra todo lo que la app guardó en el teléfono. */
export function wipeAll(): void {
  for (const k of Object.keys(localStorage)) if (k.startsWith('finagent.')) localStorage.removeItem(k);
  notify();
}
