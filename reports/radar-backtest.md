# Radar de tensión — backtest

Ejecutado: 2026-10-30 19:22 UTC · 49 activos · períodos: 1927-12-30 a 2026-10-30

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
| todos | 3 ruedas | 464.1 mil | 7.26 % | 1.44 % |
| todos | 5 ruedas | 464.0 mil | 12.48 % | 2.97 % |
| todos | 20 ruedas | 463.3 mil | 34.38 % | 14.28 % |
| índices | 3 ruedas | 87.5 mil | 2.27 % | 0.26 % |
| índices | 5 ruedas | 87.5 mil | 4.74 % | 0.68 % |
| índices | 20 ruedas | 87.4 mil | 20.68 % | 5.79 % |
| ETF | 3 ruedas | 53.2 mil | 3.08 % | 0.44 % |
| ETF | 5 ruedas | 53.1 mil | 6.05 % | 0.99 % |
| ETF | 20 ruedas | 53.0 mil | 23.69 % | 6.75 % |
| acciones | 3 ruedas | 305.0 mil | 8.51 % | 1.55 % |
| acciones | 5 ruedas | 305.0 mil | 14.66 % | 3.33 % |
| acciones | 20 ruedas | 304.5 mil | 38.75 % | 16.53 % |
| cripto | 3 ruedas | 18.4 mil | 22.35 % | 8.05 % |
| cripto | 5 ruedas | 18.4 mil | 31.71 % | 13.75 % |
| cripto | 20 ruedas | 18.3 mil | 58.10 % | 39.24 % |

## 2. ¿El rojo anticipa una caída ≥ 10 %?

| Grupo | Horizonte | Días en rojo | Caída tras rojo | Esperada por azar | Lift caídas | Lift subas | Direccionalidad | Precisión | Cobertura | Episodios (tasa) |
|---|---|---|---|---|---|---|---|---|---|---|
| todos | 3 | 3.3 mil | 4.8 % [4.1 %–5.5 %] | 1.74 % | 2.73× | 3.24× | 0.84× | 4.8 % | 2.4 % | 2233 (4.6 %) |
| todos | 5 | 3.3 mil | 7.8 % [7.0 %–8.8 %] | 3.56 % | 2.21× | 2.35× | 0.94× | 7.8 % | 1.9 % | 2232 (7.7 %) |
| todos | 20 | 3.3 mil | 23.7 % [22.3 %–25.1 %] | 16.21 % | 1.46× | 1.32× | 1.11× | 23.7 % | 1.2 % | 2228 (22.6 %) |
| índices | 3 | 341 | 2.3 % [1.2 %–4.6 %] | 0.26 % | 8.99× | 18.75× | 0.48× | 2.3 % | 3.5 % | 220 (2.7 %) |
| índices | 5 | 341 | 4.1 % [2.5 %–6.8 %] | 0.69 % | 5.92× | 11.16× | 0.53× | 4.1 % | 2.4 % | 220 (3.6 %) |
| índices | 20 | 341 | 17.3 % [13.7 %–21.7 %] | 5.87 % | 2.95× | 3.31× | 0.89× | 17.3 % | 1.2 % | 220 (15.5 %) |
| ETF | 3 | 504 | 2.0 % [1.1 %–3.6 %] | 0.46 % | 4.29× | 5.37× | 0.80× | 2.0 % | 4.3 % | 301 (1.7 %) |
| ETF | 5 | 504 | 3.4 % [2.1 %–5.3 %] | 1.05 % | 3.22× | 4.61× | 0.70× | 3.4 % | 3.2 % | 301 (3.7 %) |
| ETF | 20 | 504 | 13.5 % [10.8 %–16.8 %] | 7.14 % | 1.89× | 2.26× | 0.83× | 13.5 % | 1.9 % | 301 (10.3 %) |
| acciones | 3 | 2.3 mil | 5.2 % [4.3 %–6.1 %] | 1.76 % | 2.93× | 3.03× | 0.97× | 5.2 % | 2.5 % | 1570 (4.6 %) |
| acciones | 5 | 2.3 mil | 8.3 % [7.3 %–9.5 %] | 3.75 % | 2.22× | 2.19× | 1.01× | 8.3 % | 1.9 % | 1569 (7.8 %) |
| acciones | 20 | 2.3 mil | 25.0 % [23.3 %–26.9 %] | 17.95 % | 1.39× | 1.20× | 1.16× | 25.0 % | 1.1 % | 1565 (23.8 %) |
| cripto | 3 | 185 | 11.9 % [8.0 %–17.3 %] | 7.77 % | 1.53× | 3.17× | 0.48× | 11.9 % | 1.5 % | 142 (12.7 %) |
| cripto | 5 | 185 | 21.1 % [15.8 %–27.5 %] | 13.27 % | 1.59× | 2.25× | 0.71× | 21.1 % | 1.5 % | 142 (21.1 %) |
| cripto | 20 | 185 | 45.9 % [38.9 %–53.1 %] | 38.27 % | 1.20× | 1.36× | 0.88× | 45.9 % | 1.2 % | 142 (46.5 %) |

