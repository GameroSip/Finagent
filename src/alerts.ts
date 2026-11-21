// Alertas de precio por activo: reglas que viven SOLO en el teléfono (nunca se mandan al servidor).
// La lógica es pura (sin DOM ni red) para poder probarla: enfriamiento entre avisos e histéresis para no avisar diez veces
// cuando el precio baila alrededor del valor. El evaluador está separado de la fuente de precios: hoy corre en la app con
// Yahoo (al abrir y al volver a la app); mañana puede correr en el servidor con un proveedor comercial sin tocar la pantalla.
import type { StressLevel } from './stress';

export type RuleKind = 'above' | 'below' | 'move';
export interface AlertRule {
  id: string;
  symbol: string;
  name: string;
  kind: RuleKind;
  /** above/below: precio. move: variación diaria en % (valor absoluto). */
  value: number;
  currency?: string;
  created: number;
  /** Lista para avisar. Después de un aviso queda "desarmada" hasta que el precio se aleja del valor (histéresis). */
  armed: boolean;
  lastFired?: number;
  /** Día de mercado (AAAA-MM-DD) del último aviso de variación diaria. */
  lastDay?: string;
}
export interface Quote { price: number; changePct: number; day: string; currency?: string; at: number }
export interface AlertConfig { cooldownMs: number; hysteresis: number; moveRearm: number; maxRules: number }
export const ALERT_CFG: AlertConfig = {
  cooldownMs: 6 * 3600_000,   // como mucho un aviso cada 6 horas por regla
  hysteresis: 0.005,          // para volver a avisar "superó X", el precio tiene que bajar antes a X − 0,5 %
  moveRearm: 0.7,             // "se movió 5 %": vuelve a armarse si la variación baja de 3,5 % (o empieza otro día)
  maxRules: 30,
};

const satisfied = (r: AlertRule, q: Quote) => (r.kind === 'above' ? q.price >= r.value : r.kind === 'below' ? q.price <= r.value : Math.abs(q.changePct) >= r.value);
const rearm = (r: AlertRule, q: Quote, cfg: AlertConfig) =>
  r.kind === 'above' ? q.price < r.value * (1 - cfg.hysteresis) : r.kind === 'below' ? q.price > r.value * (1 + cfg.hysteresis) : Math.abs(q.changePct) < r.value * cfg.moveRearm || q.day !== r.lastDay;

/** Crea una regla. Si la condición ya se cumple al crearla, nace desarmada: avisa recién cuando vuelve a cruzar (no "de una"). */
export function newRule(o: { symbol: string; name: string; kind: RuleKind; value: number; currency?: string }, q: Quote | null, now = Date.now()): AlertRule {
  const r: AlertRule = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, symbol: o.symbol.toUpperCase(), name: o.name || o.symbol, kind: o.kind, value: o.value, currency: o.currency ?? q?.currency, created: now, armed: true };
  if (q && satisfied(r, q)) { r.armed = false; if (r.kind === 'move') r.lastDay = q.day; }
  return r;
}

export const ALERT_ERRORS = {
  zero: 'Ingresá un valor mayor que cero.',
  move: 'Elegí una variación entre 0,5 % y 50 %.',
  above: 'Para "supera", elegí un precio más alto que el actual.',
  below: 'Para "baja de", elegí un precio más bajo que el actual.',
};
/** Problema con el valor elegido (o null si está bien). */
export function validateRule(kind: RuleKind, value: number, price: number | null): string | null {
  if (!Number.isFinite(value) || value <= 0) return ALERT_ERRORS.zero;
  if (kind === 'move') return value < 0.5 || value > 50 ? ALERT_ERRORS.move : null;
  if (price == null) return null;
  if (kind === 'above' && value <= price) return ALERT_ERRORS.above;
  if (kind === 'below' && value >= price) return ALERT_ERRORS.below;
  return null;
}

/** Evalúa una regla contra una cotización. Devuelve la regla actualizada y si hay que avisar. */
export function evaluateRule(r: AlertRule, q: Quote, now: number, cfg: AlertConfig = ALERT_CFG): { rule: AlertRule; fire: boolean } {
  const rule = { ...r };
  if (!rule.armed && rearm(rule, q, cfg)) rule.armed = true;
  if (rule.armed && satisfied(rule, q) && (rule.lastFired == null || now - rule.lastFired >= cfg.cooldownMs) && !(rule.kind === 'move' && rule.lastDay === q.day)) {
    rule.armed = false; rule.lastFired = now;
    if (rule.kind === 'move') rule.lastDay = q.day;
    return { rule, fire: true };
  }
  return { rule, fire: false };
}

// ---------------------------------------------------------------- evaluador intercambiable
export interface QuoteSource { quotes(symbols: string[]): Promise<Record<string, Quote>> }
export interface Fired { rule: AlertRule; quote: Quote }
export interface AlertEvaluator { run(rules: AlertRule[], now: number): Promise<{ rules: AlertRule[]; fired: Fired[] }> }

/** Evalúa en el teléfono. Una cotización vieja (más de 3 días, mercado cerrado) no dispara nada. */
export class LocalEvaluator implements AlertEvaluator {
  constructor(private src: QuoteSource, private cfg: AlertConfig = ALERT_CFG) {}
  async run(rules: AlertRule[], now: number) {
    const symbols = [...new Set(rules.map((r) => r.symbol))];
    const quotes = symbols.length ? await this.src.quotes(symbols).catch(() => ({} as Record<string, Quote>)) : {};
    const fired: Fired[] = [];
    const out = rules.map((r) => {
      const q = quotes[r.symbol];
      if (!q || now - q.at > 3 * 86400_000) return r;
      const { rule, fire } = evaluateRule(r, q, now, this.cfg);
      if (fire) fired.push({ rule, quote: q });
      return rule;
    });
    return { rules: out, fired };
  }
}

// ---------------------------------------------------------------- termómetro de tensión (local)
export interface RadarState { level: StressLevel; notified: StressLevel; at: number }
/** El termómetro usa velas diarias cerradas: cambia como mucho una vez por día. Se avisa solo cuando cambia el nivel (el primero se guarda sin avisar). */
export function evaluateRadar(prev: RadarState | null, level: StressLevel, now: number, cooldownMs = 12 * 3600_000): { state: RadarState; fire: { from: StressLevel; to: StressLevel } | null } {
  if (!prev) return { state: { level, notified: level, at: now }, fire: null };
  if (level !== prev.notified && now - prev.at >= cooldownMs) return { state: { level, notified: level, at: now }, fire: { from: prev.notified, to: level } };
  return { state: { ...prev, level }, fire: null };
}

// ---------------------------------------------------------------- guardado en el teléfono
const KEY = 'finagent.alerts.v1';
export function loadRules(): AlertRule[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v.filter((r) => r && typeof r.symbol === 'string' && typeof r.value === 'number') : []; } catch { return []; }
}
export function saveRules(rules: AlertRule[]): void { try { localStorage.setItem(KEY, JSON.stringify(rules.slice(0, ALERT_CFG.maxRules))); } catch { /* sin almacenamiento */ } }
export const rulesFor = (symbol: string) => loadRules().filter((r) => r.symbol === symbol.toUpperCase());
export function addRule(r: AlertRule): boolean { const all = loadRules(); if (all.length >= ALERT_CFG.maxRules) return false; saveRules([...all, r]); return true; }
export function removeRule(id: string): void { saveRules(loadRules().filter((r) => r.id !== id)); }
