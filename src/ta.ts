// Herramientas de análisis técnico para los gráficos. Funciones puras (sin DOM): se prueban aparte y el gráfico solo las dibuja.
export interface TBar { t: number; o: number; h: number; l: number; c: number; v?: number }
export type Ser = Array<number | null>;

const dayKey = (tSec: number) => new Date(tSec * 1000).toISOString().slice(0, 10); // día UTC (cubre bien EE.UU., Europa, Asia, Argentina y cripto)

// ------------------------------------------------------------------ medias y bandas
export function sma(x: number[], n: number): Ser {
  const out: Ser = new Array(x.length).fill(null);
  let sum = 0;
  for (let i = 0; i < x.length; i++) { sum += x[i]; if (i >= n) sum -= x[i - n]; if (i >= n - 1) out[i] = sum / n; }
  return out;
}
/** Bandas de Bollinger (desvío poblacional, igual que bollingerLast). */
export function bollinger(close: number[], window = 20, nStd = 2): { upper: Ser; mid: Ser; lower: Ser } {
  const mid = sma(close, window), upper: Ser = [], lower: Ser = [];
  for (let i = 0; i < close.length; i++) {
    const m = mid[i];
    if (m === null) { upper.push(null); lower.push(null); continue; }
    const w = close.slice(i - window + 1, i + 1);
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / window);
    upper.push(m + nStd * sd); lower.push(m - nStd * sd);
  }
  return { upper, mid, lower };
}

// ------------------------------------------------------------------ Fibonacci
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export interface Fib { dir: 'up' | 'down'; high: number; low: number; levels: Array<{ ratio: number; price: number }> }
/** Retrocesos de Fibonacci sobre el último gran movimiento: del mínimo al máximo del tramo (tendencia alcista) o del máximo al mínimo (bajista). */
export function fibonacci(bars: TBar[]): Fib | null {
  if (bars.length < 2) return null;
  let hi = 0, lo = 0;
  bars.forEach((b, i) => { if (b.h > bars[hi].h) hi = i; if (b.l < bars[lo].l) lo = i; });
  const high = bars[hi].h, low = bars[lo].l;
  if (!(high > low)) return null;
  const dir = lo < hi ? 'up' : 'down';
  const span = high - low;
  return { dir, high, low, levels: FIB_RATIOS.map((ratio) => ({ ratio, price: dir === 'up' ? high - ratio * span : low + ratio * span })) };
}

// ------------------------------------------------------------------ pivotes
export interface Pivots { p: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number }
export function classicPivots(h: number, l: number, c: number): Pivots {
  const p = (h + l + c) / 3;
  return { p, r1: 2 * p - l, s1: 2 * p - h, r2: p + (h - l), s2: p - (h - l), r3: h + 2 * (p - l), s3: l - 2 * (h - p) };
}
/** Máximo, mínimo y cierre del período anterior: la barra anterior (diario/semanal) o el día anterior (gráficos intradía). null si no hay datos. */
export function previousPeriod(bars: TBar[], intraday: boolean): { h: number; l: number; c: number } | null {
  if (!intraday) { const b = bars[bars.length - 2]; return b ? { h: b.h, l: b.l, c: b.c } : null; }
  const days = [...new Set(bars.map((b) => dayKey(b.t)))];
  if (days.length < 2) return null;
  const prev = bars.filter((b) => dayKey(b.t) === days[days.length - 2]);
  return { h: Math.max(...prev.map((b) => b.h)), l: Math.min(...prev.map((b) => b.l)), c: prev[prev.length - 1].c };
}

// ------------------------------------------------------------------ VWAP (se reinicia cada día)
export function vwap(bars: TBar[]): Ser {
  const out: Ser = [];
  let day = '', pv = 0, vol = 0;
  for (const b of bars) {
    const d = dayKey(b.t);
    if (d !== day) { day = d; pv = 0; vol = 0; }
    pv += ((b.h + b.l + b.c) / 3) * (b.v ?? 0); vol += b.v ?? 0;
    out.push(vol > 0 ? pv / vol : null);
  }
  return out;
}

