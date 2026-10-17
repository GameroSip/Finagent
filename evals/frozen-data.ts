// Mercado CONGELADO para evaluar al modelo: determinista (reloj fijo, sin azar) y con valores DISTINTOS de la realidad a propósito.
// Si el modelo contesta de memoria ("el P/E de Apple es 28") en vez de usar las herramientas ("33.0"), se nota.
import type { HttpRequest, HttpResult } from '../src/http';
import { UNIVERSES } from '../src/universes';

export const NOW = Date.UTC(2026, 9, 16, 20, 0, 0) / 1000; // 16-oct-2026 20:00 UTC

const PRICE: Record<string, number> = {
  AAPL: 343.46, NVDA: 187.69, MSFT: 512.3, KO: 71.4, PEP: 148.2, MELI: 2210.5, GGAL: 61.4, YPF: 38.9, 'BTC-USD': 104500,
  'AAPL.BA': 20150, 'MSFT.BA': 29800, 'YPFD.BA': 52400, 'GGAL.BA': 6120,
  '^GSPC': 6890.2, '^IXIC': 23410.5, '^DJI': 46780.1, '^MERV': 2154300, '^VIX': 15.8, 'GC=F': 4120.3, 'CL=F': 61.2,
};
const NAME: Record<string, string> = {
  AAPL: 'Apple Inc.', NVDA: 'NVIDIA Corporation', MSFT: 'Microsoft Corporation', KO: 'The Coca-Cola Company', PEP: 'PepsiCo, Inc.',
  MELI: 'MercadoLibre, Inc.', GGAL: 'Grupo Financiero Galicia S.A.', YPF: 'YPF Sociedad Anónima', 'BTC-USD': 'Bitcoin USD',
  'AAPL.BA': 'Apple Inc. (CEDEAR)', 'MSFT.BA': 'Microsoft (CEDEAR)', 'YPFD.BA': 'YPF S.A. (BYMA)', '^GSPC': 'S&P 500', '^IXIC': 'NASDAQ Composite', '^MERV': 'S&P Merval',
};
/** P/E, dividendo (por acción), ROE, deuda/patrimonio (%) y objetivo de analistas: valores propios de este mercado de mentira. */
const FUND: Record<string, { pe: number; fpe: number; div: number; roe: number; de: number; target: number }> = {
  AAPL: { pe: 33.0, fpe: 29.0, div: 1.04, roe: 1.51, de: 154.5, target: 385 }, NVDA: { pe: 41.7, fpe: 31.2, div: 0.04, roe: 1.05, de: 12.4, target: 215 },
  MSFT: { pe: 36.1, fpe: 31.5, div: 3.4, roe: 0.33, de: 33.2, target: 590 }, KO: { pe: 24.5, fpe: 22.1, div: 2.04, roe: 0.42, de: 150, target: 78 },
  PEP: { pe: 19.2, fpe: 17.8, div: 5.4, roe: 0.55, de: 220, target: 160 },
};
const CEDEARS = new Set(['AAPL.BA', 'MSFT.BA']);

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const rng = (seed: number) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

export const KNOWN = new Set<string>([...Object.keys(PRICE), ...Object.values(UNIVERSES).flat()]);
export const isKnown = (sym: string) => KNOWN.has(sym.toUpperCase());
const priceOf = (sym: string) => PRICE[sym] ?? 20 + (hash(sym) % 380);
const currencyOf = (sym: string) => (sym.endsWith('.BA') ? 'ARS' : 'USD');

function series(sym: string, n: number, step: number) {
  const r = rng(hash(sym) + n), vol = sym.startsWith('^') ? 0.007 : 0.015;
  const closes: number[] = []; let p = priceOf(sym);
  for (let i = 0; i < n; i++) { closes.unshift(p); p = p / (1 + 0.0006 + (r() - 0.5) * vol * 2); }
  const ts = closes.map((_, i) => NOW - (n - 1 - i) * step);
  const open = closes.map((c, i) => (i ? closes[i - 1] : c * 0.998));
  return { ts, open, close: closes, high: closes.map((c, i) => Math.max(c, open[i]) * (1 + r() * 0.006)), low: closes.map((c, i) => Math.min(c, open[i]) * (1 - r() * 0.006)), volume: closes.map(() => Math.round(1e6 + r() * 5e6)) };
}
const INTRADAY: Record<string, [number, number]> = { '1d|5m': [78, 300], '5d|30m': [65, 1800] };
const DAILY: Record<string, number> = { '5d': 5, '1mo': 22, '3mo': 64, '6mo': 126, '1y': 252, '2y': 504, '5y': 1260 };
type Series = ReturnType<typeof series>;
// UNA sola historia diaria por activo; cada rango es un tramo de la misma (como en la realidad: el año es el final de los 2 años).
// Antes cada rango generaba una trayectoria distinta y los indicadores (RSI, EMA) variaban según el período que eligiera el modelo.
const masters = new Map<string, Series>();
const master = (sym: string) => { let m = masters.get(sym); if (!m) { m = series(sym, 1260, 86400); masters.set(sym, m); } return m; };
const tail = (s: Series, n: number): Series => ({ ts: s.ts.slice(-n), open: s.open.slice(-n), close: s.close.slice(-n), high: s.high.slice(-n), low: s.low.slice(-n), volume: s.volume.slice(-n) });
const weekly = (s: Series): Series => { const keep = (_: unknown, i: number) => (s.close.length - 1 - i) % 5 === 0; return { ts: s.ts.filter(keep), open: s.open.filter(keep), close: s.close.filter(keep), high: s.high.filter(keep), low: s.low.filter(keep), volume: s.volume.filter(keep) }; };

