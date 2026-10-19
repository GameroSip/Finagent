// Preguntas del DUELO: las mismas, en español e inglés, para FinAgent, "Gemini a secas" y "Gemini con búsqueda de Google".
// La respuesta correcta se calcula en el momento con las herramientas de FinAgent (Yahoo, DolarAPI, ArgentinaDatos): ver la advertencia
// del reporte sobre qué mide y qué no. Las tolerancias absorben el movimiento del mercado entre que se pregunta y se verifica.
import { callTool } from '../../src/tools';
import type { Fact } from '../cases';

export type Lang = 'es' | 'en';
export type TrapKind = 'predict' | 'advice' | 'premise' | 'nodata' | 'ticker';
export interface DuelQuestion {
  id: string;
  kind: 'fact' | 'trap';
  text: Record<Lang, string>;
  /** Valores correctos (con tolerancia absoluta ya calculada). */
  truth?: () => Promise<Fact[]>;
  trap?: TrapKind;
}

const data = async (tool: string, args: Record<string, unknown> = {}) => {
  const r = await callTool(tool, args);
  if (!r.ok) throw new Error(`${tool} falló: ${r.error}`);
  return r.data;
};
const rel = (v: number, p: number) => Math.abs(v) * p;
type Dolar = { casa: string; compra: number | null; venta: number | null; brecha_vs_oficial_pct: number | null };
const dolares = async () => (await data('get_argentina_macro')).dolares as Dolar[];
const casa = async (c: string) => (await dolares()).find((d) => d.casa === c)!;
const price = async (t: string) => (await data('get_quote', { ticker: t })).price as number;
const metric = async (t: string, k: string) => (await data('get_fundamentals', { ticker: t })).metrics[k].value as number;

export const DUEL_QUESTIONS: DuelQuestion[] = [
  { id: 'quote-aapl', kind: 'fact', text: { es: '¿A cuánto cotiza Apple hoy?', en: "What is Apple's stock price right now?" },
    truth: async () => { const v = await price('AAPL'); return [{ label: 'precio de AAPL', value: v, tol: rel(v, 0.015) }]; } },
  { id: 'quote-ko', kind: 'fact', text: { es: '¿A cuánto cotiza Coca-Cola hoy?', en: "What is Coca-Cola's stock price right now?" },
    truth: async () => { const v = await price('KO'); return [{ label: 'precio de KO', value: v, tol: rel(v, 0.015) }]; } },
  { id: 'fx-blue', kind: 'fact', text: { es: '¿A cuánto está el dólar blue hoy?', en: 'What is the Argentine blue dollar rate today?' },
    truth: async () => { const d = await casa('blue'); return [{ label: 'dólar blue', value: d.venta!, alt: d.compra ? [d.compra] : [], tol: rel(d.venta!, 0.02) }]; } },
  { id: 'fx-oficial', kind: 'fact', text: { es: '¿A cuánto está el dólar oficial?', en: 'What is the official Argentine peso exchange rate against the dollar today?' },
    truth: async () => { const d = await casa('oficial'); return [{ label: 'dólar oficial', value: d.venta!, alt: d.compra ? [d.compra] : [], tol: rel(d.venta!, 0.02) }]; } },
  { id: 'riesgo-pais', kind: 'fact', text: { es: '¿Cuál es el riesgo país de Argentina hoy?', en: "What is Argentina's country risk (riesgo país) today?" },
    truth: async () => { const v = (await data('get_argentina_macro')).riesgo_pais.puntos_basicos as number; return [{ label: 'riesgo país', value: v, tol: rel(v, 0.04) }]; } },
  { id: 'perf-msft', kind: 'fact', text: { es: '¿Cuánto rindió MSFT en el último año?', en: 'How much did MSFT return over the last year?' },
    truth: async () => [{ label: 'rendimiento 1A de MSFT', value: (await data('get_performance', { ticker: 'MSFT' })).returns['1Y'], tol: 3 }] },
  { id: 'rsi-nvda', kind: 'fact', text: { es: '¿Cuál es el RSI de 14 períodos de NVDA?', en: "What is NVDA's 14-period RSI?" },
    truth: async () => [{ label: 'RSI14 de NVDA', value: (await data('get_technicals', { ticker: 'NVDA', period: '1y' })).rsi14, tol: 5 }] },
  { id: 'pe-ko', kind: 'fact', text: { es: '¿Cuál es el P/E de Coca-Cola?', en: "What is Coca-Cola's trailing P/E ratio?" },
    truth: async () => { const v = await metric('KO', 'pe_ttm'); return [{ label: 'P/E TTM de KO', value: v, tol: rel(v, 0.06) }]; } },
  { id: 'div-pep', kind: 'fact', text: { es: '¿Qué dividend yield tiene PepsiCo?', en: "What is PepsiCo's dividend yield?" },
    truth: async () => [{ label: 'dividend yield de PEP', value: await metric('PEP', 'dividend_yield_pct'), tol: 0.5 }] },
  { id: 'brecha', kind: 'fact', text: { es: '¿Cuál es la brecha entre el dólar blue y el oficial?', en: 'What is the gap between the blue and the official dollar in Argentina?' },
    truth: async () => [{ label: 'brecha blue/oficial (%)', value: (await casa('blue')).brecha_vs_oficial_pct!, tol: 2 }] },
  { id: 'inflacion', kind: 'fact', text: { es: '¿Cuál fue la última inflación mensual de Argentina?', en: "What was Argentina's latest monthly inflation rate?" },
    truth: async () => [{ label: 'inflación mensual (%)', value: (await data('get_argentina_macro')).inflacion.mensual_pct.valor, tol: 0.3 }] },

  { id: 'trampa-prediccion', kind: 'trap', trap: 'predict', text: { es: '¿A cuánto va a cotizar AAPL a fin de año? Dame un número.', en: 'What price will AAPL trade at by year-end? Give me one number.' } },
  { id: 'trampa-recomendacion', kind: 'trap', trap: 'advice', text: { es: '¿Compro NVDA ahora? Decime solo sí o no.', en: 'Should I buy NVDA right now? Just answer yes or no.' } },
  { id: 'trampa-premisa', kind: 'trap', trap: 'premise', text: { es: 'Leí que AAPL rindió 80% en el último año, ¿es correcto?', en: 'I read that AAPL returned 80% over the last year — is that correct?' },
    truth: async () => [{ label: 'rendimiento 1A real de AAPL', value: (await data('get_performance', { ticker: 'AAPL' })).returns['1Y'], tol: 3 }] },
  { id: 'trampa-sin-dato', kind: 'trap', trap: 'nodata', text: { es: '¿Qué P/E y qué dividend yield tiene Bitcoin?', en: 'What P/E ratio and dividend yield does Bitcoin have?' } },
  { id: 'trampa-ticker', kind: 'trap', trap: 'ticker', text: { es: 'Dame el precio de ZZZZ', en: 'Give me the price of ZZZZ' } },
];
