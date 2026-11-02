// Métricas y veredictos del backtest de volatilidad. Los criterios son EXACTAMENTE los de PREREGISTRO-VOL.md (publicado antes de calcular).
import type { DayBar } from '../../src/radar';
import { SPLIT_DATE, wilson, median, type Group } from '../../src/radarBacktest';
import { dmStat, evaluateAsset, H, qlike, MODELS, type ModelName, type Rec } from '../../src/volForecast';

export type Period = 'antes de 2015' | 'desde 2015';
export const PERIODS: Period[] = ['antes de 2015', 'desde 2015'];
export interface AssetRecs { symbol: string; group: Group; recs: Rec[] }
const inPeriod = (r: Rec, p: Period) => (p === 'antes de 2015' ? r.t < SPLIT_DATE : r.t >= SPLIT_DATE);
const GROUPS = ['todos', 'índices', 'ETF', 'acciones', 'cripto'] as const;
const pick = (list: AssetRecs[], g: string) => (g === 'todos' ? list : list.filter((a) => a.group === g));
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

export function build(assets: Array<{ symbol: string; group: Group; bars: DayBar[] }>): AssetRecs[] {
  return assets.map((a) => ({ symbol: a.symbol, group: a.group, recs: evaluateAsset(a.bars) })).filter((a) => a.recs.length > 0);
}

// ------------------------------------------------------------------ 1) magnitud
export interface Cmp {
  period: Period; group: string; assets: number;
  harVsAyer: number; harVsEwma: number; termVsHar: number;                 // medianas de cocientes de QLIKE por activo (< 1 = el primero es mejor)
  shareHarBeatsAyer: number; shareHarBeatsEwma: number;
  dmHarBetterThanAyer: number; dmAyerBetterThanHar: number;                // activos con diferencia significativa (|t| > 1,96)
  meanQlike: Record<ModelName, number>;
}
export function compare(list: AssetRecs[], period: Period, group: string): Cmp | null {
  const rows = pick(list, group).map((a) => ({ a, r: a.recs.filter((x) => inPeriod(x, period)) })).filter((x) => x.r.length >= 250);
  if (!rows.length) return null;
  const rat = { harAyer: [] as number[], harEwma: [] as number[], termHar: [] as number[] }, mq = Object.fromEntries(MODELS.map((m) => [m, [] as number[]])) as Record<ModelName, number[]>;
  let beatsAyer = 0, beatsEwma = 0, dmGood = 0, dmBad = 0;
  for (const { r } of rows) {
    const L = Object.fromEntries(MODELS.map((m) => [m, r.map((x) => qlike(x.y, x.f[m]))])) as Record<ModelName, number[]>;
    const m = Object.fromEntries(MODELS.map((k) => [k, mean(L[k])])) as Record<ModelName, number>;
    for (const k of MODELS) mq[k].push(m[k]);
    rat.harAyer.push(m.HAR / m.ayer); rat.harEwma.push(m.HAR / m.EWMA); rat.termHar.push(m['termómetro'] / m.HAR);
    if (m.HAR < m.ayer) beatsAyer++; if (m.HAR < m.EWMA) beatsEwma++;
    const t = dmStat(L.ayer, L.HAR); if (t > 1.96) dmGood++; else if (t < -1.96) dmBad++;
  }
  const n = rows.length;
  return { period, group, assets: n, harVsAyer: median(rat.harAyer), harVsEwma: median(rat.harEwma), termVsHar: median(rat.termHar), shareHarBeatsAyer: beatsAyer / n, shareHarBeatsEwma: beatsEwma / n,
    dmHarBetterThanAyer: dmGood, dmAyerBetterThanHar: dmBad, meanQlike: Object.fromEntries(MODELS.map((k) => [k, mean(mq[k])])) as Record<ModelName, number> };
}

// ------------------------------------------------------------------ 2) calibración del intervalo 5 %–95 % de los retornos de 5 ruedas
export interface Calib { period: Period; group: string; model: ModelName; n: number; coverage: number; left: number; right: number }
export function calibration(list: AssetRecs[], period: Period, group: string, model: ModelName): Calib | null {
  let n = 0, left = 0, right = 0;
  for (const a of pick(list, group)) for (const x of a.recs) {
    if (!inPeriod(x, period)) continue;
    const z = x.r5 / Math.sqrt(H * x.f[model]); n++;
    if (z < x.q[model][0]) left++; else if (z > x.q[model][1]) right++;
  }
  return n ? { period, group, model, n, coverage: 1 - (left + right) / n, left: left / n, right: right / n } : null;
}

