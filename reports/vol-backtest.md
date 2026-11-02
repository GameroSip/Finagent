# Backtest de volatilidad y cola izquierda

Ejecutado: 2026-11-02 21:43 UTC · 49 activos · criterios fijados en el registro previo (commit fd04292), publicado antes de calcular nada.

Enmienda 1 del registro (antes de correr con datos reales): EWMA usa el mismo estimador que el blanco; EWMA-r² y la tabla 2b son solo informativos.

**Cómo leer:** QLIKE es una pérdida (menor = mejor). Un cociente < 1 significa que el primer modelo pronostica mejor. "Cobertura" es qué parte de los casos cae dentro del intervalo 5 %–95 % del retorno de 5 ruedas (debería ser ~90 %). Intervalos de confianza optimistas; sesgo de supervivencia (activos que hoy existen).

## 5. Veredictos (criterios del registro previo)

| Pregunta | Veredicto |
|---|---|
| P1 ¿HAR pronostica mejor la magnitud que lo simple? | **HAR es un pronóstico sólido** |
| P1b ¿Y el termómetro actual como pronóstico de magnitud? | el termómetro actual es peor pronóstico de magnitud que HAR |
| P2 ¿Los intervalos están calibrados? | no calibrado (HAR): antes de 2015 cobertura 93.3 %, izq 3.6 %, der 3.2 % · desde 2015 cobertura 90.9 %, izq 4.7 %, der 4.3 % |
| P3 ¿Hay información de cola izquierda con volatilidad creciente y precio bajo su media? | **no hay información de cola izquierda más allá de la volatilidad** |
| P4 ¿El VIX mejora al modelo propio en el S&P 500? | el VIX mejora |

## 1. ¿Qué modelo pronostica mejor la magnitud de la semana siguiente?

| Grupo | Período | Activos | QLIKE HAR/ayer | QLIKE HAR/EWMA | QLIKE termómetro/HAR | HAR mejor que ayer | HAR mejor que EWMA | Dif. significativa a favor de HAR / en contra |
|---|---|---|---|---|---|---|---|---|
| todos | antes de 2015 | 43 | 0.742 | 0.965 | 3.040 | 95 % | 74 % | 38 / 0 |
| todos | desde 2015 | 49 | 0.742 | 0.870 | 2.245 | 100 % | 98 % | 48 / 0 |
| índices | antes de 2015 | 7 | 0.880 | 1.001 | 3.811 | 71 % | 43 % | 3 / 0 |
| índices | desde 2015 | 7 | 0.780 | 0.843 | 2.149 | 100 % | 100 % | 7 / 0 |
| ETF | antes de 2015 | 8 | 0.819 | 0.936 | 4.202 | 100 % | 100 % | 7 / 0 |
| ETF | desde 2015 | 8 | 0.763 | 0.819 | 2.579 | 100 % | 100 % | 8 / 0 |
| acciones | antes de 2015 | 28 | 0.725 | 0.974 | 2.542 | 100 % | 75 % | 28 / 0 |
| acciones | desde 2015 | 29 | 0.740 | 0.890 | 2.369 | 100 % | 100 % | 28 / 0 |
| cripto | desde 2015 | 5 | 0.656 | 0.863 | 1.556 | 100 % | 80 % | 5 / 0 |

## 2. Calibración del intervalo 5 %–95 % (retorno de 5 ruedas)

| Modelo | Período | Casos | Cobertura | Cola izquierda (debería ser 5 %) | Cola derecha (5 %) |
|---|---|---|---|---|---|
| ayer | antes de 2015 | 274222 | 93.6 % | 3.4 % | 3.0 % |
| ayer | desde 2015 | 143275 | 90.9 % | 4.7 % | 4.4 % |
| EWMA | antes de 2015 | 274222 | 93.4 % | 3.5 % | 3.1 % |
| EWMA | desde 2015 | 143275 | 90.5 % | 5.0 % | 4.6 % |
| HAR | antes de 2015 | 274222 | 93.3 % | 3.6 % | 3.2 % |
| HAR | desde 2015 | 143275 | 90.9 % | 4.7 % | 4.3 % |
| termómetro | antes de 2015 | 274222 | 90.5 % | 4.9 % | 4.6 % |
| termómetro | desde 2015 | 143275 | 91.5 % | 4.3 % | 4.2 % |
| EWMA-r² | antes de 2015 | 274222 | 90.9 % | 4.8 % | 4.3 % |
| EWMA-r² | desde 2015 | 143275 | 90.1 % | 5.2 % | 4.7 % |

