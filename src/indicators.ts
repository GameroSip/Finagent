// Indicadores técnicos deterministas (equivalentes a la versión Python/pandas, verificados con fixtures).

export interface OHLC { o: number; h: number; l: number; c: number }
type Series = (number | null)[];

export function r(x: number | null | undefined, nd = 4): number | null {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Number(x.toFixed(nd));
}

export function ema(x: number[], span: number): number[] {
  const a = 2 / (span + 1);
  const out: number[] = new Array(x.length);
  let prev = x[0];
  for (let i = 0; i < x.length; i++) {
    prev = i === 0 ? x[0] : a * x[i] + (1 - a) * prev;
    out[i] = prev;
  }
  return out;
}

function rsiValue(ag: number, al: number): number {
  if (al === 0) return ag === 0 ? 50 : 100;
  return 100 - 100 / (1 + ag / al);
}

/** RSI de Wilder (semilla con promedio simple de los primeros `period` cambios). */
export function rsi(close: number[], period = 14): Series {
  const out: Series = new Array(close.length).fill(null);
  if (close.length <= period) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = close[i] - close[i - 1];
    ag += Math.max(d, 0);
    al += Math.max(-d, 0);
  }
  ag /= period; al /= period;
  out[period] = rsiValue(ag, al);
  for (let i = period + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = rsiValue(ag, al);
  }
  return out;
}

export function macd(close: number[], fast = 12, slow = 26, signal = 9) {
  const ef = ema(close, fast), es = ema(close, slow);
  const line = ef.map((v, i) => v - es[i]);
  const sig = ema(line, signal);
  return { line, signal: sig, hist: line.map((v, i) => v - sig[i]) };
}

export function bollingerLast(close: number[], window = 20, nStd = 2) {
  const w = close.slice(-window);
  const mid = w.reduce((a, b) => a + b, 0) / w.length;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - mid) ** 2, 0) / w.length);
  return { lower: mid - nStd * sd, mid, upper: mid + nStd * sd };
}

/** ATR de Wilder con suavizado exponencial alpha = 1/period (igual que pandas ewm adjust=False). */
export function atr(bars: OHLC[], period = 14): Series {
  const out: Series = new Array(bars.length).fill(null);
  const a = 1 / period;
  let prev = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const pc = i > 0 ? bars[i - 1].c : null;
    const tr = pc === null ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    prev = i === 0 ? tr : a * tr + (1 - a) * prev;
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

export function snapshot(bars: OHLC[]) {
  if (!bars || bars.length === 0) throw new Error('Sin datos de precios');
  const close = bars.map((b) => b.c);
  const n = close.length;
  const last = close[n - 1];

  const rsi14 = n >= 15 ? r(rsi(close)[n - 1], 2) : null;

  let macdD: null | { line: number | null; signal: number | null; histogram: number | null; params: object } = null;
  if (n >= 35) {
    const m = macd(close);
    macdD = { line: r(m.line[n - 1]), signal: r(m.signal[n - 1]), histogram: r(m.hist[n - 1]),
      params: { fast: 12, slow: 26, signal: 9 } };
  }

  const emaAt = (s: number) => (n >= s ? r(ema(close, s)[n - 1]) : null);
  const ema20 = emaAt(20), ema50 = emaAt(50), ema200 = emaAt(200);

  let boll: null | { lower: number | null; middle: number | null; upper: number | null; percent_b: number | null; params: object } = null;
  if (n >= 20) {
    const b = bollingerLast(close);
    const width = b.upper - b.lower;
    boll = { lower: r(b.lower), middle: r(b.mid), upper: r(b.upper),
      percent_b: width ? r((last - b.lower) / width) : null, params: { window: 20, std: 2 } };
  }

  let atr14: number | null = null, atrPct: number | null = null;
  if (n >= 15) {
    const a = atr(bars)[n - 1];
    atr14 = r(a);
    atrPct = a !== null && last ? r((a / last) * 100, 2) : null;
  }

  const win = Math.min(n, 252);
  const slice = bars.slice(-win);
  const hi = Math.max(...slice.map((b) => b.h));
  const lo = Math.min(...slice.map((b) => b.l));
  const distHigh = hi ? r((last / hi - 1) * 100, 2) : null;
  const distLow = lo ? r((last / lo - 1) * 100, 2) : null;
  const distEma200 = ema200 ? r((last / ema200 - 1) * 100, 2) : null;

  const signals: string[] = [];
  if (rsi14 !== null) {
    if (rsi14 >= 70) signals.push('RSI14 >= 70: zona de sobrecompra');
    else if (rsi14 <= 30) signals.push('RSI14 <= 30: zona de sobreventa');
    else signals.push('RSI14 entre 30 y 70: zona neutral');
  }
  if (ema200) signals.push(last > ema200 ? 'Precio por encima de EMA200' : 'Precio por debajo de EMA200');
  if (ema50 && ema200) {
    signals.push(ema50 > ema200 ? 'EMA50 > EMA200 (estructura alcista de largo plazo)'
      : 'EMA50 < EMA200 (estructura bajista de largo plazo)');
  }
  if (macdD && macdD.histogram !== null) {
    signals.push(macdD.histogram > 0 ? 'MACD sobre su señal (momentum positivo)' : 'MACD bajo su señal (momentum negativo)');
  }
  if (boll && boll.percent_b !== null) {
    if (boll.percent_b > 1) signals.push('Precio por encima de la banda superior de Bollinger');
    else if (boll.percent_b < 0) signals.push('Precio por debajo de la banda inferior de Bollinger');
  }

  return {
    bars: n,
    price: r(last),
    rsi14,
    macd: macdD,
    ema20, ema50, ema200,
    bollinger: boll,
    atr14,
    atr14_pct_of_price: atrPct,
    range_window_bars: win,
    high_in_window: r(hi),
    low_in_window: r(lo),
    pct_from_window_high: distHigh,
    pct_from_window_low: distLow,
    pct_vs_ema200: distEma200,
    signals,
    formulas: {
      pct_vs_ema200: '(precio / EMA200 - 1) × 100',
      pct_from_window_high: '(precio / máximo de la ventana - 1) × 100',
      rsi14: 'RSI de Wilder, 14 períodos',
    },
  };
}