## 2. ¿El rojo anticipa una caída ≥ 5 %?

| Grupo | Horizonte | Días en rojo | Caída tras rojo | Esperada por azar | Lift caídas | Lift subas | Direccionalidad | Precisión | Cobertura | Episodios (tasa) |
|---|---|---|---|---|---|---|---|---|---|---|
| todos | 3 | 3.3 mil | 17.0 % [15.8 %–18.4 %] | 8.36 % | 2.04× | 2.31× | 0.88× | 17.0 % | 1.7 % | 2233 (17.4 %) |
| todos | 5 | 3.3 mil | 22.3 % [21.0 %–23.8 %] | 14.09 % | 1.59× | 1.87× | 0.85× | 22.3 % | 1.3 % | 2232 (22.9 %) |
| todos | 20 | 3.3 mil | 43.8 % [42.1 %–45.5 %] | 36.77 % | 1.19× | 1.22× | 0.98× | 43.8 % | 0.9 % | 2228 (43.5 %) |
| índices | 3 | 341 | 12.3 % [9.2 %–16.2 %] | 2.32 % | 5.32× | 8.66× | 0.61× | 12.3 % | 2.1 % | 220 (12.7 %) |
| índices | 5 | 341 | 13.5 % [10.3 %–17.5 %] | 4.82 % | 2.80× | 5.53× | 0.51× | 13.5 % | 1.1 % | 220 (13.6 %) |
| índices | 20 | 341 | 32.0 % [27.2 %–37.1 %] | 20.86 % | 1.53× | 1.95× | 0.79× | 32.0 % | 0.6 % | 220 (29.5 %) |
| ETF | 3 | 504 | 13.5 % [10.8 %–16.8 %] | 3.25 % | 4.15× | 4.13× | 1.00× | 13.5 % | 4.2 % | 301 (14.6 %) |
| ETF | 5 | 504 | 16.1 % [13.1 %–19.5 %] | 6.35 % | 2.53× | 3.30× | 0.77× | 16.1 % | 2.5 % | 301 (17.3 %) |
| ETF | 20 | 504 | 33.5 % [29.5 %–37.8 %] | 24.16 % | 1.39× | 1.57× | 0.89× | 33.5 % | 1.3 % | 301 (32.2 %) |
| acciones | 3 | 2.3 mil | 17.9 % [16.4 %–19.5 %] | 9.30 % | 1.93× | 2.09× | 0.92× | 17.9 % | 1.6 % | 1570 (17.9 %) |
| acciones | 5 | 2.3 mil | 23.7 % [22.1 %–25.5 %] | 15.80 % | 1.50× | 1.67× | 0.90× | 23.7 % | 1.2 % | 1569 (23.8 %) |
| acciones | 20 | 2.3 mil | 46.4 % [44.3 %–48.4 %] | 40.24 % | 1.15× | 1.12× | 1.03× | 46.4 % | 0.9 % | 1565 (46.0 %) |
| cripto | 3 | 185 | 24.3 % [18.7 %–31.0 %] | 21.71 % | 1.12× | 2.12× | 0.53× | 24.3 % | 1.1 % | 142 (25.4 %) |
| cripto | 5 | 185 | 38.4 % [31.7 %–45.6 %] | 30.96 % | 1.24× | 1.70× | 0.73× | 38.4 % | 1.2 % | 142 (40.1 %) |
| cripto | 20 | 185 | 62.2 % [55.0 %–68.8 %] | 57.32 % | 1.08× | 1.22× | 0.89× | 62.2 % | 1.1 % | 142 (62.0 %) |

