# Radar de tensión — backtest

Ejecutado: 2026-11-02 23:20 UTC · 49 activos · períodos: 1927-12-30 a 2026-11-02

## Cómo leer esto

- **Evento** = el cierre más bajo de las próximas *h* ruedas queda ≥ 5 % (o ≥ 10 %) por debajo del cierre del día. 3 ruedas ≈ las "24 a 72 horas" de la idea original.
- **Esperada por azar** = la frecuencia de caídas de ese mismo activo en un día cualquiera (así no se confunde "activo volátil" con "señal"). **Lift** = caídas tras rojo ÷ esperadas. 1× = el rojo no aporta nada.
- **Lift subas** y **Direccionalidad** = lo mismo para subas ≥ umbral, y el cociente caídas/subas. Cerca de 1× significa que el radar solo detecta que habrá movimientos grandes (volatilidad), no hacia dónde.
- **Precisión** = de cada 100 rojos, cuántos terminaron en caída. **Cobertura** = de todas las caídas, cuántas venían precedidas por un rojo.
- Entre corchetes, intervalo de confianza del 95 % (**optimista**: los días seguidos y los activos que se mueven juntos no son independientes).
- Los umbrales del radar se fijaron antes de mirar datos y no se ajustaron. Universo = activos que hoy existen (**sesgo de supervivencia**: el resultado real sería algo peor).

## 1. Qué tan rara es una caída fuerte (días cualquiera)

| Grupo | Horizonte | Días | Caída ≥ 5 % | Caída ≥ 10 % |
|---|---|---|---|---|
| todos | 3 ruedas | 428.2 mil | 7.38 % | 1.45 % |
| todos | 5 ruedas | 428.1 mil | 12.67 % | 3.00 % |
| todos | 20 ruedas | 427.4 mil | 34.79 % | 14.47 % |
| índices | 3 ruedas | 64.3 mil | 2.15 % | 0.23 % |
| índices | 5 ruedas | 64.3 mil | 4.48 % | 0.63 % |
| índices | 20 ruedas | 64.2 mil | 20.41 % | 5.43 % |
| ETF | 3 ruedas | 51.7 mil | 3.11 % | 0.45 % |
| ETF | 5 ruedas | 51.6 mil | 6.06 % | 1.01 % |
| ETF | 20 ruedas | 51.5 mil | 23.71 % | 6.79 % |
| acciones | 3 ruedas | 294.8 mil | 8.43 % | 1.53 % |
| acciones | 5 ruedas | 294.7 mil | 14.54 % | 3.28 % |
| acciones | 20 ruedas | 294.3 mil | 38.55 % | 16.41 % |
| cripto | 3 ruedas | 17.4 mil | 21.66 % | 7.50 % |
| cripto | 5 ruedas | 17.4 mil | 30.88 % | 12.95 % |
| cripto | 20 ruedas | 17.4 mil | 57.25 % | 38.01 % |

## 2. ¿El rojo anticipa una caída ≥ 10 %?

