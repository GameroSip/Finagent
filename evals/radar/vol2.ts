// Métricas y veredictos del backtest 3. Los criterios son EXACTAMENTE los de PREREGISTRO-VOL2.md (publicado antes de calcular).
import type { DayBar } from '../../src/radar';
import { median, SPLIT_DATE } from '../../src/radarBacktest';
import { dmStat, evaluateAsset, H, qlike } from '../../src/volForecast';
import { POOLED_GROUPS, type PModel, type PooledGroup, type PRec } from '../../src/volPooled';
import { PERIODS, type Period } from './vol';

const inP = (t: number, p: Period) => (p === 'antes de 2015' ? t < SPLIT_DATE : t >= SPLIT_DATE);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const GROUPS = ['todos', ...POOLED_GROUPS] as const;
const sel = (r: PRec[], g: string) => (g === 'todos' ? r : r.filter((x) => x.group === g));
const byAsset = (r: PRec[], p: Period) => { const m = new Map<string, PRec[]>(); for (const x of r) if (inP(x.t, p)) (m.get(x.asset) ?? m.set(x.asset, []).get(x.asset)!).push(x); return [...m].filter(([, v]) => v.length >= 250); };

/** HAR por activo del backtest 2 (necesita 3+ años de historia): mapa activo → fecha → pronóstico. */
export function har3Map(assets: Array<{ symbol: string; bars: DayBar[] }>): Map<string, Map<number, number>> {
  return new Map(assets.map((a) => [a.symbol, new Map(evaluateAsset(a.bars).map((r) => [r.t, r.f.HAR]))]));
}

export interface Q12 { period: Period; assets: number; vsHar3: number; commonAssets: number; shareBeatsAyer: number; vsEwma: number; dmBetterThanAyer: number }
export function q12(rows: PRec[], har3: Map<string, Map<number, number>>, period: Period, skipQ1: Set<string> = new Set()): Q12 | null {
  const A = byAsset(rows, period);
  if (!A.length) return null;
  const r3: number[] = [], rE: number[] = []; let beats = 0, dm = 0;
  for (const [sym, rs] of A) {
    const Lg = rs.map((x) => qlike(x.y, x.f.grupo)), La = rs.map((x) => qlike(x.y, x.f.ayer)), Le = rs.map((x) => qlike(x.y, x.f.EWMA));
    if (mean(Lg) < mean(La)) beats++; rE.push(mean(Lg) / mean(Le)); if (dmStat(La, Lg) > 1.96) dm++;
    const h = har3.get(sym), common = h ? rs.filter((x) => h.has(x.t)) : [];
    if (!skipQ1.has(sym) && common.length >= 250) r3.push(mean(common.map((x) => qlike(x.y, x.f.grupo))) / mean(common.map((x) => qlike(x.y, h!.get(x.t)!))));
  }
  return { period, assets: A.length, vsHar3: median(r3), commonAssets: r3.length, shareBeatsAyer: beats / A.length, vsEwma: median(rE), dmBetterThanAyer: dm };
}

export interface Cal { period: Period; group: string; n: number; coverage: number; left: number; right: number }
export function calib(rows: PRec[], period: Period, group: string): Cal | null {
  let n = 0, l = 0, r = 0;
  for (const x of sel(rows, group)) { if (!inP(x.t, period)) continue; const z = x.r5 / Math.sqrt(H * x.f.grupo); n++; if (z < x.q[0]) l++; else if (z > x.q[1]) r++; }
  return n >= 250 ? { period, group, n, coverage: 1 - (l + r) / n, left: l / n, right: r / n } : null;
}
export const calOk = (c: Cal) => c.coverage >= 0.87 && c.coverage <= 0.93 && c.left >= 0.03 && c.left <= 0.07 && c.right >= 0.03 && c.right <= 0.07;

