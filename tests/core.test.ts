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


// ------------------------------------------------------------------ markdown, URLs y formato (revisión de bugs)
import { renderMarkdown } from '../src/markdown';
import { safeUrl } from '../src/url';
import { parseRss } from '../src/data/news';
import { timeAgo } from '../src/ui/format';
import { metricsFromInfo } from '../src/tools';

describe('markdown', () => {
  it('escapa HTML y solo permite enlaces http(s)', () => {
    const h = renderMarkdown('<script>alert(1)</script> [ok](https://a.com/x?y=1&z=2) [mal](javascript:alert(1)) **b** `c<d>`');
    expect(h).not.toContain('<script>');
    expect(h).toContain('href="https://a.com/x?y=1&amp;z=2"');
    expect(h).not.toContain('href="javascript');
    expect(h).toContain('[mal](javascript:alert(1))');
    expect(h).toContain('<strong>b</strong>');
    expect(h).toContain('<code>c&lt;d&gt;</code>');
  });
  it('listas anidadas, ordenadas con inicio y continuaciones', () => {
    const h = renderMarkdown('1. Uno\n   - sub a\n   - sub b\n2. Dos\n\n3. Tres\n\n- x\n- y');
    expect(h).toBe('<ol><li>Uno<ul><li>sub a</li><li>sub b</li></ul></li><li>Dos</li><li>Tres</li></ol><ul><li>x</li><li>y</li></ul>');
    expect(renderMarkdown('3. a\n4. b')).toContain('<ol start="3">');
  });
  it('bloques de código, citas, reglas y tablas', () => {
    expect(renderMarkdown('```ts\nconst a = "<x>";\n```')).toContain('<pre class="code"><code>const a = &quot;&lt;x&gt;&quot;;</code></pre>');
    expect(renderMarkdown('> cita\n> dos')).toBe('<blockquote>cita<br>dos</blockquote>');
    expect(renderMarkdown('a\n---\nb')).toContain('<hr>');
    const t = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(t).toContain('<th>a</th>');
    expect(t).toContain('<td>2</td>');
  });
  it('no confunde guiones bajos de identificadores con cursiva', () => {
    expect(renderMarkdown('usa max_pe y min_roe_pct')).toBe('<p>usa max_pe y min_roe_pct</p>');
    expect(renderMarkdown('esto es *importante* y _clave_')).toBe('<p>esto es <em>importante</em> y <em>clave</em></p>');
  });
});

describe('url y noticias', () => {
  it('safeUrl', () => {
    expect(safeUrl('https://x.com/a')).toBe('https://x.com/a');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'intent://x', 'file:///etc/passwd', 'no es url', '']) expect(safeUrl(bad)).toBeNull();
  });
  it('parseRss decodifica entidades sin doble decodificación y filtra enlaces peligrosos', () => {
    const rss = `<rss><channel>
      <item><title>Merval &amp; bonos: &#128512; &#x1F4C8; &amp;lt;no&amp;gt; - Ámbito</title><link>https://n.com/1</link><source url="x">Ámbito</source><pubDate>Fri, 16 Oct 2026 12:00:00 GMT</pubDate></item>
      <item><title><![CDATA[Título con "CDATA" & crudo]]></title><link>https://n.com/2</link></item>
      <item><title>Malicioso</title><link>javascript:alert(1)</link></item></channel></rss>`;
    const items = parseRss(rss);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Merval & bonos: 😀 📈 &lt;no&gt;');
    expect(items[0].source).toBe('Ámbito');
    expect(items[1].title).toBe('Título con "CDATA" & crudo');
  });
});

describe('fechas relativas', () => {
  it('no redondea hacia arriba', () => {
    const now = Date.UTC(2026, 9, 16, 12, 0, 0);
    const ago = (ms: number) => timeAgo(now - ms, now);
    expect(ago(30_000)).toBe('ahora');
    expect(ago(90_000)).toBe('hace 1 min');
    expect(ago(110 * 60_000)).toBe('hace 1 h');
    expect(ago(36 * 3600_000)).toBe('ayer');
    expect(ago(50 * 3600_000)).toBe('hace 2 d');
  });
});

