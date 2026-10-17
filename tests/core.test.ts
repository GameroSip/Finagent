import { beforeEach, describe, expect, it } from 'vitest';
import fixture from './fixtures/snapshot.json';
import { evaluate } from '../src/calc';
import { HttpRequest, HttpResult, setHttp } from '../src/http';
import { rsi, snapshot } from '../src/indicators';
import { callTool, clearCache } from '../src/tools';
import { parseToken, verifyAnswer } from '../src/verify';
import * as Y from '../src/yahoo';

// ------------------------------------------------------------------ indicadores (paridad con Python/pandas)
describe('indicadores', () => {
  it('coinciden con la implementación de referencia en Python', () => {
    const s = snapshot(fixture.bars) as any;
    const e = fixture.expected as any;
    const close = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
    close(s.rsi14, e.rsi14, 0.05);
    close(s.macd.line, e.macd.line, 0.01);
    close(s.macd.signal, e.macd.signal, 0.01);
    close(s.macd.histogram, e.macd.histogram, 0.01);
    for (const k of ['ema20', 'ema50', 'ema200']) close(s[k], e[k], 0.01);
    for (const k of ['lower', 'middle', 'upper', 'percent_b']) close(s.bollinger[k], e.bollinger[k], 0.01);
    close(s.atr14, e.atr14, 0.02);
    close(s.pct_vs_ema200, e.pct_vs_ema200, 0.05);
    expect(s.high_in_window).toBe(e.high_in_window);
    expect(s.low_in_window).toBe(e.low_in_window);
    expect(s.signals.length).toBe(e.signals.length);
  });
  it('RSI en extremos', () => {
    const up = Array.from({ length: 60 }, (_, i) => i + 1);
    expect(rsi(up)[59]).toBe(100);
    expect(rsi(new Array(60).fill(10))[59]).toBe(50);
    expect(rsi(up.slice().reverse())[59]!).toBeLessThan(1);
  });
  it('no inventa EMA200 con pocos datos', () => {
    const s = snapshot(fixture.bars.slice(0, 30)) as any;
    expect(s.ema200).toBeNull();
    expect(s.pct_vs_ema200).toBeNull();
  });
});

// ------------------------------------------------------------------ calculadora
describe('calculadora', () => {
  it('evalúa con precedencia correcta', () => {
    expect(evaluate('(187.32 / 150 - 1) * 100')).toBeCloseTo(24.88, 6);
    expect(evaluate('-2 ** 2')).toBe(-4);
    expect(evaluate('2 ** 3 ** 2')).toBe(512);
    expect(evaluate('max(1, 5, 3) + round(2.5) + abs(-1)')).toBe(8);
    expect(evaluate('-7 % 3')).toBe(2);
  });
  it('rechaza expresiones peligrosas o inválidas', () => {
    for (const bad of ["__import__('os')", 'alert(1)', '9**9**9', '1/0', '1 +', '2 $ 3', 'constructor']) {
      expect(() => evaluate(bad), bad).toThrow();
    }
  });
});

// ------------------------------------------------------------------ verificador
const POOL = [{ ok: true, data: { price: 187.32, pe: { value: 28.4 }, cap: 2950000000000, frac: 0.125, ema200: 170.55 } }];
describe('verificador numérico', () => {
  it.each([
    'El precio es 187.32 y el P/E 28.4.',
    'El precio es 187,32 USD.',
    'Market cap de 2.95T.',
    'Rentabilidad de 12.5%.',
    'Al 7 de octubre de 2026 cotizaba a 187.3.',
    'La EMA 200 está en 170.55 y el S&P 500 no importa. MACD (12,26,9).',
  ])('acepta cifras trazables: %s', (a) => expect(verifyAnswer(a, POOL).ok).toBe(true));
  it('detecta cifras inventadas', () => {
    const v = verifyAnswer('El P/E es 35.7 y el precio 187.32.', POOL);
    expect(v.ok).toBe(false);
    expect(v.unverified.map((u) => u.text)).toEqual(['35.7']);
  });
  it('acepta números puestos por el usuario', () => {
    expect(verifyAnswer('Filtré P/E menor a 12.', [], 'acciones con P/E menor a 12').ok).toBe(true);
  });
  it('interpreta separadores ambiguos', () => {
    expect(parseToken('1.234')).toEqual([[1234, 0], [1.234, 3]]);
    expect(parseToken('1.234,56')).toEqual([[1234.56, 2]]);
    expect(parseToken('1,234.56')).toEqual([[1234.56, 2]]);
  });
});

