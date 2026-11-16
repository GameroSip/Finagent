// Mi cartera: lo que la persona declara tener. Se guarda SOLO en el teléfono (localStorage) y nunca se envía a ningún servidor.
// Este módulo es puro (sin pantalla): valuación, reparto por moneda, importación de CSV y cálculo de escenarios.

export interface Holding {
  id: string;
  kind: 'asset' | 'cash';
  /** Símbolo de Yahoo (AAPL, GGAL.BA, BTC-USD) o código de moneda si es efectivo (ARS, USD). */
  symbol: string;
  qty: number;
  /** Costo promedio por unidad, en la moneda del activo. Opcional. */
  cost: number | null;
}

export const CASH_CODES = ['ARS', 'USD', 'EUR', 'BRL', 'GBP', 'USDT', 'USDC'] as const;
const KEY = 'finagent.portfolio.v1';
const MAX_HOLDINGS = 200;

const isHolding = (x: any): x is Holding =>
  !!x && typeof x.id === 'string' && (x.kind === 'asset' || x.kind === 'cash') && typeof x.symbol === 'string' && x.symbol.length > 0
  && typeof x.qty === 'number' && Number.isFinite(x.qty) && x.qty >= 0 && (x.cost === null || (typeof x.cost === 'number' && Number.isFinite(x.cost) && x.cost >= 0));

export function loadPortfolio(): Holding[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isHolding).slice(0, MAX_HOLDINGS) : [];
  } catch { return []; }
}
export function savePortfolio(list: Holding[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_HOLDINGS))); } catch { /* sin almacenamiento */ }
}

