// Notificaciones de FinAgent: locales (estado del análisis, alertas de activos, termómetro) y push anónimo por tópicos de FCM
// (dólar, miedo y codicia, resumen diario). Privacidad: las reglas y las preferencias viven en el teléfono; el servidor solo
// manda a tópicos públicos y no sabe quién está suscripto. Los textos salen de notifyTexts.ts (controlados por tests).
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { onAgentActivity } from './agentActivity';
import { LocalEvaluator, loadRules, saveRules, evaluateRadar, type QuoteSource, type Quote, type RadarState } from './alerts';
import { getLang, t } from './i18n';
import { stressNow, STRESS_TEXTS, type StressLevel } from './stress';
import { fetchChart } from './yahoo';
import {
  aiMessage, assetMessage, CATEGORY_CHANNEL, CHANNELS, topicsFor, DEFAULT_QUIET, inQuiet, linkToString, parseLink,
  radarMessage, testMessage, TOPIC_CHANNEL, type DeepLink, type NotifyCategory, type NotifyMessage, type QuietHours, type ServerTopic,
} from './notifyTexts';

// ---------------------------------------------------------------- preferencias (en el teléfono)
export interface NotifyPrefs { ai: boolean; radar: boolean; assets: boolean; digests: boolean; quiet: QuietHours; askedAi?: boolean }
const PREFS_KEY = 'finagent.notify.v1', TOPICS_KEY = 'finagent.notify.topics.v1', RADAR_KEY = 'finagent.notify.radar.v1';
// Lo que la persona no eligió queda apagado, salvo lo que ella misma provoca (el aviso de "análisis listo" y las alertas que crea).
export const DEFAULT_PREFS: NotifyPrefs = { ai: true, radar: false, assets: true, digests: false, quiet: DEFAULT_QUIET };
const read = <T>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };
export const getPrefs = (): NotifyPrefs => { const p = read<NotifyPrefs>(PREFS_KEY, DEFAULT_PREFS); return { ...p, quiet: { ...DEFAULT_QUIET, ...p.quiet } }; };
export function setPrefs(patch: Partial<NotifyPrefs>): NotifyPrefs {
  const p = { ...getPrefs(), ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
  void syncTopics();
  return p;
}

// ---------------------------------------------------------------- plataforma
const native = () => Capacitor.isNativePlatform();
/** Push del servidor: solo si el APK se compiló con Firebase (variable VITE_FCM=1 en el workflow, cuando existe google-services.json). */
export const pushAvailable = () => native() && import.meta.env.VITE_FCM === '1';
interface FcmNotification { title?: string; body?: string; data?: Record<string, string> }
interface FirebaseMessagingPlugin {
  requestPermissions(): Promise<{ receive: string }>;
  subscribeToTopic(o: { topic: string }): Promise<void>;
  unsubscribeFromTopic(o: { topic: string }): Promise<void>;
  addListener(ev: 'notificationReceived', fn: (e: { notification: FcmNotification }) => void): Promise<PluginListenerHandle>;
  addListener(ev: 'notificationActionPerformed', fn: (e: { notification: FcmNotification }) => void): Promise<PluginListenerHandle>;
}
// Se registra por nombre: el código nativo del plugin solo está en el APK cuando hay Firebase configurado.
const Fcm = registerPlugin<FirebaseMessagingPlugin>('FirebaseMessaging');

export type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported';
export async function permissionState(): Promise<PermState> {
  if (!native()) return 'unsupported';
  try { const p = (await LocalNotifications.checkPermissions()).display; return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'prompt'; } catch { return 'unsupported'; }
}
/** Pide el permiso del sistema (Android 13+). Se llama SOLO desde una acción de la persona: nunca al abrir la app. */
export async function ensurePermission(): Promise<boolean> {
  const s = await permissionState();
  if (s === 'granted') return true;
  if (s !== 'prompt') return false;
  try { return (await LocalNotifications.requestPermissions()).display === 'granted' && (void syncTopics(), true); } catch { return false; }
}

// ---------------------------------------------------------------- mostrar
const IDS = { ai: 7001, radar: 7002, test: 7003 } as const;
let nextId = 8000;
const assetId = (ruleId: string) => 8000 + ([...ruleId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 900_000);

async function show(msg: NotifyMessage, id: number, o: { ongoing?: boolean } = {}): Promise<boolean> {
  if (!native() || (await permissionState()) !== 'granted') return false;
  try {
    await LocalNotifications.schedule({ notifications: [{
      id, title: msg.title, body: msg.body, channelId: msg.channel, smallIcon: 'ic_stat_finagent', iconColor: '#3B82F6',
      extra: { link: linkToString(msg.link) }, ongoing: !!o.ongoing, autoCancel: !o.ongoing,
    }] });
    return true;
  } catch { return false; }
}
const cancel = (id: number) => (native() ? LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {}) : Promise.resolve());

/** Muestra un aviso de una categoría respetando el interruptor y el horario de silencio (el estado del análisis lo pidió la persona: no se silencia). */
export async function notify(cat: NotifyCategory, msg: NotifyMessage, id = nextId++, now = new Date()): Promise<boolean> {
  const p = getPrefs();
  if (!p[cat]) return false;
  if (cat !== 'ai' && inQuiet(p.quiet, now.getHours())) return false;
  return show({ ...msg, channel: CATEGORY_CHANNEL[cat] }, id);
}
/** "Probar notificación" (Ajustes). */
export async function testNotification(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!native()) return 'unsupported';
  if (!(await ensurePermission())) return 'denied';
  return (await show(testMessage(getLang()), IDS.test)) ? 'ok' : 'denied';
}

