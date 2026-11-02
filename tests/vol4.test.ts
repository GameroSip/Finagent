import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { synthetic } from '../evals/radar/data';
import { evaluatePooled, features, finalModels, flatShare, MAX_FLAT, validRow, type PooledGroup } from '../src/volPooled';

const sane = (n: number, seed: number) => synthetic(seed, n, 0.015);
const flatHead = (n: number, seed: number, upto: number) => sane(n, seed).map((b, i) => (i < upto ? { ...b, o: b.c, h: b.c, l: b.c } : b));

describe('calidad de datos: ruedas sin rango', () => {
  it('mide la proporción de ruedas sin rango en las 250 previas, y sin historia suficiente no se confía', () => {
    const f = features(flatHead(800, 1, 300));
    expect(flatShare(f, 100)).toBe(1);                                              // sin 250 ruedas de historia no se confía
    expect(flatShare(f, 299)).toBe(1);                                              // ventana 50..299: todas sin rango
    expect(flatShare(f, 349)).toBeCloseTo(0.8, 9);                                  // ventana 100..349: 200 de 250 sin rango
    expect(flatShare(f, 549)).toBe(0);                                              // ventana 300..549: ninguna
  });
  it('la fila es válida solo si la ventana de t y la de t+5 están sanas', () => {
    const f = features(flatHead(1200, 2, 400));
    expect(validRow(f, 300)).toBe(false);                                           // dentro del tramo sin rango
    expect(validRow(f, 700)).toBe(true);                                            // ventana 451..700: sana
    const share = (i: number) => flatShare(f, i);
    for (let t = 650; t < 1190; t += 37) expect(validRow(f, t)).toBe(share(t) <= MAX_FLAT && share(t + 5) <= MAX_FLAT);
    const g = features(sane(1200, 3).map((b, i) => (i >= 700 ? { ...b, o: b.c, h: b.c, l: b.c } : b)));
    expect(validRow(g, 500)).toBe(true);                                            // los datos sin rango empiezan en 700: t=500 y t+5 sanos
    expect(validRow(g, 960)).toBe(false);                                           // ventana de 250 con más de 5 % sin rango
  });
});

describe('el filtro arregla los cuantiles contaminados', () => {
  const mk = (): Array<{ symbol: string; group: PooledGroup; bars: ReturnType<typeof sane> }> => [
    { symbol: 'VIEJO', group: 'índices', bars: flatHead(7000, 11, 3500) }, { symbol: 'B', group: 'índices', bars: sane(7000, 12) }, { symbol: 'C', group: 'índices', bars: sane(7000, 13) }];
  it('sin filtro los cuantiles se disparan; con filtro quedan como los de datos sanos', () => {
    const dirty = finalModels(mk()), clean = finalModels(mk(), true), ref = finalModels(mk().slice(1), true);
    const span = (m: { q: [number, number] }) => m.q[1] - m.q[0];
    expect(span(dirty['índices']!)).toBeGreaterThan(span(clean['índices']!) * 2);
    expect(Math.abs(clean['índices']!.q[0])).toBeLessThan(3); expect(clean['índices']!.q[1]).toBeLessThan(3);
    expect(Math.abs(span(clean['índices']!) - span(ref['índices']!))).toBeLessThan(0.3);
  });
  it('con filtro no queda ninguna fila evaluada dentro del tramo sin rango, y los casos "imposibles" desaparecen', () => {
    const a = mk(), rows = evaluatePooled(a, true), limit = a[0].bars[3500].t;
    expect(rows.filter((r) => r.asset === 'VIEJO' && r.t < limit).length).toBe(0);
    expect(rows.filter((r) => r.asset === 'VIEJO').length).toBeGreaterThan(1000);
    const z = (r: (typeof rows)[number]) => Math.abs(r.r5 / Math.sqrt(5 * r.f.grupo)), bad = (rs: typeof rows) => rs.filter((r) => z(r) > 8).length;
    expect(bad(rows)).toBeLessThanOrEqual(bad(evaluatePooled(a, false)));
  });
  it('sigue sin usar información del futuro con el filtro activado', () => {
    const a = mk(), full = evaluatePooled(a, true), by = new Map(full.map((r) => [`${r.asset}|${r.t}`, r])), K = 6000;
    const cut = a.map((x, i) => (i === 1 ? { ...x, bars: x.bars.slice(0, K) } : x)), lim = a[1].bars[K - 8].t;
    const rows = evaluatePooled(cut, true).filter((r) => r.t <= lim);
    expect(rows.length).toBeGreaterThan(2000);
    for (const r of rows) { const f = by.get(`${r.asset}|${r.t}`)!; expect(f).toBeDefined(); expect(r.f.grupo).toBeCloseTo(f.f.grupo, 12); expect(r.q).toEqual(f.q); }
  });
});

describe('el registro previo 4 coincide con el código', () => {
  const doc = readFileSync('evals/radar/PREREGISTRO-VOL4.md', 'utf8');
  it('declara la no independencia, la regla y que no habrá un tercer intento', () => {
    for (const s of ['Declaración de no independencia', 'segundo intento', '≤ 5 %', '250 ruedas previas a t', 'No habrá un tercer intento', 'no se cambian después de ver los datos', '^GSPC, ^IXIC, ^GDAXI, ^HSI y WMT']) expect(doc).toContain(s);
    expect(MAX_FLAT).toBe(0.05);
  });
});
