// Simuladores de red: Gemini (guionado, usa los números reales que devuelven las herramientas) y las fuentes de datos.
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const PRICE = { AAPL: 343.46, NVDA: 187.69, MSFT: 512.3, MELI: 2210.5, GGAL: 61.4, YPF: 38.9, 'BTC-USD': 104500, '^GSPC': 6890.2, '^IXIC': 23410.5, '^DJI': 46780.1,
  '^MERV': 2154300, '^VIX': 15.8, 'GC=F': 4120.3, 'CL=F': 61.2, KO: 71.4, PEP: 148.2 };
const NAME = { AAPL: 'Apple Inc.', NVDA: 'NVIDIA Corporation', MSFT: 'Microsoft Corporation', MELI: 'MercadoLibre, Inc.', GGAL: 'Grupo Financiero Galicia S.A.', YPF: 'YPF Sociedad Anónima',
  'BTC-USD': 'Bitcoin USD', '^GSPC': 'S&P 500', '^IXIC': 'NASDAQ Composite', '^MERV': 'S&P Merval', KO: 'The Coca-Cola Company', PEP: 'PepsiCo, Inc.' };

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function series(sym, n, stepSec, endTs) {
  const r = rng(hash(sym) + n), end = PRICE[sym] ?? 50 + (hash(sym) % 400);
  const drift = 0.0006, vol = sym.startsWith('^') ? 0.007 : 0.015;
  const closes = []; let p = end;
  for (let i = 0; i < n; i++) { closes.unshift(p); p = p / (1 + drift + (r() - 0.5) * vol * 2); }
  const ts = closes.map((_, i) => endTs - (n - 1 - i) * stepSec);
  const open = closes.map((c, i) => (i ? closes[i - 1] : c * 0.998));
  return { ts, open, close: closes, high: closes.map((c, i) => Math.max(c, open[i]) * (1 + r() * 0.006)), low: closes.map((c, i) => Math.min(c, open[i]) * (1 - r() * 0.006)), volume: closes.map(() => Math.round(1e6 + r() * 5e6)) };
}
const BARS = { '1d|5m': [78, 300], '5d|30m': [65, 1800], '1mo|1d': [22, 86400], '3mo|1d': [64, 86400], '6mo|1d': [126, 86400], '1y|1d': [252, 86400], '2y|1d': [504, 86400], '5y|1d': [1260, 86400], '5y|1wk': [260, 604800], '5d|1d': [5, 86400] };