describe('monedas mezcladas (CEDEARs y ADRs)', () => {
  const base = { currentPrice: 20000, trailingEps: 10, forwardEps: 8, dividendRate: 300, marketCap: 5e12, freeCashflow: 2e8,
    returnOnEquity: 0.2, debtToEquity: 50, currency: 'ARS', financialCurrency: 'USD', trailingPE: 27.5, forwardPE: 22.1 };
  it('no mezcla precio en ARS con EPS en USD', () => {
    const { metrics: m, notes } = metricsFromInfo(base);
    expect(m.pe_ttm.value).toBe(27.5);                       // el de Yahoo, no 20000 / 10 = 2000
    expect(m.pe_ttm.basis).toContain('Yahoo');
    expect(m.pe_forward.value).toBe(22.1);
    expect(m.fcf_yield_pct).toBeUndefined();
    expect(m.dividend_yield_pct).toBeUndefined();
    expect(m.free_cashflow.unit).toBe('USD');
    expect(m.roe_pct.value).toBe(20);                        // los ratios puros se conservan
    expect(notes.join(' ')).toContain('ARS');
  });
  it('sin P/E de Yahoo no inventa uno', () => {
    const { metrics: m } = metricsFromInfo({ ...base, trailingPE: undefined, forwardPE: undefined });
    expect(m.pe_ttm).toBeUndefined();
    expect(m.pe_forward).toBeUndefined();
  });
  it('con la misma moneda calcula como siempre', () => {
    const { metrics: m } = metricsFromInfo({ ...base, currency: 'USD', currentPrice: 100, dividendRate: 3, marketCap: 5e9 });
    expect(m.pe_ttm.value).toBe(10);
    expect(m.dividend_yield_pct.value).toBe(3);
    expect(m.fcf_yield_pct.value).toBe(4);
  });
});

// ------------------------------------------------------------------ verificador: posiciones, cantidades descriptivas y redacción
import { redactUnverified, REDACTED } from '../src/verify';
describe('verificador: redacción de cifras sin respaldo', () => {
  const POOL2 = [{ ok: true, data: { price: 187.32, ret: 12.34 } }];
  it('informa la posición exacta de cada cifra', () => {
    const answer = 'El precio es 187.32 y el rendimiento 24.572% (ver 24.572% otra vez).';
    const v = verifyAnswer(answer, POOL2);
    expect(v.unverified.map((u) => answer.slice(u.start, u.end))).toEqual(['24.572%', '24.572%']);
  });
  it('las posiciones se conservan aunque haya fechas en el texto', () => {
    const answer = 'Al 7 de octubre de 2026 (2026-10-16) subió 35.7% y cerró en 187.32.';
    const v = verifyAnswer(answer, POOL2);
    expect(v.unverified).toHaveLength(1);
    expect(answer.slice(v.unverified[0].start, v.unverified[0].end)).toBe('35.7%');
  });
  it('quita solo lo que no tiene respaldo y deja el resto intacto', () => {
    const answer = 'Precio 187.32; rendimiento anual 24.572% y volatilidad 21.512%.';
    const v = verifyAnswer(answer, POOL2);
    const out = redactUnverified(answer, v.unverified);
    expect(out).toBe(`Precio 187.32; rendimiento anual ${REDACTED} y volatilidad ${REDACTED}.`);
    expect(verifyAnswer(out, POOL2).ok).toBe(true);
  });
  it('no marca como dato las cantidades descriptivas (días, semanas, ruedas)', () => {
    const v = verifyAnswer('En los últimos 30 días y las 52 semanas previas, con 200 ruedas de historia; el precio es 187.32.', POOL2);
    expect(v.ok, JSON.stringify(v.unverified)).toBe(true);
  });
  it('pero sí marca cifras de dato aunque sean enteras', () => {
    expect(verifyAnswer('El índice cerró en 5000 puntos y el volumen fue 12000.', POOL2).unverified.map((u) => u.text)).toEqual(['5000', '12000']);
  });
});

