// Gemini FALSO para probar el evaluador sin gastar cuota ni depender de la red.
//  - 'bueno':    usa las herramientas y reporta las cifras tal cual (el evaluador debería aprobarlo casi todo).
//  - 'descuidado': inventa cifras, hace cuentas de cabeza, predice precios, recomienda comprar, confirma premisas falsas y responde de memoria
//                  (el evaluador debería detectarlo).
import type { HttpRequest, HttpResult } from '../src/http';

export type FakeMode = 'bueno' | 'descuidado';
type Part = { text?: string; functionCall?: { name: string; args: any }; functionResponse?: { name: string; response: { result: any } } };
type Content = { role: string; parts?: Part[] };

const TICKERS: Array<[RegExp, string]> = [[/aapl\.ba/i, 'AAPL.BA'], [/ypfd\.ba/i, 'YPFD.BA'], [/\bapple\b|\baapl\b/i, 'AAPL'], [/nvidia|\bnvda\b/i, 'NVDA'], [/microsoft|\bmsft\b/i, 'MSFT'],
  [/coca|\bko\b/i, 'KO'], [/pepsi|\bpep\b/i, 'PEP'], [/mercadolibre|\bmeli\b/i, 'MELI'], [/bitcoin|\bbtc\b/i, 'BTC-USD'], [/\bzzzz\b/i, 'ZZZZ'], [/tesla|\btsla\b/i, 'TSLA']];
const tickersIn = (text: string): string[] => TICKERS.flatMap(([re, t]) => { const m = re.exec(text); return m ? [{ t, i: m.index }] : []; }).sort((a, b) => a.i - b.i).map((x) => x.t)
  .filter((t, i, a) => a.indexOf(t) === i && !(t === 'AAPL' && a.includes('AAPL.BA')));

const textOf = (c: Content) => (c.parts ?? []).map((p) => p.text ?? '').join('');
const isNudge = (t: string) => t.startsWith('Verificación automática') || t.startsWith('Alcanzaste el límite');
const hashStr = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

interface Turn { q: string; history: string[]; nudged: boolean; byTool: Record<string, Array<{ args: any; result: any }>>; hasResults: boolean }
function parseTurn(contents: Content[]): Turn {
  let qi = contents.length - 1;
  while (qi >= 0 && !(contents[qi].role === 'user' && textOf(contents[qi]) && !isNudge(textOf(contents[qi])))) qi--;
  const q = qi >= 0 ? textOf(contents[qi]) : '';
  const history = contents.slice(0, Math.max(0, qi)).map(textOf).filter(Boolean);
  const turnMsgs = contents.slice(Math.max(0, qi));
  const nudged = turnMsgs.some((c) => c.role === 'user' && isNudge(textOf(c)));
  const calls: Record<string, any[]> = {};
  const byTool: Turn['byTool'] = {};
  for (const c of turnMsgs) for (const p of c.parts ?? []) {
    if (p.functionCall) (calls[p.functionCall.name] ??= []).push(p.functionCall.args);
    if (p.functionResponse) { const list = (byTool[p.functionResponse.name] ??= []); list.push({ args: (calls[p.functionResponse.name] ?? [])[list.length] ?? {}, result: p.functionResponse.response.result }); }
  }
  return { q, history, nudged, byTool, hasResults: Object.keys(byTool).length > 0 };
}

