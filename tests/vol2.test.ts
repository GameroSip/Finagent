import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { synthetic } from '../evals/radar/data';
import { report, verdicts } from '../evals/radar/vol2';
import { SPLIT_DATE } from '../src/radarBacktest';
import { evaluatePooled, features, finalModels, fitPooled, habitual, interval, Q_WIN, xAt, type PooledGroup, type PRec } from '../src/volPooled';

const mk = (n: number, seed: number, vol = 0.015) => synthetic(seed, n, vol);
const assetsOf = (groups: PooledGroup[], n = 7000) => groups.map((g, k) => ({ symbol: `A${k}`, group: g, bars: mk(n, 40 + k * 13, g === 'cripto' ? 0.035 : 0.015) }));

describe('regresores y pronóstico', () => {
  it('sin 250 ruedas de historia no hay regresores; con volatilidad constante todos valen lo mismo', () => {
    const g = new Float64Array(400).fill(2e-4);
    expect(xAt(g, 248)).toBeNull(); expect(xAt(g, 249)).not.toBeNull();
    const x = xAt(g, 300)!; expect(x[0]).toBe(1); for (const v of x.slice(1)) expect(v).toBeCloseTo(Math.log(2e-4), 12);
    expect(habitual(g, 300)).toBeCloseTo(2e-4, 15);
  });
  it('usa el promedio de las últimas 250 ruedas (ni más ni menos)', () => {
    const g = Float64Array.from({ length: 400 }, (_, i) => (i < 150 ? 1e-3 : 1e-4)), x = xAt(g, 399)!;
    expect(x[4]).toBeCloseTo(Math.log(habitual(g, 399)), 12); expect(habitual(g, 399)).toBeCloseTo(1e-4, 12);
    expect(Q_WIN).toBe(250);
  });
  it('el intervalo es asimétrico alrededor de cero según los cuantiles y se ensancha con la varianza pronosticada', () => {
    const m = { beta: [0, 0, 0, 0, 0], bias: 1, q: [-1.7, 1.5] as [number, number], rows: 1, assets: 1 };
    const [lo, hi] = interval(m, 1e-4), [lo2, hi2] = interval(m, 4e-4);
    expect(lo).toBeLessThan(0); expect(hi).toBeGreaterThan(0); expect(Math.abs(lo)).toBeGreaterThan(hi);
    expect(lo2).toBeLessThan(lo); expect(hi2).toBeGreaterThan(hi);
  });
});

describe('ajuste por grupo', () => {
  it('con pocos datos no ajusta (no inventa coeficientes)', () => { expect(fitPooled([{ f: features(mk(600, 1)), upto: 600 }])).toBeNull(); });
  it('con datos suficientes da coeficientes finitos, sesgo ≥ 1 y cuantiles a ambos lados de cero', () => {
    const m = fitPooled(assetsOf(['acciones', 'acciones', 'acciones']).map((a) => ({ f: features(a.bars), upto: a.bars.length })))!;
    expect(m.rows).toBeGreaterThan(10000); expect(m.assets).toBe(3);
    for (const b of m.beta) expect(Number.isFinite(b)).toBe(true);
    expect(m.bias).toBeGreaterThanOrEqual(1); expect(m.q[0]).toBeLessThan(0); expect(m.q[1]).toBeGreaterThan(0);
  });
  it('finalModels devuelve un modelo por grupo con datos', () => { const f = finalModels(assetsOf(['índices', 'índices', 'ETF'])); expect(Object.keys(f).sort()).toEqual(['ETF', 'índices'].sort().filter((k) => k in f)); expect(f['índices']).toBeDefined(); });
});

describe('nunca usa información del futuro (tampoco de otros activos del mismo grupo)', () => {
  const base = assetsOf(['acciones', 'acciones', 'acciones'], 6500), full = evaluatePooled(base), key = (r: PRec) => `${r.asset}|${r.t}`, fullBy = new Map(full.map((r) => [key(r), r]));
  it('hay pronósticos en toda la historia', () => { expect(full.length).toBeGreaterThan(8000); });
  it('cortar la serie de UN activo no cambia los pronósticos anteriores de NINGÚN activo del grupo', () => {
    const K = 5200, cut = base.map((a, i) => (i === 1 ? { ...a, bars: a.bars.slice(0, K) } : a)), lim = base[1].bars[K - 8].t;
    const rows = evaluatePooled(cut).filter((r) => r.t <= lim);
    expect(rows.length).toBeGreaterThan(3000);
    for (const r of rows) { const f = fullBy.get(key(r))!; expect(f).toBeDefined(); expect(r.f.grupo).toBeCloseTo(f.f.grupo, 12); expect(r.q).toEqual(f.q); }
  });
  it('alterar los datos futuros de un activo no cambia los pronósticos anteriores', () => {
    const K = 5000, lim = base[2].bars[K - 8].t, tampered = base.map((a, i) => (i === 2 ? { ...a, bars: a.bars.map((b, j) => (j > K ? { ...b, o: b.o * 4, h: b.h * 4.5, l: b.l * 3.2, c: b.c * 3.9 } : b)) } : a));
    for (const r of evaluatePooled(tampered).filter((x) => x.t <= lim)) { const f = fullBy.get(key(r))!; expect(r.f.grupo).toBeCloseTo(f.f.grupo, 12); expect(r.q).toEqual(f.q); }
  });
  it('un golpe a mitad de año no altera los pronósticos de ese año anteriores al golpe (se reajusta solo el 1 de enero)', () => {
    const yr = (t: number) => new Date(t * 1000).getUTCFullYear(), a0 = base[0], first = a0.bars.findIndex((b) => yr(b.t) === 2010), shock = first + 140;
    const hit = base.map((a, i) => (i === 0 ? { ...a, bars: a.bars.map((b, j) => (j >= shock ? { ...b, o: b.o * 2, h: b.h * 2.5, l: b.l * 1.4, c: b.c * 1.9 } : b)) } : a));
    const before = evaluatePooled(hit).filter((r) => yr(r.t) === 2010 && r.t < a0.bars[shock - 8].t);
    expect(before.length).toBeGreaterThan(200);
    for (const r of before) expect(r.f.grupo).toBeCloseTo(fullBy.get(key(r))!.f.grupo, 12);
  });
});