| Grupo | Horizonte | Días en rojo | Caída tras rojo | Esperada por azar | Lift caídas | Lift subas | Direccionalidad | Precisión | Cobertura | Episodios (tasa) |
|---|---|---|---|---|---|---|---|---|---|---|
| todos | 3 | 3.2 mil | 4.9 % [4.2 %–5.7 %] | 1.73 % | 2.83× | 3.15× | 0.90× | 4.9 % | 2.5 % | 2110 (4.6 %) |
| todos | 5 | 3.2 mil | 8.0 % [7.1 %–9.0 %] | 3.54 % | 2.27× | 2.30× | 0.98× | 8.0 % | 2.0 % | 2110 (7.8 %) |
| todos | 20 | 3.2 mil | 24.0 % [22.5 %–25.5 %] | 16.26 % | 1.48× | 1.31× | 1.13× | 24.0 % | 1.2 % | 2105 (22.9 %) |
| índices | 3 | 278 | 2.5 % [1.2 %–5.1 %] | 0.22 % | 11.32× | 22.94× | 0.49× | 2.5 % | 4.8 % | 178 (2.8 %) |
| índices | 5 | 278 | 4.7 % [2.8 %–7.8 %] | 0.65 % | 7.16× | 13.52× | 0.53× | 4.7 % | 3.2 % | 178 (3.9 %) |
| índices | 20 | 278 | 18.3 % [14.2 %–23.3 %] | 5.61 % | 3.27× | 4.26× | 0.77× | 18.3 % | 1.5 % | 178 (16.3 %) |
| ETF | 3 | 491 | 2.0 % [1.1 %–3.7 %] | 0.47 % | 4.32× | 4.85× | 0.89× | 2.0 % | 4.3 % | 292 (1.7 %) |
| ETF | 5 | 491 | 3.5 % [2.2 %–5.5 %] | 1.06 % | 3.25× | 4.26× | 0.76× | 3.5 % | 3.3 % | 292 (3.8 %) |
| ETF | 20 | 491 | 13.8 % [11.1 %–17.2 %] | 7.17 % | 1.93× | 2.32× | 0.83× | 13.8 % | 1.9 % | 292 (10.6 %) |
| acciones | 3 | 2.2 mil | 5.2 % [4.4 %–6.2 %] | 1.75 % | 2.97× | 2.98× | 1.00× | 5.2 % | 2.6 % | 1504 (4.7 %) |
| acciones | 5 | 2.2 mil | 8.4 % [7.3 %–9.6 %] | 3.73 % | 2.24× | 2.16× | 1.04× | 8.4 % | 1.9 % | 1504 (7.8 %) |
| acciones | 20 | 2.2 mil | 25.3 % [23.5 %–27.1 %] | 17.95 % | 1.41× | 1.19× | 1.18× | 25.3 % | 1.2 % | 1499 (23.9 %) |
| cripto | 3 | 176 | 12.5 % [8.4 %–18.2 %] | 7.30 % | 1.71× | 3.00× | 0.57× | 12.5 % | 1.7 % | 136 (13.2 %) |
| cripto | 5 | 176 | 21.6 % [16.2 %–28.2 %] | 12.57 % | 1.72× | 2.16× | 0.80× | 21.6 % | 1.7 % | 136 (21.3 %) |
| cripto | 20 | 176 | 44.9 % [37.7 %–52.3 %] | 37.11 % | 1.21× | 1.32× | 0.92× | 44.9 % | 1.2 % | 136 (46.3 %) |

## 2. ¿El rojo anticipa una caída ≥ 5 %?

| Grupo | Horizonte | Días en rojo | Caída tras rojo | Esperada por azar | Lift caídas | Lift subas | Direccionalidad | Precisión | Cobertura | Episodios (tasa) |
|---|---|---|---|---|---|---|---|---|---|---|
| todos | 3 | 3.2 mil | 17.4 % [16.1 %–18.8 %] | 8.39 % | 2.07× | 2.30× | 0.90× | 17.4 % | 1.7 % | 2110 (17.8 %) |
| todos | 5 | 3.2 mil | 22.9 % [21.5 %–24.4 %] | 14.14 % | 1.62× | 1.85× | 0.87× | 22.9 % | 1.3 % | 2110 (23.5 %) |
| todos | 20 | 3.2 mil | 44.5 % [42.8 %–46.2 %] | 36.92 % | 1.21× | 1.22× | 0.99× | 44.5 % | 0.9 % | 2105 (44.3 %) |
| índices | 3 | 278 | 14.4 % [10.7 %–19.0 %] | 2.25 % | 6.39× | 10.33× | 0.62× | 14.4 % | 2.9 % | 178 (14.6 %) |
| índices | 5 | 278 | 15.8 % [12.0 %–20.6 %] | 4.66 % | 3.40× | 6.62× | 0.51× | 15.8 % | 1.5 % | 178 (15.7 %) |
| índices | 20 | 278 | 34.5 % [29.2 %–40.3 %] | 20.98 % | 1.65× | 2.26× | 0.73× | 34.5 % | 0.7 % | 178 (32.0 %) |
| ETF | 3 | 491 | 13.4 % [10.7 %–16.7 %] | 3.28 % | 4.10× | 4.11× | 1.00× | 13.4 % | 4.1 % | 292 (14.7 %) |
| ETF | 5 | 491 | 16.1 % [13.1 %–19.6 %] | 6.35 % | 2.53× | 3.37× | 0.75× | 16.1 % | 2.5 % | 292 (17.5 %) |
| ETF | 20 | 491 | 33.8 % [29.8 %–38.1 %] | 24.20 % | 1.40× | 1.57× | 0.89× | 33.8 % | 1.4 % | 292 (32.5 %) |
| acciones | 3 | 2.2 mil | 18.1 % [16.5 %–19.7 %] | 9.28 % | 1.95× | 2.08× | 0.94× | 18.1 % | 1.6 % | 1504 (18.0 %) |
| acciones | 5 | 2.2 mil | 24.0 % [22.3 %–25.8 %] | 15.77 % | 1.52× | 1.65× | 0.92× | 24.0 % | 1.3 % | 1504 (24.1 %) |
| acciones | 20 | 2.2 mil | 46.8 % [44.7 %–48.9 %] | 40.17 % | 1.16× | 1.11× | 1.05× | 46.8 % | 0.9 % | 1499 (46.4 %) |
| cripto | 3 | 176 | 25.0 % [19.2 %–31.9 %] | 21.09 % | 1.19× | 2.10× | 0.57× | 25.0 % | 1.2 % | 136 (25.7 %) |
| cripto | 5 | 176 | 38.6 % [31.8 %–46.0 %] | 30.22 % | 1.28× | 1.66× | 0.77× | 38.6 % | 1.3 % | 136 (39.7 %) |
| cripto | 20 | 176 | 61.4 % [54.0 %–68.2 %] | 56.49 % | 1.09× | 1.21× | 0.90× | 61.4 % | 1.1 % | 136 (61.8 %) |