export function yahooChart(sym, range, interval) {
  const [n, step] = BARS[`${range}|${interval}`] ?? [126, 86400];
  const now = Math.floor(Date.now() / 1000), s = series(sym, n, step, now - 600);
  const last = s.close.at(-1), prev = s.close.at(-2) ?? last;
  const yr = series(sym, 252, 86400, now - 600).close;
  return { chart: { error: null, result: [{ meta: { currency: sym.startsWith('^') ? 'USD' : sym.endsWith('.BA') ? 'ARS' : 'USD', symbol: sym, shortName: NAME[sym] ?? sym, longName: NAME[sym] ?? sym,
    exchangeName: 'NMS', fullExchangeName: 'NasdaqGS', regularMarketTime: now - 600, regularMarketPrice: last, chartPreviousClose: prev, previousClose: prev,
    fiftyTwoWeekHigh: Math.max(...yr), fiftyTwoWeekLow: Math.min(...yr), regularMarketVolume: 48_200_000 },
    timestamp: s.ts, indicators: { quote: [{ open: s.open, high: s.high, low: s.low, close: s.close, volume: s.volume }], adjclose: [{ adjclose: s.close }] } }] } };
}
export function yahooSummary(sym) {
  const px = PRICE[sym] ?? 120;
  return { quoteSummary: { error: null, result: [{
    financialData: { currentPrice: px, targetMeanPrice: px * 1.12, targetHighPrice: px * 1.3, targetLowPrice: px * 0.85, numberOfAnalystOpinions: 38, freeCashflow: 9.8e10, returnOnEquity: 1.51, debtToEquity: 154.5, profitMargins: 0.24, operatingMargins: 0.31, revenueGrowth: 0.08, financialCurrency: 'USD' },
    quoteType: { longName: NAME[sym] ?? sym, exchange: 'NMS', quoteType: 'EQUITY' },
    defaultKeyStatistics: { trailingEps: px / 33, forwardEps: px / 29, priceToBook: 47.2, enterpriseToEbitda: 24.1, beta: 1.09, mostRecentQuarter: 1759190400 },
    assetProfile: { sector: 'Technology', industry: 'Consumer Electronics', country: 'United States' },
    summaryDetail: { currency: 'USD', dividendRate: 1.04, marketCap: px * 1.48e10, payoutRatio: 0.16, trailingPE: 33, forwardPE: 29 } }] } };
}
export const yahooSearch = (q) => ({
  quotes: [{ symbol: q.toUpperCase().slice(0, 5) || 'AAPL', longname: NAME[q.toUpperCase()] ?? `${q} Corp.`, exchDisp: 'NASDAQ', quoteType: 'EQUITY' }, { symbol: 'AAPL', longname: 'Apple Inc.', exchDisp: 'NASDAQ', quoteType: 'EQUITY' }],
  news: [{ title: `${q.toUpperCase() || 'AAPL'} presenta resultados por encima de lo esperado en el trimestre`, publisher: 'Reuters', link: 'https://example.com/n1', providerPublishTime: Math.floor(Date.now() / 1000) - 3600 },
    { title: 'Analistas revisan objetivos tras el anuncio de nuevos productos', publisher: 'Bloomberg', link: 'https://example.com/n2', providerPublishTime: Math.floor(Date.now() / 1000) - 9000 }],
});
export const yahooMovers = (kind) => ({ finance: { result: [{ quotes: ['SMCI', 'PLTR', 'RIVN', 'SOFI', 'HOOD', 'IONQ', 'AFRM'].map((s, i) => ({ symbol: s, shortName: `${s} Inc`, regularMarketPrice: 20 + i * 7.3, regularMarketChangePercent: (kind === 'day_losers' ? -1 : 1) * (4 + i * 1.7), regularMarketVolume: 3e7, marketCap: 5e9, currency: 'USD' })) }] } });
export const dolares = () => [['oficial', 'Oficial', 1395, 1445], ['blue', 'Blue', 1415, 1435], ['bolsa', 'Bolsa', 1448, 1452], ['contadoconliqui', 'Contado con liquidación', 1462, 1467], ['cripto', 'Cripto', 1459, 1461]]
  .map(([casa, nombre, compra, venta]) => ({ moneda: 'USD', casa, nombre, compra, venta, fechaActualizacion: new Date().toISOString() }));
export const rss = () => `<?xml version="1.0"?><rss><channel>${['El Merval sube con fuerza y los bonos recortan el riesgo país - Ámbito', 'Wall Street cierra mixto a la espera de datos de inflación - Infobae', 'Dólar: la brecha se mantiene estable en el cierre de la semana - Clarín', 'Bancos lideran las subas en la bolsa porteña - La Nación']
  .map((t, i) => `<item><title>${t.replace(/&/g, '&amp;')}</title><link>https://news.example.com/${i}</link><source url="x">${t.split(' - ').pop()}</source><pubDate>${new Date(Date.now() - i * 5400_000).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;

// ------------------------------------------------------------------ Gemini simulado
const models = () => ({ models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) });
const text = (t) => ({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] });
const calls = (...fcs) => ({ candidates: [{ content: { role: 'model', parts: fcs.map(([name, args]) => ({ functionCall: { name, args } })) } }] });
const userTexts = (b) => b.contents.filter((c) => c.role === 'user').flatMap((c) => (c.parts ?? []).map((p) => p.text ?? '')).join('\n');
const results = (b) => { const last = b.contents.at(-1); const out = {}; for (const p of last.parts ?? []) if (p.functionResponse) out[p.functionResponse.name] = p.functionResponse.response.result; return out; };
const f = (n, d = 2) => Number(n).toFixed(d);