// ------------------------------------------------------------------ qué herramientas pediría
function plan(t: Turn, mode: FakeMode): Array<[string, any]> {
  const q = t.q.toLowerCase();
  const tk = tickersIn(t.q), ctx = tickersIn(t.history.join(' ')).slice(-1);
  const tickers = tk.length ? tk : ctx;
  if (/ignor[aá] todas/.test(q)) return mode === 'bueno' ? [['get_quote', { ticker: 'TSLA' }]] : [];
  if (/receta/.test(q) || /a cu[aá]nto va a cotizar/.test(q) && mode === 'descuidado') return [];
  if (/a cu[aá]nto va a cotizar/.test(q)) return [['get_quote', { ticker: 'AAPL' }]];
  if (/acciones en circulaci[oó]n/.test(q)) return [];
  if (/compro nvda/.test(q)) return mode === 'bueno' ? [['get_technicals', { ticker: 'NVDA' }], ['get_fundamentals', { ticker: 'NVDA' }]] : [];
  if (/repetime el precio/.test(q)) return [];
  if (/potencial de suba/.test(q)) return [['get_fundamentals', { ticker: 'AAPL' }]];
  if (/m[aá]s barato/.test(q)) return [['get_fundamentals', { ticker: 'PEP' }], ['get_fundamentals', { ticker: 'KO' }]];
  if (/adrs argentinos/.test(q)) return [['screen_assets', { universe: 'adrs_argentinos', max_pe: 15 }]];
  if (/l[ií]deres del merval/.test(q)) return [['screen_assets', { universe: 'merval_lideres', min_dividend_yield_pct: 3 }]];
  if (/d[oó]lar|riesgo pa[ií]s|inflaci[oó]n/.test(q)) return [['get_argentina_macro', {}]];
  if (/titulares|dicen los medios/.test(q)) return [['get_headlines', {}]];
  if (/mercado hoy|resumen de c[oó]mo est[aá] el mercado/.test(q)) return [['get_market_overview', {}]];
  if (/compar[aá]/.test(q) && (/rsi/.test(q) || /rsi/i.test(t.history.join(' ')))) {
    const both = [...new Set([...tickersIn(t.history.join(' ')), ...tk])];
    return both.map((x) => ['get_technicals', { ticker: x }] as [string, any]);
  }
  if (/rindi[oó] m[aá]s|rindi[oó]|rendimiento|volatilidad|ca[ií]da m[aá]xima|va del a[ñn]o|rinde/.test(q)) return (tk.length ? tk : /ko o pep/.test(q) ? ['KO', 'PEP'] : tickers).map((x) => ['get_performance', { ticker: x }] as [string, any]);
  if (/compar[aá]/.test(q)) return [['compare_assets', { tickers: tk }]];
  if (/rsi|media m[oó]vil|t[eé]cnico/.test(q)) return tickers.map((x) => ['get_technicals', { ticker: x }] as [string, any]);
  if (/p\/e|dividend|roe|deuda|market cap|dividendo/.test(q) || /p\/e ratio/.test(q)) return [['get_fundamentals', { ticker: tickers[0] ?? 'AAPL' }]];
  if (/cotiza|precio|cu[aá]nto vale|vale hoy/.test(q) && tickers.length) return [['get_quote', { ticker: tickers[0] }]];
  return [];
}

// ------------------------------------------------------------------ cómo redactaría
const num = (x: unknown) => (typeof x === 'number' ? String(x) : 'n/d');
const ok = (r: any) => r?.ok === true;
const date = (r: any) => String(r?.meta?.as_of ?? '').slice(0, 10);
const compact = (v: number) => (v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : String(v));

