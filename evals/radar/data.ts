import { existsSync, readFileSync } from 'node:fs';
import type { DayBar } from '../../src/radar';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export interface Fetched { bars: DayBar[]; note?: string }

export const cachePath = (symbol: string) => `evals/radar/data/${symbol.replace(/[^A-Za-z0-9.-]/g, '_')}.json`;
/** Datos ya descargados por el paso de Python (yfinance). Formato: { bars: [[t, o, h, l, c, v], ...] }. */
export function loadCached(symbol: string): DayBar[] | null {
  const f = cachePath(symbol);
  if (!existsSync(f)) return null;
  try { return (JSON.parse(readFileSync(f, 'utf8')).bars as number[][]).map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })).filter((b) => [b.o, b.h, b.l, b.c].every((x) => x > 0)); } catch { return null; }
}

/** CSV de Stooq (Date,Open,High,Low,Close,Volume). Devuelve [] si la respuesta no es un CSV de precios (por ejemplo, si pide una clave). */
export function parseStooq(text: string): DayBar[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length || !/^date,open,high,low,close/i.test(lines[0])) return [];
  const bars: DayBar[] = [];
  for (const ln of lines.slice(1)) {
    const [d, o, h, l, c, v] = ln.split(',');
    const t = Date.parse(`${d}T00:00:00Z`) / 1000, [no, nh, nl, nc] = [o, h, l, c].map(Number);
    if (!Number.isFinite(t) || [no, nh, nl, nc].some((x) => !(x > 0))) continue;
    bars.push({ t, o: no, h: nh, l: nl, c: nc, v: Number(v) || 0 });
  }
  return bars.sort((x, y) => x.t - y.t);
}
const STOOQ_INDEX: Record<string, string> = { '^GSPC': '^spx', '^IXIC': '^ndq', '^DJI': '^dji', '^FTSE': '^ukx', '^GDAXI': '^dax', '^N225': '^nkx', '^BVSP': '^bvp', '^HSI': '^hsi', '^VIX': '^vix' };
export const stooqSymbol = (symbol: string): string | null => (symbol.startsWith('^') ? STOOQ_INDEX[symbol] ?? null : /-USD$/.test(symbol) ? null : `${symbol.toLowerCase()}.us`);

/** Velas diarias de Binance (datos públicos de mercado). Cada vela: [apertura, open, high, low, close, volume, ...] con precios como texto. */
export function parseKlines(rows: unknown[][]): DayBar[] {
  return rows.map((k) => ({ t: Math.floor(Number(k[0]) / 1000), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) || 0 })).filter((b) => [b.o, b.h, b.l, b.c].every((x) => x > 0));
}
export const binanceSymbol = (symbol: string): string | null => (/-USD$/.test(symbol) ? `${symbol.replace('-USD', '')}USDT` : null);

export const retryDelay = { ms: 1200 };   // espera entre reintentos (las pruebas la ponen en 0)
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36';

async function fromYahoo(symbol: string): Promise<DayBar[]> {
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const host of ['query1', 'query2']) {
      try {
        const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=max&interval=1d&includePrePost=false&events=div,splits`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
        if (r.status === 429) { lastErr = 'HTTP 429'; continue; }
        const j: any = await r.json(), res = j?.chart?.result?.[0];
        if (!res) { lastErr = j?.chart?.error?.description ?? `HTTP ${r.status}`; continue; }
        const q = res.indicators?.quote?.[0] ?? {}, ts: number[] = res.timestamp ?? [], bars: DayBar[] = [];
        for (let i = 0; i < ts.length; i++) {
          const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
          if ([o, h, l, c].some((x) => typeof x !== 'number' || !(x > 0))) continue;
          bars.push({ t: ts[i], o, h, l, c, v: Number(q.volume?.[i]) || 0 });
        }
        return bars;
      } catch (e: any) { lastErr = String(e?.message ?? e); }
    }
    await sleep(retryDelay.ms);
  }
  throw new Error(lastErr || 'sin datos');
}
async function fromStooq(symbol: string): Promise<DayBar[]> {
  const s = stooqSymbol(symbol); if (!s) return [];
  const r = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`, { headers: { 'User-Agent': UA } });
  return r.ok ? parseStooq(await r.text()) : [];
}
async function fromBinance(symbol: string): Promise<DayBar[]> {
  const s = binanceSymbol(symbol); if (!s) return [];
  const bars: DayBar[] = []; let start = Date.UTC(2017, 7, 1);
  for (let page = 0; page < 12; page++) {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${s}&interval=1d&limit=1000&startTime=${start}`);
    if (!r.ok) break;
    const rows = (await r.json()) as unknown[][];
    if (!rows.length) break;
    bars.push(...parseKlines(rows)); start = Number(rows[rows.length - 1][0]) + 86400000;
    if (rows.length < 1000) break;
  }
  return bars;
}

/** Historia diaria: primero lo ya descargado por yfinance, luego Yahoo directo y por último respaldos (Stooq para acciones/índices, Binance para cripto). */
export async function fetchDaily(symbol: string, state = { blocked: 0 }): Promise<Fetched> {
  const cached = loadCached(symbol);
  if (cached && cached.length) return { bars: cached, note: 'yfinance' };
  const tried: string[] = [];
  if (state.blocked < 4) {
    try { const b = await fromYahoo(symbol); if (b.length) { state.blocked = 0; return { bars: b, note: 'Yahoo' }; } tried.push('Yahoo: sin datos'); }
    catch (e: any) { tried.push(`Yahoo: ${e.message}`); if (/429/.test(e.message)) state.blocked++; }
  } else tried.push('Yahoo: bloqueado (se omite)');
  for (const [name, f] of [['Stooq', fromStooq], ['Binance', fromBinance]] as const) {
    try { const b = await f(symbol); if (b.length) return { bars: b, note: name }; } catch (e: any) { tried.push(`${name}: ${String(e?.message ?? e).slice(0, 40)}`); }
  }
  throw new Error(tried.join(' · ') || 'sin datos');
}

/** Camino aleatorio con volatilidad que se agrupa (parecido a un activo real, pero SIN ninguna señal predictiva escondida). Para probar el circuito sin internet. */
export function synthetic(seed: number, days = 6000, volMean = 0.012): DayBar[] {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const norm = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const bars: DayBar[] = [];
  let price = 100, vol = volMean;
  for (let i = 0; i < days; i++) {
    vol = Math.max(0.003, 0.94 * vol + 0.06 * volMean + 0.25 * volMean * Math.abs(norm()) * 0.4);
    const ret = vol * norm(), o = price, c = price * Math.exp(ret), range = Math.abs(ret) + vol * 0.6 * rnd();
    const h = Math.max(o, c) * (1 + range * 0.3 * rnd()), l = Math.min(o, c) * (1 - range * 0.3 * rnd());
    bars.push({ t: 946684800 + i * 86400, o, h, l, c, v: Math.round(1e6 * Math.exp(0.35 * norm() + 8 * Math.abs(ret))) });
    price = c;
  }
  return bars;
}