export const BINS4: Array<[string, number, number]> = [['< 0,5×', 0, 0.5], ['0,5–1×', 0.5, 1], ['1–2×', 1, 2], ['≥ 2×', 2, Infinity]];
export function condCal(rows: PRec[], period: Period) {
  const acc = BINS4.map(() => ({ n: 0, out: 0 }));
  for (const [, rs] of byAsset(rows, period)) { const mu = mean(rs.map((x) => x.f.grupo)); for (const x of rs) { const i = BINS4.findIndex(([, lo, hi]) => x.f.grupo / mu >= lo && x.f.grupo / mu < hi), z = x.r5 / Math.sqrt(H * x.f.grupo); acc[i].n++; if (z < x.q[0] || z > x.q[1]) acc[i].out++; } }
  return BINS4.map(([bin], i) => ({ bin, n: acc[i].n, coverage: acc[i].n ? 1 - acc[i].out / acc[i].n : NaN }));
}

export const RBINS: Array<[string, number, number]> = [['< 0,8×', 0, 0.8], ['0,8–1,25×', 0.8, 1.25], ['1,25–2×', 1.25, 2], ['≥ 2×', 2, Infinity]];
/** ¿"X veces lo habitual" significa algo? Variación real posterior ÷ variación de 250 ruedas, por tramo de pronóstico ÷ variación de 250 ruedas. */
export function ratioBins(rows: PRec[], period: Period) {
  const acc = RBINS.map(() => ({ n: 0, s: 0 }));
  for (const x of rows) { if (!inP(x.t, period)) continue; const rho = x.f.grupo / x.habit, i = RBINS.findIndex(([, lo, hi]) => rho >= lo && rho < hi); acc[i].n++; acc[i].s += x.y / x.habit; }
  return RBINS.map(([bin], i) => ({ bin, n: acc[i].n, realized: acc[i].n ? acc[i].s / acc[i].n : NaN }));
}

export interface VixP { period: Period; n: number; vix: number; grupo: number }
export function vixCompare(rows: PRec[], vix: DayBar[] | null, period: Period): VixP | null {
  if (!vix || !vix.length) return null;
  const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10), vm = new Map(vix.map((b) => [day(b.t), (b.c / 100) ** 2 / 252]));
  const J = rows.filter((x) => x.asset === '^GSPC').map((r) => ({ r, v: vm.get(day(r.t)) })).filter((x): x is { r: PRec; v: number } => x.v !== undefined && x.v > 0);
  const yr = (t: number) => new Date(t * 1000).getUTCFullYear(), L = { vix: [] as number[], grupo: [] as number[] };
  for (const y of [...new Set(J.map((j) => yr(j.r.t)))]) {
    const start = Date.UTC(y, 0, 1) / 1000, train = J.filter((j) => j.r.t < start - 10 * 86400);
    if (train.length < 500) continue;
    const c = mean(train.map((j) => j.r.y)) / mean(train.map((j) => j.v));
    for (const j of J) if (yr(j.r.t) === y && inP(j.r.t, period)) { L.vix.push(qlike(j.r.y, c * j.v)); L.grupo.push(qlike(j.r.y, j.r.f.grupo)); }
  }
  return L.vix.length >= 250 ? { period, n: L.vix.length, vix: mean(L.vix), grupo: mean(L.grupo) } : null;
}

