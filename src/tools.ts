// Herramientas financieras deterministas que el LLM puede invocar (port de la versión Python).
// Reglas: el LLM nunca calcula ni recuerda cifras; cada resultado trae fuente, fecha (as_of) y fórmulas.
import { evaluate } from './calc';
import { fetchDolares, fetchInflacion, fetchRiesgoPais, withBrecha } from './data/argentina';
import { fetchFearGreed, fetchIndices } from './data/market';
import { fetchHeadlines, Region } from './data/news';
import { ema, performance, r, snapshot } from './indicators';
import { UNIVERSES } from './universes';
import { safeUrl } from './url';
import * as Y from './yahoo';

type Args = Record<string, any>;
export type ToolResult = Record<string, any>;

const SOURCE = 'Yahoo Finance (API no oficial, consultada desde el teléfono)';

// ---------------------------------------------------------------- utilidades
const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const iso = (ts: unknown): string | null => {
  if (ts === null || ts === undefined) return null;
  if (typeof ts === 'number' && ts > 1e9) return new Date(ts * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  return String(ts);
};
const sym = (t: unknown): string => {
  const s = String(t ?? '').trim().toUpperCase();
  if (!s) throw new Error('ticker vacío');
  return s;
};
const env = (ticker: string, data: unknown, asOf: unknown = null, notes: string[] = [], ui?: unknown, source = SOURCE) => ({
  ok: true, ticker, data,
  meta: { source, as_of: iso(asOf), fetched_at: nowIso(), notes },
  ...(ui ? { ui } : {}),
});
const safe = <T>(p: Promise<T>): Promise<T | null> => p.then((v) => v, () => null);
const thin = <T>(arr: T[], max: number): T[] => {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => arr[Math.round(i * step)]);
};

// ---------------------------------------------------------------- registro con cache y errores como dato
interface ToolDef { ttl: number; fn: (a: Args) => Promise<ToolResult> }
const cache = new Map<string, { at: number; value: ToolResult }>();
export const clearCache = () => cache.clear();
const defs: Record<string, ToolDef> = {};

export async function callTool(name: string, args: Args = {}): Promise<ToolResult> {
  const def = defs[name];
  if (!def) return { ok: false, error: `herramienta desconocida: ${name}` };
  const key = name + JSON.stringify(args ?? {});
  const hit = cache.get(key);
  if (def.ttl && hit && Date.now() - hit.at < def.ttl * 1000) return hit.value;
  let out: ToolResult;
  try {
    out = JSON.parse(JSON.stringify(await def.fn(args ?? {}))); // NaN -> null, undefined fuera
  } catch (e: any) {
    return { ok: false, tool: name, error: `${e?.name ?? 'Error'}: ${e?.message ?? e}` };
  }
  if (def.ttl && out.ok) {
    if (cache.size >= 200) cache.delete(cache.keys().next().value as string); // acotado: se descarta lo más viejo
    cache.set(key, { at: Date.now(), value: out });
  }
  return out;
}
const tool = (name: string, ttl: number, fn: (a: Args) => Promise<ToolResult>) => { defs[name] = { ttl, fn }; };
export const TOOL_NAMES = () => Object.keys(defs);

// ---------------------------------------------------------------- búsqueda
tool('search_ticker', 3600, async (a) => {
  const query = String(a.query ?? '').trim();
  if (!query) throw new Error('query vacío');
  const { quotes } = await Y.searchSymbols(query, 8, 0);
  const cands = quotes.map((q: any) => ({
    symbol: q.symbol, name: q.longname ?? q.shortname, exchange: q.exchDisp ?? q.exchange, type: q.quoteType,
  }));
  if (!cands.length) throw new Error(`Sin resultados para '${query}'`);
  return env(query, { candidates: cands },
    null, ['Verificá bolsa y moneda: un mismo activo puede tener varios tickers (local, ADR, CEDEAR).']);
});

