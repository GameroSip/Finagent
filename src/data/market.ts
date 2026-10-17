// Datos de mercado para la pantalla de inicio y para las herramientas del asistente.
import { fetchChart } from '../yahoo';
import { getJsonFrom, pool } from './net';

export const INDEX_LIST: Array<{ symbol: string; name: string }> = [
  { symbol: '^GSPC', name: 'S&P 500' }, { symbol: '^IXIC', name: 'Nasdaq' }, { symbol: '^DJI', name: 'Dow Jones' },
  { symbol: '^MERV', name: 'Merval' }, { symbol: '^VIX', name: 'VIX (volatilidad)' }, { symbol: 'BTC-USD', name: 'Bitcoin' },
  { symbol: 'GC=F', name: 'Oro' }, { symbol: 'CL=F', name: 'Petróleo WTI' },
];

export interface QuoteCard {
  symbol: string; name: string; price: number | null; currency: string | null; changePct: number | null;
  spark: number[]; asOf: number | null; error?: string;
}

/** Cotización + mini-gráfico (cierres diarios del último mes). */
export async function fetchQuoteCard(symbol: string, name?: string, range = '1mo'): Promise<QuoteCard> {
  try {
    const ch = await fetchChart(symbol, range, '1d');
    const closes = ch.bars.map((b) => b.c);
    if (!closes.length) throw new Error('sin datos');
    const last = closes[closes.length - 1];
    const prev = closes.length > 1 ? closes[closes.length - 2] : ch.meta.chartPreviousClose ?? null;
    return {
      symbol, name: name ?? ch.meta.shortName ?? ch.meta.longName ?? symbol, price: last, currency: ch.meta.currency ?? null,
      changePct: prev ? (last / prev - 1) * 100 : null, spark: closes, asOf: ch.meta.regularMarketTime ?? ch.bars[ch.bars.length - 1].t,
    };
  } catch (e: any) {
    return { symbol, name: name ?? symbol, price: null, currency: null, changePct: null, spark: [], asOf: null, error: e?.message ?? String(e) };
  }
}

export const fetchIndices = () => pool(INDEX_LIST, 4, (i) => fetchQuoteCard(i.symbol, i.name));

export interface FearGreed { value: number; label: string; labelEs: string; ts: number | null }
const FNG_ES: Record<string, string> = {
  'extreme fear': 'Miedo extremo', fear: 'Miedo', neutral: 'Neutral', greed: 'Codicia', 'extreme greed': 'Codicia extrema',
};

/** Índice de Miedo y Codicia del mercado cripto (alternative.me, gratuito). */
export async function fetchFearGreed(): Promise<FearGreed> {
  const j = await getJsonFrom('https://api.alternative.me/fng/?limit=1', 'Miedo y codicia (cripto)');
  const d = j?.data?.[0];
  const value = Number(d?.value);
  if (!Number.isFinite(value)) throw new Error('Miedo y codicia: dato no válido');
  const label = String(d.value_classification ?? '');
  return { value, label, labelEs: FNG_ES[label.toLowerCase()] ?? label, ts: d.timestamp ? Number(d.timestamp) * 1000 : null };
}