// ------------------------------------------------------------------ veredictos
export function verdicts(rows: PRec[], har3: Map<string, Map<number, number>>, vix: DayBar[] | null, opts: { skipQ1?: Set<string> } = {}) {
  const c = PERIODS.map((p) => q12(rows, har3, p, opts.skipQ1)), both = c.every((x) => x !== null), cc = c as Q12[];
  const Q1 = both && cc.every((x) => Number.isFinite(x.vsHar3) && x.vsHar3 <= 1.03), Q2 = both && cc.every((x) => x.shareBeatsAyer >= 0.8 && x.vsEwma <= 1.0);
  const Q3: Record<string, boolean> = {};
  for (const g of POOLED_GROUPS) { const cs = PERIODS.map((p) => calib(rows, p, g)).filter((x): x is Cal => x !== null); Q3[g] = cs.length > 0 && cs.every(calOk); }
  const Q3all = PERIODS.map((p) => calib(rows, p, 'todos')).every((x) => x && calOk(x));
  const Q4 = PERIODS.every((p) => condCal(rows, p).filter((b) => b.bin === '< 0,5×' || b.bin === '≥ 2×').every((b) => b.n < 1000 || (b.coverage >= 0.85 && b.coverage <= 0.95)));
  const Q5 = PERIODS.every((p) => { const b = ratioBins(rows, p); return b.every((x) => x.n > 0) && b.every((x, i) => i === 0 || x.realized > b[i - 1].realized) && b[3].realized >= 1.3 && b[0].realized <= 0.9; });
  const vx = PERIODS.map((p) => vixCompare(rows, vix, p)), Q6 = vx.every((x) => x !== null) && (vx as VixP[]).every((x) => x.vix < x.grupo);
  const build = Q1 && Q2 && Q4 && Q5;
  return { Q1, Q2, Q3, Q3all, Q4, Q5, Q6, build, intervalGroups: build ? POOLED_GROUPS.filter((g) => Q3[g]) : [], useVix: build && Q6, noData: !both };
}

