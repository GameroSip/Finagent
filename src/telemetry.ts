// Vocabulario CERRADO de estadísticas de uso de la beta. Lo comparten la app y el servidor: el servidor descarta todo lo que no esté acá.
// Principio: nunca texto libre. Cada valor sale de una lista, de un número acotado o de un patrón estricto (un símbolo bursátil, una versión).
// Por eso, aunque alguien manipulara la app, el servidor no puede guardar lo que escribís al asistente ni tu plan.
export type Rule = 'bool' | { int: [number, number] } | readonly string[] | RegExp | { csv: readonly string[]; max: number };
export type Spec = Record<string, Rule>;

export const GROUPS = ['índices', 'ETF', 'acciones', 'cripto', 'otro'] as const;
export const LEVELS = ['baja', 'media', 'alta'] as const;
export const AI_TOOLS = ['search_ticker', 'get_quote', 'get_fundamentals', 'get_financials', 'get_technicals', 'get_performance', 'get_news', 'compare_assets', 'screen_assets', 'calculate', 'get_market_overview', 'get_movers', 'get_argentina_macro', 'get_headlines'] as const;
export const CHART_TOOLS = ['ema20', 'ema50', 'ema200', 'bollinger', 'fib', 'pivots', 'vwap', 'profile', 'sessions', 'volume', 'rsi', 'macd'] as const;
/** Funciones que todavía NO existen y sobre las que se mide interés (ver "Qué te gustaría que sumemos" en Ajustes). */
export const FEATURES = ['cartera', 'calculadora', 'alertas', 'cuentas', 'ejecucion', 'recomendaciones', 'tiempo_real'] as const;
export const FEEDBACK_KINDS = ['idea', 'problema', 'falta', 'nps'] as const;

const SYM = /^[A-Z0-9.\-^=]{1,16}$/, QUERY = /^[a-z0-9.\-^=]{1,24}$/, VERSION = /^\d{1,2}\.\d{1,2}\.\d{1,2}$/;

export const EVENTS: Record<string, Spec> = {
  app_open: { v: VERSION, lang: ['es', 'en', 'pt'], theme: ['auto', 'dark', 'light'], sound: 'bool' },
  intro_step: { step: ['account', 'language', 'consent', 'tour', 'done'], skipped: 'bool' },
  tour_slide: { n: { int: [1, 7] } },
  screen: { name: ['markets', 'assistant', 'watchlist', 'settings', 'asset', 'search', 'about', 'plans', 'chats', 'feedback'] },
  asset_open: { sym: SYM, group: GROUPS, from: ['market', 'search', 'watchlist', 'assistant'] },
  search: { found: 'bool' },
  search_miss: { q: QUERY },                                         // solo búsquedas SIN resultado, y solo si parecen un símbolo o un nombre corto (sin espacios ni frases)
  chart_range: { range: ['1D', '1S', '1M', '6M', '1A', '5A'] },
  chart_kind: { kind: ['line', 'candles'] },
  chart_tool: { tool: CHART_TOOLS, on: 'bool' },
  stress_view: { level: LEVELS, group: GROUPS },
  move_view: { group: GROUPS, ok: 'bool' },
  plan_open: {},
  plan_saved: { len: ['corto', 'medio', 'largo'] },                  // el plan en sí NUNCA se envía: solo si es corto, medio o largo
  plan_removed: {},
  watch: { op: ['add', 'remove'], group: GROUPS },
  ai_send: { src: ['typed', 'suggestion', 'asset', 'market', 'regenerate'], chat: ['new', 'follow'], len: ['s', 'm', 'l'] },   // el texto de la consulta NUNCA se envía
  ai_done: { tools: { csv: AI_TOOLS, max: 14 }, ms: { int: [0, 600000] }, steps: { int: [0, 40] }, checked: { int: [0, 99] }, unverified: { int: [0, 99] }, fixed: 'bool' },
  ai_error: { kind: ['network', 'limit', 'capacity', 'session', 'other'] },
  ai_rate: { rating: ['up', 'down'], reason: ['wrong', 'incomplete', 'confusing', 'slow', 'other'] },
  quota_block: { reason: ['daily', 'monthly'] },
  upsell: { action: ['view', 'click', 'dismiss'] },
  fakedoor: { feature: FEATURES, action: ['view', 'interest'] },
  setting: { key: ['lang', 'theme', 'sound', 'analytics'], value: /^[a-z0-9]{1,8}$/ },
  feedback_sent: { kind: FEEDBACK_KINDS },
  error: { kind: ['network', 'session', 'render', 'other'] },
};
export type EventName = keyof typeof EVENTS;
export const EVENT_NAMES = Object.keys(EVENTS);

function ok(rule: Rule, v: unknown): boolean {
  if (rule === 'bool') return typeof v === 'boolean';
  if (rule instanceof RegExp) return typeof v === 'string' && v.length <= 40 && rule.test(v);
  if (Array.isArray(rule)) return typeof v === 'string' && (rule as readonly string[]).includes(v);
  const r = rule as { int?: [number, number]; csv?: readonly string[]; max?: number };
  if (r.int) return typeof v === 'number' && Number.isInteger(v) && v >= r.int[0] && v <= r.int[1];
  if (r.csv) { if (typeof v !== 'string' || v.length > 400) return false; if (v === '') return true; const parts = v.split(','); return parts.length <= (r.max ?? 10) && parts.every((p) => r.csv!.includes(p)); }
  return false;
}

/** Devuelve las propiedades limpias del evento, o null si el evento no existe o algún valor no cumple su regla. Las claves que no están en la lista se ignoran. */
export function cleanEvent(name: unknown, props: unknown): Record<string, string | number | boolean> | null {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(EVENTS, name)) return null;
  const spec = EVENTS[name], src = (props && typeof props === 'object' ? props : {}) as Record<string, unknown>, out: Record<string, string | number | boolean> = {};
  for (const [k, rule] of Object.entries(spec)) {
    if (!(k in src)) continue;
    if (!ok(rule, src[k])) return null;
    out[k] = src[k] as string | number | boolean;
  }
  return out;
}

/** Cuánto escribió la persona, en tres tamaños (nunca la cantidad exacta). */
export const lenBucket = (n: number): 's' | 'm' | 'l' => (n <= 40 ? 's' : n <= 160 ? 'm' : 'l');
export const planLen = (n: number): 'corto' | 'medio' | 'largo' => (n <= 80 ? 'corto' : n <= 250 ? 'medio' : 'largo');
/** Búsqueda sin resultado → patrón aceptado (o null si parece una frase, tiene espacios o es demasiado larga). */
export const missQuery = (raw: string): string | null => { const q = raw.trim().toLowerCase(); return QUERY.test(q) ? q : null; };
