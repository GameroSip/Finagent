import { BROWSER_UA, http } from '../http';
import { t as tr } from '../i18n';

export class SourceError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SourceError'; }
}

export async function getText(url: string, what: string, timeoutMs = 15000): Promise<string> {
  let r;
  try { r = await http({ url, headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' }, timeoutMs }); }
  catch (e: any) { throw new SourceError(tr('{w}: sin conexión ({e})', { w: what, e: e?.message ?? e })); }
  if (r.status < 200 || r.status >= 300) throw new SourceError(`${what}: HTTP ${r.status}`);
  return r.text;
}

export async function getJsonFrom(url: string, what: string, timeoutMs = 15000): Promise<any> {
  const t = await getText(url, what, timeoutMs);
  try { return JSON.parse(t); } catch { throw new SourceError(tr('{w}: respuesta no válida', { w: what })); }
}

/** Ejecuta fn sobre items con concurrencia limitada, conservando el orden. */
export async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}