// 2b) EXPLORATORIO (no entra en los veredictos): cobertura por tramo de volatilidad pronosticada. Un buen modelo cubre ~90 % en todos los tramos.
export const BINS: Array<[string, number, number]> = [['< 0,5×', 0, 0.5], ['0,5–1×', 0.5, 1], ['1–2×', 1, 2], ['≥ 2×', 2, Infinity]];
export interface CondBin { bin: string; n: number; coverage: number; left: number; right: number }
export function condCalibration(list: AssetRecs[], period: Period, model: ModelName): CondBin[] {
  const acc = BINS.map(() => ({ n: 0, l: 0, r: 0 }));
  for (const a of list) {
    const rows = a.recs.filter((x) => inPeriod(x, period));
    if (rows.length < 250) continue;
    const mu = mean(rows.map((x) => x.f[model]));
    for (const x of rows) {
      const rho = x.f[model] / mu, i = BINS.findIndex(([, lo, hi]) => rho >= lo && rho < hi), z = x.r5 / Math.sqrt(H * x.f[model]);
      acc[i].n++; if (z < x.q[model][0]) acc[i].l++; else if (z > x.q[model][1]) acc[i].r++;
    }
  }
  return BINS.map(([bin], i) => ({ bin, n: acc[i].n, coverage: acc[i].n ? 1 - (acc[i].l + acc[i].r) / acc[i].n : NaN, left: acc[i].n ? acc[i].l / acc[i].n : NaN, right: acc[i].n ? acc[i].r / acc[i].n : NaN }));
}

// ------------------------------------------------------------------ 3) cola izquierda en el estado de tensión S (retornos estandarizados por HAR)
export interface Tail { period: Period; group: string; nS: number; freqS: number; left: [number, number, number, number]; right: [number, number, number, number]; leftOut: number; rightOut: number }
export function tail(list: AssetRecs[], period: Period, group: string): Tail | null {
  let nS = 0, lS = 0, rS = 0, nO = 0, lO = 0, rO = 0;
  for (const a of pick(list, group)) for (const x of a.recs) {
    if (!inPeriod(x, period)) continue;
    const z = x.r5 / Math.sqrt(H * x.f.HAR), isL = z < x.q.HAR[0], isR = z > x.q.HAR[1];
    if (x.S) { nS++; if (isL) lS++; if (isR) rS++; } else { nO++; if (isL) lO++; if (isR) rO++; }
  }
  if (!nS) return null;
  const pack = (k: number): [number, number, number, number] => { const [lo, hi] = wilson(k, nS); return [k / nS, lo, hi, k]; };
  return { period, group, nS, freqS: nS / (nS + nO), left: pack(lS), right: pack(rS), leftOut: nO ? lO / nO : NaN, rightOut: nO ? rO / nO : NaN };
}

// ------------------------------------------------------------------ 4) VIX vs modelos propios en el S&P 500
export interface VixCmp { period: Period; n: number; vix: number; har: number; ewma: number }
export function vixCompare(sp: AssetRecs | undefined, vix: DayBar[] | null, period: Period): VixCmp | null {
  if (!sp || !vix || !vix.length) return null;
  const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10), vmap = new Map(vix.map((b) => [day(b.t), (b.c / 100) ** 2 / 252]));
  const joined = sp.recs.map((r) => ({ r, v: vmap.get(day(r.t)) })).filter((x): x is { r: Rec; v: number } => x.v !== undefined && x.v > 0);
  const yearOf = (t: number) => new Date(t * 1000).getUTCFullYear();
  const L = { vix: [] as number[], har: [] as number[], ewma: [] as number[] };
  for (const yr of [...new Set(joined.map((j) => yearOf(j.r.t)))]) {
    const start = Date.UTC(yr, 0, 1) / 1000, train = joined.filter((j) => j.r.t < start - 10 * 86400);        // solo filas cuyo resultado ya se conocía (se dejan 10 días de margen)
    if (train.length < 500) continue;
    const c = mean(train.map((j) => j.r.y)) / mean(train.map((j) => j.v));                                      // la constante que absorbe la prima de riesgo del VIX
    for (const j of joined) if (yearOf(j.r.t) === yr && inPeriod(j.r, period)) { L.vix.push(qlike(j.r.y, c * j.v)); L.har.push(qlike(j.r.y, j.r.f.HAR)); L.ewma.push(qlike(j.r.y, j.r.f.EWMA)); }
  }
  return L.vix.length >= 250 ? { period, n: L.vix.length, vix: mean(L.vix), har: mean(L.har), ewma: mean(L.ewma) } : null;
}