// ---------------------------------------------------------------- cotización
tool('get_quote', 60, async (a) => {
  const s = sym(a.ticker);
  const ch = await Y.fetchChart(s, '5d', '1d');
  if (!ch.bars.length) throw new Error(`Sin datos de precio para ${s}`);
  const last = ch.bars[ch.bars.length - 1];
  const prev = ch.bars.length > 1 ? ch.bars[ch.bars.length - 2] : null;
  const data = {
    price: r(last.c), currency: ch.meta.currency ?? null, previous_close: prev ? r(prev.c) : null,
    change_pct: prev ? r((last.c / prev.c - 1) * 100, 2) : null, volume: last.v,
    formulas: { change_pct: '(cierre / cierre previo - 1) × 100' },
  };
  return env(s, data, ch.meta.regularMarketTime ?? last.t,
    ['Cotización de la última rueda disponible; puede tener demora (~15 min). Con el mercado abierto la última barra es parcial.']);
});

// ---------------------------------------------------------------- fundamentales
export function metricsFromInfo(info: Args): { metrics: Record<string, any>; notes: string[] } {
  const m: Record<string, any> = {};
  const notes: string[] = [];
  const cur = info.currency ?? info.financialCurrency;
  const price = num(info.currentPrice) || num(info.regularMarketPrice) || num(info.previousClose);
  const epsTtm = num(info.trailingEps), epsFwd = num(info.forwardEps);
  const divRate = num(info.dividendRate), mcap = num(info.marketCap), fcf = num(info.freeCashflow);

  const put = (key: string, value: unknown, basis: string, formula: string, unit?: string, inputs?: Record<string, unknown>) => {
    const v = r(num(value));
    if (v === null) return;
    const e: Record<string, any> = { value: v, basis, formula };
    if (unit) e.unit = unit;
    if (inputs) e.inputs = Object.fromEntries(Object.entries(inputs).map(([k, x]) => [k, r(num(x))]));
    m[key] = e;
  };

  // Si la acción cotiza en una moneda y la empresa reporta en otra (CEDEARs en pesos con balances en dólares, ADRs
  // argentinos), dividir precio por EPS o flujo de caja por market cap mezcla monedas y da cifras absurdas.
  const quoteCur = String(info.currency ?? '').toUpperCase();
  const finCur = String(info.financialCurrency ?? '').toUpperCase();
  const mixed = !!quoteCur && !!finCur && quoteCur !== finCur;

  put('price', price, 'último precio disponible', 'campo Yahoo currentPrice/regularMarketPrice', cur);
  put('market_cap', mcap, 'actual', 'campo Yahoo marketCap', cur);
  if (mixed) {
    notes.push(`La moneda de cotización (${quoteCur}) difiere de la de reporte (${finCur}): no se calculan FCF yield ni dividend yield ` +
      'porque mezclarían monedas; el P/E se toma de Yahoo si lo informa. Los objetivos de analistas pueden estar en otra moneda.');
    const peY = num(info.trailingPE), pfY = num(info.forwardPE);
    if (peY !== null && peY > 0) put('pe_ttm', peY, 'TTM, calculado por Yahoo (monedas de cotización y reporte distintas)', 'campo Yahoo trailingPE');
    if (pfY !== null && pfY > 0) put('pe_forward', pfY, 'forward, calculado por Yahoo (monedas distintas)', 'campo Yahoo forwardPE');
  } else {
    if (price && epsTtm !== null) {
      if (epsTtm > 0) put('pe_ttm', price / epsTtm, 'TTM (últimos 12 meses)', 'precio / EPS TTM', undefined, { price, trailing_eps: epsTtm });
      else notes.push('EPS TTM <= 0: el P/E TTM no aplica');
    }
    if (price && epsFwd !== null) {
      if (epsFwd > 0) put('pe_forward', price / epsFwd, 'forward (estimación de analistas)', 'precio / EPS forward', undefined, { price, forward_eps: epsFwd });
      else notes.push('EPS forward <= 0: el P/E forward no aplica');
    }
  }

  put('price_to_book', info.priceToBook, 'último balance', 'campo Yahoo priceToBook');
  put('ev_ebitda', info.enterpriseToEbitda, 'TTM', 'campo Yahoo enterpriseToEbitda');
  if (!mixed && price && price > 0 && divRate !== null) {
    put('dividend_yield_pct', (divRate / price) * 100, 'dividendo anual indicado / precio actual',
      'dividendo anual por acción / precio × 100', '%', { dividend_rate: divRate, price });
  }
  const pr = num(info.payoutRatio);
  if (pr !== null) put('payout_ratio_pct', pr * 100, 'TTM', 'campo Yahoo payoutRatio × 100', '%');
  const pct: Array<[string, string, string]> = [
    ['roe_pct', 'returnOnEquity', 'TTM'], ['profit_margin_pct', 'profitMargins', 'TTM'],
    ['operating_margin_pct', 'operatingMargins', 'TTM'],
    ['revenue_growth_pct', 'revenueGrowth', 'último trimestre vs mismo trimestre año anterior'],
  ];
  for (const [key, field, basis] of pct) {
    const v = num(info[field]);
    if (v !== null) put(key, v * 100, basis, `campo Yahoo ${field} × 100`, '%');
  }
  const de = num(info.debtToEquity);
  if (de !== null) put('debt_to_equity_ratio', de / 100, 'último balance', 'campo Yahoo debtToEquity (viene en %) / 100', 'x');
  put('free_cashflow', fcf, 'TTM', 'campo Yahoo freeCashflow', finCur || cur);
  if (!mixed && fcf !== null && mcap && mcap > 0) {
    put('fcf_yield_pct', (fcf / mcap) * 100, 'TTM', 'flujo de caja libre / market cap × 100', '%', { free_cashflow: fcf, market_cap: mcap });
  }
  put('beta', info.beta, 'Yahoo (horizonte no especificado)', 'campo Yahoo beta');
  const an: Array<[string, string]> = [['analyst_target_mean', 'targetMeanPrice'], ['analyst_target_high', 'targetHighPrice'],
    ['analyst_target_low', 'targetLowPrice'], ['analyst_count', 'numberOfAnalystOpinions']];
  for (const [key, field] of an) {
    put(key, info[field], 'opinión de analistas (NO es una predicción verificada)', `campo Yahoo ${field}`, field.includes('target') ? cur : undefined);
  }
  return { metrics: m, notes };
}