// ------------------------------------------------------------------ Yahoo + herramientas (HTTP simulado)
const N = 300;
const T0 = Date.UTC(2025, 7, 1) / 1000;
const closes = Array.from({ length: N }, (_, i) => 100 + i * 0.1 + Math.sin(i / 5) * 2);
const lastTs = T0 + (N - 1) * 86400;
const chartJson = (currency = 'USD') => ({
  chart: { error: null, result: [{
    meta: { currency, regularMarketTime: lastTs, exchangeName: 'NMS' },
    timestamp: Array.from({ length: N }, (_, i) => T0 + i * 86400),
    indicators: {
      quote: [{ open: closes, high: closes.map((c) => c + 1), low: closes.map((c) => c - 1), close: closes, volume: closes.map(() => 1e6) }],
      adjclose: [{ adjclose: closes }],
    },
  }] },
});
const summary = (info: Record<string, Record<string, unknown>>) => ({ quoteSummary: { error: null, result: [info] } });
const SUMMARIES: Record<string, any> = {
  AAA: summary({
    financialData: { currentPrice: 100, targetMeanPrice: 120, freeCashflow: 2e8, returnOnEquity: 0.2, debtToEquity: 50 },
    quoteType: { longName: 'Alfa SA', exchange: 'NYQ', quoteType: 'EQUITY' },
    defaultKeyStatistics: { trailingEps: 10, forwardEps: 8, mostRecentQuarter: 1759190400 },
    assetProfile: { sector: 'Utilities' },
    summaryDetail: { currency: 'USD', dividendRate: 3, marketCap: 5e9, payoutRatio: 0.3, beta: 0.8 },
  }),
  BBB: summary({
    financialData: { currentPrice: 50, returnOnEquity: 0.05, debtToEquity: 250 },
    quoteType: { longName: 'Beta SA', exchange: 'NMS', quoteType: 'EQUITY' },
    defaultKeyStatistics: { trailingEps: -1 },
    assetProfile: { sector: 'Tech' },
    summaryDetail: { currency: 'USD', marketCap: 1e9 },
  }),
};
const series = (kind: string, key: string, vals: number[]) => ({
  meta: { symbol: ['AAA'], type: [kind + key] }, timestamp: [1, 2],
  [kind + key]: vals.map((v, i) => ({ asOfDate: i === 0 ? '2025-12-31' : '2024-12-31', reportedValue: { raw: v } })),
});