// ------------------------------------------------------------------ rendimiento y riesgo (get_performance)
import perfFixture from './fixtures/perf.json';
import { performance as perfCalc } from '../src/indicators';
describe('rendimiento y riesgo', () => {
  it('coincide con el cálculo independiente en Python (retornos, CAGR, volatilidad, caída máxima)', () => {
    const got = perfCalc(perfFixture.bars) as any;
    const exp = perfFixture.expected as any;
    const close = (a: number | null, b: number | null) => (b === null ? expect(a).toBeNull() : expect(Math.abs((a as number) - b)).toBeLessThanOrEqual(0.011));
    for (const k of Object.keys(exp.returns)) close(got.returns[k], exp.returns[k]);
    close(got.ytd, exp.ytd);
    for (const k of Object.keys(exp.cagr)) close(got.cagr[k], exp.cagr[k]);
    close(got.volatility_1y_pct, exp.volatility_1y_pct);
    close(got.max_drawdown_1y_pct, exp.max_drawdown_1y_pct);
  });
  it('los horizontes sin historia quedan en null, no se aproximan', async () => {
    const r = await callTool('get_performance', { ticker: 'AAA' });   // el simulador entrega ~300 días
    expect(r.ok).toBe(true);
    const ret = r.data.returns;
    expect(ret['1M']).not.toBeNull();
    expect(ret['6M']).not.toBeNull();
    expect(ret['1Y']).toBeNull();
    expect(ret['3Y']).toBeNull();
    expect(r.data.volatility_1y_pct).not.toBeNull();
    expect(r.data.max_drawdown_1y_pct).toBeLessThanOrEqual(0);
    expect(r.ui.items.some((i: any) => i.key === 'ret_1Y')).toBe(false);
    expect(r.meta.notes.join(' ')).toContain('ajustados');
  });
  it('lo que devuelve la herramienta es verificable (el modelo puede citarlo sin que se lo quiten)', async () => {
    const r = await callTool('get_performance', { ticker: 'AAA' });
    const v = r.data.returns['6M'];
    expect(verifyAnswer(`En 6 meses rindió ${v}%.`, [r]).ok).toBe(true);
    expect(verifyAnswer(`En 6 meses rindió ${(v + 3.217).toFixed(3)}%.`, [r]).ok).toBe(false);
  });
});

describe('verificador: números con muchos decimales', () => {
  it.each([
    ['Rinde 5.431951%.', '5.431951%'], ['Subió 24.572312%.', '24.572312%'], ['Vale 187.6921.', '187.6921'],
    ['Fue 12.3456 veces.', '12.3456'], ['Cap 1.234.567,89 pesos.', '1.234.567,89'], ['Precio 187.692.', '187.692'],
  ])('lee %s como un solo número', (text, expected) => {
    expect(verifyAnswer(text, []).unverified.map((u) => u.text)).toEqual([expected]); // antes: "5.431", "24.572", "187.692", "12.345"
  });
  it('compara con todos los decimales y respeta el %', () => {
    const pool = [{ result: 5.431951 }];
    expect(verifyAnswer('Potencial de 5.431951%.', pool).ok).toBe(true);
    expect(verifyAnswer('Potencial de 5.43%.', pool).ok).toBe(true);        // redondeado: sigue siendo trazable
    expect(verifyAnswer('Potencial de 5.431999%.', pool).ok).toBe(false);   // más precisión de la que tienen los datos
    expect(verifyAnswer('Potencial de 17.1%.', pool).ok).toBe(false);       // el error real que se vio en WarrenAI
  });
});

