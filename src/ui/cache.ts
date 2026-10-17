// Caché persistente (stale-while-revalidate): la pantalla pinta al instante con el último dato y se actualiza sola.
const PREFIX = 'finagent.cache.v3.';

export function getCache<T>(key: string): { at: number; data: T } | null {
  try { const v = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null'); return v && typeof v.at === 'number' ? v : null; } catch { return null; }
}
export function setCache(key: string, data: unknown) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch { /* sin espacio */ }
}