interface Seen { url: string; headers: Record<string, string> }
let seen: Seen[] = [];
const yahooRouter = (req: HttpRequest): HttpResult | undefined => {
  const u = req.url;
  const ok = (body: unknown, headers: Record<string, string> = {}): HttpResult => ({ status: 200, headers, text: typeof body === 'string' ? body : JSON.stringify(body) });
  if (u.includes('fc.yahoo.com')) {
    return { status: 404, text: '', headers: { 'set-cookie': 'A3=d=AQABBxyz&S=AQAAA; Expires=Wed, 21 Oct 2027 07:28:00 GMT; Domain=.yahoo.com; Path=/; SameSite=None; Secure; HttpOnly' } };
  }
  if (u.includes('getcrumb')) return ok('abc123');
  if (u.includes('/v8/finance/chart/')) return ok(chartJson());
  if (u.includes('/v10/finance/quoteSummary/')) {
    const sym = decodeURIComponent(u.split('/quoteSummary/')[1].split('?')[0]);
    if (SUMMARIES[sym]) return ok(SUMMARIES[sym]);
    return { status: 404, headers: {}, text: JSON.stringify({ quoteSummary: { result: null, error: { code: 'Not Found', description: `Quote not found for ticker symbol: ${sym}` } } }) };
  }
  if (u.includes('/timeseries/')) {
    return ok({ timeseries: { result: [
      series('annual', 'TotalRevenue', [1000, 900]), series('annual', 'NetIncome', [100, 80]),
      series('annual', 'FreeCashFlow', [120, 90]), series('annual', 'TotalDebt', [300, 310]),
    ] } });
  }
  if (u.includes('/screener/predefined/saved')) {
    return ok({ finance: { result: [{ quotes: [
      { symbol: 'SMCI', shortName: 'Super Micro', regularMarketPrice: 52.4, regularMarketChangePercent: 15.8, regularMarketVolume: 1e7, marketCap: 3e10, currency: 'USD' },
      { symbol: 'PLTR', shortName: 'Palantir', regularMarketPrice: 63.7, regularMarketChangePercent: 13.6, regularMarketVolume: 2e7, marketCap: 1.4e11, currency: 'USD' }] }] } });
  }
  if (u.includes('dolarapi.com')) {
    return ok([{ casa: 'oficial', nombre: 'Oficial', compra: 1480, venta: 1530, fechaActualizacion: '2026-10-15T18:00:00.000Z' },
      { casa: 'blue', nombre: 'Blue', compra: 1525, venta: 1545, fechaActualizacion: '2026-10-15T20:57:00.000Z' },
      { casa: 'contadoconliqui', nombre: 'Contado con liquidación', compra: 1615.5, venta: 1616, fechaActualizacion: '2026-10-15T20:57:00.000Z' }]);
  }
  if (u.includes('riesgo-pais/ultimo')) return ok({ valor: 622, fecha: '2026-10-15' });
  if (u.includes('/indices/inflacionInteranual')) return ok([{ fecha: '2026-08-31', valor: 32.4 }, { fecha: '2026-09-30', valor: 31.8 }]);
  if (u.includes('/indices/inflacion')) return ok([{ fecha: '2026-08-31', valor: 2.1 }, { fecha: '2026-09-30', valor: 1.9 }]);
  if (u.includes('alternative.me')) return ok({ data: [{ value: '34', value_classification: 'Fear', timestamp: '1760500000' }] });
  if (u.includes('news.google.com')) {
    return ok(`<?xml version="1.0"?><rss><channel><item><title>El Merval sube fuerte &amp; los bonos acompañan - Ámbito</title><link>https://x/1</link><pubDate>Thu, 15 Oct 2026 18:00:00 GMT</pubDate><source url="https://ambito.com">Ámbito</source></item><item><title><![CDATA[Dólar hoy: cómo cotiza el blue - Infobae]]></title><link>https://x/2</link><pubDate>Thu, 15 Oct 2026 15:00:00 GMT</pubDate><source url="https://infobae.com">Infobae</source></item><item><title>El Merval sube fuerte &amp; los bonos acompañan - Ámbito</title><link>https://x/3</link><pubDate>Thu, 15 Oct 2026 14:00:00 GMT</pubDate><source url="https://ambito.com">Ámbito</source></item></channel></rss>`, {});
  }
  if (u.includes('/v1/finance/search')) {
    return ok({ quotes: [{ symbol: 'AAA', longname: 'Alfa SA', exchDisp: 'NYSE', quoteType: 'EQUITY' }],
      news: [{ title: 'Nueva noticia', publisher: 'Reuters', link: 'https://x/1', providerPublishTime: 1759752000 }, { publisher: 'sin título' }] });
  }
  return undefined;
};
const installYahoo = () => setHttp(async (req) => {
  seen.push({ url: req.url, headers: req.headers ?? {} });
  const r = yahooRouter(req);
  if (!r) throw new Error('URL no simulada: ' + req.url);
  return r;
});
beforeEach(() => { seen = []; clearCache(); Y.resetSession(); installYahoo(); });

describe('Yahoo', () => {
  it('extrae cookies de Set-Cookie sin confundir atributos', () => {
    expect(Y.extractCookies('A3=d=AQAB&S=AQAA; Expires=Wed, 21 Oct 2027 07:28:00 GMT; Domain=.yahoo.com; Path=/; Secure, A1=xyz; Path=/'))
      .toBe('A3=d=AQAB&S=AQAA; A1=xyz');
    expect(Y.extractCookies(undefined)).toBe('');
  });
  it('usa cookie + crumb en fundamentales', async () => {
    const r = await callTool('get_fundamentals', { ticker: 'aaa' });
    expect(r.ok).toBe(true);
    const crumbReq = seen.find((s) => s.url.includes('getcrumb'))!;
    expect(crumbReq.headers.Cookie).toContain('A3=d=AQABBxyz&S=AQAAA');
    const sumReq = seen.find((s) => s.url.includes('quoteSummary'))!;
    expect(sumReq.url).toContain('crumb=abc123');
    expect(sumReq.url).toContain('formatted=false');
    expect(sumReq.headers.Cookie).toContain('A3=');
  });
  it('reintenta con sesión nueva ante 401', async () => {
    let first = true;
    setHttp(async (req) => {
      seen.push({ url: req.url, headers: req.headers ?? {} });
      if (req.url.includes('quoteSummary') && first) { first = false; return { status: 401, headers: {}, text: '{}' }; }
      const r = yahooRouter(req);
      if (!r) throw new Error('no simulada');
      return r;
    });
    expect((await callTool('get_fundamentals', { ticker: 'AAA' })).ok).toBe(true);
    expect(seen.filter((s) => s.url.includes('getcrumb')).length).toBe(2);
  });
});

