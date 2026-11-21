// Textos, canales y tópicos de las notificaciones. Lo usan la app (notificaciones locales) y el servidor (push por FCM),
// así los dos dicen exactamente lo mismo y una sola prueba (tests/notifications.test.ts) controla que ningún aviso
// prometa "tiempo real", recomiende comprar o vender, ni suene a asesoramiento financiero.
// Es un módulo puro: no toca el DOM ni Capacitor.
import { lookup, type UiLang } from './i18n';

/** Categorías que la persona puede prender o apagar en Ajustes. */
export type NotifyCategory = 'ai' | 'radar' | 'assets' | 'digests';
/** Canales nativos de Android (cada uno con su prioridad y sonido; la persona también los puede ajustar desde el sistema). */
export type ChannelId = 'ai_status' | 'radar_stress' | 'asset_alerts' | 'digests';
/** Tópicos públicos de FCM. El servidor manda a un tópico; no sabe quién está suscripto. */
export type ServerTopic = 'radar_stress' | 'macro_dolar' | 'daily_brief';

export interface ChannelSpec { id: ChannelId; name: string; description: string; importance: 1 | 2 | 3 | 4 | 5; sound: boolean; vibration: boolean }
// importance (Android): 2 = baja (sin sonido), 3 = normal, 4 = alta (sonido y aviso en pantalla).
export const CHANNELS: ChannelSpec[] = [
  { id: 'ai_status', name: 'Estado del análisis', description: 'Te avisa cuando el asistente termina una respuesta mientras usás otra app.', importance: 2, sound: false, vibration: false },
  { id: 'radar_stress', name: 'Termómetro y sentimiento', description: 'Cambios de nivel del termómetro de tensión y del índice de miedo y codicia.', importance: 3, sound: true, vibration: true },
  { id: 'asset_alerts', name: 'Alertas de activos', description: 'Las alertas de precio que creaste para tus activos.', importance: 4, sound: true, vibration: true },
  { id: 'digests', name: 'Dólar y resumen diario', description: 'Movimientos del dólar y un resumen por día.', importance: 3, sound: false, vibration: false },
];
export const CATEGORY_CHANNEL: Record<NotifyCategory, ChannelId> = { ai: 'ai_status', radar: 'radar_stress', assets: 'asset_alerts', digests: 'digests' };
/** Qué tópicos del servidor corresponden a cada categoría. */
export const CATEGORY_TOPICS: Record<NotifyCategory, ServerTopic[]> = { ai: [], radar: ['radar_stress'], assets: [], digests: ['macro_dolar', 'daily_brief'] };
export const TOPIC_CHANNEL: Record<ServerTopic, ChannelId> = { radar_stress: 'radar_stress', macro_dolar: 'digests', daily_brief: 'digests' };

/** A dónde lleva tocar la notificación. */
export type DeepLink = { to: 'chat'; chatId?: string } | { to: 'radar' } | { to: 'asset'; symbol: string; name?: string } | { to: 'market' } | { to: 'settings' };
export const linkToString = (l: DeepLink): string => (l.to === 'asset' ? `asset/${encodeURIComponent(l.symbol)}` : l.to === 'chat' && l.chatId ? `chat/${encodeURIComponent(l.chatId)}` : l.to);
export function parseLink(s: unknown): DeepLink | null {
  if (typeof s !== 'string' || s.length > 120) return null;
  const [head, rest] = [s.split('/')[0], s.split('/').slice(1).join('/')];
  let arg = '';
  try { arg = decodeURIComponent(rest); } catch { return null; }
  if (head === 'asset') return /^[A-Za-z0-9.^=\-_]{1,24}$/.test(arg) ? { to: 'asset', symbol: arg.toUpperCase() } : null;
  if (head === 'chat') return arg ? (/^[\w-]{1,64}$/.test(arg) ? { to: 'chat', chatId: arg } : null) : { to: 'chat' };
  if (head === 'radar' || head === 'market' || head === 'settings') return rest ? null : { to: head };
  return null;
}