// ---------------------------------------------------------------- enlaces internos (tocar la notificación)
let linkHandler: ((l: DeepLink) => void) | null = null, pendingLink: DeepLink | null = null;
/** La app registra cómo navegar. Si la notificación se tocó con la app cerrada, el enlace espera a que la app esté lista. */
export function setLinkHandler(fn: (l: DeepLink) => void): void { linkHandler = fn; if (pendingLink) { const l = pendingLink; pendingLink = null; fn(l); } }
export function openLink(raw: unknown): void { const l = parseLink(raw); if (!l) return; if (linkHandler) linkHandler(l); else pendingLink = l; }

// ---------------------------------------------------------------- estado del análisis
let foreground = typeof document === 'undefined' || document.visibilityState !== 'hidden';
let running: { question: string; since: number } | null = null;
let softAsk: ((question: string) => void) | null = null;
/** La pantalla registra la hoja que ofrece los avisos (se muestra una sola vez, con la primera consulta larga). */
export function setSoftAsk(fn: (question: string) => void): void { softAsk = fn; }
export const isForeground = () => foreground;

async function onBackground() {
  if (running && getPrefs().ai) await show(aiMessage(getLang(), 'progress'), IDS.ai, { ongoing: true });
}
async function onForeground() {
  await cancel(IDS.ai);   // la persona volvió: el aviso del análisis ya no sirve
  void runChecks('resume');
}
function handleAgent(phase: string, question: string) {
  if (phase === 'start') {
    running = { question, since: Date.now() };
    const p = getPrefs();
    if (foreground && native() && p.ai && !p.askedAi && question.trim().length >= 40 && softAsk) void permissionState().then((s) => { if (s === 'prompt' && softAsk) softAsk(question); });
    if (!foreground) void onBackground();
    return;
  }
  if (phase === 'verifying') return;
  const was = running; running = null;
  if (!was) return;
  // Si la persona está mirando la app (en el chat o en otra pestaña) no se avisa nada: la respuesta ya está en pantalla.
  if (foreground || phase === 'aborted' || !getPrefs().ai) { void cancel(IDS.ai); return; }
  void show(aiMessage(getLang(), phase === 'done' ? 'done' : 'fail'), IDS.ai);   // mismo id: reemplaza al de "analizando"
}