tool('get_fundamentals', 3600, async (a) => {
  const s = sym(a.ticker);
  const info = await Y.fetchInfo(s);
  const { metrics, notes } = metricsFromInfo(info);
  const data = {
    profile: { name: info.longName ?? info.shortName, sector: info.sector, industry: info.industry, country: info.country,
      currency: info.currency ?? info.financialCurrency, exchange: info.exchange, quote_type: info.quoteType },
    reporting: { most_recent_quarter: iso(info.mostRecentQuarter), last_fiscal_year_end: iso(info.lastFiscalYearEnd) },
    metrics,
  };
  notes.push("Yahoo no informa la hora de los fundamentales; ver 'reporting' para el último período reportado.");
  const pick: Array<[string, string]> = [['pe_ttm', 'P/E (TTM)'], ['pe_forward', 'P/E forward'], ['dividend_yield_pct', 'Dividendo'],
    ['roe_pct', 'ROE'], ['debt_to_equity_ratio', 'Deuda / Patrim.'], ['fcf_yield_pct', 'FCF yield'], ['market_cap', 'Market cap'], ['beta', 'Beta']];
  const ui = {
    kind: 'metrics', symbol: s, name: data.profile.name ?? s, currency: data.profile.currency ?? null,
    items: pick.filter(([k]) => metrics[k]).map(([k, label]) => ({ key: k, label, value: metrics[k].value, unit: metrics[k].unit ?? null, basis: metrics[k].basis })),
  };
  return env(s, data, info.mostRecentQuarter, notes, ui);
});

// ---------------------------------------------------------------- estados contables
tool('get_financials', 3600, async (a) => {
  const s = sym(a.ticker);
  const kind = String(a.period ?? 'annual').toLowerCase().startsWith('q') ? 'quarterly' : 'annual';
  const rows = await Y.fetchStatements(s, kind);
  const periods = Object.entries(rows)
    .sort(([d1], [d2]) => (d1 < d2 ? 1 : -1)).slice(0, 4)
    .map(([d, vals]) => ({ period_end: d, ...vals }));
  if (!periods.length) throw new Error(`Sin estados contables para ${s}`);
  return env(s, { period_type: kind, periods }, periods[0].period_end, [
    'Valores en la moneda de reporte de la empresa (puede diferir de la moneda de cotización).',
    'Los períodos más recientes pueden faltar si la empresa aún no reportó.']);
});

