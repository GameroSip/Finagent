// Pronóstico de volatilidad con coeficientes COMUNES por tipo de activo y solo 1 año de datos del propio activo (lo que descarga la app).
// ln(variación de las 5 ruedas siguientes) = a + b1·ln(d) + b2·ln(s) + b3·ln(m) + b4·ln(q), con d, s, m, q = promedio de la variación diaria (Garman-Klass) de las últimas 1, 5, 22 y 250 ruedas.
// Validación en evals/radar/PREREGISTRO-VOL2.md.
import type { DayBar } from './radar';
import { gk, H, LAMBDA } from './volForecast';
import { quantile } from './radarBacktest';

export type PooledGroup = 'índices' | 'ETF' | 'acciones' | 'cripto';
export const POOLED_GROUPS: PooledGroup[] = ['índices', 'ETF', 'acciones', 'cripto'];
export const Q_WIN = 250, START_P = 250, MIN_GROUP_ROWS = 1500;

export interface PModel { beta: number[]; bias: number; q: [number, number]; rows: number; assets: number }

/** Regresores del día t con solo datos hasta t (en logaritmos). Devuelve null si falta historia. */
export function xAt(g: ArrayLike<number>, t: number, prefix?: Float64Array): number[] | null {
  if (t < Q_WIN - 1) return null;
  const mean = (a: number, b: number) => { if (prefix) return (prefix[b + 1] - prefix[a]) / (b - a + 1); let s = 0; for (let i = a; i <= b; i++) s += g[i]; return s / (b - a + 1); };
  return [1, Math.log(g[t]), Math.log(mean(t - 4, t)), Math.log(mean(t - 21, t)), Math.log(mean(t - Q_WIN + 1, t))];
}
export const forecast = (m: PModel, x: number[]): number => m.bias * Math.exp(m.beta.reduce((s, b, i) => s + b * x[i], 0));
/** Variación diaria promedio (dato "habitual") de las últimas 250 ruedas del activo. */
export const habitual = (g: ArrayLike<number>, t: number): number => { let s = 0; for (let i = t - Q_WIN + 1; i <= t; i++) s += g[i]; return s / Q_WIN; };

/** Intervalo del 5 % al 95 % del retorno de las próximas 5 ruedas (en proporción: -0,05 = -5 %). */
export function interval(m: PModel, sigma2: number): [number, number] { const s = Math.sqrt(H * sigma2); return [Math.exp(m.q[0] * s) - 1, Math.exp(m.q[1] * s) - 1]; }

export interface Feat { n: number; g: Float64Array; P: Float64Array; y: Float64Array; r5: Float64Array; sg: Float64Array; ts: number[]; Pf: Float64Array }
export function features(bars: DayBar[]): Feat {
  const n = bars.length, Pf = new Float64Array(n + 1), g = new Float64Array(n), P = new Float64Array(n + 1), y = new Float64Array(n).fill(NaN), r5 = new Float64Array(n).fill(NaN), sg = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) { g[i] = gk(bars[i]); P[i + 1] = P[i] + g[i]; Pf[i + 1] = Pf[i] + (bars[i].h === bars[i].l ? 1 : 0); }
  if (n > 21) { let s = 0; for (let i = 1; i <= 20; i++) s += g[i]; sg[20] = s / 20; for (let i = 21; i < n; i++) sg[i] = LAMBDA * sg[i - 1] + (1 - LAMBDA) * g[i]; }
  for (let t = 0; t + H < n; t++) { y[t] = (P[t + H + 1] - P[t + 1]) / H; r5[t] = Math.log(bars[t + H].c / bars[t].c); }
  return { n, g, P, y, r5, sg, ts: bars.map((b) => b.t), Pf };
}

/** Proporción de ruedas SIN RANGO (máximo = mínimo) en las 250 ruedas que terminan en i. Un rango de cero no es "volatilidad cero": es un dato que falta (índices viejos con solo el cierre). */
export const flatShare = (f: Feat, i: number): number => (i >= Q_WIN - 1 && i < f.n ? (f.Pf[i + 1] - f.Pf[i + 1 - Q_WIN]) / Q_WIN : 1);
export const MAX_FLAT = 0.05;
/** Calidad de datos (registro previo del backtest 4): la fila es válida solo si ≤ 5 % de ruedas sin rango en las 250 previas a t Y a t+5. */
export const validRow = (f: Feat, t: number): boolean => flatShare(f, t) <= MAX_FLAT && flatShare(f, t + H) <= MAX_FLAT;

