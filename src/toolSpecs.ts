// Declaración de herramientas para Gemini (function calling). Los nombres deben coincidir con tools.ts.
const S = { type: 'STRING' } as const;
const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'OBJECT', properties, ...(required.length ? { required } : {}) });

export const DECLARATIONS: any[] = [
  {
    name: 'search_ticker',
    description: "Busca el ticker de una empresa o activo a partir de su nombre (ej. 'Apple', 'Mercado Libre', 'YPF'). Devuelve candidatos con símbolo, nombre, bolsa y tipo. Usala cuando el usuario no da el ticker exacto.",
    parameters: obj({ query: S }, ['query']),
  },
  {
    name: 'get_quote',
    description: 'Última cotización disponible de un activo (acción, CEDEAR, ETF, cripto, índice): precio, moneda, cierre previo, variación diaria % y volumen, con la fecha de la rueda.',
    parameters: obj({ ticker: S }, ['ticker']),
  },
  {
    name: 'get_fundamentals',
    description: 'Métricas fundamentales y de valuación de una empresa: P/E (TTM y forward), P/B, EV/EBITDA, dividend yield, payout, ROE, márgenes, deuda/patrimonio, flujo de caja libre, FCF yield, beta y objetivos de analistas. Cada métrica trae su base (TTM/forward), fórmula e insumos.',
    parameters: obj({ ticker: S }, ['ticker']),
  },
  {
    name: 'get_financials',
    description: "Estados contables históricos (últimos 4 períodos): ingresos, utilidad bruta/operativa, EBITDA, utilidad neta, EPS, flujo operativo, capex, flujo de caja libre, deuda total, caja y patrimonio. period: 'annual' (anual) o 'quarterly' (trimestral). Cada fila trae la fecha de cierre del período.",
    parameters: obj({ ticker: S, period: S }, ['ticker']),
  },
  {
    name: 'get_technicals',
    description: "Análisis técnico calculado sobre precios reales: RSI14, MACD(12,26,9), EMA 20/50/200, Bandas de Bollinger, ATR14, máximo/mínimo del período, distancia a la EMA200 y señales descriptivas. La app muestra el gráfico automáticamente. period: '6mo','1y','2y','5y' (por defecto '1y'). interval: '1d' o '1wk'. Para tener la EMA200 usá period '1y' o más (con '6mo' o menos NO se puede calcular: faltan barras); salvo que el usuario pida un plazo corto, usá '1y'.",
    parameters: obj({ ticker: S, period: S, interval: S }, ['ticker']),
  },
  {
    name: 'get_performance',
    description: "Rendimiento (%) a 1 mes, 3 meses, 6 meses, en el año, 1, 3 y 5 años; CAGR a 3 y 5 años; volatilidad anualizada y caída máxima del último año de un activo, calculados con precios ajustados. USALA para cualquier pregunta de rendimiento, retorno, volatilidad o caída: no los calcules vos. Los horizontes sin historia suficiente vienen en null.",
    parameters: obj({ ticker: S }, ['ticker']),
  },
  {
    name: 'get_news',
    description: 'Últimas noticias de un activo (título, fecha, medio y link). Sirven como contexto, no como prueba de causalidad: que una noticia coincida con un movimiento de precio no demuestra que lo haya causado.',
    parameters: obj({ ticker: S, limit: { type: 'INTEGER' } }, ['ticker']),
  },
  {
    name: 'compare_assets',
    description: 'Compara 2 a 6 activos lado a lado con las mismas métricas (valuación, rentabilidad, deuda, dividendos) y su estado técnico básico (RSI14 y distancia a EMA200). La app muestra un gráfico de rendimiento comparado. Advierte si las monedas difieren.',
    parameters: obj({ tickers: { type: 'ARRAY', items: S } }, ['tickers']),
  },
  {
    name: 'screen_assets',
    description: "Filtra activos con criterios cuantitativos, aplicados en código (no por el modelo). Indicá `tickers` (lista) o `universe` ('merval_lideres','adrs_argentinos','cedears_populares','usa_mega_caps'). Filtros opcionales: max_pe (P/E TTM máximo), min_dividend_yield_pct (en %), max_debt_to_equity (ratio, 1.0 = deuda igual al patrimonio), min_roe_pct (en %), min_market_cap (en la moneda de cotización de cada activo). Devuelve los que pasan Y los excluidos con el motivo exacto. Máximo 30 activos por llamada.",
    parameters: obj({
      tickers: { type: 'ARRAY', items: S, nullable: true }, universe: { ...S, nullable: true },
      max_pe: { type: 'NUMBER', nullable: true }, min_dividend_yield_pct: { type: 'NUMBER', nullable: true },
      max_debt_to_equity: { type: 'NUMBER', nullable: true }, min_roe_pct: { type: 'NUMBER', nullable: true },
      min_market_cap: { type: 'NUMBER', nullable: true },
    }),
  },
  {
    name: 'calculate',
    description: "Calculadora exacta. Evalúa una expresión aritmética con números (+ - * / ** % paréntesis, abs, round, min, max, sqrt). Usala para TODO cálculo derivado (variaciones %, diferencias, promedios, upside): el modelo no debe hacer aritmética de cabeza. Ejemplo: '(187.32 / 150 - 1) * 100'.",
    parameters: obj({ expression: S }, ['expression']),
  },
  {
    name: 'get_market_overview',
    description: "Panorama del mercado ahora: S&P 500, Nasdaq, Dow Jones, Merval, VIX, Bitcoin, oro y petróleo con variación diaria; mayores subas, bajas y más operadas de EE.UU.; y el índice de miedo y codicia cripto. Usala para '¿cómo está el mercado?', 'resumen del día', 'qué está pasando hoy'. La app muestra tarjetas con mini-gráficos.",
    parameters: obj({}),
  },
  {
    name: 'get_movers',
    description: "Ranking intradía de EE.UU. según Yahoo Finance. kind: 'day_gainers' (mayores subas), 'day_losers' (mayores bajas) o 'most_actives' (más operadas). Incluye empresas de cualquier tamaño.",
    parameters: obj({ kind: S }),
  },
  {
    name: 'get_argentina_macro',
    description: 'Contexto macro de Argentina: cotizaciones del dólar (oficial, blue, MEP, CCL, mayorista, cripto, tarjeta) con brecha contra el oficial, riesgo país e inflación mensual e interanual. Usala para dólar, brecha, riesgo país, inflación o cualquier análisis de activos argentinos.',
    parameters: obj({}),
  },
  {
    name: 'get_headlines',
    description: "Titulares recientes de medios (últimos 2 días) para entender la narrativa del mercado. topic: tema opcional (ej. 'Merval', 'Nvidia', 'Fed', 'bonos'); si se omite, trae titulares generales de mercados. region: 'ar' (medios argentinos, en español) o 'us' (medios globales, en inglés). Son narrativa mediática, no hechos verificados.",
    parameters: obj({ topic: S, region: S, limit: { type: 'INTEGER' } }),
  },
];