function chart(sym: string, range: string, interval: string) {
  const key = `${range}|${interval}`;
  const s = key === '5y|1wk' ? weekly(master(sym)) : interval === '1d' && DAILY[range] ? tail(master(sym), DAILY[range])
    : series(sym, ...(INTRADAY[key] ?? [126, 86400]));
  const year = tail(master(sym), 252).close, last = s.close.at(-1)!, prev = s.close.at(-2) ?? last;
  return { chart: { error: null, result: [{ meta: { currency: currencyOf(sym), symbol: sym, shortName: NAME[sym] ?? sym, longName: NAME[sym] ?? sym, exchangeName: 'NMS', fullExchangeName: 'NasdaqGS',
    regularMarketTime: NOW, regularMarketPrice: last, chartPreviousClose: prev, previousClose: prev, fiftyTwoWeekHigh: Math.max(...year), fiftyTwoWeekLow: Math.min(...year), regularMarketVolume: 48_200_000 },
    timestamp: s.ts, indicators: { quote: [{ open: s.open, high: s.high, low: s.low, close: s.close, volume: s.volume }], adjclose: [{ adjclose: s.close }] } }] } };
}

function summary(sym: string) {
  const px = priceOf(sym);
  if (sym === 'BTC-USD') return { quoteSummary: { error: null, result: [{ quoteType: { longName: 'Bitcoin USD', quoteType: 'CRYPTOCURRENCY' } }] } }; // las cripto no tienen fundamentales
  const h = hash(sym);
  const f = FUND[sym.replace('.BA', '')] ?? { pe: 6 + (h % 30), fpe: 5 + (h % 25), div: px * ((h % 6) / 100), roe: (h % 35) / 100, de: 20 + (h % 200), target: px * 1.1 };
  const cedear = CEDEARS.has(sym), cur = currencyOf(sym), fin = cedear ? 'USD' : cur;
  return { quoteSummary: { error: null, result: [{
    financialData: { currentPrice: px, targetMeanPrice: f.target * (cedear ? px / priceOf(sym.replace('.BA', '')) : 1), numberOfAnalystOpinions: 38, freeCashflow: px * 1e8, returnOnEquity: f.roe, debtToEquity: f.de, profitMargins: 0.24, operatingMargins: 0.31, revenueGrowth: 0.08, financialCurrency: fin },
    quoteType: { longName: NAME[sym] ?? sym, exchange: 'NMS', quoteType: 'EQUITY' },
    defaultKeyStatistics: { trailingEps: Number((px / f.pe).toFixed(4)), forwardEps: Number((px / f.fpe).toFixed(4)), priceToBook: 12.4, enterpriseToEbitda: 18.1, beta: 1.09, mostRecentQuarter: 1782777600 /* 30-jun-2026 */ },
    assetProfile: { sector: 'Technology', industry: 'Consumer Electronics', country: sym.endsWith('.BA') ? 'Argentina' : 'United States' },
    summaryDetail: { currency: cur, dividendRate: f.div, marketCap: px * 1.4e10, payoutRatio: 0.16, trailingPE: f.pe, forwardPE: f.fpe },
  }] } };
}

const statements = (types: string[], sym: string) => ({ timeseries: { result: types.map((t) => {
  const base = 1e9 * (1 + (hash(sym + t) % 90));
  return { meta: { symbol: [sym], type: [t] }, timestamp: [1], [t]: [0, 1, 2, 3].map((i) => ({ asOfDate: `${2025 - i}-06-30`, reportedValue: { raw: Math.round(base * (1 - i * 0.08)) } })) };
}) } });