describe('herramientas', () => {
  it('get_quote', async () => {
    const r = await callTool('get_quote', { ticker: 'AAA' });
    expect(r.ok).toBe(true);
    expect(r.data.price).toBeCloseTo(closes[N - 1], 3);
    expect(r.data.currency).toBe('USD');
    expect(r.meta.as_of).toBe(new Date(lastTs * 1000).toISOString().replace(/\.\d+Z$/, 'Z'));
    expect(r.data.change_pct).toBeCloseTo((closes[N - 1] / closes[N - 2] - 1) * 100, 2);
    expect(seen.some((s) => s.url.includes('getcrumb'))).toBe(false); // chart no necesita crumb
  });
  it('get_fundamentals: fórmulas y unidades', async () => {
    const m = (await callTool('get_fundamentals', { ticker: 'AAA' })).data.metrics;
    expect(m.pe_ttm.value).toBe(10);
    expect(m.pe_ttm.basis).toContain('TTM');
    expect(m.pe_forward.value).toBe(12.5);
    expect(m.dividend_yield_pct.value).toBe(3);
    expect(m.debt_to_equity_ratio.value).toBe(0.5);
    expect(m.roe_pct.value).toBe(20);
    expect(m.payout_ratio_pct.value).toBe(30);
    expect(m.fcf_yield_pct.value).toBe(4);
  });
  it('P/E no aplica con EPS negativo', async () => {
    const r = await callTool('get_fundamentals', { ticker: 'BBB' });
    expect(r.data.metrics.pe_ttm).toBeUndefined();
    expect(r.meta.notes.some((n: string) => n.includes('P/E TTM no aplica'))).toBe(true);
  });
  it('ticker inexistente devuelve el motivo como dato', async () => {
    const r = await callTool('get_fundamentals', { ticker: 'ZZZ' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Quote not found');
  });
  it('get_financials alinea por fecha', async () => {
    const p = (await callTool('get_financials', { ticker: 'AAA' })).data.periods;
    expect(p[0]).toMatchObject({ period_end: '2025-12-31', revenue: 1000, free_cash_flow: 120, net_income: 100 });
    expect(p[1]).toMatchObject({ period_end: '2024-12-31', total_debt: 310 });
  });
  it('get_technicals', async () => {
    const r = await callTool('get_technicals', { ticker: 'AAA' });
    expect(r.ok).toBe(true);
    expect(r.data.ema200).not.toBeNull();
    expect((await callTool('get_technicals', { ticker: 'AAA', period: 'xx' })).ok).toBe(false);
  });
  it('get_news y search_ticker', async () => {
    const n = await callTool('get_news', { ticker: 'AAA' });
    expect(n.data.articles).toHaveLength(1);
    expect(n.data.articles[0]).toMatchObject({ title: 'Nueva noticia', publisher: 'Reuters' });
    const s = await callTool('search_ticker', { query: 'Alfa' });
    expect(s.data.candidates[0]).toMatchObject({ symbol: 'AAA', name: 'Alfa SA', exchange: 'NYSE' });
  });
  it('screener explica exclusiones', async () => {
    const r = await callTool('screen_assets', { tickers: ['AAA', 'BBB', 'ZZZ'], max_pe: 12, min_dividend_yield_pct: 2 });
    const d = r.data;
    expect(d.passed.map((p: any) => p.ticker)).toEqual(['AAA']);
    const ex = Object.fromEntries(d.excluded.map((e: any) => [e.ticker, e.reasons]));
    expect(ex.BBB.some((x: string) => x.includes('dato faltante: pe_ttm'))).toBe(true);
    expect(ex.ZZZ[0]).toContain('error de datos');
    expect((await callTool('screen_assets', { tickers: ['AAA'] })).ok).toBe(false);
    expect((await callTool('screen_assets', { universe: 'nada', max_pe: 10 })).ok).toBe(false);
  });
  it('compare_assets', async () => {
    const r = await callTool('compare_assets', { tickers: ['AAA', 'BBB'] });
    expect(r.data.rows.AAA.pe_ttm).toBe(10);
    expect(r.data.rows.BBB.pe_ttm).toBeUndefined();
    expect((await callTool('compare_assets', { tickers: ['AAA'] })).ok).toBe(false);
  });
  it('calculate y herramienta desconocida', async () => {
    expect((await callTool('calculate', { expression: '(187.32/150-1)*100' })).result).toBeCloseTo(24.88, 5);
    expect((await callTool('calculate', { expression: "__import__('os')" })).ok).toBe(false);
    expect((await callTool('nope', {})).ok).toBe(false);
  });
  it('cachea fundamentales', async () => {
    await callTool('get_fundamentals', { ticker: 'AAA' });
    const n = seen.length;
    await callTool('get_fundamentals', { ticker: 'AAA' });
    expect(seen.length).toBe(n);
  });
});