/** Ajusta el modelo común con las filas t ∈ [START_P, upto - H - 1] de cada activo (así el resultado de cada fila ya se conocía en la fecha de corte). */
export function fitPooled(sets: Array<{ f: Feat; upto: number }>, quality = false): PModel | null {
  const k = 5, A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  let rows = 0, assets = 0;
  for (const { f, upto } of sets) {
    let used = 0;
    for (let t = START_P; t <= Math.min(upto, f.n) - H - 1; t++) {
      const x = xAt(f.g, t, f.P); if (!x || !(f.y[t] > 0) || (quality && !validRow(f, t))) continue;
      const yl = Math.log(f.y[t]); used++;
      for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; A[i][k] += x[i] * yl; }
    }
    rows += used; if (used) assets++;
  }
  if (rows < MIN_GROUP_ROWS) return null;
  for (let i = 0; i < k; i++) {
    let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    const d = A[i][i] || 1e-12; for (let j = i; j <= k; j++) A[i][j] /= d;
    for (let r = 0; r < k; r++) if (r !== i) { const fct = A[r][i]; if (fct) for (let j = i; j <= k; j++) A[r][j] -= fct * A[i][j]; }
  }
  const beta = A.map((r) => r[k]);
  let ss = 0; const z: number[] = [], pre: PModel = { beta, bias: 1, q: [0, 0], rows, assets };
  for (const { f, upto } of sets) for (let t = START_P; t <= Math.min(upto, f.n) - H - 1; t++) { const x = xAt(f.g, t, f.P); if (!x || !(f.y[t] > 0) || (quality && !validRow(f, t))) continue; const lp = x.reduce((s, v, i) => s + v * beta[i], 0); ss += (Math.log(f.y[t]) - lp) ** 2; }
  const bias = Math.exp(ss / Math.max(1, rows - k) / 2);
  const model: PModel = { ...pre, bias };
  for (const { f, upto } of sets) for (let t = START_P; t <= Math.min(upto, f.n) - H - 1; t++) { const x = xAt(f.g, t, f.P); if (!x || !(f.y[t] > 0) || (quality && !validRow(f, t))) continue; z.push(f.r5[t] / Math.sqrt(H * forecast(model, x))); }
  model.q = [quantile(z, 0.05), quantile(z, 0.95)];
  return model;
}

export interface PRec { asset: string; group: PooledGroup; t: number; y: number; r5: number; habit: number; f: { grupo: number; ayer: number; EWMA: number }; q: [number, number] }
const yearOf = (t: number) => new Date(t * 1000).getUTCFullYear();

/** Pronósticos del día t con coeficientes ajustados cada 1 de enero SOLO con datos cuyo resultado ya se conocía. */
export function evaluatePooled(assets: Array<{ symbol: string; group: PooledGroup; bars: DayBar[] }>, quality = false): PRec[] {
  const out: PRec[] = [];
  const feats = assets.map((a) => ({ a, f: features(a.bars), first: new Map<number, number>() }));
  for (const e of feats) e.f.ts.forEach((t, i) => { const y = yearOf(t); if (!e.first.has(y)) e.first.set(y, i); });
  for (const grp of POOLED_GROUPS) {
    const mine = feats.filter((e) => e.a.group === grp);
    const years = [...new Set(mine.flatMap((e) => [...e.first.keys()]))].sort((x, y) => x - y);
    for (const yr of years) {
      const sets = mine.map((e) => ({ f: e.f, upto: e.first.get(yr) ?? (yearOf(e.f.ts[e.f.n - 1]) < yr ? e.f.n : 0) }));
      const model = fitPooled(sets, quality); if (!model) continue;
      for (const e of mine) {
        const i0 = e.first.get(yr); if (i0 === undefined) continue;
        const i1 = e.first.get(yr + 1) ?? e.f.n;
        for (let t = Math.max(i0, START_P); t < i1; t++) {
          const x = xAt(e.f.g, t, e.f.P), y = e.f.y[t], r5 = e.f.r5[t];
          if (!x || !(y > 0) || !Number.isFinite(r5) || !(e.f.sg[t] > 0) || (quality && !validRow(e.f, t))) continue;
          out.push({ asset: e.a.symbol, group: grp, t: e.f.ts[t], y, r5, habit: habitual(e.f.g, t), f: { grupo: forecast(model, x), ayer: (e.f.P[t + 1] - e.f.P[t - 4]) / 5, EWMA: e.f.sg[t] }, q: model.q });
        }
      }
    }
  }
  return out;
}

/** Modelo final (para la app): ajustado con TODOS los datos disponibles de cada grupo. */
export function finalModels(assets: Array<{ symbol: string; group: PooledGroup; bars: DayBar[] }>, quality = false): Partial<Record<PooledGroup, PModel>> {
  const out: Partial<Record<PooledGroup, PModel>> = {};
  for (const grp of POOLED_GROUPS) { const m = fitPooled(assets.filter((a) => a.group === grp).map((a) => ({ f: features(a.bars), upto: a.bars.length })), quality); if (m) out[grp] = m; }
  return out;
}