## 3. ¿Avisa antes o llega tarde? (caída ≥ 5 %, todos los activos)

| Horizonte | Tras rojo (episodio) | Tras rojo que NO venía cayendo | Tras "ya cayó ≥ 5 % en 3 ruedas" |
|---|---|---|---|
| 3 ruedas | 17.4 % [15.9 %–19.0 %] vs 8.6 % esperado (n=2.2 mil) | 12.7 % [10.1 %–15.8 %] vs 8.5 % esperado (n=527) | 20.7 % [20.2 %–21.2 %] vs 12.4 % esperado (n=26.6 mil) |
| 5 ruedas | 22.9 % [21.2 %–24.7 %] vs 14.4 % esperado (n=2.2 mil) | 19.9 % [16.7 %–23.5 %] vs 14.0 % esperado (n=527) | 28.9 % [28.3 %–29.4 %] vs 19.7 % esperado (n=26.6 mil) |
| 20 ruedas | 43.5 % [41.5 %–45.6 %] vs 37.2 % esperado (n=2.2 mil) | 40.2 % [36.1 %–44.5 %] vs 35.8 % esperado (n=527) | 54.2 % [53.6 %–54.8 %] vs 44.6 % esperado (n=26.6 mil) |

*Si el rojo "sin caída previa" no supera lo esperado, el radar no avisa antes: solo confirma una caída que ya empezó.*

## 4. Estabilidad en el tiempo (todos los activos)