// ---------------------------------------------------------------- textos (la clave es el texto en español: se traduce con src/i18n)
export const NOTIFY_TEXTS = {
  aiProgressTitle: 'Análisis en curso',
  aiProgressBody: 'FinAgent está analizando y verificando cifras…',
  aiDoneTitle: 'Análisis listo · Cifras verificadas',
  aiDoneBody: 'Tocá para ver la respuesta.',
  aiFailTitle: 'La respuesta no se completó',
  aiFailBody: 'Tocá para volver al chat e intentarlo de nuevo.',
  assetAbove: '{name} superó {v}',
  assetBelow: '{name} bajó de {v}',
  assetMove: '{name} se movió {c} hoy',
  assetBody: 'Precio: {p} · Variación del día: {c}. Los datos pueden tener demora.',
  radarTitle: 'Termómetro de tensión: {level}',
  radarBody: 'El S&P 500 pasó de {from} a {to}. Tocá para ver el detalle y qué pasó otras veces.',
  fngTitle: 'Miedo y codicia (cripto): {to}',
  fngBody: 'El índice pasó de {from} a {to} ({v} de 100). Fuente: alternative.me.',
  dolarTitle: 'Dólar {name}: {v}',
  dolarBody: 'Se movió {c} desde el último aviso ({prev}). Fuente: DolarAPI.',
  briefTitle: 'Resumen del día',
  briefBody: 'Dólar oficial {o} · blue {b} · MEP {m} · riesgo país {r} puntos.',
  briefBodyNoRisk: 'Dólar oficial {o} · blue {b} · MEP {m}.',
  testTitle: 'Notificaciones activadas',
  testBody: 'Así te vamos a avisar. Elegí qué recibir en Ajustes → Notificaciones.',
  fng: { 'extreme-fear': 'miedo extremo', fear: 'miedo', neutral: 'neutral', greed: 'codicia', 'extreme-greed': 'codicia extrema' } as Record<FngRegime, string>,
  dolarNames: { oficial: 'oficial', blue: 'blue', bolsa: 'MEP', contadoconliqui: 'CCL', tarjeta: 'tarjeta', mayorista: 'mayorista', cripto: 'cripto' } as Record<string, string>,
};
export type FngRegime = 'extreme-fear' | 'fear' | 'neutral' | 'greed' | 'extreme-greed';

/** Todos los textos fijos de las notificaciones (para las traducciones y los controles). */
export const notifyTexts = (): string[] => {
  const { fng, dolarNames, ...rest } = NOTIFY_TEXTS;
  return [...Object.values(rest), ...Object.values(fng), ...CHANNELS.flatMap((c) => [c.name, c.description])].concat(Object.values(dolarNames).filter((x) => /[a-z]{4}/.test(x) && x !== 'blue' && x !== 'cripto'));
};

/** Frases prohibidas en un aviso: además de FORBIDDEN_CLAIMS, una notificación nunca puede sonar a recomendación ni a urgencia de operar. */
export const NOTIFY_FORBIDDEN: Array<[string, RegExp]> = [
  ['recomienda comprar o vender', /(^|[^\wáéíóúñ])(compr[áa](lo)?|vend[ée](lo)?|comprar|vender|recomiendo|recomendamos|recomendad[oa]|recomendaci[óo]n)(?=$|[^\wáéíóúñ])|se[ñn]al\s+de\s+(compra|venta)|oportunidad|\bbuy\b|\bsell\b/i],
  ['suena a asesoramiento o predicción', /asesor(amiento|a)?(?=$|[^\wáéíóúñ])|deber[íi]as|te\s+conviene|es\s+(el\s+)?momento\s+de|va\s+a\s+(subir|bajar)|predic|pron[óo]stic/i],
  ['promete inmediatez o exactitud', /tiempo\s+real|al\s+instante|garantiz|100\s*%|sin\s+demora|exact[oa]s?\b/i],
  ['mete urgencia', /urgente|[¡!]\s*ya\b|no\s+te\s+lo\s+pierdas|[úu]ltima\s+oportunidad/i],
];
export function notifyViolations(text: string): string[] { return NOTIFY_FORBIDDEN.filter(([, re]) => re.test(text)).map(([why]) => why); }

