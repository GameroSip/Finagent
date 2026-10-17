// Acceso a Yahoo Finance (API NO oficial, la misma que usa yfinance; endpoints verificados contra yfinance 1.7).
// - chart, search y noticias: no requieren crumb.
// - quoteSummary y fundamentals-timeseries: requieren cookie + crumb (flujo fc.yahoo.com -> getcrumb).
import { BROWSER_UA, http, HttpResult } from './http';

const Q1 = 'https://query1.finance.yahoo.com';
const Q2 = 'https://query2.finance.yahoo.com';

export class YahooError extends Error {
  constructor(msg: string) { super(msg); this.name = 'YahooError'; }
}

type Params = Record<string, string | number | boolean | undefined>;
const qs = (p: Params) =>
  Object.entries(p).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');

const baseHeaders = (): Record<string, string> => ({
  'User-Agent': BROWSER_UA,
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
});

// ---------------------------------------------------------------- sesión (cookie + crumb)
interface Session { cookie: string; crumb: string; at: number }
let session: Session | null = null;
let sessionPromise: Promise<Session> | null = null;

export function resetSession(): void { session = null; sessionPromise = null; }

/** Extrae pares nombre=valor de una cabecera Set-Cookie (posiblemente varias unidas con coma). */
export function extractCookies(setCookie?: string): string {
  if (!setCookie) return '';
  const attrs = new Set(['expires', 'path', 'domain', 'max-age', 'samesite', 'secure', 'httponly']);
  const found = new Map<string, string>();
  for (const m of setCookie.matchAll(/(?:^|,\s*)([A-Za-z0-9_]+)=([^;,\s]+)/g)) {
    if (!attrs.has(m[1].toLowerCase())) found.set(m[1], m[2]);
  }
  return [...found].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function newSession(): Promise<Session> {
  let cookie = '';
  try {
    const r = await http({ url: 'https://fc.yahoo.com', headers: baseHeaders(), timeoutMs: 15000 });
    cookie = extractCookies(r.headers['set-cookie']);
  } catch { /* no crítico: se intenta igual */ }
  const c = await http({
    url: `${Q1}/v1/test/getcrumb`,
    headers: { ...baseHeaders(), ...(cookie ? { Cookie: cookie } : {}) },
    timeoutMs: 15000,
  });
  const crumb = c.text.trim();
  if (c.status === 429 || /too many/i.test(crumb)) {
    throw new YahooError('Yahoo limitó las solicitudes (429) al pedir la sesión. Esperá unos minutos y reintentá.');
  }
  if (c.status >= 400 || !crumb || crumb.includes('<html')) {
    throw new YahooError(`No se pudo obtener la sesión de Yahoo (HTTP ${c.status}).`);
  }
  return { cookie, crumb, at: Date.now() };
}

async function getSession(force = false): Promise<Session> {
  if (!force && session && Date.now() - session.at < 55 * 60_000) return session;
  if (force) { session = null; sessionPromise = null; }
  if (!sessionPromise) {
    sessionPromise = newSession().then((s) => (session = s)).finally(() => { sessionPromise = null; });
  }
  return sessionPromise;
}

// ---------------------------------------------------------------- requests
function parseJson(r: HttpResult, what: string): any {
  if (r.status === 429) throw new YahooError('Yahoo respondió 429 (demasiadas solicitudes o bloqueo). Reintentá en unos minutos.');
  let j: any;
  try { j = JSON.parse(r.text); } catch { j = undefined; }
  if (r.status >= 400) {
    const desc = j?.quoteSummary?.error?.description ?? j?.chart?.error?.description ?? j?.finance?.error?.description;
    throw new YahooError(desc ? `${desc} (HTTP ${r.status})` : `Yahoo respondió HTTP ${r.status} en ${what}.`);
  }
  if (j === undefined) throw new YahooError(`Yahoo devolvió una respuesta no válida en ${what}.`);
  return j;
}

async function plainJson(base: string, path: string, params: Params, what: string): Promise<any> {
  const r = await http({ url: `${base}${path}?${qs(params)}`, headers: baseHeaders(), timeoutMs: 20000 });
  return parseJson(r, what);
}

async function crumbJson(base: string, path: string, params: Params, what: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await getSession(attempt > 0);
    const r = await http({
      url: `${base}${path}?${qs({ ...params, crumb: s.crumb })}`,
      headers: { ...baseHeaders(), ...(s.cookie ? { Cookie: s.cookie } : {}) },
      timeoutMs: 20000,
    });
    if ((r.status === 401 || r.status === 403) && attempt === 0) { session = null; continue; }
    return parseJson(r, what);
  }
  throw new YahooError(`No se pudo autenticar con Yahoo en ${what}.`);
}

// ---------------------------------------------------------------- chart
export interface Bar { t: number; o: number; h: number; l: number; c: number; v: number; adjc: number | null }
export interface ChartData {
  meta: { currency?: string; exchangeName?: string; instrumentType?: string; regularMarketTime?: number; regularMarketPrice?: number };
  bars: Bar[];
  dividends: Array<{ t: number; amount: number }>;
}