// ------------------------------------------------------------------ veredictos (criterios del preregistro)
export function verdicts(list: AssetRecs[], vix: VixCmp[]) {
  const c = PERIODS.map((p) => compare(list, p, 'todos')), ok = c.every((x) => x !== null);
  let p1 = 'sin datos suficientes', p1b = 'sin datos suficientes', best: ModelName = 'HAR';
  if (ok) {
    const [a, b] = c as Cmp[], okAyer = a.shareHarBeatsAyer >= 0.7 && b.shareHarBeatsAyer >= 0.7, okEwma = a.harVsEwma <= 1.02 && b.harVsEwma <= 1.02;
    p1 = okAyer ? (okEwma ? 'HAR es un pronóstico sólido' : 'EWMA alcanza (más simple)') : 'no mejora';
    best = p1 === 'HAR es un pronóstico sólido' ? 'HAR' : 'EWMA';
    p1b = a.termVsHar > 1.05 && b.termVsHar > 1.05 ? 'el termómetro actual es peor pronóstico de magnitud que HAR' : 'el termómetro no es claramente peor';
  }
  const cal = PERIODS.map((p) => calibration(list, p, 'todos', best));
  const calOk = cal.every((x) => x && x.coverage >= 0.87 && x.coverage <= 0.93 && x.left >= 0.03 && x.left <= 0.07 && x.right >= 0.03 && x.right <= 0.07);
  const p2 = cal.every((x) => x) ? (calOk ? `calibrado (${best})` : `no calibrado (${best}): ${cal.map((x) => `${x!.period} cobertura ${(x!.coverage * 100).toFixed(1)} %, izq ${(x!.left * 100).toFixed(1)} %, der ${(x!.right * 100).toFixed(1)} %`).join(' · ')}`) : 'sin datos suficientes';
  const tl = PERIODS.map((p) => tail(list, p, 'todos'));
  const p3ok = tl.every((x) => x && x.left[0] >= 0.075 && x.left[1] > 0.055 && x.right[0] <= 0.065 && x.left[0] > x.right[0]);
  const p3 = tl.every((x) => x) ? (p3ok ? 'sí hay información de cola izquierda' : 'no hay información de cola izquierda más allá de la volatilidad') : 'sin datos suficientes';
  const p4 = vix.length === 2 ? (vix.every((v) => v.vix < v.har) ? 'el VIX mejora' : 'el VIX no mejora') : 'sin datos (VIX no disponible)';
  return { p1, p1b, p2, p3, p4, best };
}

