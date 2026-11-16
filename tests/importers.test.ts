import { describe, expect, it } from 'vitest';
import { BROKERS, buildPortfolioPrompt, normCurrency, parseShotJson, resolveSymbols, shotToItems, yahooCandidates } from '../src/importers';
import { FORBIDDEN_CLAIMS } from '../src/about';

const iol = {
  broker: 'IOL', notes: '',
  positions: [
    { symbol: 'GGAL', name: 'Grupo Financiero Galicia', asset_type: 'accion_ar', quantity: 100, avg_cost: 5230.5, last_price: 6140, market_value: 614000, currency: 'ARS' },
    { symbol: 'AAPL', asset_type: 'cedear', quantity: '10', avg_cost: '18.500,25', last_price: 20100, market_value: 201000, currency: '$' },
    { symbol: 'AL30', asset_type: 'bono_ar', quantity: 500, last_price: 61000, market_value: 999, currency: 'ARS' },
    { symbol: 'XYZ', quantity: 0 },
    { symbol: '', quantity: 3 },
  ],
  cash: [{ currency: 'pesos', amount: 15000.5 }, { currency: 'US$', amount: 120 }],
};

describe('importar cartera desde capturas', () => {
  it('reconoce el broker y pasa los activos locales a símbolos de Yahoo', () => {
    const r = shotToItems([iol]);
    expect(r.broker?.id).toBe('iol');
    const a = r.items.filter((i) => i.kind === 'asset');
    expect(a.map((i) => i.symbol)).toEqual(['GGAL.BA', 'AAPL.BA', 'AL30.BA']);
    expect(a[1].qty).toBe(10);
    expect(a[1].cost).toBe(18500.25);          // "18.500,25" en formato argentino
    expect(r.dropped).toBe(2);                 // cantidad 0 y símbolo vacío
  });
  it('el efectivo sale de "cash" con la moneda normalizada', () => {
    const c = shotToItems([iol]).items.filter((i) => i.kind === 'cash');
    expect(c.map((i) => [i.symbol, i.qty])).toEqual([['ARS', 15000.5], ['USD', 120]]);
  });
  it('marca la fila donde cantidad × precio no da la valuación', () => {
    const r = shotToItems([iol]);
    expect(r.items.find((i) => i.symbol === 'AL30.BA')!.flags).toContain('value');
    expect(r.items.find((i) => i.symbol === 'GGAL.BA')!.flags).toEqual([]);
  });
  it('ofrece símbolos alternativos por si el primero no cotiza', () => {
    expect(yahooCandidates('GGAL', 'accion_ar', 'ARS', null)).toEqual(['GGAL.BA', 'GGAL']);
    expect(yahooCandidates('AAPL', 'accion_us', 'USD', null)).toEqual(['AAPL', 'AAPL.BA']);
    expect(yahooCandidates('BTC', 'cripto', 'USD', null)).toEqual(['BTC-USD', 'BTC']);
    expect(yahooCandidates('GGAL.BA', 'accion_ar', 'ARS', null)).toEqual(['GGAL.BA']);
    expect(yahooCandidates('YPFD', '', 'ARS', null)[0]).toBe('YPFD.BA');          // sin tipo pero en pesos: bolsa local
    expect(yahooCandidates('NVDA', '', 'USD', null)[0]).toBe('NVDA');
    expect(yahooCandidates('no es un ticker!', 'otro', null, null)).toEqual([]);
  });
  it('USDT y USDC son efectivo, no activos', () => {
    const r = shotToItems([{ positions: [{ symbol: 'USDT', quantity: 50, asset_type: 'cripto' }, { symbol: 'ETH', quantity: 0.5, asset_type: 'cripto' }] }]);
    expect(r.items.map((i) => [i.kind, i.symbol])).toEqual([['asset', 'ETH-USD'], ['cash', 'USDT']]);
  });
  it('la misma fila en dos capturas no se suma; con otra cantidad se conserva y se avisa', () => {
    const a = { positions: [{ symbol: 'GGAL', asset_type: 'accion_ar', quantity: 100 }, { symbol: 'YPFD', asset_type: 'accion_ar', quantity: 5 }] };
    const b = { positions: [{ symbol: 'GGAL', asset_type: 'accion_ar', quantity: 100 }, { symbol: 'YPFD', asset_type: 'accion_ar', quantity: 7 }] };
    const r = shotToItems([a, b]).items;
    expect(r.filter((i) => i.symbol === 'GGAL.BA')).toHaveLength(1);
    expect(r.filter((i) => i.symbol === 'YPFD.BA').map((i) => i.qty)).toEqual([5, 7]);
    expect(r.filter((i) => i.symbol === 'YPFD.BA')[1].flags).toContain('dup');
  });
  it('lee el JSON aunque venga con ``` o con texto alrededor, y rechaza lo que no es JSON', () => {
    expect(parseShotJson('```json\n{"positions":[{"symbol":"A","quantity":1}]}\n```')?.positions).toHaveLength(1);
    expect(parseShotJson('Acá está: {"positions":[]} listo')?.positions).toEqual([]);
    expect(parseShotJson('[{"symbol":"A","quantity":1}]')?.positions).toHaveLength(1);
    expect(parseShotJson('no hay nada')).toBeNull();
  });
  it('normaliza monedas escritas de muchas formas', () => {
    expect(['$', 'Pesos', 'ars', 'AR$'].map(normCurrency)).toEqual(['ARS', 'ARS', 'ARS', 'ARS']);
    expect(['US$', 'u$s', 'Dólares', 'USD', 'MEP'].map(normCurrency)).toEqual(['USD', 'USD', 'USD', 'USD', 'USD']);
    expect(normCurrency('')).toBeNull();
  });
  it('comprueba los símbolos probando alternativas y avisa los que no cotizan', async () => {
    const items = [
      { kind: 'asset', symbol: 'AAA.BA', alternatives: ['AAA'] },
      { kind: 'asset', symbol: 'BBB.BA', alternatives: ['BBB'] },
      { kind: 'cash', symbol: 'ARS', alternatives: [] },
    ];
    const res = await resolveSymbols(items, async (s) => (s === 'AAA' ? { price: 10, currency: 'USD' } : { price: null }));
    expect(res[0]).toMatchObject({ found: true, symbol: 'AAA', price: 10 });
    expect(res[1]).toMatchObject({ found: false, symbol: 'BBB.BA' });
    expect(res[2]).toMatchObject({ found: true, symbol: 'ARS' });
  });
  it('agregar un broker es agregar una fila: el prompt los incluye a todos y no viola las reglas de honestidad', () => {
    const p = buildPortfolioPrompt();
    for (const b of BROKERS) expect(p).toContain(b.name);
    expect(p).toMatch(/1\.234,50/);
    for (const [name, re] of FORBIDDEN_CLAIMS) expect(re.test(p), name).toBe(false);
  });
});