// ---------------------------------------------------------------- técnico
const RANGES = ['1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'];
const INTERVALS = ['1d', '1wk', '1mo'];
tool('get_technicals', 300, async (a) => {
  const s = sym(a.ticker);
  const period = String(a.period ?? '1y'), interval = String(a.interval ?? '1d');
  if (!RANGES.includes(period)) throw new Error(`period inválido. Usá: ${RANGES.join(', ')}`);
  if (!INTERVALS.includes(interval)) throw new Error(`interval inválido. Usá: ${INTERVALS.join(', ')}`);
  const ch = await Y.fetchChart(s, period, interval);
  const bars = Y.adjustBars(ch.bars);
  const snap = snapshot(bars);
  const notes = ['Las señales son descriptivas del pasado reciente, no predicciones.',
    'Con el mercado abierto, la última barra puede ser parcial.'];
  if (snap.bars < 200) notes.push("Menos de 200 barras: EMA200 no disponible. Probá con period='2y'.");
  const closes = bars.map((b) => b.c);
  const keep = Math.min(bars.length, 260);
  const emaFor = (span: number) => (closes.length >= span ? ema(closes, span).slice(-keep).map((v) => r(v, 4)) : null);
  const ui = {
    kind: 'chart', symbol: s, currency: ch.meta.currency ?? null, period, interval,
    bars: bars.slice(-keep).map((b) => ({ t: b.t, o: r(b.o, 4), h: r(b.h, 4), l: r(b.l, 4), c: r(b.c, 4) })),
    ema: { 20: emaFor(20), 50: emaFor(50), 200: emaFor(200) },
  };
  return env(s, { period, interval, ...snap }, bars[bars.length - 1].t, notes, ui);
});

// ---------------------------------------------------------------- rendimiento y riesgo
const HORIZON_ES: Record<string, string> = { '1M': '1 mes', '3M': '3 meses', '6M': '6 meses', '1Y': '1 año', '3Y': '3 años', '5Y': '5 años' };
tool('get_performance', 300, async (a) => {
  const s = sym(a.ticker);
  const ch = await Y.fetchChart(s, '5y', '1d');
  const bars = Y.adjustBars(ch.bars);
  if (bars.length < 30) throw new Error(`Historia insuficiente para ${s}`);
  const p = performance(bars.map((b) => ({ t: b.t, c: b.c })));
  const last = bars[bars.length - 1];
  const items: Array<Record<string, unknown>> = [
    ...Object.entries(p.returns).filter(([, v]) => v !== null).map(([k, v]) => ({ key: `ret_${k}`, label: `Retorno ${HORIZON_ES[k]}`, value: v, unit: '%', signed: true })),
    ...(p.ytd !== null ? [{ key: 'ret_ytd', label: 'Retorno en el año', value: p.ytd, unit: '%', signed: true }] : []),
    ...(p.volatility_1y_pct !== null ? [{ key: 'vol', label: 'Volatilidad anual', value: p.volatility_1y_pct, unit: '%' }] : []),
    { key: 'dd', label: 'Caída máxima 1 año', value: p.max_drawdown_1y_pct, unit: '%' },
  ];
  const notes = ['Precios ajustados por dividendos y splits (retorno total aproximado). Los horizontes sin historia suficiente vienen en null. Rendimientos pasados no garantizan resultados futuros.'];
  if (ch.meta.currency === 'ARS') notes.push('Cotiza en pesos: el rendimiento es nominal en pesos (no descuenta inflación ni la evolución del dólar).');
  return env(s, {
    currency: ch.meta.currency ?? null, ...p,
    formulas: {
      returns: '(último cierre / cierre N días atrás - 1) × 100',
      cagr: '((último cierre / cierre inicial) ^ (365 / días) - 1) × 100',
      volatility_1y_pct: 'desvío estándar de los retornos logarítmicos diarios (252 ruedas) × √252 × 100',
      max_drawdown_1y_pct: 'mínimo de (cierre / máximo previo - 1) × 100 en las últimas 252 ruedas',
    },
  }, last.t, notes, { kind: 'metrics', title: `${s} · rendimiento y riesgo`, symbol: s, name: s, items });
});

