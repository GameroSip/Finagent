// Pronóstico de volatilidad (magnitud de los movimientos) con datos diarios. Todo con información disponible hasta el día evaluado.
// Se compara en el backtest (ver evals/radar/PREREGISTRO-VOL.md): "ayer", EWMA, HAR y el termómetro actual.
import { radarSeries, type DayBar } from './radar';
import { quantile } from './radarBacktest';

export const MODELS = ['ayer', 'EWMA', 'HAR', 'termómetro', 'EWMA-r²'] as const;   // 'EWMA-r²' (retornos al cuadrado) es solo informativo: ver la enmienda 1 del preregistro
export type ModelName = (typeof MODELS)[number];
export const H = 5, LAMBDA = 0.94, MIN_TRAIN = 750, START = 125;

/** Variación diaria según Garman-Klass (usa apertura, máximo, mínimo y cierre). */
export const gk = (b: DayBar): number => Math.max(1e-8, 0.5 * Math.log(b.h / b.l) ** 2 - (2 * Math.LN2 - 1) * Math.log(b.c / b.o) ** 2);

/** Mínimos cuadrados (ecuaciones normales). Devuelve los coeficientes y la varianza del error. */
export function ols(X: number[][], y: number[]): { beta: number[]; s2: number } {
  const k = X[0].length, A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (let r = 0; r < X.length; r++) for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += X[r][i] * X[r][j]; A[i][k] += X[r][i] * y[r]; }
  for (let i = 0; i < k; i++) {
    let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    const d = A[i][i] || 1e-12; for (let j = i; j <= k; j++) A[i][j] /= d;
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i]; if (f) for (let j = i; j <= k; j++) A[r][j] -= f * A[i][j]; }
  }
  const beta = A.map((row) => row[k]);
  let ss = 0; for (let r = 0; r < X.length; r++) { let p = 0; for (let i = 0; i < k; i++) p += X[r][i] * beta[i]; ss += (y[r] - p) ** 2; }
  return { beta, s2: ss / Math.max(1, X.length - k) };
}

export interface Rec {
  t: number;                                     // fecha (segundos)
  y: number;                                     // variación diaria promedio REAL de las 5 ruedas siguientes (el "blanco" del pronóstico)
  r5: number;                                    // retorno logarítmico real de las 5 ruedas siguientes
  f: Record<ModelName, number>;                  // pronóstico de variación diaria de cada modelo
  q: Record<ModelName, [number, number]>;        // cuantiles 5 % y 95 % de los retornos estandarizados (entrenamiento)
  S: boolean;                                    // estado de tensión (ver preregistro)
}

const yearOf = (t: number) => new Date(t * 1000).getUTCFullYear();