## 3. ¿Avisa antes o llega tarde? (caída ≥ 5 %, todos los activos)

| Horizonte | Tras rojo (episodio) | Tras rojo que NO venía cayendo | Tras "ya cayó ≥ 5 % en 3 ruedas" |
|---|---|---|---|
| 3 ruedas | 17.8 % [16.2 %–19.5 %] vs 8.6 % esperado (n=2.1 mil) | 13.1 % [10.4 %–16.3 %] vs 8.7 % esperado (n=490) | 20.5 % [20.0 %–21.0 %] vs 12.4 % esperado (n=25.0 mil) |
| 5 ruedas | 23.5 % [21.7 %–25.3 %] vs 14.5 % esperado (n=2.1 mil) | 20.4 % [17.1 %–24.2 %] vs 14.3 % esperado (n=490) | 28.7 % [28.1 %–29.2 %] vs 19.7 % esperado (n=25.0 mil) |
| 20 ruedas | 44.3 % [42.2 %–46.4 %] vs 37.4 % esperado (n=2.1 mil) | 41.2 % [37.0 %–45.6 %] vs 36.3 % esperado (n=490) | 54.1 % [53.5 %–54.7 %] vs 44.7 % esperado (n=24.9 mil) |

*Si el rojo "sin caída previa" no supera lo esperado, el radar no avisa antes: solo confirma una caída que ya empezó.*

## 4. Estabilidad en el tiempo (todos los activos)

| Caída | Horizonte | Período | Días en rojo | Caída tras rojo | Esperada | Lift caídas | Direccionalidad |
|---|---|---|---|---|---|---|---|
| ≥ 10 % | 5 | antes de 2015 | 1.8 mil | 7.4 % [6.2 %–8.7 %] | 3.04 % | 2.42× | 0.93× |
| ≥ 10 % | 5 | desde 2015 | 1.4 mil | 8.9 % [7.5 %–10.5 %] | 4.01 % | 2.22× | 1.04× |
| ≥ 10 % | 20 | antes de 2015 | 1.8 mil | 20.8 % [19.0 %–22.7 %] | 15.38 % | 1.35× | 1.04× |
| ≥ 10 % | 20 | desde 2015 | 1.4 mil | 28.2 % [25.9 %–30.6 %] | 16.73 % | 1.68× | 1.24× |
| ≥ 5 % | 5 | antes de 2015 | 1.8 mil | 22.2 % [20.3 %–24.2 %] | 13.64 % | 1.63× | 0.88× |
| ≥ 5 % | 5 | desde 2015 | 1.4 mil | 23.8 % [21.6 %–26.1 %] | 14.09 % | 1.69× | 0.87× |
| ≥ 5 % | 20 | antes de 2015 | 1.8 mil | 42.5 % [40.2 %–44.8 %] | 36.61 % | 1.16× | 0.96× |
| ≥ 5 % | 20 | desde 2015 | 1.4 mil | 47.1 % [44.5 %–49.8 %] | 36.30 % | 1.30× | 1.04× |

## 5. Veredicto automático

*Regla fijada de antemano: "alarma útil" solo si las caídas tras rojo son ≥ 2× lo esperado por azar (mismo activo), el límite inferior del intervalo lo supera, las caídas aumentan ≥ 1,5× más que las subas, y se sostiene antes y después de 2015.*

| Caída | Horizonte | Veredicto |
|---|---|---|
| ≥ 10 % | 3 ruedas | detecta volatilidad, no dirección |
| ≥ 10 % | 5 ruedas | detecta volatilidad, no dirección |
| ≥ 10 % | 20 ruedas | detecta volatilidad, no dirección |
| ≥ 5 % | 3 ruedas | detecta volatilidad, no dirección |
| ≥ 5 % | 5 ruedas | detecta volatilidad, no dirección |
| ≥ 5 % | 20 ruedas | no se distingue del azar |

## Datos