export async function fetchChart(symbol: string, range: string, interval: string): Promise<ChartData> {
  const j = await plainJson(Q2, `/v8/finance/chart/${encodeURIComponent(symbol)}`,
    { range, interval, includePrePost: false, events: 'div,splits' }, `chart de ${symbol}`);
  const res = j?.chart?.result?.[0];
  if (!res) {
    const e = j?.chart?.error;
    throw new YahooError(e ? `${e.code}: ${e.description}` : `Sin datos de precio para ${symbol}`);
  }
  const q = res.indicators?.quote?.[0] ?? {};
  const adj: Array<number | null> | undefined = res.indicators?.adjclose?.[0]?.adjclose;
  const ts: number[] = res.timestamp ?? [];
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const bars: Bar[] = [];
  ts.forEach((t, i) => {
    const c = q.close?.[i], o = q.open?.[i], h = q.high?.[i], l = q.low?.[i];
    if (num(c) && num(o) && num(h) && num(l)) {
      bars.push({ t, o, h, l, c, v: num(q.volume?.[i]) ? q.volume[i] : 0, adjc: num(adj?.[i]) ? (adj as number[])[i] : null });
    }
  });
  const dividends = Object.values(res.events?.dividends ?? {}).map((d: any) => ({ t: d.date, amount: d.amount }));
  return { meta: res.meta ?? {}, bars, dividends };
}

/** Ajusta OHLC por dividendos/splits usando adjclose (equivale a auto_adjust=True de yfinance). */
export function adjustBars(bars: Bar[]): Bar[] {
  return bars.map((b) => {
    if (b.adjc === null || !b.c) return b;
    const f = b.adjc / b.c;
    return { ...b, o: b.o * f, h: b.h * f, l: b.l * f, c: b.adjc };
  });
}

// ---------------------------------------------------------------- fundamentales (info)
const INFO_MODULES = 'financialData,quoteType,defaultKeyStatistics,assetProfile,summaryDetail';

/** Aplana los módulos de quoteSummary en un solo objeto, como hace yfinance en Ticker.info. */
export async function fetchInfo(symbol: string): Promise<Record<string, any>> {
  const j = await crumbJson(Q2, `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`,
    { modules: INFO_MODULES, corsDomain: 'finance.yahoo.com', formatted: false, symbol }, `fundamentales de ${symbol}`);
  const r0 = j?.quoteSummary?.result?.[0];
  if (!r0) {
    const e = j?.quoteSummary?.error;
    throw new YahooError(e ? `${e.code}: ${e.description}` : `Yahoo no devolvió datos fundamentales para ${symbol} (¿ticker incorrecto o sin cobertura?)`);
  }
  const info: Record<string, any> = {};
  for (const [k, v] of Object.entries(r0)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k1, v1] of Object.entries(v as Record<string, any>)) if (v1 !== null && v1 !== undefined) info[k1] = v1;
    } else if (v !== null && v !== undefined) info[k] = v;
  }
  if (Object.keys(info).length < 5) throw new YahooError(`Yahoo no devolvió datos fundamentales para ${symbol} (¿ticker incorrecto o sin cobertura?)`);
  return info;
}

// ---------------------------------------------------------------- estados contables (timeseries)
export const STATEMENT_KEYS: Record<string, string> = {
  TotalRevenue: 'revenue', GrossProfit: 'gross_profit', OperatingIncome: 'operating_income', EBITDA: 'ebitda',
  NetIncome: 'net_income', DilutedEPS: 'eps_diluted', OperatingCashFlow: 'operating_cash_flow',
  CapitalExpenditure: 'capex', FreeCashFlow: 'free_cash_flow', TotalDebt: 'total_debt',
  CashAndCashEquivalents: 'cash', StockholdersEquity: 'equity',
};

/** Devuelve { fecha(YYYY-MM-DD): { nombre_normalizado: valor } }. */
export async function fetchStatements(symbol: string, kind: 'annual' | 'quarterly'): Promise<Record<string, Record<string, number>>> {
  const types = Object.keys(STATEMENT_KEYS).map((k) => kind + k).join(',');
  const j = await crumbJson(Q2, `/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`,
    { symbol, type: types, period1: Math.floor(Date.UTC(2016, 11, 31) / 1000), period2: Math.floor(Date.now() / 1000) + 86400 },
    `estados contables de ${symbol}`);
  const result: any[] = j?.timeseries?.result ?? [];
  if (!result.length) throw new YahooError(`Sin estados contables para ${symbol}`);
  const rows: Record<string, Record<string, number>> = {};
  for (const item of result) {
    const type: string | undefined = item?.meta?.type?.[0];
    if (!type || !type.startsWith(kind)) continue;
    const name = STATEMENT_KEYS[type.slice(kind.length)];
    if (!name) continue;
    for (const e of item[type] ?? []) {
      const raw = e?.reportedValue?.raw;
      if (e?.asOfDate && typeof raw === 'number' && Number.isFinite(raw)) (rows[e.asOfDate] ??= {})[name] = raw;
    }
  }
  return rows;
}

// ---------------------------------------------------------------- búsqueda y noticias
export async function searchSymbols(query: string, quotesCount: number, newsCount: number): Promise<{ quotes: any[]; news: any[] }> {
  const j = await plainJson(Q2, '/v1/finance/search', {
    q: query, quotesCount, newsCount, enableFuzzyQuery: false,
    quotesQueryId: 'tss_match_phrase_query', newsQueryId: 'news_cie_vespa',
  }, `búsqueda de ${query}`);
  return { quotes: j?.quotes ?? [], news: j?.news ?? [] };
}