// ---------------------------------------------------------------- noticias
tool('get_news', 600, async (a) => {
  const s = sym(a.ticker);
  const limit = Math.max(1, Math.min(Number(a.limit ?? 5) || 5, 10));
  const { news } = await Y.searchSymbols(s, 0, limit);
  const articles = news.filter((n: any) => n?.title).slice(0, limit).map((n: any) => ({
    title: n.title, published: iso(n.providerPublishTime), publisher: n.publisher ?? null, url: safeUrl(n.link),
  }));
  if (!articles.length) throw new Error(`Sin noticias para ${s}`);
  return env(s, { articles }, articles[0].published, ['Las noticias suelen reflejar eventos ya conocidos por el mercado.']);
});

// ---------------------------------------------------------------- comparación
const COMPARE_KEYS = ['pe_ttm', 'pe_forward', 'price_to_book', 'ev_ebitda', 'dividend_yield_pct', 'payout_ratio_pct',
  'roe_pct', 'profit_margin_pct', 'debt_to_equity_ratio', 'fcf_yield_pct', 'revenue_growth_pct'];

tool('compare_assets', 0, async (a) => {
  const syms = (Array.isArray(a.tickers) ? a.tickers : []).map(sym).slice(0, 6);
  if (syms.length < 2) throw new Error('Pasá al menos 2 tickers');
  const rows: Record<string, any> = {};
  const problems: string[] = [];
  const currencies = new Set<string>();
  const lines: Array<{ symbol: string; points: Array<[number, number]> }> = [];
  for (const s of syms) {
    const row: Record<string, any> = {};
    const f = await callTool('get_fundamentals', { ticker: s });
    if (f.ok) {
      const cur = f.data.profile.currency;
      row.currency = cur;
      if (cur) currencies.add(cur);
      for (const k of COMPARE_KEYS) if (k in f.data.metrics) row[k] = f.data.metrics[k].value;
    } else problems.push(`${s} fundamentales: ${f.error}`);
    const t = await callTool('get_technicals', { ticker: s, period: '2y' });
    if (t.ok) {
      row.rsi14 = t.data.rsi14; row.pct_vs_ema200 = t.data.pct_vs_ema200;
      const bars: Array<{ t: number; c: number }> = (t.ui?.bars ?? []).slice(-252);
      if (bars.length > 1) lines.push({ symbol: s, points: thin(bars, 120).map((b) => [b.t, r((b.c / bars[0].c - 1) * 100, 2) ?? 0] as [number, number]) });
    }
    else problems.push(`${s} técnico: ${t.error}`);
    rows[s] = row;
  }
  const notes = ['Bases: P/E TTM = últimos 12 meses; P/E forward = estimación de analistas.', ...problems];
  if (currencies.size > 1) {
    notes.push(`Monedas distintas (${[...currencies].join(', ')}): precios y market caps no son comparables directamente; los ratios sí, con cautela.`);
  }
  return env(syms.join(','), { rows }, null, notes, lines.length > 1 ? { kind: 'compare', lines } : undefined);
});

// ---------------------------------------------------------------- screener
const RULES: Array<[string, string, 'max' | 'min']> = [
  ['max_pe', 'pe_ttm', 'max'], ['min_dividend_yield_pct', 'dividend_yield_pct', 'min'],
  ['max_debt_to_equity', 'debt_to_equity_ratio', 'max'], ['min_roe_pct', 'roe_pct', 'min'],
  ['min_market_cap', 'market_cap', 'min'],
];
const SHOWN = ['price', 'pe_ttm', 'dividend_yield_pct', 'debt_to_equity_ratio', 'roe_pct', 'market_cap'];

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