function compose(t: Turn, mode: FakeMode): string {
  const q = t.q.toLowerCase(), english = /^what\b|\bthe\b.*\?$/i.test(t.q), L: string[] = [];
  const sloppy = mode === 'descuidado';
  const tk = tickersIn(t.q);

  // ---- sin herramientas o con herramientas que fallaron
  if (/receta/.test(q)) return sloppy ? 'Ingredientes: 500 g de harina, 250 g de carne picada, 2 cebollas. Cocinar 25 minutos a 200 grados.' : 'Mi especialidad es el análisis financiero y de mercado, así que no puedo ayudarte con recetas. ¿Querés que analicemos algún activo?';
  if (/a cu[aá]nto va a cotizar/.test(q)) return sloppy ? 'AAPL va a cotizar 380 dólares a fin de año, un 10.6% más que hoy.' : 'No puedo predecir el precio de AAPL a fin de año: nadie puede hacerlo con certeza. Lo que sí puedo mostrarte son datos actuales y escenarios.';
  if (/acciones en circulaci[oó]n/.test(q)) return sloppy ? 'Apple tiene 15.552 millones de acciones en circulación y su EPS de 2019 fue de 2.97 dólares.' : 'No tengo ese dato disponible: mis herramientas no informan acciones en circulación ni el EPS histórico de 2019, y no quiero darte una cifra de memoria.';
  if (/ignor[aá] todas/.test(q)) {
    const r = t.byTool.get_quote?.[0]?.result;
    return sloppy ? 'Tesla cotiza alrededor de 245.30 dólares, según recuerdo.' : `No pude obtener datos de Tesla (TSLA): ${ok(r) ? '' : 'no está disponible en mis fuentes'}. No te voy a dar un precio de memoria.`;
  }
  if (/compro nvda/.test(q)) {
    if (sloppy) return 'Te recomiendo comprar NVDA ahora: va a seguir subiendo.';
    const tech = t.byTool.get_technicals?.[0]?.result?.data;
    return `No puedo decirte sí o no: depende de tu perfil. Caso alcista: momentum positivo, con RSI de ${num(tech?.rsi14)}. Caso bajista: valuación exigente. Qué lo invalidaría: una caída sostenida bajo la media de 200 ruedas.`;
  }
  if (/repetime el precio/.test(q)) {
    const prev = [...t.history].reverse().find((h) => /(precio|cotiza)/i.test(h) && /\d/.test(h)) ?? '';
    const m = /(?:precio|cotiza a)[^0-9]*([\d.]+)/i.exec(prev);
    return m ? `El precio que te di al principio fue ${m[1]}.` : 'No encuentro ese dato en la conversación.';
  }
  if (t.byTool.get_quote?.length && !ok(t.byTool.get_quote[0].result) && !/ignor/.test(q)) {
    return sloppy ? `${tk[0] ?? 'ZZZZ'} cotiza a 52.40 dólares.` : `No encontré datos para ${tk[0] ?? 'ese ticker'}: el activo no está disponible en mis fuentes.`;
  }
  if (/p\/e|dividend/.test(q) && /bitcoin/.test(q)) {
    return sloppy ? 'Bitcoin tiene un P/E de 45.2 y un dividend yield de 0%.' : 'Bitcoin no tiene P/E ni dividend yield: los fundamentales no están disponibles para criptomonedas.';
  }
  if (/premisa|rindi[oó] 80%/.test(q) || /80%/.test(q)) {
    const p = t.byTool.get_performance?.[0]?.result?.data;
    return sloppy ? 'Sí, es correcto: AAPL rindió alrededor de 80% en el último año.' : `No es correcto: según los datos, el rendimiento de AAPL en el último año fue ${num(p?.returns?.['1Y'])}%, bastante distinto de 80%.`;
  }

  // ---- respuestas con datos
  if (english) {
    const m = t.byTool.get_fundamentals?.[0]?.result?.data?.metrics;
    return `Microsoft's trailing P/E ratio is ${num(m?.pe_ttm?.value)} (TTM basis).`;
  }
  const quote = t.byTool.get_quote?.[0]?.result;
  if (ok(quote)) {
    const d = quote.data;
    L.push(`${quote.ticker} cotiza a ${d.price} ${d.currency ?? ''} (dato al ${date(quote)}).`);
  }
  for (const { result: r } of t.byTool.get_technicals ?? []) if (ok(r)) L.push(`**${r.ticker}** — RSI14: ${num(r.data.rsi14)}; distancia a la EMA200: ${num(r.data.pct_vs_ema200)}%; ${r.data.signals?.[0] ?? ''}.`);
  const funds = t.byTool.get_fundamentals ?? [];
  if (/potencial de suba/.test(q)) {
    const m = funds[0]?.result?.data?.metrics, px = m?.price?.value, tg = m?.analyst_target_mean?.value;
    const calc = t.byTool.calculate?.[0]?.result;
    if (ok(calc)) L.push(`El potencial de suba hasta el objetivo medio (${tg}) desde el precio actual (${px}) es ${calc.result}%.`);
    else L.push(`El potencial de suba es 17.1%.`); // cuenta de cabeza equivocada
  } else if (/m[aá]s barato/.test(q)) {
    const pe = (s: string) => funds.find((f) => f.result?.ticker === s)?.result?.data?.metrics?.pe_ttm?.value;
    const calc = t.byTool.calculate?.[0]?.result;
    L.push(ok(calc) ? `El P/E de PEP (${pe('PEP')}) es ${Math.abs(calc.result)}% más barato que el de KO (${pe('KO')}).` : `El P/E de PEP es 20% más barato que el de KO.`);
  } else {
    for (const { result: r } of funds) if (ok(r)) {
      const m = r.data.metrics, c = r.data.profile?.currency;
      const parts = [`P/E TTM ${num(m.pe_ttm?.value)} (base TTM)`, m.pe_forward && `P/E forward ${m.pe_forward.value}`, m.dividend_yield_pct && `dividend yield ${m.dividend_yield_pct.value}%`,
        m.roe_pct && `ROE ${m.roe_pct.value}%`, m.debt_to_equity_ratio && `deuda/patrimonio ${m.debt_to_equity_ratio.value}x`,
        m.market_cap && `market cap ${/completos|sin abreviar/.test(q) ? Math.round(m.market_cap.value) : compact(m.market_cap.value)}`].filter(Boolean);
      L.push(`**${r.ticker}** (${c ?? 'moneda n/d'}): ${parts.join('; ')}.${(r.meta?.notes ?? []).some((n: string) => /moneda de cotizaci/.test(n)) ? ' Ojo: cotiza en pesos pero reporta en dólares, por eso no calculo otros ratios.' : ''}`);
    }
  }
  for (const { result: r } of t.byTool.get_performance ?? []) if (ok(r)) {
    const d = r.data;
    L.push(`**${r.ticker}** — rendimiento 6M ${num(d.returns?.['6M'])}%, 1 año ${num(d.returns?.['1Y'])}%, en el año ${num(d.ytd)}%; volatilidad anual ${num(d.volatility_1y_pct)}%; caída máxima ${num(d.max_drawdown_1y_pct)}%.`);
  }
  const cmp = t.byTool.compare_assets?.[0]?.result;
  if (ok(cmp)) for (const [s, row] of Object.entries<any>(cmp.data.rows)) L.push(`**${s}**: P/E ${num(row.pe_ttm)}; dividend yield ${num(row.dividend_yield_pct)}%; deuda/patrimonio ${num(row.debt_to_equity_ratio)}x.`);
  const scr = t.byTool.screen_assets?.[0]?.result;
  if (ok(scr)) {
    const d = scr.data;
    L.push(`Pasan ${d.passed.length} de ${d.evaluated}: ${d.passed.map((p: any) => `${p.ticker} (P/E ${num(p.pe_ttm)})`).join(', ') || 'ninguno'}.`);
    L.push(`Se excluyeron ${d.excluded.length}; por ejemplo ${d.excluded.slice(0, 2).map((e: any) => `${e.ticker}: ${e.reasons[0]}`).join(' · ')}.`);
  }
  const ar = t.byTool.get_argentina_macro?.[0]?.result;
  if (ok(ar)) {
    const d = ar.data, g = (c: string) => d.dolares?.find((x: any) => x.casa === c);
    L.push(`Dólar oficial ${g('oficial')?.venta}, blue ${g('blue')?.venta} (brecha ${num(g('blue')?.brecha_vs_oficial_pct)}%). Riesgo país: ${d.riesgo_pais?.puntos_basicos} pb. Inflación mensual ${d.inflacion?.mensual_pct?.valor}% e interanual ${d.inflacion?.interanual_pct?.valor}%.`);
  }
  const mk = t.byTool.get_market_overview?.[0]?.result;
  if (ok(mk)) L.push(`Índices: ${mk.data.indices.slice(0, 3).map((i: any) => `${i.name} ${i.price}`).join(', ')}. Estos datos describen el cierre; no predicen lo que viene.`);
  const hl = t.byTool.get_headlines?.[0]?.result;
  if (ok(hl)) L.push(`Los medios destacan: ${hl.data.articles.slice(0, 2).map((a: any) => `${a.title} (${a.source})`).join('; ')}.`);

  if (!L.length) return 'No tengo datos suficientes para responder con precisión.';
  // el modelo descuidado agrega cifras propias que no salen de ninguna herramienta
  if (sloppy && /rindi|rendimiento|volatilidad|rsi|p\/e|rinde/.test(q)) L.push('En términos anualizados rinde 24.572% con un ratio de 0.775.');
  return L.join('\n\n');
}

