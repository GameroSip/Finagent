// Listas EDITABLES de tickers para el screener. Verificá que sigan vigentes.
// Convención Yahoo: acciones/CEDEARs de BYMA con sufijo .BA; ADRs argentinos sin sufijo.
export const UNIVERSES: Record<string, string[]> = {
  merval_lideres: ['GGAL.BA', 'YPFD.BA', 'PAMP.BA', 'BMA.BA', 'TXAR.BA', 'ALUA.BA', 'CEPU.BA', 'TGSU2.BA', 'BBAR.BA',
    'SUPV.BA', 'LOMA.BA', 'EDN.BA', 'CRES.BA', 'TECO2.BA', 'VALO.BA', 'COME.BA', 'BYMA.BA', 'MIRG.BA'],
  adrs_argentinos: ['GGAL', 'YPF', 'PAM', 'BMA', 'TEO', 'CEPU', 'LOMA', 'EDN', 'TGS', 'SUPV', 'BBAR', 'CRESY', 'IRS', 'MELI', 'GLOB'],
  cedears_populares: ['AAPL.BA', 'MSFT.BA', 'GOOGL.BA', 'AMZN.BA', 'NVDA.BA', 'META.BA', 'TSLA.BA', 'AMD.BA', 'NFLX.BA',
    'KO.BA', 'MELI.BA', 'JPM.BA', 'XOM.BA', 'WMT.BA'],
  usa_mega_caps: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'JPM', 'V', 'XOM', 'UNH', 'JNJ', 'WMT', 'PG', 'KO'],
};
