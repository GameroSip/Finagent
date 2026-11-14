import { describe, expect, it } from 'vitest';
import { addHolding, allocation, parseCsv, parseNum, savings, scenario, toBase, totalsByCurrency, valuate, type Holding, type Quote } from '../src/portfolio';
import { buildPdf, textWidth, toWinAnsi, type Block } from '../src/pdf';
import { assetStats, portfolioBlocks } from '../src/reports';
import { FORBIDDEN_CLAIMS } from '../src/about';

const H = (symbol: string, qty: number, cost: number | null = null, kind: 'asset' | 'cash' = 'asset'): Holding => ({ id: symbol, kind, symbol, qty, cost });
const Q = (e: Array<[string, number, string]>): Map<string, Quote> => new Map(e.map(([s, price, currency]) => [s, { price, currency }]));

describe('números y CSV', () => {
  it('lee números a la argentina y a la americana', () => {
    expect(parseNum('1.234,56')).toBe(1234.56); expect(parseNum('1,234.56')).toBe(1234.56); expect(parseNum('10,5')).toBe(10.5);
    expect(parseNum('1.234.567')).toBe(1234567); expect(parseNum('$ 2.500,00')).toBe(2500); expect(parseNum('(5)')).toBe(-5);
    expect(parseNum('100.000')).toBe(100000); expect(parseNum('1,234')).toBe(1234); expect(parseNum('0.125')).toBe(0.125); expect(parseNum('1.5')).toBe(1.5); expect(parseNum('12.3456')).toBe(12.3456);
    expect(parseNum('')).toBeNull(); expect(parseNum('abc')).toBeNull(); expect(parseNum('1,2,3x')).toBeNull();
  });
  it('importa un CSV con encabezados y punto y coma, y avisa lo que no entendió', () => {
    const r = parseCsv('Ticker;Cantidad;Precio promedio\nAAPL;10;150,5\nGGAL.BA;100;\nUSD;250;\nmal fila;x;y\n');
    expect(r.rows).toEqual([{ kind: 'asset', symbol: 'AAPL', qty: 10, cost: 150.5 }, { kind: 'asset', symbol: 'GGAL.BA', qty: 100, cost: null }, { kind: 'cash', symbol: 'USD', qty: 250, cost: null }]);
    expect(r.skipped).toHaveLength(1);
  });
  it('sin encabezado toma símbolo, cantidad y costo por posición; vacío no inventa nada', () => {
    expect(parseCsv('MSFT,2,400').rows).toEqual([{ kind: 'asset', symbol: 'MSFT', qty: 2, cost: 400 }]);
    expect(parseCsv('').rows).toEqual([]); expect(parseCsv('foo,bar\n').rows).toEqual([]);
  });
  it('rechaza cantidades negativas y símbolos con caracteres raros', () => {
    expect(parseCsv('symbol,qty\nAAPL,-1\n<b>,3\n').rows).toEqual([]);
  });
});

describe('cartera, reparto y escenarios', () => {
  it('suma cantidades del mismo símbolo y promedia el costo', () => {
    const l = addHolding(addHolding([], { kind: 'asset', symbol: 'aapl', qty: 10, cost: 100 }), { kind: 'asset', symbol: 'AAPL', qty: 10, cost: 200 });
    expect(l).toHaveLength(1); expect(l[0]).toMatchObject({ symbol: 'AAPL', qty: 20, cost: 150 });
  });
  const list = [H('AAPL', 10, 100), H('GGAL.BA', 100), H('USD', 500, null, 'cash'), H('ARS', 20000, null, 'cash'), H('RARO', 1)];
  const v = valuate(list, Q([['AAPL', 200, 'USD'], ['GGAL.BA', 5000, 'ARS']]));
  it('valúa en la moneda de cada activo y no inventa precios', () => {
    expect(v[0]).toMatchObject({ value: 2000, currency: 'USD', gainPct: 100 });
    expect(v[4]).toMatchObject({ value: null, currency: null });
    expect(totalsByCurrency(v)).toEqual([{ currency: 'ARS', total: 520000 }, { currency: 'USD', total: 2500 }]);
  });
  it('convierte con el tipo de cambio elegido y deja afuera lo que no puede', () => {
    expect(toBase(10, 'USD', 'ARS', 1000)).toBe(10000); expect(toBase(1000, 'ARS', 'USD', 1000)).toBe(1); expect(toBase(5, 'EUR', 'ARS', 1000)).toBeNull();
    const a = allocation(v, 'ARS', 1000);
    expect(a.total).toBe(2000 * 1000 + 500 * 1000 + 520000); expect(a.excluded).toBe(1);
    expect(a.items.reduce((s, i) => s + i.pct, 0)).toBeCloseTo(100, 6);
  });
  it('escenario: el dólar sube y los activos bajan, con aritmética exacta', () => {
    const own = valuate([H('AAPL', 10), H('USD', 100, null, 'cash'), H('ARS', 100000, null, 'cash')], Q([['AAPL', 100, 'USD']]));
    const r = scenario(own, 'ARS', 1000, { fxPct: 20, assetsPct: -10 });
    expect(r.before).toBe(1000 * 1000 + 100 * 1000 + 100000);                       // 1.200.000
    expect(r.after).toBe(900 * 1200 + 100 * 1200 + 100000);                          // 1.300.000
    expect(r.rateAfter).toBe(1200);
    expect(scenario(own, 'ARS', 1000, { fxPct: 0, assetsPct: 0 }).deltaPct).toBe(0);
    expect(scenario(own, 'USD', 1000, { fxPct: 100, assetsPct: 0 }).after).toBeCloseTo(1000 + 100 + 50, 9);
    expect(scenario(own, 'ARS', 1000, { fxPct: 0, assetsPct: -10, bySymbol: { AAPL: 0 } }).deltaPct).toBe(0);
  });
});