// ---------------------------------------------------------------- controles locales (al abrir, al volver y cada 10 minutos con la app abierta)
export const yahooQuotes: QuoteSource = {
  async quotes(symbols) {
    const out: Record<string, Quote> = {};
    await Promise.all(symbols.slice(0, 30).map(async (s) => {
      try {
        const { meta, bars } = await fetchChart(s, '1d', '1d');
        const price = meta.regularMarketPrice ?? bars[bars.length - 1]?.c, prev = meta.chartPreviousClose ?? meta.previousClose;
        if (!price || !prev) return;
        const at = (meta.regularMarketTime ?? Date.now() / 1000) * 1000;
        out[s] = { price, changePct: (price / prev - 1) * 100, day: new Date(at + (meta.gmtoffset ?? 0) * 1000).toISOString().slice(0, 10), currency: meta.currency, at };
      } catch { /* sin datos de este activo ahora: se prueba la próxima vez */ }
    }));
    return out;
  },
};
let lastCheck = 0, checking = false;
export async function runChecks(_why: 'open' | 'resume' | 'timer' | 'manual', now = Date.now()): Promise<number> {
  if (checking || now - lastCheck < 10 * 60_000 || !native()) return 0;
  const p = getPrefs();
  if (inQuiet(p.quiet, new Date(now).getHours()) || (await permissionState()) !== 'granted') return 0;   // en horario de silencio no se evalúa: la alerta queda armada para después
  checking = true; lastCheck = now;
  let sent = 0;
  try {
    const rules = loadRules();
    if (p.assets && rules.length) {
      const res = await new LocalEvaluator(yahooQuotes).run(rules, now);
      saveRules(res.rules);
      for (const f of res.fired) if (await notify('assets', assetMessage(getLang(), f.rule.kind, { symbol: f.rule.symbol, name: f.rule.name, value: f.rule.value, price: f.quote.price, changePct: f.quote.changePct, currency: f.rule.currency ?? f.quote.currency }), assetId(f.rule.id))) sent++;
    }
    if (p.radar) {
      const d = await fetchChart('SPY', '1y', '1d').catch(() => null);
      const r = d ? stressNow(d.bars, 'SPY', d.meta, now) : null;
      if (r && r.kind === 'ok') {
        const prev = read<RadarState | null>(RADAR_KEY, null), { state, fire } = evaluateRadar(prev, r.level, now);
        try { localStorage.setItem(RADAR_KEY, JSON.stringify(state)); } catch { /* sin almacenamiento */ }
        if (fire && (await notify('radar', radarMessage(getLang(), STRESS_TEXTS.levels[fire.from as StressLevel], STRESS_TEXTS.levels[fire.to as StressLevel]), IDS.radar))) sent++;
      }
    }
  } finally { checking = false; }
  return sent;
}

// ---------------------------------------------------------------- tópicos del servidor (FCM)
export const desiredTopics = (p: NotifyPrefs, lang = getLang(), offsetMin = -new Date().getTimezoneOffset()): string[] => topicsFor(p, lang, offsetMin);
let syncing: Promise<void> | null = null;
export function syncTopics(): Promise<void> {
  if (!pushAvailable()) return Promise.resolve();
  syncing = (syncing ?? Promise.resolve()).then(async () => {
    if ((await permissionState()) !== 'granted') return;
    let have: string[] = [];
    try { have = JSON.parse(localStorage.getItem(TOPICS_KEY) ?? '[]'); } catch { /* vacío */ }
    const want = new Set(desiredTopics(getPrefs())), had = new Set(have), done = new Set(have);
    for (const tp of want) if (!had.has(tp)) { try { await Fcm.subscribeToTopic({ topic: tp }); done.add(tp); } catch { /* se reintenta en la próxima sincronización */ } }
    for (const tp of had) if (!want.has(tp)) { try { await Fcm.unsubscribeFromTopic({ topic: tp }); done.delete(tp); } catch { /* idem */ } }
    try { localStorage.setItem(TOPICS_KEY, JSON.stringify([...done])); } catch { /* sin almacenamiento */ }
  }).catch(() => {});
  return syncing;
}

// ---------------------------------------------------------------- arranque
let installed = false;
/** Crea los canales y escucha el estado de la app. NO pide permisos (eso pasa cuando la persona activa algo). */
export function installNotifications(): void {
  if (installed) return; installed = true;
  onAgentActivity((a) => handleAgent(a.phase, a.question));
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { foreground = document.visibilityState !== 'hidden'; });
  if (!native()) return;
  void App.addListener('appStateChange', ({ isActive }) => { foreground = isActive; void (isActive ? onForeground() : onBackground()); });
  void Promise.all(CHANNELS.map((c) => LocalNotifications.createChannel({ id: c.id, name: t(c.name), description: t(c.description), importance: c.importance, vibration: c.vibration, visibility: 1, lights: false }).catch(() => {})));
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => openLink(a.notification?.extra?.link));
  if (pushAvailable()) {
    void Fcm.addListener('notificationActionPerformed', (e) => openLink(e.notification?.data?.link));
    // Con la app abierta, Android no muestra el push: se muestra como aviso local, con las mismas reglas de categorías y silencio.
    void Fcm.addListener('notificationReceived', ({ notification: n }) => {
      const topic = (n.data?.topic ?? '') as ServerTopic, cat: NotifyCategory = topic === 'radar_stress' ? 'radar' : 'digests';
      if (n.title && n.body) void notify(cat, { title: n.title, body: n.body, channel: TOPIC_CHANNEL[topic] ?? 'digests', link: parseLink(n.data?.link) ?? { to: 'market' } });
    });
    void syncTopics();
  }
  setInterval(() => { if (foreground) void runChecks('timer'); }, 10 * 60_000);
  setTimeout(() => void runChecks('open'), 8000);
}
