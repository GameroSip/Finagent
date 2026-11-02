import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { build, calibration, condCalibration, report, tail, verdicts, type AssetRecs } from '../evals/radar/vol';
import { synthetic } from '../evals/radar/data';
import { SPLIT_DATE } from '../src/radarBacktest';
import { dmStat, evaluateAsset, gk, MODELS, ols, qlike, type Rec } from '../src/volForecast';

describe('piezas del pronóstico', () => {
  it('Garman-Klass: un día sin rango no da cero ni negativo (se acota), y un día con rango da la fórmula', () => {
    expect(gk({ t: 0, o: 100, h: 100, l: 100, c: 100, v: 0 })).toBe(1e-8);
    const v = gk({ t: 0, o: 100, h: 102, l: 99, c: 101, v: 0 }), exact = 0.5 * Math.log(102 / 99) ** 2 - (2 * Math.LN2 - 1) * Math.log(101 / 100) ** 2;
    expect(v).toBeCloseTo(exact, 12); expect(v).toBeGreaterThan(0);
  });
  it('mínimos cuadrados recupera los coeficientes de una relación exacta', () => {
    const X = [...Array(50)].map((_, i) => [1, i, (i * 7) % 11]), y = X.map(([a, b, c]) => 1.5 + 2 * b - 0.5 * c + a * 0);
    const { beta, s2 } = ols(X, y);
    expect(beta[0]).toBeCloseTo(1.5, 6); expect(beta[1]).toBeCloseTo(2, 6); expect(beta[2]).toBeCloseTo(-0.5, 6); expect(s2).toBeLessThan(1e-12);
  });
  it('QLIKE: cero si acierta, y castiga más quedarse corto que pasarse', () => {
    expect(qlike(0.01, 0.01)).toBeCloseTo(0, 12);
    expect(qlike(0.01, 0.005)).toBeGreaterThan(qlike(0.01, 0.02));                         // pronosticar la mitad duele más que pronosticar el doble
    expect(qlike(0.01, 0.0123)).toBeGreaterThan(0);
  });
  it('Diebold-Mariano: ventaja constante da estadístico alto; sin diferencia o con pocos datos, no inventa', () => {
    const a = [...Array(300)].map((_, i) => 1 + 0.1 * Math.sin(i)), b = a.map((x) => x - 0.2);
    expect(dmStat(a, b)).toBeGreaterThan(5); expect(dmStat(b, a)).toBeLessThan(-5);
    expect(Number.isNaN(dmStat(a, a))).toBe(true); expect(Number.isNaN(dmStat(a.slice(0, 20), b.slice(0, 20)))).toBe(true);
  });
});

describe('nunca usa información del futuro', () => {
  const bars = synthetic(5, 5200, 0.015), full = evaluateAsset(bars), key = (r: Rec) => r.t;
  it('cortar la serie no cambia ningún pronóstico anterior (ni los cuantiles de calibración)', () => {
    const K = 4300, cut = evaluateAsset(bars.slice(0, K)), lim = bars[K - 6].t, byT = new Map(full.map((r) => [key(r), r]));
    const rows = cut.filter((r) => r.t <= lim);
    expect(rows.length).toBeGreaterThan(500);
    for (const r of rows) { const f = byT.get(r.t)!; expect(f).toBeDefined(); expect(r.f).toEqual(f.f); expect(r.q).toEqual(f.q); expect(r.S).toBe(f.S); }
  });
  it('alterar los datos posteriores no cambia los pronósticos anteriores', () => {
    const K = 4000, tampered = bars.map((b, i) => (i > K ? { ...b, o: b.o * 3, h: b.h * 3.3, l: b.l * 2.6, c: b.c * 3.1, v: b.v * 7 } : b)), t2 = evaluateAsset(tampered), lim = bars[K - 6].t;
    const byT = new Map(full.map((r) => [key(r), r]));
    for (const r of t2.filter((x) => x.t <= lim)) { const f = byT.get(r.t)!; expect(r.f).toEqual(f.f); expect(r.q).toEqual(f.q); }
  });
  it('un golpe en mitad de un año NO altera los pronósticos de ese año anteriores al golpe (el modelo se reajusta solo el 1 de enero)', () => {
    const yr = (t: number) => new Date(t * 1000).getUTCFullYear(), target = 2012, first = bars.findIndex((b) => yr(b.t) === target), shock = first + 150;
    const hit = bars.map((b, i) => (i >= shock ? { ...b, o: b.o * 2, h: b.h * 2.4, l: b.l * 1.5, c: b.c * 1.9 } : b)), withShock = evaluateAsset(hit), byT = new Map(full.map((r) => [key(r), r]));
    const before = withShock.filter((r) => yr(r.t) === target && r.t < bars[shock - 6].t);
    expect(before.length).toBeGreaterThan(100);
    for (const r of before) { const f = byT.get(r.t)!; expect(r.f.HAR).toBeCloseTo(f.f.HAR, 12); expect(r.q.HAR).toEqual(f.q.HAR); }
  });
});