tool('screen_assets', 0, async (a) => {
  let syms: string[];
  if (a.universe) {
    const key = String(a.universe).toLowerCase().trim();
    if (!UNIVERSES[key]) throw new Error(`Universo desconocido. Disponibles: ${Object.keys(UNIVERSES).join(', ')}`);
    syms = [...UNIVERSES[key]];
  } else if (Array.isArray(a.tickers) && a.tickers.length) syms = a.tickers.map(sym);
  else throw new Error('Indicá `tickers` o `universe`');
  syms = syms.slice(0, 30);
  const filters: Record<string, number> = {};
  for (const [arg] of RULES) if (typeof a[arg] === 'number') filters[arg] = a[arg];
  if (!Object.keys(filters).length) throw new Error('Indicá al menos un filtro');

  const results = await pool(syms, 3, async (s) => {
    try { return { s, m: metricsFromInfo(await Y.fetchInfo(s)).metrics, err: null as string | null }; }
    catch (e: any) { return { s, m: null, err: `${e?.name ?? 'Error'}: ${e?.message ?? e}` }; }
  });

  const passed: any[] = [], excluded: any[] = [];
  for (const { s, m, err } of results) {
    if (err || !m) { excluded.push({ ticker: s, reasons: [`error de datos: ${err}`] }); continue; }
    const reasons: string[] = [];
    for (const [arg, key, kind] of RULES) {
      if (!(arg in filters)) continue;
      const entry = m[key];
      if (!entry) { reasons.push(`dato faltante: ${key}`); continue; }
      const val = entry.value, lim = filters[arg];
      if (kind === 'max' && !(val <= lim)) reasons.push(`${key}=${val} supera el máximo ${lim}`);
      if (kind === 'min' && !(val >= lim)) reasons.push(`${key}=${val} está bajo el mínimo ${lim}`);
    }
    const values = Object.fromEntries(SHOWN.filter((k) => k in m).map((k) => [k, m[k].value]));
    if (reasons.length) excluded.push({ ticker: s, reasons, values });
    else passed.push({ ticker: s, ...values });
  }
  return env(syms.join(','), {
    universe: a.universe ?? 'lista personalizada', evaluated: syms.length, filters_applied: filters, passed, excluded,
  }, null, ['Datos de Yahoo; el market cap está en la moneda de cotización de cada activo.',
    'Un dato faltante excluye al activo (no se asume ningún valor).'],
  { kind: 'screen', universe: a.universe ?? 'lista personalizada', evaluated: syms.length, filters, passed,
    excluded: excluded.map((e: any) => ({ ticker: e.ticker, reasons: e.reasons })) });
});

// ---------------------------------------------------------------- calculadora
tool('calculate', 0, async (a) => {
  const expr = String(a.expression ?? '').trim();
  if (!expr || expr.length > 200) throw new Error('expresión vacía o demasiado larga');
  return { ok: true, expression: expr, result: r(evaluate(expr), 6),
    meta: { source: 'cálculo local determinista', as_of: null, fetched_at: nowIso(), notes: [] } };
});


// ================================================================ contexto de mercado (sin clave)
const SRC_MARKET = 'Yahoo Finance (índices, futuros, cripto) + alternative.me (miedo y codicia)';

tool('get_market_overview', 120, async () => {
  const [indices, gainers, losers, actives, fng] = await Promise.all([
    fetchIndices(), safe(Y.fetchMovers('day_gainers', 5)), safe(Y.fetchMovers('day_losers', 5)),
    safe(Y.fetchMovers('most_actives', 5)), safe(fetchFearGreed()),
  ]);
  const ok = indices.filter((i) => i.price !== null);
  if (!ok.length) throw new Error(indices.find((i) => i.error)?.error ?? 'Sin datos de mercado');
  const mv = (l: Y.Mover[] | null) => l?.map((m) => ({ symbol: m.symbol, name: m.name, price: r(m.price, 2), change_pct: r(m.changePct, 2) })) ?? null;
  const data = {
    indices: ok.map((i) => ({ symbol: i.symbol, name: i.name, price: r(i.price, 2), currency: i.currency,
      change_pct: r(i.changePct, 2), as_of: iso(i.asOf) })),
    movers_us: { gainers: mv(gainers), losers: mv(losers), most_active: mv(actives) },
    crypto_fear_greed: fng ? { value: fng.value, label: fng.labelEs, as_of: iso(fng.ts) } : null,
    formulas: { change_pct: '(último cierre / cierre anterior - 1) × 100' },
  };
  const notes = ['Variación diaria = último cierre vs cierre anterior; durante la rueda, el último valor es parcial.'];
  if (!gainers && !losers && !actives) notes.push('No se pudieron obtener los rankings de ganadores/perdedores.');
  if (!fng) notes.push('No se pudo obtener el índice de miedo y codicia cripto.');
  return env('MERCADO', data, ok[0].asOf, notes, { kind: 'quotes', title: 'Mercados', items: ok }, SRC_MARKET);
});