Por tipo de activo (HAR):

| Grupo | Período | Cobertura | Izquierda | Derecha |
|---|---|---|---|---|
| índices | antes de 2015 | 96.8 % | 1.7 % | 1.5 % |
| índices | desde 2015 | 96.0 % | 2.3 % | 1.7 % |
| ETF | antes de 2015 | 90.2 % | 5.1 % | 4.7 % |
| ETF | desde 2015 | 88.0 % | 5.8 % | 6.2 % |
| acciones | antes de 2015 | 92.5 % | 4.0 % | 3.5 % |
| acciones | desde 2015 | 90.3 % | 5.1 % | 4.6 % |
| cripto | desde 2015 | 92.4 % | 4.4 % | 3.3 % |

### 2b. Cobertura por tramo de volatilidad pronosticada (EXPLORATORIO: no entra en los veredictos)

Un buen pronóstico cubre ~90 % en todos los tramos; uno que no capta la dinámica falla en los extremos. Tramo = pronóstico ÷ su promedio del activo.

| Modelo | Período | Cobertura < 0,5× (casos) | Cobertura 0,5–1× (casos) | Cobertura 1–2× (casos) | Cobertura ≥ 2× (casos) |
|---|---|---|---|---|---|
| ayer | antes de 2015 | 90.7 % (116929) | 94.6 % (79349) | 96.5 % (50732) | 97.8 % (27212) |
| ayer | desde 2015 | 87.4 % (54268) | 91.6 % (48569) | 94.1 % (28131) | 95.9 % (12307) |
| EWMA | antes de 2015 | 91.6 % (97969) | 93.5 % (93059) | 95.1 % (56968) | 96.6 % (26226) |
| EWMA | desde 2015 | 88.0 % (38735) | 90.6 % (59113) | 92.1 % (34736) | 93.6 % (10691) |
| HAR | antes de 2015 | 92.6 % (76374) | 93.0 % (107753) | 94.0 % (66831) | 94.8 % (23264) |
| HAR | desde 2015 | 89.5 % (31525) | 90.8 % (63879) | 91.8 % (37959) | 92.4 % (9912) |
| termómetro | antes de 2015 | 91.5 % (22227) | 88.8 % (120288) | 91.8 % (124875) | 90.4 % (6832) |
| termómetro | desde 2015 | — (0) | 91.0 % (114413) | 93.1 % (26277) | 94.6 % (2585) |
| EWMA-r² | antes de 2015 | 87.6 % (102889) | 91.6 % (92253) | 94.0 % (53801) | 95.6 % (25279) |
| EWMA-r² | desde 2015 | 86.2 % (48926) | 90.6 % (52567) | 93.5 % (30183) | 95.6 % (11599) |

## 3. Cola izquierda en el estado de tensión S (retornos estandarizados por HAR)

S = volatilidad EWMA ≥ 1,25× la de las últimas 126 ruedas **y** cierre bajo su media de 50 ruedas. Sin tensión, ambas colas deberían ser ~5 %.