describe('aportes y plazo', () => {
  it('sin rentabilidad ni inflación, es solo lo aportado', () => {
    const r = savings({ initial: 1000, monthly: 100, annualRatePct: 0, inflationPct: 0, years: 2 });
    expect(r.nominal).toBeCloseTo(1000 + 2400, 6); expect(r.contributed).toBe(3400); expect(r.interest).toBeCloseTo(0, 6); expect(r.real).toBeCloseTo(r.nominal, 6);
  });
  it('con rentabilidad crece más que lo aportado y la inflación lo achica en valores de hoy', () => {
    const r = savings({ initial: 0, monthly: 100, annualRatePct: 12, inflationPct: 12, years: 5 });
    expect(r.nominal).toBeGreaterThan(r.contributed); expect(r.real).toBeLessThan(r.nominal); expect(r.byYear).toHaveLength(5);
    const one = savings({ initial: 1000, monthly: 0, annualRatePct: 10, inflationPct: 0, years: 1 });
    expect(one.nominal).toBeCloseTo(1100, 6);
  });
  it('plazo 0 o negativo no rompe', () => { expect(savings({ initial: 5, monthly: 1, annualRatePct: 3, inflationPct: 1, years: 0 }).nominal).toBe(5); });
});

describe('PDF', () => {
  const blocks: Block[] = [{ t: 'h1', text: 'Informe ñandú (prueba) \\ ✓' }, { t: 'p', text: 'palabra '.repeat(400) }, { t: 'table', head: ['A', 'B'], widths: [0.5, 0.5], align: ['l', 'r'], rows: Array.from({ length: 120 }, (_, i) => [`fila ${i}`, `${i * 1000},50`]) }];
  const bytes = buildPdf('Prueba', blocks, 'pie');
  const text = Buffer.from(bytes).toString('latin1');
  it('es un PDF bien formado: cabecera, fin y tabla de referencias que apunta a cada objeto', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true); expect(text.endsWith('%%EOF')).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    entries.forEach((off, i) => expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect(/\/Count (\d+)/.exec(text)![1]).not.toBe('1');                            // varias páginas
  });
  it('cada contenido declara su largo real', () => {
    for (const m of text.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) expect(m[2].length).toBe(Number(m[1]));
  });
  it('escapa paréntesis y barras, y convierte a un solo byte sin perder el español', () => {
    expect(text).toContain('\\(prueba\\)'); expect(text).toContain('\\\\');
    expect(toWinAnsi('ñandú — €')).toBe('ñandú \u0097 \u0080'); expect(toWinAnsi('✓')).toBe('?'); expect(textWidth('0000', 10)).toBeGreaterThan(textWidth('iiii', 10));
  });
  it('el informe de cartera se genera y no usa afirmaciones prohibidas', () => {
    const v = valuate([H('AAPL', 10, 100), H('USD', 5, null, 'cash')], Q([['AAPL', 200, 'USD']]));
    const b = portfolioBlocks(v, 'ARS', 1000, scenario(v, 'ARS', 1000, { fxPct: 10, assetsPct: -5 }));
    const all = JSON.stringify(b);
    for (const [name, re] of FORBIDDEN_CLAIMS) expect(all, name).not.toMatch(re);
    expect(all).toMatch(/no es asesoramiento/i); expect(all).toMatch(/demora/);
    expect(buildPdf('x', b).length).toBeGreaterThan(800);
  });
  it('estadísticas de un activo: rendimiento, volatilidad y caída desde un máximo', () => {
    const bars = Array.from({ length: 300 }, (_, i) => { const c = 100 + i * 0.1; return { t: i, o: c, h: c + 1, l: c - 1, c, v: 1, adjc: c }; });
    const s = assetStats(bars)!;
    expect(s.dd).toBe(0); expect(s.m1!).toBeGreaterThan(0); expect(s.vol).toBeGreaterThan(0); expect(assetStats(bars.slice(0, 5))).toBeNull();
  });
});