| Caída | Horizonte | Período | Días en rojo | Caída tras rojo | Esperada | Lift caídas | Direccionalidad |
|---|---|---|---|---|---|---|---|
| ≥ 10 % | 5 | antes de 2015 | 1.9 mil | 7.1 % [6.0 %–8.3 %] | 2.99 % | 2.37× | 0.89× |
| ≥ 10 % | 5 | desde 2015 | 1.4 mil | 8.9 % [7.5 %–10.5 %] | 4.14 % | 2.15× | 0.99× |
| ≥ 10 % | 20 | antes de 2015 | 1.9 mil | 20.3 % [18.5 %–22.1 %] | 15.14 % | 1.34× | 1.02× |
| ≥ 10 % | 20 | desde 2015 | 1.4 mil | 28.4 % [26.1 %–30.9 %] | 16.97 % | 1.68× | 1.23× |
| ≥ 5 % | 5 | antes de 2015 | 1.9 mil | 21.3 % [19.6 %–23.2 %] | 13.42 % | 1.59× | 0.85× |
| ≥ 5 % | 5 | desde 2015 | 1.4 mil | 23.8 % [21.6 %–26.1 %] | 14.27 % | 1.66× | 0.85× |
| ≥ 5 % | 20 | antes de 2015 | 1.9 mil | 41.4 % [39.2 %–43.6 %] | 36.18 % | 1.14× | 0.94× |
| ≥ 5 % | 20 | desde 2015 | 1.4 mil | 47.3 % [44.7 %–49.9 %] | 36.50 % | 1.30× | 1.04× |

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
| ^GSPC | índices | 24826 | 1927-12-30 | 2026-10-30 |
| ^IXIC | índices | 14052 | 1971-02-05 | 2026-10-30 |
| ^DJI | índices | 8770 | 1992-01-02 | 2026-10-30 |
| ^RUT | índices | 9860 | 1987-09-10 | 2026-10-30 |
| ^FTSE | índices | 10820 | 1984-01-03 | 2026-10-30 |
| ^GDAXI | índices | 9822 | 1987-12-29 | 2026-10-29 |
| ^HSI | índices | 9829 | 1986-12-30 | 2026-10-28 |
| SPY | ETF | 8497 | 1993-01-29 | 2026-10-30 |
| QQQ | ETF | 6955 | 1999-03-10 | 2026-10-30 |
| IWM | ETF | 6647 | 2000-05-26 | 2026-10-30 |
| EEM | ETF | 5926 | 2003-04-14 | 2026-10-30 |
| GLD | ETF | 5522 | 2004-11-18 | 2026-10-30 |
| TLT | ETF | 6104 | 2002-07-30 | 2026-10-30 |
| XLE | ETF | 7007 | 1998-12-22 | 2026-10-30 |
| XLF | ETF | 7007 | 1998-12-22 | 2026-10-30 |
| AAPL | acciones | 11564 | 1980-12-12 | 2026-10-30 |
| MSFT | acciones | 10238 | 1986-03-13 | 2026-10-30 |
| AMZN | acciones | 7412 | 1997-05-15 | 2026-10-30 |
| GOOGL | acciones | 5586 | 2004-08-19 | 2026-10-30 |
| META | acciones | 3634 | 2012-05-18 | 2026-10-30 |
| NVDA | acciones | 6987 | 1999-01-22 | 2026-10-30 |
| TSLA | acciones | 4111 | 2010-06-29 | 2026-10-30 |
| AMD | acciones | 11752 | 1980-03-17 | 2026-10-30 |
| NFLX | acciones | 6150 | 2002-05-23 | 2026-10-30 |
| INTC | acciones | 11752 | 1980-03-17 | 2026-10-30 |
| KO | acciones | 16317 | 1962-01-02 | 2026-10-30 |
| PEP | acciones | 13718 | 1972-06-01 | 2026-10-30 |
| JNJ | acciones | 16317 | 1962-01-02 | 2026-10-30 |
| PFE | acciones | 13718 | 1972-06-01 | 2026-10-30 |
| JPM | acciones | 11752 | 1980-03-17 | 2026-10-30 |
| BAC | acciones | 13538 | 1973-02-21 | 2026-10-30 |
| XOM | acciones | 16317 | 1962-01-02 | 2026-10-30 |
| CVX | acciones | 16317 | 1962-01-02 | 2026-10-30 |
| WMT | acciones | 13658 | 1972-08-25 | 2026-10-30 |
| DIS | acciones | 16317 | 1962-01-02 | 2026-10-30 |
| BA | acciones | 16317 | 1962-01-02 | 2026-10-30 |
| F | acciones | 13718 | 1972-06-01 | 2026-10-30 |
| T | acciones | 10820 | 1983-11-21 | 2026-10-30 |
| GME | acciones | 6219 | 2002-02-13 | 2026-10-30 |
| GGAL | acciones | 6607 | 2000-07-25 | 2026-10-30 |
| YPF | acciones | 8393 | 1993-06-29 | 2026-10-30 |
| MELI | acciones | 4837 | 2007-08-10 | 2026-10-30 |
| VALE | acciones | 6194 | 2002-03-21 | 2026-10-30 |
| PBR | acciones | 6595 | 2000-08-10 | 2026-10-30 |
| BTC-USD | cripto | 4427 | 2014-09-17 | 2026-10-30 |
| ETH-USD | cripto | 3278 | 2017-11-09 | 2026-10-30 |
| XRP-USD | cripto | 3278 | 2017-11-09 | 2026-10-30 |
| LTC-USD | cripto | 4427 | 2014-09-17 | 2026-10-30 |
| DOGE-USD | cripto | 3278 | 2017-11-09 | 2026-10-30 |

**Excluidos:**

- ^N225: no informa volumen (la condición de volumen no se puede medir)
- ^BVSP: no informa volumen (la condición de volumen no se puede medir)
- ^MERV: no informa volumen (la condición de volumen no se puede medir)