// ---------------------------------------------------------------- armado de mensajes (los usan app y servidor)
const LOCALES: Record<UiLang, string> = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' };
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
export const tl = (lang: UiLang, key: string, vars: Record<string, string | number> = {}) => fill(lookup(lang, key) ?? key, vars);
export const fmtNum = (lang: UiLang, v: number, dec = 2) => v.toLocaleString(LOCALES[lang], { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const fmtPct = (lang: UiLang, v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(lang, Math.abs(v), 2)} %`;
export const fmtMoney = (lang: UiLang, v: number, cur = '$') => `${cur === 'ARS' || cur === '$' ? '$' : cur === 'USD' ? 'US$' : `${cur} `}${fmtNum(lang, v, v >= 1000 ? 0 : 2)}`;

export interface NotifyMessage { title: string; body: string; channel: ChannelId; link: DeepLink }

export function aiMessage(lang: UiLang, phase: 'progress' | 'done' | 'fail', chatId?: string): NotifyMessage {
  const k = phase === 'progress' ? ['aiProgressTitle', 'aiProgressBody'] : phase === 'done' ? ['aiDoneTitle', 'aiDoneBody'] : ['aiFailTitle', 'aiFailBody'];
  return { title: tl(lang, (NOTIFY_TEXTS as any)[k[0]]), body: tl(lang, (NOTIFY_TEXTS as any)[k[1]]), channel: 'ai_status', link: { to: 'chat', chatId } };
}
export function assetMessage(lang: UiLang, kind: 'above' | 'below' | 'move', o: { symbol: string; name: string; value: number; price: number; changePct: number; currency?: string }): NotifyMessage {
  const c = fmtPct(lang, o.changePct), p = fmtMoney(lang, o.price, o.currency);
  const title = kind === 'move' ? tl(lang, NOTIFY_TEXTS.assetMove, { name: o.name, c }) : tl(lang, kind === 'above' ? NOTIFY_TEXTS.assetAbove : NOTIFY_TEXTS.assetBelow, { name: o.name, v: fmtMoney(lang, o.value, o.currency) });
  return { title, body: tl(lang, NOTIFY_TEXTS.assetBody, { p, c }), channel: 'asset_alerts', link: { to: 'asset', symbol: o.symbol, name: o.name } };
}
export function radarMessage(lang: UiLang, fromLabel: string, toLabel: string): NotifyMessage {
  return { title: tl(lang, NOTIFY_TEXTS.radarTitle, { level: tl(lang, toLabel) }), body: tl(lang, NOTIFY_TEXTS.radarBody, { from: tl(lang, fromLabel).toLowerCase(), to: tl(lang, toLabel).toLowerCase() }), channel: 'radar_stress', link: { to: 'radar' } };
}
export function fngMessage(lang: UiLang, from: FngRegime, to: FngRegime, value: number): NotifyMessage {
  const L = (r: FngRegime) => tl(lang, NOTIFY_TEXTS.fng[r]);
  return { title: tl(lang, NOTIFY_TEXTS.fngTitle, { to: L(to) }), body: tl(lang, NOTIFY_TEXTS.fngBody, { from: L(from), to: L(to), v: Math.round(value) }), channel: 'radar_stress', link: { to: 'market' } };
}
export function dolarMessage(lang: UiLang, casa: string, value: number, prev: number): NotifyMessage {
  const name = NOTIFY_TEXTS.dolarNames[casa] ?? casa;
  return { title: tl(lang, NOTIFY_TEXTS.dolarTitle, { name: tl(lang, name), v: fmtMoney(lang, value) }), body: tl(lang, NOTIFY_TEXTS.dolarBody, { c: fmtPct(lang, (value / prev - 1) * 100), prev: fmtMoney(lang, prev) }), channel: 'digests', link: { to: 'market' } };
}
export function briefMessage(lang: UiLang, o: { oficial: number; blue: number; mep: number; riesgo?: number | null }): NotifyMessage {
  const v = { o: fmtMoney(lang, o.oficial), b: fmtMoney(lang, o.blue), m: fmtMoney(lang, o.mep), r: o.riesgo != null ? fmtNum(lang, o.riesgo, 0) : '' };
  return { title: tl(lang, NOTIFY_TEXTS.briefTitle), body: tl(lang, o.riesgo != null ? NOTIFY_TEXTS.briefBody : NOTIFY_TEXTS.briefBodyNoRisk, v), channel: 'digests', link: { to: 'market' } };
}
export const testMessage = (lang: UiLang): NotifyMessage => ({ title: tl(lang, NOTIFY_TEXTS.testTitle), body: tl(lang, NOTIFY_TEXTS.testBody), channel: 'digests', link: { to: 'settings' } });

/** Régimen del índice de miedo y codicia, con histéresis: para salir del régimen anterior hay que pasar el límite por `margin` puntos. */
export function fngRegime(v: number, prev?: FngRegime | null, margin = 3): FngRegime {
  const cuts: Array<[number, FngRegime]> = [[25, 'extreme-fear'], [45, 'fear'], [55, 'neutral'], [75, 'greed'], [101, 'extreme-greed']];
  const raw = cuts.find(([c]) => v < c)![1];
  if (!prev || raw === prev) return raw;
  const order = cuts.map(([, r]) => r), i = order.indexOf(prev), lo = i === 0 ? -Infinity : cuts[i - 1][0], hi = cuts[i][0];
  return v >= lo - margin && v < hi + margin ? prev : raw;   // todavía cerca del borde: se queda en el anterior (no avisa por un punto de diferencia)
}

// ---------------------------------------------------------------- horario de silencio y tópicos por hora
export interface QuietHours { on: boolean; start: number; end: number }   // horas locales 0–23; de start (incluida) a end (excluida); puede cruzar la medianoche
export const DEFAULT_QUIET: QuietHours = { on: true, start: 23, end: 8 };
export function inQuiet(q: QuietHours, localHour: number): boolean {
  if (!q.on || q.start === q.end) return false;
  return q.start < q.end ? localHour >= q.start && localHour < q.end : localHour >= q.start || localHour < q.end;
}
/**
 * Horas UTC en las que la persona SÍ acepta avisos del servidor. La app se suscribe a un tópico por hora (`macro_dolar_es_h13`) y el
 * servidor manda solo al tópico de la hora en curso: así se respeta el horario de silencio de cada uno, en su zona horaria, sin que el
 * servidor sepa nada de nadie. `offsetMin` es la diferencia de la hora local con UTC (Argentina: −180).
 */
export function activeUtcHours(q: QuietHours, offsetMin: number): number[] {
  const off = Math.round(offsetMin / 60), out: number[] = [];
  for (let utc = 0; utc < 24; utc++) if (!inQuiet(q, (((utc + off) % 24) + 24) % 24)) out.push(utc);
  return out;
}
export const topicName = (t: ServerTopic, lang: UiLang, utcHour: number) => `${t}_${lang}_h${String(utcHour).padStart(2, '0')}`;
export const TOPIC_RE = /^(radar_stress|macro_dolar|daily_brief)_(es|en|pt)_h([01]\d|2[0-3])$/;

/** Tópicos que corresponden a unas preferencias: por categoría, idioma y cada hora UTC fuera del horario de silencio. */
export function topicsFor(p: { radar: boolean; digests: boolean; quiet: QuietHours }, lang: UiLang, offsetMin: number): string[] {
  const hours = activeUtcHours(p.quiet, offsetMin), out: string[] = [];
  for (const cat of ['radar', 'digests'] as const) if (p[cat]) for (const tp of CATEGORY_TOPICS[cat]) for (const h of hours) out.push(topicName(tp, lang, h));
  return out;
}