// ------------------------------------------------------------------ reporte
const pc = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)} %` : '—'), f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—'), yn = (b: boolean) => (b ? '**PASA**' : '**NO PASA**');
export function report(rows: PRec[], har3: Map<string, Map<number, number>>, vix: DayBar[] | null, models: Partial<Record<PooledGroup, PModel>>, meta: { when: string; synthetic: boolean; excluded: Array<{ symbol: string; why: string }>; prereg: string; assets: Array<{ symbol: string; group: string }>; quality?: boolean; skipQ1?: Set<string> }): string {
  const v = verdicts(rows, har3, vix, { skipQ1: meta.skipQ1 }), L: string[] = ['# Backtest 3: movimiento esperado con coeficientes por grupo', ''];
  if (meta.synthetic) L.push('> **DATOS SINTÉTICOS.** Solo prueban el circuito; no dicen nada de los mercados reales.', '');
  L.push(`Ejecutado: ${meta.when} · ${meta.assets.length} activos · criterios fijados en el registro previo (commit ${meta.prereg}), publicado antes de calcular nada.`, '');
  if (meta.quality) L.push('> **Segundo intento** (registro previo PREREGISTRO-VOL4.md, no independiente del intento 1): filtro de calidad de datos aplicado al entrenamiento, a los cuantiles y a la evaluación. Criterios de éxito idénticos. ' + (meta.skipQ1?.size ? `Q1 excluye por calidad de datos: ${[...meta.skipQ1].join(', ')}.` : ''), '');
  L.push('## Veredictos (criterios del registro previo)', '', '| Criterio | Resultado |', '|---|---|',
    `| Q1 no peor que el modelo por activo (mediana ≤ 1,03) | ${yn(v.Q1)} |`, `| Q2 mejor que "ayer" (≥ 80 % de activos) y que EWMA (mediana ≤ 1,00) | ${yn(v.Q2)} |`,
    `| Q3 calibración del intervalo — todos | ${yn(v.Q3all)} |`, ...POOLED_GROUPS.map((g) => `| Q3 calibración — ${g} | ${yn(v.Q3[g])} |`),
    `| Q4 calibración condicional (tramos < 0,5× y ≥ 2×) | ${yn(v.Q4)} |`, `| Q5 "X veces lo habitual" crece con X (≥ 1,3 arriba, ≤ 0,9 abajo) | ${yn(v.Q5)} |`, `| Q6 el VIX mejora al modelo por grupo en el S&P 500 | ${yn(v.Q6)} |`, '',
    '**Decisión según el registro previo:** ' + (v.noData ? 'sin datos suficientes.' : `bloque "movimiento esperado": **${v.build ? 'SE CONSTRUYE' : 'NO se construye'}** · intervalo solo para: ${v.intervalGroups.length ? v.intervalGroups.join(', ') : '(ningún grupo)'} · VIX: ${v.useVix ? 'se incorpora' : 'no se incorpora'}.`), '');
  L.push('## Q1 y Q2: magnitud', '', '| Período | Activos | Activos con HAR por activo | Grupo/HAR por activo (mediana QLIKE) | Grupo mejor que ayer | Grupo/EWMA (mediana QLIKE) | Dif. significativa vs ayer |', '|---|---|---|---|---|---|---|');
  for (const p of PERIODS) { const c = q12(rows, har3, p, meta.skipQ1); if (c) L.push(`| ${p} | ${c.assets} | ${c.commonAssets} | ${f3(c.vsHar3)} | ${pc(c.shareBeatsAyer, 0)} | ${f3(c.vsEwma)} | ${c.dmBetterThanAyer} |`); }
  L.push('', '## Q3: calibración del intervalo 5 %–95 % del retorno de 5 ruedas (cuantiles por grupo)', '', '| Grupo | Período | Casos | Cobertura | Cola izquierda | Cola derecha | ¿Pasa? |', '|---|---|---|---|---|---|---|');
  for (const g of GROUPS) for (const p of PERIODS) { const c = calib(rows, p, g); if (c) L.push(`| ${g} | ${p} | ${c.n} | ${pc(c.coverage)} | ${pc(c.left)} | ${pc(c.right)} | ${calOk(c) ? 'sí' : 'no'} |`); }
  L.push('', '## Q4: cobertura por tramo de pronóstico (todos)', '', '| Período | ' + BINS4.map(([b]) => `${b} (casos)`).join(' | ') + ' |', '|---|' + BINS4.map(() => '---').join('|') + '|');
  for (const p of PERIODS) L.push(`| ${p} | ` + condCal(rows, p).map((b) => `${pc(b.coverage)} (${b.n})`).join(' | ') + ' |');
  L.push('', '## Q5: variación real posterior ÷ variación de 250 ruedas, según pronóstico ÷ variación de 250 ruedas (todos)', '', '| Período | ' + RBINS.map(([b]) => `Pronóstico ${b} (casos)`).join(' | ') + ' |', '|---|' + RBINS.map(() => '---').join('|') + '|');
  for (const p of PERIODS) L.push(`| ${p} | ` + ratioBins(rows, p).map((b) => `${f3(b.realized)} (${b.n})`).join(' | ') + ' |');
  L.push('', '## Q6: VIX (S&P 500)', '', '| Período | Casos | QLIKE VIX reescalado | QLIKE modelo por grupo |', '|---|---|---|---|');
  for (const p of PERIODS) { const x = vixCompare(rows, vix, p); if (x) L.push(`| ${p} | ${x.n} | ${f3(x.vix)} | ${f3(x.grupo)} |`); }
  L.push('', '## Coeficientes finales (ajustados con todos los datos de cada grupo)', '', '| Grupo | Activos | Observaciones | a | b₁ ln d | b₂ ln s | b₃ ln m | b₄ ln q | Sesgo | q 5 % | q 95 % |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const g of POOLED_GROUPS) { const m = models[g]; if (m) L.push(`| ${g} | ${m.assets} | ${m.rows} | ${m.beta.map((b) => b.toFixed(4)).join(' | ')} | ${m.bias.toFixed(4)} | ${m.q[0].toFixed(4)} | ${m.q[1].toFixed(4)} |`); }
  if (meta.excluded.length) { L.push('', '**Excluidos:**', ''); for (const e of meta.excluded) L.push(`- ${e.symbol}: ${e.why}`); }
  return L.join('\n') + '\n';
}

// ------------------------------------------------------------------ diagnóstico EXPLORATORIO (no cambia ningún veredicto)
/** ¿Hay ruedas sin rango (apertura, máximo y mínimo iguales)? Un rango de cero no es volatilidad cero: es un dato que falta. */
export function diagnostic(assets: Array<{ symbol: string; group: string; bars: DayBar[] }>, rows: PRec[], har3: Map<string, Map<number, number>>, vix: DayBar[] | null): string {
  const L: string[] = ['# Diagnóstico del backtest 3 (exploratorio: NO cambia ningún veredicto)', '', 'Pregunta: ¿los datos de algunos activos traen ruedas sin rango (máximo = mínimo), que el modelo toma como "volatilidad cero"?', ''];
  const share = new Map<string, Map<number, number>>();
  L.push('## Activos con ruedas sin rango', '', '| Activo | Grupo | Ruedas | % sin rango (total) | % sin rango antes de 1990 | Última rueda sin rango |', '|---|---|---|---|---|---|');
  for (const a of assets) {
    const flat = a.bars.map((b) => (b.h === b.l ? 1 : 0)), P = [0]; for (const f of flat) P.push(P[P.length - 1] + f);
    const m = new Map<number, number>(); a.bars.forEach((b, i) => { if (i >= 249) m.set(b.t, (P[i + 1] - P[i - 249]) / 250); }); share.set(a.symbol, m);
    const tot = P[P.length - 1] / a.bars.length, old = a.bars.filter((b) => b.t < Date.UTC(1990, 0, 1) / 1000), oldS = old.length ? old.filter((b) => b.h === b.l).length / old.length : NaN;
    let lastI = -1; flat.forEach((f, i) => { if (f) lastI = i; });
    if (tot > 0.01) L.push(`| ${a.symbol} | ${a.group} | ${a.bars.length} | ${pc(tot)} | ${pc(oldS)} | ${lastI >= 0 ? new Date(a.bars[lastI].t * 1000).toISOString().slice(0, 10) : '—'} |`);
  }
  const z = (r: PRec) => Math.abs(r.r5 / Math.sqrt(H * r.f.grupo)), ext = (rs: PRec[]) => rs.filter((r) => z(r) > 8).length;
  const clean = rows.filter((r) => (share.get(r.asset)?.get(r.t) ?? 1) <= 0.05), dirty = rows.length - clean.length;
  L.push('', `Casos totales: ${rows.length} · con ≥ 5 % de ruedas sin rango en las 250 previas: ${dirty} (${pc(dirty / rows.length)}).`, `Retornos "imposibles" (|z| > 8): todos ${ext(rows)} · limpios ${ext(clean)}.`, '',
    '## Sensibilidad (exploratoria): los mismos criterios sin los casos con datos de rango degenerado', '');
  const a = verdicts(rows, har3, vix), b = verdicts(clean, har3, vix);
  L.push('| Criterio | Todos los casos (veredicto oficial) | Sin rango degenerado |', '|---|---|---|');
  const yes = (v: boolean) => (v ? 'pasa' : 'no pasa');
  for (const k of ['Q1', 'Q2', 'Q3all', 'Q4', 'Q5', 'Q6'] as const) L.push(`| ${k} | ${yes(a[k] as boolean)} | ${yes(b[k] as boolean)} |`);
  for (const g of POOLED_GROUPS) L.push(`| Q3 ${g} | ${yes(a.Q3[g])} | ${yes(b.Q3[g])} |`);
  L.push(`| Se construiría | ${a.build ? 'sí' : 'no'} | ${b.build ? 'sí' : 'no'} |`, '', '### Q5 sin rango degenerado', '', '| Período | ' + RBINS.map(([x]) => x).join(' | ') + ' |', '|---|' + RBINS.map(() => '---').join('|') + '|');
  for (const p of PERIODS) L.push(`| ${p} | ` + ratioBins(clean, p).map((x) => `${f3(x.realized)} (${x.n})`).join(' | ') + ' |');
  L.push('', '### Q3 sin rango degenerado', '', '| Grupo | Período | Cobertura | Izq. | Der. |', '|---|---|---|---|---|');
  for (const g of GROUPS) for (const p of PERIODS) { const c = calib(clean, p, g); if (c) L.push(`| ${g} | ${p} | ${pc(c.coverage)} | ${pc(c.left)} | ${pc(c.right)} |`); }
  return L.join('\n') + '\n';
}