export function geminiReply(url, body) {
  if (url.includes('/models?')) return models();
  const sys = body.systemInstruction?.parts?.[0]?.text ?? '';
  if (sys.startsWith('Generás títulos')) return text('Análisis técnico de AAPL');
  const q = userTexts(body).toLowerCase();
  const last = body.contents.at(-1), hasResults = (last.parts ?? []).some((p) => p.functionResponse);
  if (q.includes('inventá') && !hasResults) return text('Rinde 24.572% anual con una volatilidad de 21.512% y un ratio de 0.775.');
  if (!hasResults) {
    if (q.includes('técnico')) return calls(['get_technicals', { ticker: 'AAPL', period: '2y' }], ['get_performance', { ticker: 'AAPL' }]);
    if (q.includes('mercado')) return calls(['get_market_overview', {}], ['get_argentina_macro', {}], ['get_headlines', {}]);
    if (q.includes('merval')) return calls(['screen_assets', { universe: 'adrs_argentinos', max_pe: 15 }]);
    return text('Hola, soy tu analista financiero. Preguntame por un activo, el mercado o el dólar y consulto datos reales.');
  }
  const r = results(body);
  if (r.get_technicals) {
    const t = r.get_technicals.data, p = r.get_performance?.data;
    return text(`## Estado técnico de AAPL\n\n**Hechos** (Yahoo Finance, al ${String(r.get_technicals.meta.as_of).slice(0, 10)}):\n\n- Precio: ${f(t.price)} USD\n- RSI de 14 períodos: ${f(t.rsi14, 1)}\n- EMA 200: ${f(t.ema200)} (el precio está ${f(t.pct_vs_ema200)}% respecto de la media)\n` +
      (p ? `- Rendimiento a 1 mes: ${f(p.returns['1M'])}%\n- Rendimiento a 6 meses: ${f(p.returns['6M'])}%\n- Volatilidad anual: ${f(p.volatility_1y_pct)}%\n- Caída máxima del último año: ${f(p.max_drawdown_1y_pct)}%\n` : '') +
      `\n**Interpretación**\n\n${t.signals.map((s) => `- ${s}`).join('\n')}\n\n| Indicador | Valor |\n|---|---|\n| RSI14 | ${f(t.rsi14, 1)} |\n| ATR14 | ${f(t.atr14)} |\n\n> Las señales técnicas describen el pasado reciente; no predicen precios.`);
  }
  if (r.get_market_overview) {
    const ix = r.get_market_overview.data.indices.slice(0, 3), ar = r.get_argentina_macro?.data;
    return text(`## Resumen del mercado\n\n**Índices**\n\n${ix.map((i) => `- ${i.name}: ${f(i.price)} (${i.change_pct > 0 ? '+' : ''}${f(i.change_pct)}%)`).join('\n')}\n\n` +
      (ar?.riesgo_pais ? `**Argentina**\n\n- Riesgo país: ${ar.riesgo_pais.puntos_basicos} puntos básicos\n- Dólar oficial (venta): ${ar.dolares?.find((d) => d.casa === 'oficial')?.venta}\n\n` : '') + '**A vigilar**\n\n1. La reacción del mercado a los próximos datos de inflación\n2. El comportamiento de los bonos soberanos\n3. La brecha cambiaria');
  }
  if (r.screen_assets) {
    const d = r.screen_assets.data;
    return text(`## Screener: ${d.universe}\n\nPasan **${d.passed.length}** de ${d.evaluated} con P/E máximo ${d.filters_applied.max_pe}.\n\n${d.passed.map((x) => `- ${x.ticker}: P/E ${f(x.pe_ttm, 1)}`).join('\n') || '- Ninguno cumple todos los filtros'}`);
  }
  return text('Listo.');
}

