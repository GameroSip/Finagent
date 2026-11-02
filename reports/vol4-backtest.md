# Backtest 3: movimiento esperado con coeficientes por grupo

Ejecutado: 2026-11-02 23:23 UTC · 49 activos · criterios fijados en el registro previo (commit 8d64535), publicado antes de calcular nada.

> **Segundo intento** (registro previo PREREGISTRO-VOL4.md, no independiente del intento 1): filtro de calidad de datos aplicado al entrenamiento, a los cuantiles y a la evaluación. Criterios de éxito idénticos. Q1 excluye por calidad de datos: ^GSPC, ^IXIC, ^GDAXI, ^HSI, WMT.

## Veredictos (criterios del registro previo)

| Criterio | Resultado |
|---|---|
| Q1 no peor que el modelo por activo (mediana ≤ 1,03) | **PASA** |
| Q2 mejor que "ayer" (≥ 80 % de activos) y que EWMA (mediana ≤ 1,00) | **PASA** |
| Q3 calibración del intervalo — todos | **PASA** |
| Q3 calibración — índices | **PASA** |
| Q3 calibración — ETF | **PASA** |
| Q3 calibración — acciones | **PASA** |
| Q3 calibración — cripto | **PASA** |
| Q4 calibración condicional (tramos < 0,5× y ≥ 2×) | **PASA** |
| Q5 "X veces lo habitual" crece con X (≥ 1,3 arriba, ≤ 0,9 abajo) | **PASA** |
| Q6 el VIX mejora al modelo por grupo en el S&P 500 | **NO PASA** |

**Decisión según el registro previo:** bloque "movimiento esperado": **SE CONSTRUYE** · intervalo solo para: índices, ETF, acciones, cripto · VIX: no se incorpora.

## Q1 y Q2: magnitud

| Período | Activos | Activos con HAR por activo | Grupo/HAR por activo (mediana QLIKE) | Grupo mejor que ayer | Grupo/EWMA (mediana QLIKE) | Dif. significativa vs ayer |
|---|---|---|---|---|---|---|
| antes de 2015 | 44 | 38 | 0.976 | 98 % | 0.948 | 42 |
| desde 2015 | 49 | 44 | 1.006 | 100 % | 0.878 | 49 |

## Q3: calibración del intervalo 5 %–95 % del retorno de 5 ruedas (cuantiles por grupo)

| Grupo | Período | Casos | Cobertura | Cola izquierda | Cola derecha | ¿Pasa? |
|---|---|---|---|---|---|---|
| todos | antes de 2015 | 281468 | 91.0 % | 4.8 % | 4.2 % | sí |
| todos | desde 2015 | 146223 | 89.8 % | 5.4 % | 4.8 % | sí |
| índices | antes de 2015 | 49344 | 88.6 % | 6.2 % | 5.2 % | sí |
| índices | desde 2015 | 20772 | 91.2 % | 5.1 % | 3.8 % | sí |
| ETF | antes de 2015 | 26348 | 88.7 % | 5.7 % | 5.6 % | sí |
| ETF | desde 2015 | 23768 | 87.1 % | 6.2 % | 6.7 % | sí |
| acciones | antes de 2015 | 205776 | 91.9 % | 4.4 % | 3.7 % | sí |
| acciones | desde 2015 | 86159 | 89.8 % | 5.3 % | 4.8 % | sí |
| cripto | desde 2015 | 15524 | 92.1 % | 4.5 % | 3.4 % | sí |

## Q4: cobertura por tramo de pronóstico (todos)

| Período | < 0,5× (casos) | 0,5–1× (casos) | 1–2× (casos) | ≥ 2× (casos) |
|---|---|---|---|---|
| antes de 2015 | 87.8 % (84559) | 91.7 % (104273) | 93.2 % (67517) | 92.9 % (25119) |
| desde 2015 | 88.0 % (31784) | 89.8 % (64498) | 90.9 % (39595) | 91.2 % (10346) |

## Q5: variación real posterior ÷ variación de 250 ruedas, según pronóstico ÷ variación de 250 ruedas (todos)

| Período | Pronóstico < 0,8× (casos) | Pronóstico 0,8–1,25× (casos) | Pronóstico 1,25–2× (casos) | Pronóstico ≥ 2× (casos) |
|---|---|---|---|---|
| antes de 2015 | 0.623 (93078) | 1.010 (123418) | 1.590 (53913) | 3.111 (11059) |
| desde 2015 | 0.610 (56998) | 1.001 (55438) | 1.609 (25847) | 3.905 (7940) |

## Q6: VIX (S&P 500)

| Período | Casos | QLIKE VIX reescalado | QLIKE modelo por grupo |
|---|---|---|---|
| antes de 2015 | 5795 | 0.165 | 0.164 |
| desde 2015 | 2971 | 0.259 | 0.272 |

## Coeficientes finales (ajustados con todos los datos de cada grupo)

| Grupo | Activos | Observaciones | a | b₁ ln d | b₂ ln s | b₃ ln m | b₄ ln q | Sesgo | q 5 % | q 95 % |
|---|---|---|---|---|---|---|---|---|---|---|
| índices | 7 | 71866 | -0.6288 | 0.1381 | 0.3252 | 0.3092 | 0.1679 | 1.1750 | -2.1692 | 2.0857 |
| ETF | 8 | 51633 | -0.6161 | 0.1442 | 0.3073 | 0.3430 | 0.1458 | 1.1639 | -2.1521 | 1.9771 |
| acciones | 29 | 294647 | -0.4763 | 0.0972 | 0.2542 | 0.3861 | 0.2135 | 1.1693 | -1.9126 | 1.9826 |
| cripto | 5 | 17428 | -0.9550 | 0.1495 | 0.3138 | 0.2084 | 0.2069 | 1.4062 | -1.6480 | 1.9313 |

**Excluidos:**

- ^N225: no informa volumen (se excluye igual que en los backtests anteriores, para comparar lo mismo)
- ^BVSP: no informa volumen (se excluye igual que en los backtests anteriores, para comparar lo mismo)
- ^MERV: no informa volumen (se excluye igual que en los backtests anteriores, para comparar lo mismo)