| Grupo | Período | Días en S (% del total) | Cola izquierda en S [IC 95 %] | Cola derecha en S [IC 95 %] | Izq. fuera de S | Der. fuera de S |
|---|---|---|---|---|---|---|
| todos | antes de 2015 | 18538 (6.8 %) | 4.0 % [3.7 %–4.3 %] | 2.7 % [2.4 %–2.9 %] | 3.5 % | 3.2 % |
| todos | desde 2015 | 10303 (7.2 %) | 5.4 % [5.0 %–5.8 %] | 3.1 % [2.8 %–3.5 %] | 4.7 % | 4.4 % |
| índices | antes de 2015 | 5133 (8.5 %) | 2.3 % [1.9 %–2.8 %] | 2.0 % [1.7 %–2.5 %] | 1.6 % | 1.5 % |
| índices | desde 2015 | 1861 (9.0 %) | 2.6 % [2.0 %–3.5 %] | 1.5 % [1.0 %–2.2 %] | 2.2 % | 1.7 % |
| ETF | antes de 2015 | 1971 (9.0 %) | 5.7 % [4.8 %–6.8 %] | 4.6 % [3.7 %–5.6 %] | 5.1 % | 4.7 % |
| ETF | desde 2015 | 1685 (7.1 %) | 7.4 % [6.3 %–8.8 %] | 5.9 % [4.9 %–7.2 %] | 5.7 % | 6.2 % |
| acciones | antes de 2015 | 11434 (5.9 %) | 4.4 % [4.0 %–4.8 %] | 2.6 % [2.3 %–2.9 %] | 4.0 % | 3.5 % |
| acciones | desde 2015 | 6129 (7.1 %) | 6.1 % [5.5 %–6.7 %] | 3.1 % [2.7 %–3.6 %] | 5.0 % | 4.8 % |
| cripto | desde 2015 | 628 (4.9 %) | 1.6 % [0.9 %–2.9 %] | 0.6 % [0.2 %–1.6 %] | 4.5 % | 3.4 % |

## 4. VIX vs modelo propio (S&P 500)

| Período | Casos | QLIKE VIX (reescalado) | QLIKE HAR | QLIKE EWMA |
|---|---|---|---|---|
| antes de 2015 | 5795 | 0.165 | 0.174 | 0.183 |
| desde 2015 | 2971 | 0.259 | 0.288 | 0.339 |

## Datos

| Activo | Grupo | Casos evaluados |
|---|---|---|
| ^GSPC | índices | 23819 |
| ^IXIC | índices | 13063 |
| ^DJI | índices | 7755 |
| ^RUT | índices | 8766 |
| ^FTSE | índices | 9804 |
| ^GDAXI | índices | 8820 |
| ^HSI | índices | 8836 |
| SPY | ETF | 7501 |
| QQQ | ETF | 5992 |
| IWM | ETF | 5740 |
| EEM | ETF | 4985 |
| GLD | ETF | 4481 |
| TLT | ETF | 4985 |
| XLE | ETF | 5992 |
| XLF | ETF | 5992 |
| AAPL | acciones | 10535 |
| MSFT | acciones | 9272 |
| AMZN | acciones | 6492 |
| GOOGL | acciones | 4481 |
| META | acciones | 2719 |
| NVDA | acciones | 5992 |
| TSLA | acciones | 3223 |
| AMD | acciones | 10788 |
| NFLX | acciones | 5236 |
| INTC | acciones | 10788 |
| KO | acciones | 15305 |
| PEP | acciones | 12810 |
| JNJ | acciones | 15305 |
| PFE | acciones | 12810 |
| JPM | acciones | 10788 |
| BAC | acciones | 12557 |
| XOM | acciones | 15305 |
| CVX | acciones | 15305 |
| WMT | acciones | 12557 |
| DIS | acciones | 15305 |
| BA | acciones | 15305 |
| F | acciones | 12810 |
| T | acciones | 9777 |
| GME | acciones | 5236 |
| GGAL | acciones | 5488 |
| YPF | acciones | 7501 |
| MELI | acciones | 3725 |
| VALE | acciones | 5236 |
| PBR | acciones | 5488 |
| BTC-USD | cripto | 3223 |
| ETH-USD | cripto | 2127 |
| XRP-USD | cripto | 2127 |
| LTC-USD | cripto | 3223 |
| DOGE-USD | cripto | 2127 |

**Excluidos:**

- ^N225: no informa volumen (se excluye igual que en el backtest del radar, para comparar lo mismo)
- ^BVSP: no informa volumen (se excluye igual que en el backtest del radar, para comparar lo mismo)
- ^MERV: no informa volumen (se excluye igual que en el backtest del radar, para comparar lo mismo)
