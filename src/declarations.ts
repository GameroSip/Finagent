// GENERADO a partir del SDK oficial de Gemini; describe las herramientas que el modelo puede invocar.
export const DECLARATIONS: any[] = [
  {
    "description": "Busca el ticker de una empresa o activo a partir de su nombre (ej. 'Apple', 'Mercado Libre', 'YPF').\nDevuelve candidatos con símbolo, nombre, bolsa y tipo. Usala cuando el usuario no da el ticker exacto.",
    "name": "search_ticker",
    "parameters": {
      "properties": {
        "query": {
          "type": "STRING"
        }
      },
      "required": [
        "query"
      ],
      "type": "OBJECT"
    }
  },
  {
    "description": "Última cotización disponible de un activo (acción, CEDEAR, ETF, cripto, índice): precio, moneda,\ncierre previo, variación diaria % y volumen, con la fecha de la rueda.",
    "name": "get_quote",
    "parameters": {
      "properties": {
        "ticker": {
          "type": "STRING"
        }
      },
      "required": [
        "ticker"
      ],
      "type": "OBJECT"
    }
  },
  {
    "description": "Métricas fundamentales y de valuación de una empresa: P/E (TTM y forward), P/B, EV/EBITDA, dividend yield,\npayout, ROE, márgenes, deuda/patrimonio, flujo de caja libre, FCF yield, beta y objetivos de analistas.\nCada métrica trae su base (TTM/forward), fórmula e insumos.",
    "name": "get_fundamentals",
    "parameters": {
      "properties": {
        "ticker": {
          "type": "STRING"
        }
      },
      "required": [
        "ticker"
      ],
      "type": "OBJECT"
    }
  },
  {
    "description": "Estados contables históricos (últimos 4 períodos): ingresos, utilidad bruta/operativa, EBITDA, utilidad neta,\nEPS, flujo operativo, capex, flujo de caja libre, deuda total, caja y patrimonio.\nperiod: 'annual' (anual) o 'quarterly' (trimestral). Cada fila trae la fecha de cierre del período.",
    "name": "get_financials",
    "parameters": {
      "properties": {
        "ticker": {
          "type": "STRING"
        },
        "period": {
          "type": "STRING"
        }
      },
      "required": [
        "ticker"
      ],
      "type": "OBJECT"
    }
  },
  {
    "description": "Análisis técnico calculado sobre precios reales: RSI14, MACD(12,26,9), EMA 20/50/200, Bandas de Bollinger,\nATR14, máximo/mínimo del período, distancia a la EMA200 y señales descriptivas.\nperiod: '6mo','1y','2y','5y'. interval: '1d' o '1wk'. Para EMA200 se necesitan al menos 200 barras.",
    "name": "get_technicals",
    "parameters": {
      "properties": {
        "ticker": {
          "type": "STRING"
        },
        "period": {
          "type": "STRING"
        },
        "interval": {
          "type": "STRING"
        }
      },
      "required": [
        "ticker"
      ],
      "type": "OBJECT"
    }
  },
  {
    "description": "Últimas noticias de un activo (título, fecha, medio y link). Sirven como contexto, no como prueba de\ncausalidad: que una noticia coincida con un movimiento de precio no demuestra que lo haya causado.",
    "name": "get_news",
    "parameters": {
      "properties": {
        "ticker": {
          "type": "STRING"
        },
        "limit": {
          "type": "INTEGER"
        }
      },
      "required": [
        "ticker"
      ],
      "type": "OBJECT"
    }
  },
  {
    "description": "Compara 2 a 6 activos lado a lado con las mismas métricas (valuación, rentabilidad, deuda, dividendos)\ny su estado técnico básico (RSI14 y distancia a EMA200). Advierte si las monedas difieren.",
    "name": "compare_assets",
    "parameters": {
      "properties": {
        "tickers": {
          "items": {
            "type": "STRING"
          },
          "type": "ARRAY"
        }
      },
      "required": [
        "tickers"
      ],
      "type": "OBJECT"
    }
  },
  {
    "description": "Filtra activos con criterios cuantitativos, aplicados en código (no por el modelo).\nIndicá `tickers` (lista) o `universe` ('merval_lideres','adrs_argentinos','cedears_populares','usa_mega_caps').\nFiltros opcionales: max_pe (P/E TTM máximo), min_dividend_yield_pct (en %), max_debt_to_equity (ratio, 1.0 = deuda\nigual al patrimonio), min_roe_pct (en %), min_market_cap (en la moneda de cotización de cada activo).\nDevuelve los que pasan Y los excluidos con el motivo exacto. Máximo 30 activos por llamada.",
    "name": "screen_assets",
    "parameters": {
      "properties": {
        "tickers": {
          "items": {
            "type": "STRING"
          },
          "nullable": true,
          "type": "ARRAY"
        },
        "universe": {
          "nullable": true,
          "type": "STRING"
        },
        "max_pe": {
          "nullable": true,
          "type": "NUMBER"
        },
        "min_dividend_yield_pct": {
          "nullable": true,
          "type": "NUMBER"
        },
        "max_debt_to_equity": {
          "nullable": true,
          "type": "NUMBER"
        },
        "min_roe_pct": {
          "nullable": true,
          "type": "NUMBER"
        },
        "min_market_cap": {
          "nullable": true,
          "type": "NUMBER"
        }
      },
      "required": [],
      "type": "OBJECT"
    }
  },
  {
    "description": "Calculadora exacta. Evalúa una expresión aritmética con números (+ - * / ** % paréntesis, abs, round, min,\nmax, sqrt). Usala para TODO cálculo derivado (variaciones %, diferencias, promedios, upside): el modelo\nno debe hacer aritmética de cabeza. Ejemplo: '(187.32 / 150 - 1) * 100'.",
    "name": "calculate",
    "parameters": {
      "properties": {
        "expression": {
          "type": "STRING"
        }
      },
      "required": [
        "expression"
      ],
      "type": "OBJECT"
    }
  }
];
