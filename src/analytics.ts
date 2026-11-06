// Estadísticas de uso de la beta. Solo funcionan con servidor (beta cerrada) Y si la persona las aceptó; si las apaga, la cola se borra y se avisa al servidor.
// Qué se envía: nombres de funciones y valores de listas cerradas (src/telemetry.ts). NUNCA el texto que escribís al asistente, tu plan ni tus búsquedas con resultado.
import { getLang } from './i18n';
import { isServerMode, sendConsent, sendEvents } from './server';
import { getSettings } from './store';
import { cleanEvent, type EventName } from './telemetry';
import { soundOn } from './ui/sfx';
import { VERSION } from './version';

const K = { consent: 'finagent.analytics.v1', queue: 'finagent.evq.v1', pendingConsent: 'finagent.analytics.sync.v1', lastActive: 'finagent.lastactive.v1' };
const MAX_QUEUE = 200, BATCH = 40, FLUSH_AFTER_MS = 6000, SESSION_GAP_MS = 30 * 60_000;
const ls = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const get = (k: string) => { try { return ls()?.getItem(k) ?? null; } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) ls()?.removeItem(k); else ls()?.setItem(k, v); } catch { /* sin almacenamiento */ } };

type Ev = { t: number; n: string; p: Record<string, string | number | boolean> };
const readQueue = (): Ev[] => { try { const q = JSON.parse(get(K.queue) ?? '[]'); return Array.isArray(q) ? q : []; } catch { return []; } };
const writeQueue = (q: Ev[]) => set(K.queue, q.length ? JSON.stringify(q.slice(-MAX_QUEUE)) : null);

export const analyticsAvailable = (): boolean => isServerMode();
export const hasDecided = (): boolean => get(K.consent) !== null;
export const analyticsOn = (): boolean => analyticsAvailable() && get(K.consent) === '1';

/** Registra la decisión de la persona. Apagar borra todo lo que estaba por enviarse. */
export async function setAnalytics(on: boolean): Promise<void> {
  set(K.consent, on ? '1' : '0');
  if (!on) writeQueue([]);
  if (!analyticsAvailable()) return;
  set(K.pendingConsent, on ? '1' : '0');                             // si no hay conexión, se reintenta con el próximo envío
  try { await sendConsent(on); set(K.pendingConsent, null); } catch { /* se reintenta */ }
  if (on) scheduleFlush();
}

let timer: ReturnType<typeof setTimeout> | null = null, flushing = false;
function scheduleFlush(ms = FLUSH_AFTER_MS) { if (timer || typeof setTimeout === 'undefined') return; timer = setTimeout(() => { timer = null; void flush(); }, ms); }

/** Anota un evento (si la persona aceptó las estadísticas). Los valores que no cumplan el vocabulario se descartan acá mismo. */
export function track(name: EventName, props: Record<string, string | number | boolean> = {}): void {
  if (!analyticsOn()) return;
  const clean = cleanEvent(name, props);
  if (!clean) return;
  const q = readQueue(); q.push({ t: Date.now(), n: name, p: clean }); writeQueue(q);
  scheduleFlush();
}

/** Envía lo pendiente en lotes. Si falla, queda en la cola (hasta 200 eventos) y se reintenta más tarde. */
export async function flush(): Promise<void> {
  if (flushing || !analyticsOn()) return;
  flushing = true;
  try {
    if (get(K.pendingConsent) !== null) { await sendConsent(get(K.pendingConsent) === '1'); set(K.pendingConsent, null); }
    for (let guard = 0; guard < 6; guard++) {
      const q = readQueue(); if (!q.length) break;
      const batch = q.slice(0, BATCH), res = await sendEvents(batch);
      if (!res.consent) { await sendConsent(true); set(K.pendingConsent, null); if (guard > 0) break; continue; }       // el servidor no tenía el consentimiento: se reenvía una vez y se reintenta
      writeQueue(readQueue().slice(batch.length));
    }
  } catch { scheduleFlush(60_000); }
  finally { flushing = false; }
}

/** Una sesión por apertura de la app (y otra si vuelve al primer plano después de 30 minutos). */
export function trackAppOpen(): void {
  track('app_open', { v: VERSION, lang: getLang(), theme: getSettings().theme as 'auto' | 'dark' | 'light', sound: soundOn() });
  set(K.lastActive, String(Date.now()));
}
export function installLifecycle(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { set(K.lastActive, String(Date.now())); void flush(); return; }
    const last = Number(get(K.lastActive) ?? 0);
    if (last && Date.now() - last > SESSION_GAP_MS) trackAppOpen();
    void flush();
  });
  globalThis.addEventListener?.('pagehide', () => void flush());
  if (analyticsOn()) scheduleFlush(2000);                              // lo que quedó pendiente de la sesión anterior
}

/** Solo para pruebas. */
export const _test = { readQueue, K };