let seq = 0;
export const newId = () => `h${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Agrega una posición. Si ya existe el mismo símbolo, suma cantidades y promedia el costo (solo si ambas lo tienen). */
export function addHolding(list: Holding[], h: Omit<Holding, 'id'>): Holding[] {
  const symbol = h.symbol.trim().toUpperCase();
  const i = list.findIndex((x) => x.kind === h.kind && x.symbol === symbol);
  if (i < 0) return [...list, { ...h, symbol, id: newId() }].slice(0, MAX_HOLDINGS);
  const a = list[i];
  const qty = a.qty + h.qty;
  const cost = a.cost !== null && h.cost !== null && qty > 0 ? (a.cost * a.qty + h.cost * h.qty) / qty : a.cost !== null && h.cost === null ? a.cost : h.cost !== null && a.cost === null ? h.cost : null;
  const out = list.slice(); out[i] = { ...a, qty, cost }; return out;
}

// ───────────────────────── importación de CSV ─────────────────────────

/** Número escrito a la argentina o a la americana. Con un solo separador seguido de EXACTAMENTE tres dígitos (y 1 a 3 antes, sin 0 inicial) se toma como miles (100.000 = cien mil); si no, como decimal. */
export function parseNum(raw: string): number | null {
  let s = raw.trim().replace(/[\s$€£]|US|R\$/g, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');
  const dots = (s.match(/\./g) ?? []).length, commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (commas + dots === 1 && /^[1-9]\d{0,2}[.,]\d{3}$/.test(s)) s = s.replace(/[.,]/, '');
  else if (commas > 1) s = s.replace(/,/g, '');
  else if (dots > 1) s = s.replace(/\./g, '');
  else if (commas === 1) s = s.replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const COLS: Record<'symbol' | 'qty' | 'cost', RegExp> = {
  symbol: /^(symbol|ticker|simbolo|símbolo|activo|especie|instrumento|asset|codigo|código)$/i,
  qty: /^(qty|quantity|cantidad|nominales|tenencia|unidades|cant\.?|amount|monto)$/i,
  cost: /^(cost|costo|precio|price|ppc|precio promedio|costo promedio|precio de compra|avg price)$/i,
};

export interface CsvResult { rows: Array<Omit<Holding, 'id'>>; skipped: string[] }

/** Lee un CSV (coma, punto y coma o tabulación) con columnas de símbolo, cantidad y, si hay, costo. Lo que no se entiende se informa, no se inventa. */
export function parseCsv(text: string): CsvResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: CsvResult = { rows: [], skipped: [] };
  if (!lines.length) return out;
  const delim = [';', '\t', ','].find((d) => lines[0].includes(d)) ?? ',';
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = split(lines[0]);
  const idx = { symbol: head.findIndex((c) => COLS.symbol.test(c)), qty: head.findIndex((c) => COLS.qty.test(c)), cost: head.findIndex((c) => COLS.cost.test(c)) };
  const hasHeader = idx.symbol >= 0 && idx.qty >= 0;
  const body = hasHeader ? lines.slice(1) : lines;
  const at = hasHeader ? idx : { symbol: 0, qty: 1, cost: head.length > 2 ? 2 : -1 };
  body.forEach((line, n) => {
    const c = split(line);
    const sym = (c[at.symbol] ?? '').toUpperCase();
    const qty = parseNum(c[at.qty] ?? '');
    const cost = at.cost >= 0 && c[at.cost] ? parseNum(c[at.cost]) : null;
    const lineNo = n + (hasHeader ? 2 : 1);
    if (!/^[A-Z0-9.^=\-]{1,20}$/.test(sym) || qty === null || qty < 0) { out.skipped.push(`${lineNo}: ${line.slice(0, 40)}`); return; }
    const kind = (CASH_CODES as readonly string[]).includes(sym) ? 'cash' : 'asset';
    out.rows.push({ kind, symbol: sym, qty, cost: kind === 'cash' ? null : cost !== null && cost >= 0 ? cost : null });
  });
  return out;
}

// ───────────────────────── valuación ─────────────────────────

export interface Quote { price: number; currency: string | null }
export interface Valued {
  h: Holding;
  currency: string | null;          // moneda en que se expresa el valor (null = no se pudo saber)
  price: number | null;
  value: number | null;             // en su propia moneda
  gainPct: number | null;           // contra el costo declarado
}

export function valuate(list: Holding[], quotes: ReadonlyMap<string, Quote>): Valued[] {
  return list.map((h) => {
    if (h.kind === 'cash') return { h, currency: h.symbol, price: 1, value: h.qty, gainPct: null };
    const q = quotes.get(h.symbol);
    if (!q || !Number.isFinite(q.price)) return { h, currency: null, price: null, value: null, gainPct: null };
    return { h, currency: q.currency, price: q.price, value: q.price * h.qty, gainPct: h.cost && h.cost > 0 ? (q.price / h.cost - 1) * 100 : null };
  });
}

/** Total por moneda, sin convertir nada. */
export function totalsByCurrency(v: Valued[]): Array<{ currency: string; total: number }> {
  const m = new Map<string, number>();
  for (const x of v) if (x.value !== null && x.currency) m.set(x.currency, (m.get(x.currency) ?? 0) + x.value);
  return [...m].map(([currency, total]) => ({ currency, total })).sort((a, b) => b.total - a.total);
}

const isUsdLike = (c: string | null) => c === 'USD' || c === 'USDT' || c === 'USDC';

/** Convierte a pesos o a dólares con UN tipo de cambio que la persona elige (pesos por dólar). Otras monedas quedan sin convertir. */
export function toBase(value: number, currency: string | null, base: 'ARS' | 'USD', arsPerUsd: number): number | null {
  if (!currency) return null;
  if (currency === base || (base === 'USD' && isUsdLike(currency))) return value;
  if (base === 'ARS' && isUsdLike(currency)) return value * arsPerUsd;
  if (base === 'USD' && currency === 'ARS') return arsPerUsd > 0 ? value / arsPerUsd : null;
  return null;
}

export interface Allocation { symbol: string; value: number; pct: number }
export function allocation(v: Valued[], base: 'ARS' | 'USD', arsPerUsd: number): { items: Allocation[]; total: number; excluded: number } {
  const items: Array<{ symbol: string; value: number }> = [];
  let excluded = 0;
  for (const x of v) {
    const b = x.value === null ? null : toBase(x.value, x.currency, base, arsPerUsd);
    if (b === null) { excluded++; continue; }
    items.push({ symbol: x.h.symbol, value: b });
  }
  const total = items.reduce((a, b) => a + b.value, 0);
  return { items: items.map((i) => ({ ...i, pct: total > 0 ? (i.value / total) * 100 : 0 })).sort((a, b) => b.value - a.value), total, excluded };
}

// ───────────────────────── escenarios ─────────────────────────

export interface Shocks {
  /** Cambio del dólar frente al peso, en % (+20 = el dólar sube 20%). */
  fxPct: number;
  /** Cambio de todos los activos (no efectivo), en su propia moneda, en %. */
  assetsPct: number;
  /** Cambios puntuales por símbolo; reemplazan al general para ese activo. */
  bySymbol?: Record<string, number>;
}
export interface ScenarioRow { symbol: string; before: number; after: number; deltaPct: number }
export interface ScenarioResult { base: 'ARS' | 'USD'; rateBefore: number; rateAfter: number; before: number; after: number; deltaPct: number; rows: ScenarioRow[]; excluded: number }

/**
 * Aritmética pura sobre SUPUESTOS que la persona elige: no es una predicción ni una estimación de probabilidad.
 * No modela que los activos en pesos que cotizan en el país (p. ej. CEDEARs) suelen moverse con el dólar: eso lo decide cada quien en "cambio puntual".
 */
export function scenario(v: Valued[], base: 'ARS' | 'USD', arsPerUsd: number, s: Shocks): ScenarioResult {
  const rateAfter = arsPerUsd * (1 + s.fxPct / 100);
  const rows: ScenarioRow[] = [];
  let before = 0, after = 0, excluded = 0;
  for (const x of v) {
    const b0 = x.value === null ? null : toBase(x.value, x.currency, base, arsPerUsd);
    if (b0 === null || x.value === null) { excluded++; continue; }
    const move = x.h.kind === 'cash' ? 0 : s.bySymbol?.[x.h.symbol] ?? s.assetsPct;
    const b1 = toBase(x.value * (1 + move / 100), x.currency, base, rateAfter) ?? b0;
    before += b0; after += b1;
    rows.push({ symbol: x.h.symbol, before: b0, after: b1, deltaPct: b0 ? (b1 / b0 - 1) * 100 : 0 });
  }
  return { base, rateBefore: arsPerUsd, rateAfter, before, after, deltaPct: before ? (after / before - 1) * 100 : 0, rows: rows.sort((a, b) => b.before - a.before), excluded };
}

// ───────────────────────── aportes y plazo ─────────────────────────

export interface SavingsInput { initial: number; monthly: number; annualRatePct: number; years: number; inflationPct: number }
export interface SavingsResult { contributed: number; nominal: number; real: number; interest: number; byYear: Array<{ year: number; nominal: number; real: number }> }

/** Interés compuesto mensual equivalente a la tasa anual supuesta; aportes a fin de cada mes. `real` descuenta la inflación supuesta. */
export function savings(i: SavingsInput): SavingsResult {
  const years = Math.max(0, Math.min(60, Math.floor(i.years)));
  const m = Math.pow(1 + i.annualRatePct / 100, 1 / 12) - 1;
  const infl = Math.pow(1 + i.inflationPct / 100, 1 / 12);
  let bal = i.initial;
  const byYear: SavingsResult['byYear'] = [];
  for (let k = 1; k <= years * 12; k++) {
    bal = bal * (1 + m) + i.monthly;
    if (k % 12 === 0) byYear.push({ year: k / 12, nominal: bal, real: bal / Math.pow(infl, k) });
  }
  const contributed = i.initial + i.monthly * years * 12;
  const last = byYear[byYear.length - 1] ?? { nominal: i.initial, real: i.initial };
  return { contributed, nominal: last.nominal, real: last.real, interest: last.nominal - contributed, byYear };
}