Parámetros del radar (fijos): {"rsiPeriod":14,"rsiHigh":70,"overboughtLookback":10,"rsiFadeLag":5,"supportWindow":20,"volWindow":20,"volMult":1.5,"atrFast":5,"atrSlow":60,"atrRatio":1.4,"warmup":60}

| Activo | Grupo | Ruedas | Desde | Hasta |
|---|---|---|---|---|
| ^GSPC | índices | 24827 | 1927-12-30 | 2026-11-02 |
| ^IXIC | índices | 14053 | 1971-02-05 | 2026-11-02 |
| ^DJI | índices | 8771 | 1992-01-02 | 2026-11-02 |
| ^RUT | índices | 9861 | 1987-09-10 | 2026-11-02 |
| ^FTSE | índices | 10821 | 1984-01-03 | 2026-11-02 |
| ^GDAXI | índices | 9822 | 1987-12-29 | 2026-10-29 |
| ^HSI | índices | 9830 | 1986-12-30 | 2026-10-29 |
| SPY | ETF | 8498 | 1993-01-29 | 2026-11-02 |
| QQQ | ETF | 6956 | 1999-03-10 | 2026-11-02 |
| IWM | ETF | 6648 | 2000-05-26 | 2026-11-02 |
| EEM | ETF | 5927 | 2003-04-14 | 2026-11-02 |
| GLD | ETF | 5523 | 2004-11-18 | 2026-11-02 |
| TLT | ETF | 6105 | 2002-07-30 | 2026-11-02 |
| XLE | ETF | 7008 | 1998-12-22 | 2026-11-02 |
| XLF | ETF | 7008 | 1998-12-22 | 2026-11-02 |
| AAPL | acciones | 11565 | 1980-12-12 | 2026-11-02 |
| MSFT | acciones | 10239 | 1986-03-13 | 2026-11-02 |
| AMZN | acciones | 7413 | 1997-05-15 | 2026-11-02 |
| GOOGL | acciones | 5587 | 2004-08-19 | 2026-11-02 |
| META | acciones | 3635 | 2012-05-18 | 2026-11-02 |
| NVDA | acciones | 6988 | 1999-01-22 | 2026-11-02 |
| TSLA | acciones | 4112 | 2010-06-29 | 2026-11-02 |
| AMD | acciones | 11753 | 1980-03-17 | 2026-11-02 |
| NFLX | acciones | 6151 | 2002-05-23 | 2026-11-02 |
| INTC | acciones | 11753 | 1980-03-17 | 2026-11-02 |
| KO | acciones | 16318 | 1962-01-02 | 2026-11-02 |
| PEP | acciones | 13719 | 1972-06-01 | 2026-11-02 |
| JNJ | acciones | 16318 | 1962-01-02 | 2026-11-02 |
| PFE | acciones | 13719 | 1972-06-01 | 2026-11-02 |
| JPM | acciones | 11753 | 1980-03-17 | 2026-11-02 |
| BAC | acciones | 13539 | 1973-02-21 | 2026-11-02 |
| XOM | acciones | 16318 | 1962-01-02 | 2026-11-02 |
| CVX | acciones | 16318 | 1962-01-02 | 2026-11-02 |
| WMT | acciones | 13659 | 1972-08-25 | 2026-11-02 |
| DIS | acciones | 16318 | 1962-01-02 | 2026-11-02 |
| BA | acciones | 16318 | 1962-01-02 | 2026-11-02 |
| F | acciones | 13719 | 1972-06-01 | 2026-11-02 |
| T | acciones | 10821 | 1983-11-21 | 2026-11-02 |
| GME | acciones | 6220 | 2002-02-13 | 2026-11-02 |
| GGAL | acciones | 6608 | 2000-07-25 | 2026-11-02 |
| YPF | acciones | 8394 | 1993-06-29 | 2026-11-02 |
| MELI | acciones | 4838 | 2007-08-10 | 2026-11-02 |
| VALE | acciones | 6195 | 2002-03-21 | 2026-11-02 |
| PBR | acciones | 6596 | 2000-08-10 | 2026-11-02 |
| BTC-USD | cripto | 4430 | 2014-09-17 | 2026-11-02 |
| ETH-USD | cripto | 3281 | 2017-11-09 | 2026-11-02 |
| XRP-USD | cripto | 3281 | 2017-11-09 | 2026-11-02 |
| LTC-USD | cripto | 4430 | 2014-09-17 | 2026-11-02 |
| DOGE-USD | cripto | 3281 | 2017-11-09 | 2026-11-02 |

**Excluidos:**

- ^N225: no informa volumen (la condición de volumen no se puede medir)
- ^BVSP: no informa volumen (la condición de volumen no se puede medir)
- ^MERV: no informa volumen (la condición de volumen no se puede medir)