/** Pronósticos del día t para cada modelo y el estado S, usando solo datos hasta t y un entrenamiento cuyo resultado ya se conocía el 1 de enero del año de t. */
export function evaluateAsset(bars: DayBar[]): Rec[] {
  const n = bars.length;
  if (n < MIN_TRAIN + START + 300) return [];
  const g = bars.map(gk), close = bars.map((b) => b.c), r = close.map((c, i) => (i ? Math.log(c / close[i - 1]) : 0));
  const pre = (a: number[]) => { const p = new Array<number>(n + 1).fill(0); for (let i = 0; i < n; i++) p[i + 1] = p[i] + a[i]; return p; };
  const Pg = pre(g), Pr2 = pre(r.map((x) => x * x)), Pc = pre(close);
  const mean = (P: number[], a: number, b: number) => (P[b + 1] - P[a]) / (b - a + 1);
  const s2 = new Array<number>(n).fill(NaN), sg = new Array<number>(n).fill(NaN);           // s2: EWMA de retornos² · sg: EWMA de la variación de Garman-Klass (el mismo estimador que el blanco)
  s2[20] = mean(Pr2, 1, 20); sg[20] = mean(Pg, 1, 20);
  for (let i = 21; i < n; i++) { s2[i] = LAMBDA * s2[i - 1] + (1 - LAMBDA) * r[i] * r[i]; sg[i] = LAMBDA * sg[i - 1] + (1 - LAMBDA) * g[i]; }
  const levels = radarSeries(bars).map((p) => (p.ready ? p.level : null));
  const D = (t: number) => g[t], W = (t: number) => mean(Pg, t - 4, t), M = (t: number) => mean(Pg, t - 21, t);
  const Y = (t: number) => (t + H < n ? mean(Pg, t + 1, t + H) : NaN), R5 = (t: number) => (t + H < n ? Math.log(close[t + H] / close[t]) : NaN);
  const stateS = (t: number) => t >= 125 && Math.sqrt(s2[t] / mean(Pr2, t - 125, t)) >= 1.25 && close[t] < mean(Pc, t - 49, t);
  const years = [...new Set(bars.map((b) => yearOf(b.t)))];
  const out: Rec[] = [];
  for (const yr of years) {
    const iY = bars.findIndex((b) => yearOf(b.t) === yr);
    const train: number[] = []; for (let t = START; t <= iY - H - 1; t++) train.push(t);
    if (train.length < MIN_TRAIN) continue;
    const X = train.map((t) => [1, Math.log(D(t)), Math.log(W(t)), Math.log(M(t))]), yl = train.map((t) => Math.log(Y(t)));
    const { beta, s2: res } = ols(X, yl), bias = Math.exp(res / 2);
    const har = (t: number) => bias * Math.exp(beta[0] + beta[1] * Math.log(D(t)) + beta[2] * Math.log(W(t)) + beta[3] * Math.log(M(t)));
    const lvMean: Record<string, number> = {}, lvN: Record<string, number> = {}; let allSum = 0;
    for (const t of train) { allSum += Y(t); const L = levels[t]; if (L) { lvMean[L] = (lvMean[L] ?? 0) + Y(t); lvN[L] = (lvN[L] ?? 0) + 1; } }
    const allMean = allSum / train.length;
    for (const L of Object.keys(lvMean)) lvMean[L] = lvN[L] >= 30 ? lvMean[L] / lvN[L] : allMean;
    const term = (t: number) => { const L = levels[t]; return L && lvMean[L] !== undefined ? lvMean[L] : allMean; };
    const fns: Record<ModelName, (t: number) => number> = { ayer: W, EWMA: (t) => sg[t], HAR: har, 'termómetro': term, 'EWMA-r²': (t) => s2[t] };
    const q = {} as Record<ModelName, [number, number]>;
    for (const m of MODELS) { const z = train.map((t) => R5(t) / Math.sqrt(H * fns[m](t))); q[m] = [quantile(z, 0.05), quantile(z, 0.95)]; }
    const next = years[years.indexOf(yr) + 1], iEnd = next === undefined ? n : bars.findIndex((b) => yearOf(b.t) === next);
    for (let t = Math.max(iY, START); t < iEnd; t++) {
      const y = Y(t), r5 = R5(t);
      if (!Number.isFinite(y) || !Number.isFinite(r5) || !(s2[t] > 0)) continue;
      out.push({ t: bars[t].t, y, r5, f: Object.fromEntries(MODELS.map((m) => [m, fns[m](t)])) as Record<ModelName, number>, q, S: stateS(t) });
    }
  }
  return out;
}

/** Pérdida QLIKE (menor = mejor). Robusta al ruido de usar una medida aproximada como "verdad". */
export const qlike = (y: number, f: number): number => { const x = y / f; return x - Math.log(x) - 1; };

/** Estadístico de Diebold-Mariano con varianza de Newey-West (rezago 5): positivo = el segundo modelo (B) pierde menos que el primero (A). */
export function dmStat(dA: number[], dB: number[], lag = 5): number {
  const d = dA.map((v, i) => v - dB[i]), n = d.length;
  if (n < 50) return NaN;
  const mu = d.reduce((s, x) => s + x, 0) / n, gam = (l: number) => { let s = 0; for (let i = l; i < n; i++) s += (d[i] - mu) * (d[i - l] - mu); return s / n; };
  let v = gam(0); for (let l = 1; l <= lag; l++) v += 2 * (1 - l / (lag + 1)) * gam(l);
  return v > 0 ? mu / Math.sqrt(v / n) : NaN;
}