tool('get_movers', 120, async (a) => {
  const kind = String(a.kind ?? 'day_gainers') as Y.MoverKind;
  if (!Y.MOVER_KINDS.includes(kind)) throw new Error(`kind inválido. Usá: ${Y.MOVER_KINDS.join(', ')}`);
  const list = await Y.fetchMovers(kind, 10);
  const titles = { day_gainers: 'Mayores subas (EE.UU.)', day_losers: 'Mayores bajas (EE.UU.)', most_actives: 'Más operadas (EE.UU.)' };
  return env(kind, { kind, assets: list.map((m) => ({ symbol: m.symbol, name: m.name, price: r(m.price, 2), change_pct: r(m.changePct, 2), market_cap: m.marketCap })) },
    null, ['Ranking intradía del mercado de EE.UU. según Yahoo Finance; incluye empresas de cualquier tamaño (cuidado con las muy chicas).'],
    { kind: 'quotes', title: titles[kind], items: list.map((m) => ({ symbol: m.symbol, name: m.name, price: m.price, currency: m.currency, changePct: m.changePct, spark: [], asOf: null })) });
});

tool('get_argentina_macro', 120, async () => {
  const [dol, rp, inf] = await Promise.all([safe(fetchDolares()), safe(fetchRiesgoPais()), safe(fetchInflacion())]);
  if (!dol && !rp && !inf) throw new Error('No se pudieron obtener los datos de Argentina (DolarAPI / ArgentinaDatos).');
  const rows = dol ? withBrecha(dol) : null;
  const data = {
    dolares: rows?.map((d) => ({ tipo: d.nombre, casa: d.casa, compra: d.compra, venta: d.venta, brecha_vs_oficial_pct: d.brecha_pct, actualizado: d.fecha })) ?? null,
    riesgo_pais: rp ? { puntos_basicos: rp.valor, fecha: rp.fecha } : null,
    inflacion: inf ? { mensual_pct: inf.mensual, interanual_pct: inf.interanual } : null,
    formulas: { brecha_vs_oficial_pct: '(venta / venta oficial - 1) × 100' },
  };
  const notes: string[] = [];
  if (!dol) notes.push('No se pudieron obtener las cotizaciones del dólar.');
  if (!rp) notes.push('No se pudo obtener el riesgo país.');
  if (!inf || (!inf.mensual && !inf.interanual)) notes.push('No se pudo obtener la inflación.');
  const asOf = rows?.map((d) => d.fecha).filter(Boolean).sort().pop() ?? rp?.fecha ?? null;
  return env('ARGENTINA', data, asOf, notes,
    { kind: 'fx', rows: rows ?? [], riesgoPais: rp, inflacion: inf }, 'DolarAPI.com + ArgentinaDatos.com (BCRA/INDEC/mercado)');
});

tool('get_headlines', 600, async (a) => {
  const region: Region = String(a.region ?? 'ar').toLowerCase() === 'us' ? 'us' : 'ar';
  const limit = Math.max(3, Math.min(Number(a.limit ?? 8) || 8, 12));
  const items = await fetchHeadlines(a.topic ? String(a.topic) : undefined, region, limit);
  return env(a.topic ? String(a.topic) : 'MERCADOS',
    { region, articles: items.map((h) => ({ title: h.title, source: h.source, published: h.published, url: h.url })) },
    items[0].published, ['Titulares de medios (Google News). Reflejan la narrativa mediática, no son hechos verificados: contrastalos con los datos.'],
    { kind: 'headlines', items }, 'Google News RSS');
});