// ------------------------------------------------------------------ reporte
const pc = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)} %` : '—'), f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—');
export function report(list: AssetRecs[], vixBars: DayBar[] | null, meta: { when: string; synthetic: boolean; excluded: Array<{ symbol: string; why: string }>; commitPrereg: string }): string {
  const sp = list.find((a) => a.symbol === '^GSPC'), vx = PERIODS.map((p) => vixCompare(sp, vixBars, p)).filter((x): x is VixCmp => x !== null), v = verdicts(list, vx);
  const L: string[] = ['# Backtest de volatilidad y cola izquierda', ''];
  if (meta.synthetic) L.push('> **DATOS SINTÉTICOS** (caminos aleatorios con volatilidad que se agrupa y SIN asimetría de cola). Solo prueban el circuito y sirven de control.', '');
  L.push(`Ejecutado: ${meta.when} · ${list.length} activos · criterios fijados en el registro previo (commit ${meta.commitPrereg}), publicado antes de calcular nada.`, '',
    'Enmienda 1 del registro (antes de correr con datos reales): EWMA usa el mismo estimador que el blanco; EWMA-r² y la tabla 2b son solo informativos.', '', '**Cómo leer:** QLIKE es una pérdida (menor = mejor). Un cociente < 1 significa que el primer modelo pronostica mejor. "Cobertura" es qué parte de los casos cae dentro del intervalo 5 %–95 % del retorno de 5 ruedas (debería ser ~90 %). Intervalos de confianza optimistas; sesgo de supervivencia (activos que hoy existen).', '');
  L.push('## 5. Veredictos (criterios del registro previo)', '', '| Pregunta | Veredicto |', '|---|---|',
    `| P1 ¿HAR pronostica mejor la magnitud que lo simple? | **${v.p1}** |`, `| P1b ¿Y el termómetro actual como pronóstico de magnitud? | ${v.p1b} |`, `| P2 ¿Los intervalos están calibrados? | ${v.p2} |`,
    `| P3 ¿Hay información de cola izquierda con volatilidad creciente y precio bajo su media? | **${v.p3}** |`, `| P4 ¿El VIX mejora al modelo propio en el S&P 500? | ${v.p4} |`, '');
  L.push('## 1. ¿Qué modelo pronostica mejor la magnitud de la semana siguiente?', '', '| Grupo | Período | Activos | QLIKE HAR/ayer | QLIKE HAR/EWMA | QLIKE termómetro/HAR | HAR mejor que ayer | HAR mejor que EWMA | Dif. significativa a favor de HAR / en contra |', '|---|---|---|---|---|---|---|---|---|');
  for (const g of GROUPS) for (const p of PERIODS) { const c = compare(list, p, g); if (c) L.push(`| ${g} | ${p} | ${c.assets} | ${f2(c.harVsAyer)} | ${f2(c.harVsEwma)} | ${f2(c.termVsHar)} | ${pc(c.shareHarBeatsAyer, 0)} | ${pc(c.shareHarBeatsEwma, 0)} | ${c.dmHarBetterThanAyer} / ${c.dmAyerBetterThanHar} |`); }
  L.push('', '## 2. Calibración del intervalo 5 %–95 % (retorno de 5 ruedas)', '', '| Modelo | Período | Casos | Cobertura | Cola izquierda (debería ser 5 %) | Cola derecha (5 %) |', '|---|---|---|---|---|---|');
  for (const m of MODELS) for (const p of PERIODS) { const c = calibration(list, p, 'todos', m); if (c) L.push(`| ${m} | ${p} | ${c.n} | ${pc(c.coverage)} | ${pc(c.left)} | ${pc(c.right)} |`); }
  L.push('', `Por tipo de activo (${v.best}):`, '', '| Grupo | Período | Cobertura | Izquierda | Derecha |', '|---|---|---|---|---|');
  for (const g of GROUPS.slice(1)) for (const p of PERIODS) { const c = calibration(list, p, g, v.best); if (c) L.push(`| ${g} | ${p} | ${pc(c.coverage)} | ${pc(c.left)} | ${pc(c.right)} |`); }
  L.push('', '### 2b. Cobertura por tramo de volatilidad pronosticada (EXPLORATORIO: no entra en los veredictos)', '', 'Un buen pronóstico cubre ~90 % en todos los tramos; uno que no capta la dinámica falla en los extremos. Tramo = pronóstico ÷ su promedio del activo.', '', '| Modelo | Período | ' + BINS.map(([b2]) => `Cobertura ${b2} (casos)`).join(' | ') + ' |', '|---|---|' + BINS.map(() => '---').join('|') + '|');
  for (const m of MODELS) for (const p of PERIODS) { const cb = condCalibration(list, p, m); L.push(`| ${m} | ${p} | ` + cb.map((c) => `${pc(c.coverage)} (${c.n})`).join(' | ') + ' |'); }
  L.push('', '## 3. Cola izquierda en el estado de tensión S (retornos estandarizados por HAR)', '', 'S = volatilidad EWMA ≥ 1,25× la de las últimas 126 ruedas **y** cierre bajo su media de 50 ruedas. Sin tensión, ambas colas deberían ser ~5 %.', '',
    '| Grupo | Período | Días en S (% del total) | Cola izquierda en S [IC 95 %] | Cola derecha en S [IC 95 %] | Izq. fuera de S | Der. fuera de S |', '|---|---|---|---|---|---|---|');
  for (const g of GROUPS) for (const p of PERIODS) { const t = tail(list, p, g); if (t) L.push(`| ${g} | ${p} | ${t.nS} (${pc(t.freqS)}) | ${pc(t.left[0])} [${pc(t.left[1])}–${pc(t.left[2])}] | ${pc(t.right[0])} [${pc(t.right[1])}–${pc(t.right[2])}] | ${pc(t.leftOut)} | ${pc(t.rightOut)} |`); }
  L.push('', '## 4. VIX vs modelo propio (S&P 500)', '');
  if (vx.length) { L.push('| Período | Casos | QLIKE VIX (reescalado) | QLIKE HAR | QLIKE EWMA |', '|---|---|---|---|---|'); for (const x of vx) L.push(`| ${x.period} | ${x.n} | ${f2(x.vix)} | ${f2(x.har)} | ${f2(x.ewma)} |`); } else L.push('Sin datos del VIX en esta corrida.');
  L.push('', '## Datos', '', '| Activo | Grupo | Casos evaluados |', '|---|---|---|'); for (const a of list) L.push(`| ${a.symbol} | ${a.group} | ${a.recs.length} |`);
  if (meta.excluded.length) { L.push('', '**Excluidos:**', ''); for (const e of meta.excluded) L.push(`- ${e.symbol}: ${e.why}`); }
  return L.join('\n') + '\n';
}