describe('comportamiento sobre datos con volatilidad que se agrupa y SIN asimetría (control)', () => {
  const assets = ['índices', 'acciones', 'cripto', 'ETF', 'acciones', 'índices'].map((g, k) => ({ symbol: `S${k}`, group: g as AssetRecs['group'], bars: synthetic(300 + k * 17, 7000, g === 'cripto' ? 0.035 : 0.015) }));      // 7.000 días desde 2000: llega a 2019, o sea que hay dos períodos
  const list = build(assets);
  it('hay pronósticos de los cinco modelos para todos los activos', () => { expect(list).toHaveLength(6); expect(MODELS).toHaveLength(5); for (const a of list) expect(a.recs.length).toBeGreaterThan(1000); });
  it('la calibración total es ~90 % y por tramos HAR se mantiene cerca mientras "ayer" falla en los extremos', () => {
    for (const p of ['antes de 2015', 'desde 2015'] as const) { const c = calibration(list, p, 'todos', 'HAR')!; expect(c.coverage).toBeGreaterThan(0.86); expect(c.coverage).toBeLessThan(0.94); }
    const har = condCalibration(list, 'antes de 2015', 'HAR').filter((b) => b.n > 2000), ayer = condCalibration(list, 'antes de 2015', 'ayer').filter((b) => b.n > 2000);
    expect(Math.max(...har.map((b) => Math.abs(b.coverage - 0.9)))).toBeLessThan(0.05);
    expect(Math.max(...ayer.map((b) => Math.abs(b.coverage - 0.9)))).toBeGreaterThan(0.06);
  });
  it('NO inventa información de cola izquierda (sin asimetría real) y el reporte sale completo', () => {
    const v = verdicts(list, []);
    expect(v.p3).toBe('no hay información de cola izquierda más allá de la volatilidad');
    expect(v.p2).toMatch(/^calibrado/); expect(v.p4).toMatch(/sin datos/);
    const md = report(list, null, { when: 'test', synthetic: true, excluded: [], commitPrereg: 'abc1234' });
    for (const h of ['## 5. Veredictos', '## 1.', '## 2.', '### 2b', '## 3.', '## 4.', 'SINTÉTICOS', 'Enmienda 1']) expect(md).toContain(h);
    expect(md).not.toMatch(/NaN|undefined/);
  });
});

describe('la prueba de cola izquierda detecta una asimetría real cuando existe', () => {
  const mk = (leftInS: number): AssetRecs => {
    const recs: Rec[] = [];
    for (const [t0, n] of [[SPLIT_DATE - 400 * 86400, 600], [SPLIT_DATE + 10 * 86400, 600]] as const) for (let i = 0; i < n; i++) {
      const S = i % 4 === 0, j = i / 4, f = 1e-4, left = S && j % 100 < leftInS, right = S && !left && j % 39 === 0, z = left ? -3 : right ? 3 : 0.2;   // en S: exactamente `leftInS` de cada 100 casos cae bajo el cuantil izquierdo y ~2,6 % sobre el derecho
      recs.push({ t: t0 + i * 86400, y: f, r5: z * Math.sqrt(5 * f), f: Object.fromEntries(MODELS.map((m) => [m, f])) as Rec['f'], q: Object.fromEntries(MODELS.map((m) => [m, [-1.645, 1.645]])) as Rec['q'], S });
    }
    return { symbol: 'X', group: 'acciones', recs };
  };
  it('con 12 % de la cola izquierda en S y casi nada a la derecha: dice que sí hay información', () => {
    const l = [mk(12)], t = tail(l, 'desde 2015', 'todos')!;
    expect(t.left[0]).toBeGreaterThan(0.075); expect(t.right[0]).toBeLessThan(0.065);
    expect(verdicts(l, []).p3).toBe('sí hay información de cola izquierda');
  });
  it('con una cola izquierda normal (5 %) en S: dice que no', () => { expect(verdicts([mk(5)], []).p3).toMatch(/^no hay información/); });
});

describe('el registro previo coincide con el código', () => {
  const doc = readFileSync('evals/radar/PREREGISTRO-VOL.md', 'utf8');
  it('contiene los criterios y la enmienda, y se publicó el compromiso de no cambiarlos', () => {
    for (const s of ['≥ 70 %', '1,02', '1,05', '87 % y 93 %', '7,5 %', '5,5 %', '6,5 %', 'λ = 0,94', '750', 'Enmienda 1', 'no se cambian después de ver los datos']) expect(doc).toContain(s);
  });
});
