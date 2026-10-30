// Universo del backtest. Son activos que HOY existen y son conocidos, así que hay sesgo de supervivencia (se explica en el reporte).
import type { Group } from '../../src/radarBacktest';
export const UNIVERSE: Array<[string, Group]> = [
  ...['^GSPC', '^IXIC', '^DJI', '^RUT', '^FTSE', '^GDAXI', '^N225', '^BVSP', '^HSI', '^MERV'].map((s) => [s, 'índices'] as [string, Group]),
  ...['SPY', 'QQQ', 'IWM', 'EEM', 'GLD', 'TLT', 'XLE', 'XLF'].map((s) => [s, 'ETF'] as [string, Group]),
  ...['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'AMD', 'NFLX', 'INTC', 'KO', 'PEP', 'JNJ', 'PFE', 'JPM', 'BAC', 'XOM', 'CVX', 'WMT', 'DIS', 'BA', 'F', 'T', 'GME', 'GGAL', 'YPF', 'MELI', 'VALE', 'PBR'].map((s) => [s, 'acciones'] as [string, Group]),
  ...['BTC-USD', 'ETH-USD', 'XRP-USD', 'LTC-USD', 'DOGE-USD'].map((s) => [s, 'cripto'] as [string, Group]),
];
