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

/** Mercados del mundo, por grupo (símbolos de Yahoo Finance). La disponibilidad y la demora dependen de cada plaza. */
export type WorldGroup = 'indices' | 'fx' | 'crypto' | 'commodities';
export const WORLD_GROUPS: Record<WorldGroup, Array<{ symbol: string; name: string }>> = {
  indices: [{ symbol: '^FTSE', name: 'FTSE 100' }, { symbol: '^GDAXI', name: 'DAX' }, { symbol: '^FCHI', name: 'CAC 40' }, { symbol: '^STOXX50E', name: 'Euro Stoxx 50' }, { symbol: '^IBEX', name: 'IBEX 35' },
    { symbol: '^N225', name: 'Nikkei 225' }, { symbol: '^HSI', name: 'Hang Seng' }, { symbol: '^KS11', name: 'KOSPI' }, { symbol: '^BSESN', name: 'Sensex' }, { symbol: '^AXJO', name: 'ASX 200' },
    { symbol: '^BVSP', name: 'Bovespa' }, { symbol: '^GSPTSE', name: 'S&P/TSX' }],
  fx: [{ symbol: 'EURUSD=X', name: 'EUR/USD' }, { symbol: 'GBPUSD=X', name: 'GBP/USD' }, { symbol: 'USDJPY=X', name: 'USD/JPY' }, { symbol: 'USDCHF=X', name: 'USD/CHF' }, { symbol: 'AUDUSD=X', name: 'AUD/USD' },
    { symbol: 'USDCAD=X', name: 'USD/CAD' }, { symbol: 'USDBRL=X', name: 'USD/BRL' }, { symbol: 'USDMXN=X', name: 'USD/MXN' }, { symbol: 'DX-Y.NYB', name: 'Índice dólar (DXY)' }],
  crypto: [{ symbol: 'BTC-USD', name: 'Bitcoin' }, { symbol: 'ETH-USD', name: 'Ethereum' }, { symbol: 'SOL-USD', name: 'Solana' }, { symbol: 'XRP-USD', name: 'XRP' }, { symbol: 'BNB-USD', name: 'BNB' },
    { symbol: 'DOGE-USD', name: 'Dogecoin' }, { symbol: 'ADA-USD', name: 'Cardano' }, { symbol: 'AVAX-USD', name: 'Avalanche' }, { symbol: 'LINK-USD', name: 'Chainlink' }],
  commodities: [{ symbol: 'GC=F', name: 'Oro' }, { symbol: 'SI=F', name: 'Plata' }, { symbol: 'CL=F', name: 'Petróleo WTI' }, { symbol: 'BZ=F', name: 'Petróleo Brent' }, { symbol: 'NG=F', name: 'Gas natural' },
    { symbol: 'HG=F', name: 'Cobre' }, { symbol: 'ZS=F', name: 'Soja' }, { symbol: 'ZC=F', name: 'Maíz' }, { symbol: 'ZW=F', name: 'Trigo' }, { symbol: 'KC=F', name: 'Café' }],
};
export const fetchWorldGroup = (g: WorldGroup) => pool(WORLD_GROUPS[g], 4, (i) => fetchQuoteCard(i.symbol, i.name));

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