const SEARCH_NAMES: Record<string, string> = { apple: 'AAPL', nvidia: 'NVDA', microsoft: 'MSFT', 'coca-cola': 'KO', coca: 'KO', pepsi: 'PEP', 'mercado libre': 'MELI', mercadolibre: 'MELI', galicia: 'GGAL', ypf: 'YPF', bitcoin: 'BTC-USD' };
function search(q: string) {
  const key = q.toLowerCase().trim();
  const hit = Object.entries(SEARCH_NAMES).find(([k]) => key.includes(k) || (key.length >= 4 && k.includes(key)));
  const sym = hit?.[1] ?? (isKnown(q) ? q.toUpperCase() : null);
  return {
    quotes: sym ? [{ symbol: sym, longname: NAME[sym] ?? sym, exchDisp: 'NASDAQ', quoteType: 'EQUITY' }] : [],
    news: sym ? [{ title: `${sym}: analistas mantienen su visión tras los resultados`, publisher: 'Reuters', link: 'https://example.com/n1', providerPublishTime: NOW - 3600 }] : [],
  };
}
const movers = (kind: string) => ({ finance: { result: [{ quotes: ['SMCI', 'PLTR', 'RIVN', 'SOFI', 'HOOD'].map((s, i) => ({ symbol: s, shortName: `${s} Inc`, regularMarketPrice: 20 + i * 7.3, regularMarketChangePercent: (kind === 'day_losers' ? -1 : 1) * (4 + i * 1.7), regularMarketVolume: 3e7, marketCap: 5e9, currency: 'USD' })) }] } });
const dolares = [['oficial', 'Oficial', 1395, 1445], ['blue', 'Blue', 1415, 1435], ['bolsa', 'Bolsa', 1448, 1452], ['contadoconliqui', 'Contado con liquidación', 1462, 1467]]
  .map(([casa, nombre, compra, venta]) => ({ moneda: 'USD', casa, nombre, compra, venta, fechaActualizacion: '2026-10-16T19:30:00.000Z' }));
const rss = `<?xml version="1.0"?><rss><channel>${['El Merval sube y los bonos recortan el riesgo país - Ámbito', 'Wall Street cierra mixto a la espera de datos de inflación - Infobae'].map((t, i) =>
  `<item><title>${t}</title><link>https://news.example.com/${i}</link><source url="x">${t.split(' - ').pop()}</source><pubDate>Fri, 16 Oct 2026 1${5 + i}:00:00 GMT</pubDate></item>`).join('')}</channel></rss>`;

const ok = (body: unknown, headers: Record<string, string> = {}): HttpResult => ({ status: 200, headers, text: typeof body === 'string' ? body : JSON.stringify(body) });
const notFound = (body: unknown): HttpResult => ({ status: 404, headers: {}, text: JSON.stringify(body) });

/** Respuestas de todas las fuentes de datos (todo menos Gemini). */
export function frozenHttp(req: HttpRequest): HttpResult {
  const u = new URL(req.url);
  if (u.host === 'fc.yahoo.com') return { status: 404, headers: { 'set-cookie': 'A3=d=AQABfake&S=AQAAfake; Path=/' }, text: '' };
  if (u.pathname.includes('getcrumb')) return ok('crumbfake');
  if (u.host.endsWith('finance.yahoo.com')) {
    const sym = decodeURIComponent(u.pathname.split('/').pop() ?? '').toUpperCase();
    if (u.pathname.includes('/v8/finance/chart/')) return isKnown(sym) ? ok(chart(sym, u.searchParams.get('range') ?? '1y', u.searchParams.get('interval') ?? '1d'))
      : notFound({ chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } });
    if (u.pathname.includes('/quoteSummary/')) return isKnown(sym) ? ok(summary(sym))
      : notFound({ quoteSummary: { result: null, error: { code: 'Not Found', description: `Quote not found for ticker symbol: ${sym}` } } });
    if (u.pathname.includes('/v1/finance/search')) return ok(search(u.searchParams.get('q') ?? ''));
    if (u.pathname.includes('screener')) return ok(movers(u.searchParams.get('scrIds') ?? ''));
    if (u.pathname.includes('timeseries')) return ok(statements((u.searchParams.get('type') ?? '').split(',').filter(Boolean), sym));
  }
  if (u.host === 'dolarapi.com') return ok(dolares);
  if (u.host === 'api.argentinadatos.com') {
    if (u.pathname.includes('riesgo-pais')) return ok({ fecha: '2026-10-16', valor: 612 });
    if (u.pathname.includes('inflacionInteranual')) return ok([{ fecha: '2026-08-31', valor: 31.2 }, { fecha: '2026-09-30', valor: 29.8 }]);
    return ok([{ fecha: '2026-08-31', valor: 2.1 }, { fecha: '2026-09-30', valor: 1.9 }]);
  }
  if (u.host === 'api.alternative.me') return ok({ data: [{ value: '62', value_classification: 'Greed', timestamp: String(NOW) }] });
  if (u.host === 'news.google.com') return ok(rss);
  return { status: 503, headers: {}, text: 'fuente no simulada: ' + u.host };
}