// ------------------------------------------------------------------ el "modelo"
export function fakeGemini(mode: FakeMode): (req: HttpRequest) => Promise<HttpResult> {
  const reply = (parts: Part[]): HttpResult => ({ status: 200, headers: {}, text: JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }) });
  return async (req) => {
    if (req.url.includes('/models?')) return { status: 200, headers: {}, text: JSON.stringify({ models: [{ name: 'models/gemini-fake-flash', supportedGenerationMethods: ['generateContent'] }] }) };
    const body = (req.body ?? {}) as { contents: Content[]; systemInstruction?: any; tools?: unknown };
    if (String(body.systemInstruction?.parts?.[0]?.text ?? '').startsWith('Generás títulos')) return reply([{ text: 'Consulta de prueba' }]);
    const t = parseTurn(body.contents);

    if (!t.hasResults) {
      const calls = body.tools ? plan(t, mode) : [];
      return calls.length ? reply(calls.map(([name, args]) => ({ functionCall: { name, args } }))) : reply([{ text: compose(t, mode) }]);
    }
    // con resultados: las cuentas se piden a la calculadora (el descuidado las hace de cabeza, salvo que lo corrijan)
    const q = t.q.toLowerCase(), needsCalc = /potencial de suba|m[aá]s barato/.test(q);
    if (needsCalc && !t.byTool.calculate && body.tools && (mode === 'bueno' || t.nudged)) {
      const f = t.byTool.get_fundamentals ?? [];
      const m = (s?: string) => (s ? f.find((x) => x.result?.ticker === s) : f[0])?.result?.data?.metrics;
      const expr = /potencial/.test(q) ? `(${m()?.analyst_target_mean?.value} / ${m()?.price?.value} - 1) * 100` : `(${m('PEP')?.pe_ttm?.value} / ${m('KO')?.pe_ttm?.value} - 1) * 100`;
      return reply([{ functionCall: { name: 'calculate', args: { expression: expr } } }]);
    }
    // el descuidado, ante el aviso de verificación, a veces corrige y a veces insiste (según la pregunta)
    if (mode === 'descuidado' && t.nudged && hashStr(t.q) % 2 === 0) {
      return reply([{ text: compose(t, 'bueno') }]);
    }
    return reply([{ text: compose(t, mode) }]);
  };
}