describe('criterios y decisiones (con casos armados a mano)', () => {
  const RHO = [0.5, 1, 1.5, 3], REAL = [0.8, 1.0, 1.4, 2.0];
  const rowsFor = (o: { flat?: boolean; allInside?: boolean; group?: PooledGroup } = {}) => {
    const out: PRec[] = [], har3 = new Map<string, Map<number, number>>();
    for (const asset of ['A', 'B', 'C', 'D', 'E']) {
      const h = new Map<number, number>(); har3.set(asset, h);
      for (const t0 of [SPLIT_DATE - 900 * 86400, SPLIT_DATE + 10 * 86400]) for (let i = 0; i < 600; i++) {
        const habit = 1e-4, rho = RHO[i % 4], f = habit * rho, y = habit * (o.flat ? 1 : REAL[i % 4]), z = o.allInside ? 0.1 : i % 20 === 0 ? -3 : i % 20 === 10 ? 3 : 0.1, t = t0 + i * 86400;
        out.push({ asset, group: o.group ?? 'acciones', t, y, r5: z * Math.sqrt(5 * f), habit, f: { grupo: f, ayer: 4e-4, EWMA: f * 3 }, q: [-1.645, 1.645] });
        h.set(t, f);
      }
    }
    return { out, har3 };
  };
  it('si todo cumple: se construye, con intervalo para el grupo que calibra', () => {
    const { out, har3 } = rowsFor(), v = verdicts(out, har3, null);
    expect([v.Q1, v.Q2, v.Q4, v.Q5]).toEqual([true, true, true, true]); expect(v.build).toBe(true); expect(v.intervalGroups).toEqual(['acciones']); expect(v.useVix).toBe(false);
  });
  it('si "X veces lo habitual" no significa nada (Q5 falla): NO se construye y no se muestra ningún intervalo', () => {
    const { out, har3 } = rowsFor({ flat: true }), v = verdicts(out, har3, null);
    expect(v.Q5).toBe(false); expect(v.build).toBe(false); expect(v.intervalGroups).toEqual([]);
  });
  it('si el intervalo no calibra (cobertura de 100 %): se construye pero SIN intervalo para ese grupo', () => {
    const { out, har3 } = rowsFor({ allInside: true }), v = verdicts(out, har3, null);
    expect(v.Q3.acciones).toBe(false); expect(v.build).toBe(true); expect(v.intervalGroups).toEqual([]);
  });
  it('sin el modelo por activo para comparar (Q1) no se aprueba nada', () => { const { out } = rowsFor(); expect(verdicts(out, new Map(), null).build).toBe(false); });
  it('el reporte sale completo, sin NaN, e incluye los coeficientes finales', () => {
    const a = assetsOf(['índices', 'ETF', 'acciones', 'acciones', 'cripto'], 7000), rows = evaluatePooled(a), md = report(rows, new Map(), null, finalModels(a), { when: 'test', synthetic: true, excluded: [], prereg: 'abc1234', assets: a });
    for (const s of ['## Veredictos', '## Q1 y Q2', '## Q3', '## Q4', '## Q5', '## Q6', '## Coeficientes finales', 'SINTÉTICOS']) expect(md).toContain(s);
    expect(md).not.toMatch(/NaN|undefined/);
  });
});

describe('el registro previo coincide con el código', () => {
  it('contiene los criterios y las reglas de decisión', () => {
    const doc = readFileSync('evals/radar/PREREGISTRO-VOL2.md', 'utf8');
    for (const s of ['≤ 1,03', '≥ 80 %', '≤ 1,00', '87 % y 93 %', '85 % y 95 %', '1,3', '0,9', '1.500', '250 ruedas', 'solo si pasan Q1, Q2, Q4 y Q5'.replace('solo si', '**solo si'), 'no se cambian después de ver los datos']) expect(doc).toContain(s.replace('**solo si pasan Q1, Q2, Q4 y Q5', '**solo si pasan Q1, Q2, Q4 y Q5'));
  });
});