// ------------------------------------------------------------------ perfil de volumen
export interface VolumeBin { lo: number; hi: number; vol: number }
export interface VolumeProfile { bins: VolumeBin[]; poc: VolumeBin; vah: number; val: number; total: number }
/** Cuánto volumen se operó en cada franja de precio. El volumen de cada barra se reparte entre las franjas que toca su rango. POC = franja con más volumen; área de valor = donde se concentra el 70%. */
export function volumeProfile(bars: TBar[], nBins = 36, valueArea = 0.7): VolumeProfile | null {
  const withVol = bars.filter((b) => (b.v ?? 0) > 0);
  if (withVol.length < 2) return null;
  const min = Math.min(...withVol.map((b) => b.l)), max = Math.max(...withVol.map((b) => b.h));
  if (!(max > min)) return null;
  const step = (max - min) / nBins;
  const bins: VolumeBin[] = Array.from({ length: nBins }, (_, i) => ({ lo: min + i * step, hi: min + (i + 1) * step, vol: 0 }));
  for (const b of withVol) {
    const range = b.h - b.l;
    if (range <= 0) { bins[Math.min(nBins - 1, Math.floor((b.c - min) / step))].vol += b.v!; continue; }
    const first = Math.max(0, Math.floor((b.l - min) / step)), last = Math.min(nBins - 1, Math.floor((b.h - min) / step));
    for (let i = first; i <= last; i++) {
      const overlap = Math.min(b.h, bins[i].hi) - Math.max(b.l, bins[i].lo);
      if (overlap > 0) bins[i].vol += b.v! * (overlap / range);
    }
  }
  const total = bins.reduce((a, x) => a + x.vol, 0);
  let pocI = 0;
  bins.forEach((x, i) => { if (x.vol > bins[pocI].vol) pocI = i; });
  let lo = pocI, hi = pocI, acc = bins[pocI].vol;
  while (acc < total * valueArea && (lo > 0 || hi < nBins - 1)) { // se expande hacia el lado con más volumen
    const down = lo > 0 ? bins[lo - 1].vol : -1, up = hi < nBins - 1 ? bins[hi + 1].vol : -1;
    if (up >= down) { hi++; acc += bins[hi].vol; } else { lo--; acc += bins[lo].vol; }
  }
  return { bins, poc: bins[pocI], vah: bins[hi].hi, val: bins[lo].lo, total };
}

// ------------------------------------------------------------------ sesiones de mercado (convención de las mesas de divisas, en hora LOCAL de cada plaza: el horario de verano se respeta solo)
export type SessionId = 'asia' | 'london' | 'newyork';
export const SESSIONS: Array<{ id: SessionId; label: string; tz: string; open: number; close: number }> = [
  { id: 'asia', label: 'Asia', tz: 'Asia/Tokyo', open: 9, close: 18 },
  { id: 'london', label: 'Londres', tz: 'Europe/London', open: 8, close: 17 },
  { id: 'newyork', label: 'Nueva York', tz: 'America/New_York', open: 8, close: 17 },
];
const fmts = new Map<string, Intl.DateTimeFormat>();
function localParts(tSec: number, tz: string): { hour: number; weekday: string } {
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }); fmts.set(tz, f); }
  const p = f.formatToParts(new Date(tSec * 1000));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { hour: Number(g('hour')) + Number(g('minute')) / 60, weekday: g('weekday') };
}
/** Qué plazas están abiertas en ese instante (lunes a viernes). */
export function sessionsAt(tSec: number): SessionId[] {
  return SESSIONS.filter((s) => { const { hour, weekday } = localParts(tSec, s.tz); return weekday !== 'Sat' && weekday !== 'Sun' && hour >= s.open && hour < s.close; }).map((s) => s.id);
}
/** Tramos continuos de cada sesión sobre una serie de velas: [primera vela, última vela] de cada tramo. */
export function sessionBands(times: number[]): Array<{ id: SessionId; from: number; to: number }> {
  const out: Array<{ id: SessionId; from: number; to: number }> = [];
  const open = new Map<SessionId, number>();
  times.forEach((t, i) => {
    const now = new Set(sessionsAt(t));
    for (const s of SESSIONS) {
      if (now.has(s.id) && !open.has(s.id)) open.set(s.id, i);
      if (!now.has(s.id) && open.has(s.id)) { out.push({ id: s.id, from: times[open.get(s.id)!], to: times[i - 1] }); open.delete(s.id); }
    }
  });
  for (const [id, i] of open) out.push({ id, from: times[i], to: times[times.length - 1] });
  return out;
}