describe('verificador: signos (las cifras negativas correctas no deben marcarse)', () => {
  const dd = [{ data: { max_drawdown_1y_pct: -3.21, ret: 5.5 } }];
  it('un "-3.21%" respalda un dato negativo (antes se marcaba como inventado)', () => {
    expect(verifyAnswer('Caída máxima del último año: -3.21%.', dd).ok).toBe(true);
    expect(verifyAnswer('Caída máxima del último año: −3.21% (menos tipográfico).', dd).ok).toBe(true);
    expect(verifyAnswer('Caída máxima del último año: –3,21 %.', dd).ok).toBe(true);
  });
  it('sin signo alcanza la magnitud, porque el sentido lo da la palabra', () => {
    expect(verifyAnswer('Cayó como máximo 3.21% en el año.', dd).ok).toBe(true);
    expect(verifyAnswer('Rindió 5.5%.', dd).ok).toBe(true);
  });
  it('pero un error de signo explícito sí se detecta', () => {
    expect(verifyAnswer('Caída máxima: +3.21%.', dd).ok).toBe(false);
    expect(verifyAnswer('Rendimiento: -5.5%.', dd).ok).toBe(false);
    expect(verifyAnswer('Rendimiento: +5.5%.', dd).ok).toBe(true);
  });
  it('un rango con guion no se confunde con un signo', () => {
    expect(verifyAnswer('Entre 5.5-7%.', [{ a: 5.5, b: 7 }]).ok).toBe(true);
  });
  it('al quitar una cifra negativa sin respaldo se va también el signo', () => {
    const answer = 'Caída máxima: -3.99% en el año.';
    const v = verifyAnswer(answer, dd);
    expect(v.unverified.map((u) => u.text)).toEqual(['-3.99%']);
    expect(redactUnverified(answer, v.unverified)).toBe('Caída máxima: [dato no verificado] en el año.');
  });
});

describe('verificador: la "M" de los horizontes (1M, 3M, 6M) no es "millones"', () => {
  const perfPool = [{ data: { returns: { '1M': 4.2, '3M': 8.61, '6M': 22.87, '1Y': 50.87 } } }];
  it('acepta las etiquetas de período cuando ese número existe en los datos (aunque la cifra se escriba "6M")', () => {
    const answer = 'Rendimiento 6M: 22.87%, 3M: 8.61% y 1M: 4.2%.';
    const v = verifyAnswer(answer, perfPool);
    expect(v.ok, JSON.stringify(v.unverified)).toBe(true);
  });
  it('pero un "7M" inventado igual se marca (ese número no está en los datos)', () => {
    expect(verifyAnswer('Ganó 7M en el año.', perfPool).unverified.map((u) => u.text)).toEqual(['7M']);
  });
  it('los millones de verdad siguen funcionando', () => {
    expect(verifyAnswer('Facturó 3.2M en el trimestre.', [{ rev: 3_200_000 }]).ok).toBe(true);
    expect(verifyAnswer('Facturó 3.2M en el trimestre.', [{ rev: 3_000_000 }]).ok).toBe(false);
    expect(verifyAnswer('El volumen fue 20M.', [{ vol: 20_000_000 }]).ok).toBe(true);
  });
});