// ------------------------------------------------------------------ servidor de FinAgent simulado (modo beta)
export const FA_CODE = 'FA-TEST-2222';
const FREE = { id: 'free', label: 'Gratis', modelLabel: 'Gemini 3.5 Flash-Lite', dailyLimit: 3, monthlyLimit: 90, available: true };
const PLUS = { id: 'plus', label: 'Plus', modelLabel: 'Gemini 3.8 Flash', dailyLimit: 10, monthlyLimit: 200, available: false };
const PLAN_LIST = [
  { ...FREE, blurb: 'Respuestas rápidas con un modelo liviano.', deepModelLabel: null, deepMonthlyLimit: 0 },
  { ...PLUS, blurb: 'Un modelo más potente y más conversaciones por día.', deepModelLabel: null, deepMonthlyLimit: 0 },
  { id: 'pro', label: 'Pro', modelLabel: 'Gemini 3.8 Flash', dailyLimit: 30, monthlyLimit: 600, available: false, blurb: 'El modelo más potente para análisis profundos y el máximo de conversaciones.', deepModelLabel: 'Gemini 3.1 Pro', deepMonthlyLimit: 30 },
];
export const apiState = { used: 0, month: 0, turn: 0, plan: 'free', capacity: null, banned: false, tokens: new Set(), deviceAuths: 0, interest: [] };
export const resetApi = () => Object.assign(apiState, { used: 0, month: 0, turn: 0, plan: 'free', capacity: null, banned: false, tokens: new Set(), deviceAuths: 0, interest: [] });
const planNow = () => (apiState.plan === 'plus' ? PLUS : FREE);
const remaining = () => ({ day: Math.max(0, planNow().dailyLimit - apiState.used), month: Math.max(0, planNow().monthlyLimit - apiState.month) });

export function finagentApi(method, path, headers, body) {
  const j = (o, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
  if (method === 'OPTIONS') return { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type' }, body: '' };
  if (path === '/v1/plans') return j({ tier: 'free', plans: PLAN_LIST });
  if (path === '/v1/auth/device') {              // cuenta automática: sin registro ni códigos
    if (apiState.banned) return j({ error: 'disabled' }, 403);
    const tok = `tok-e2e-${++apiState.deviceAuths}`; apiState.tokens.add(tok);
    return j({ token: tok, plan: planNow(), tier: 'free', expiresAt: Date.now() + 90 * 86400e3 });
  }
  const tok = (headers.authorization ?? '').replace('Bearer ', '');
  if (!apiState.tokens.has(tok)) return j({ error: 'session' }, 401);
  if (path === '/v1/me') return j({ plan: planNow(), remaining: remaining(), resetsOn: '2026-10-20', tier: 'free' });
  if (path === '/v1/interest') { if (!apiState.interest.includes(body.plan)) apiState.interest.push(body.plan); return j({ ok: true, first: true }); }
  if (path === '/v1/plan/redeem') {
    if (body.code !== FA_CODE) return j({ error: 'code' }, 404);
    apiState.plan = 'plus'; return j({ plan: PLUS, unchanged: false, remaining: remaining() });
  }
  if (path === '/v1/generate') {
    if (apiState.capacity === 'minute') return j({ error: 'capacity', scope: 'minute', retryAfterSec: 30, tier: 'free' }, 503);
    if (apiState.capacity === 'day') return j({ error: 'capacity', scope: 'day', retryAfterSec: 7200, tier: 'free' }, 503);
    let turn = body.turn;
    if (!turn) {                                  // la primera vuelta de cada respuesta descuenta UNA conversación
      if (remaining().day <= 0) return j({ error: 'limit', reason: 'daily', resetsOn: '2026-10-20', plan: planNow() }, 429);
      apiState.used++; apiState.month++; turn = `t${++apiState.turn}`;
    }
    const data = geminiReply('https://fake/models/m:generateContent', { contents: body.contents, systemInstruction: { parts: [{ text: 'sistema' }] } });
    return j({ data, model: 'gemini-3.5-flash-lite', turn, remaining: remaining(), plan: planNow(), tier: 'free' });
  }
  return j({ error: 'not_found' }, 404);
}