describe('verificador: fechas y horas en cualquier formato (falsos positivos que vimos con Gemini real)', () => {
  const sinCifras = (s: string) => verifyAnswer(s, [{ price: 343.46 }]).unverified.map((u) => u.text);
  it.each([
    'al 2026-10-16', 'el 16 de octubre de 2026', '16-10-2026', '16/10/2026', '16.10.2026', 'el 16/10', '16 oct 2026', '16 de oct. de 2026',
    'octubre 16, 2026', 'October 16, 2026', 'Oct 16', '16/oct/2026', '16-oct-2026', 'del 5 may al 9 jun',
    'cierre a las 20:00 UTC', '20:00 UTC', 'a las 20:00', 'a las 20', 'cierre de las 20h', '20 hs', '20:00:05',
  ])('no confunde "%s" con una cifra de dato', (s) => expect(sinCifras(`Precio 343.46 (${s}).`)).toEqual([]));
  it('pero las cifras de verdad se siguen controlando', () => {
    expect(sinCifras('El P/E es 16 y el ROE 20.')).toEqual(['16', '20']);
    expect(sinCifras('El ratio del CEDEAR es 20:1 y también 1:20.')).toEqual(['20', '20']);       // una razón no es una hora: el 20 sigue siendo una cifra a respaldar
    expect(sinCifras('Rindió 16.5% en 20 meses, con 5 may.')).toContain('16.5%');
    expect(sinCifras('Subió 12 puntos y 3.5 veces el promedio.')).toEqual(['12', '3.5']);
    expect(sinCifras('Hay 12 acciones y 3.5 veces el promedio.')).toEqual(['3.5']);               // "12 acciones" es una cantidad descriptiva, no un dato
  });
  it('las posiciones de redacción siguen siendo exactas con fechas en el texto', () => {
    const answer = 'Al 16 oct 2026 a las 20:00 UTC rindió 99.9% (otra cifra: 7.77).';
    const v = verifyAnswer(answer, [{ ok: 99.9 }]);
    expect(v.unverified.map((u) => answer.slice(u.start, u.end))).toEqual(['7.77']);
  });
});

describe('cifras grandes legibles (display)', () => {
  it('las métricas grandes traen una versión corta que el modelo puede copiar y que el verificador acepta', () => {
    const { metrics } = metricsFromInfo({ currentPrice: 343.46, marketCap: 4.80844e12, freeCashflow: 9.8e10, currency: 'USD', financialCurrency: 'USD', trailingEps: 10 });
    expect(metrics.market_cap.display).toBe('4.81T USD');
    expect(metrics.free_cashflow.display).toBe('98.00B USD');
    expect(metrics.pe_ttm.display).toBeUndefined();                                       // las cifras chicas no llevan display
    expect(verifyAnswer('El market cap es 4.81T USD y el flujo de caja 98B.', [{ metrics }]).ok).toBe(true);
  });
  it('el prompt exige responder en el idioma del usuario y no confirmar tickers obvios', async () => {
    const { SYSTEM_PROMPT } = await import('../src/agent');
    expect(SYSTEM_PROMPT).toMatch(/IDIOMA: respondé SIEMPRE en el idioma del último mensaje/);
    expect(SYSTEM_PROMPT).toMatch(/no gastes una consulta en confirmarlo/);
  });
});

describe('verificador: nombres de indicadores y listas de períodos (lo que marcó Gemini real en "¿compro NVDA?")', () => {
  const flagged = (s: string) => verifyAnswer(s, [{ price: 187.69 }]).unverified.map((u) => u.text);
  it.each([
    'EMA 20, 50 y 200', 'EMA 50 y EMA 200', 'SMA(200)', 'medias móviles de 20, 50 y 200', 'media móvil exponencial de 50', 'RSI 14', 'RSI(14)', 'MACD 12/26',
    'las medias de 20, 50 y 200 ruedas', 'de 20, 50 y 200 días',
  ])('"%s" son parámetros, no datos', (s) => expect(flagged(`Precio 187.69 con ${s}.`)).toEqual([]));
  it('pero un valor que se parezca a un parámetro sigue controlado', () => {
    expect(flagged('El RSI 56 indica neutralidad.')).toEqual(['56']);          // "RSI 56" sería un dato, no un parámetro
    expect(flagged('La EMA 77 está arriba.')).toEqual(['77']);                 // 77 no es un período convencional
    expect(flagged('Subió 20 puntos.')).toEqual(['20']);
  });
});
