# Backtest 3: movimiento esperado con coeficientes por grupo

Ejecutado: 2026-11-02 22:37 UTC · 49 activos · criterios fijados en el registro previo (commit 3cbd797), publicado antes de calcular nada.

## Veredictos (criterios del registro previo)

| Criterio | Resultado |
|---|---|
| Q1 no peor que el modelo por activo (mediana ≤ 1,03) | **PASA** |
| Q2 mejor que "ayer" (≥ 80 % de activos) y que EWMA (mediana ≤ 1,00) | **PASA** |
| Q3 calibración del intervalo — todos | **NO PASA** |
| Q3 calibración — índices | **NO PASA** |
| Q3 calibración — ETF | **PASA** |
| Q3 calibración — acciones | **PASA** |
| Q3 calibración — cripto | **PASA** |
| Q4 calibración condicional (tramos < 0,5× y ≥ 2×) | **NO PASA** |
| Q5 "X veces lo habitual" crece con X (≥ 1,3 arriba, ≤ 0,9 abajo) | **NO PASA** |
| Q6 el VIX mejora al modelo por grupo en el S&P 500 | **PASA** |

**Decisión según el registro previo:** bloque "movimiento esperado": **NO se construye** · intervalo solo para: (ningún grupo) · VIX: no se incorpora.

## Q1 y Q2: magnitud

| Período | Activos | Activos con HAR por activo | Grupo/HAR por activo (mediana QLIKE) | Grupo mejor que ayer | Grupo/EWMA (mediana QLIKE) | Dif. significativa vs ayer |
|---|---|---|---|---|---|---|
| antes de 2015 | 44 | 43 | 0.973 | 98 % | 0.953 | 39 |
| desde 2015 | 49 | 49 | 1.005 | 100 % | 0.881 | 49 |

## Q3: calibración del intervalo 5 %–95 % del retorno de 5 ruedas (cuantiles por grupo)

| Grupo | Período | Casos | Cobertura | Cola izquierda | Cola derecha | ¿Pasa? |
|---|---|---|---|---|---|---|
| todos | antes de 2015 | 300326 | 93.3 % | 3.6 % | 3.1 % | no |
| todos | desde 2015 | 146224 | 91.2 % | 4.6 % | 4.2 % | sí |
| índices | antes de 2015 | 63684 | 98.9 % | 0.5 % | 0.6 % | no |
| índices | desde 2015 | 20773 | 100.0 % | 0.0 % | 0.0 % | no |
| ETF | antes de 2015 | 26348 | 88.7 % | 5.7 % | 5.6 % | sí |
| ETF | desde 2015 | 23768 | 87.1 % | 6.2 % | 6.7 % | sí |
| acciones | antes de 2015 | 210294 | 92.2 % | 4.2 % | 3.5 % | sí |
| acciones | desde 2015 | 86159 | 90.1 % | 5.2 % | 4.7 % | sí |
| cripto | desde 2015 | 15524 | 92.1 % | 4.5 % | 3.4 % | sí |

## Q4: cobertura por tramo de pronóstico (todos)

| Período | < 0,5× (casos) | 0,5–1× (casos) | 1–2× (casos) | ≥ 2× (casos) |
|---|---|---|---|---|
| antes de 2015 | 91.7 % (95478) | 93.2 % (106820) | 94.7 % (69797) | 95.6 % (28231) |
| desde 2015 | 90.1 % (32649) | 91.0 % (63806) | 92.0 % (39340) | 92.8 % (10429) |

## Q5: variación real posterior ÷ variación de 250 ruedas, según pronóstico ÷ variación de 250 ruedas (todos)

| Período | Pronóstico < 0,8× (casos) | Pronóstico 0,8–1,25× (casos) | Pronóstico 1,25–2× (casos) | Pronóstico ≥ 2× (casos) |
|---|---|---|---|---|
| antes de 2015 | 0.628 (95415) | 1.748 (136300) | 1.567 (55888) | 3.393 (12723) |
| desde 2015 | 0.609 (56873) | 1.001 (55303) | 1.599 (25881) | 3.858 (8167) |

## Q6: VIX (S&P 500)

| Período | Casos | QLIKE VIX reescalado | QLIKE modelo por grupo |
|---|---|---|---|
| antes de 2015 | 5795 | 0.165 | 0.166 |
| desde 2015 | 2971 | 0.259 | 0.273 |

## Coeficientes finales (ajustados con todos los datos de cada grupo)

| Grupo | Activos | Observaciones | a | b₁ ln d | b₂ ln s | b₃ ln m | b₄ ln q | Sesgo | q 5 % | q 95 % |
|---|---|---|---|---|---|---|---|---|---|---|
| índices | 7 | 86201 | -0.1219 | 0.1482 | 0.3673 | 0.3343 | 0.1421 | 1.1681 | -26.8208 | 47.7184 |
| ETF | 8 | 51633 | -0.6161 | 0.1442 | 0.3073 | 0.3430 | 0.1458 | 1.1639 | -2.1521 | 1.9771 |
| acciones | 29 | 299489 | -0.4806 | 0.0869 | 0.2561 | 0.3894 | 0.2185 | 1.1751 | -1.9235 | 1.9962 |
| cripto | 5 | 17428 | -0.9550 | 0.1495 | 0.3138 | 0.2084 | 0.2069 | 1.4062 | -1.6480 | 1.9313 |

**Excluidos:**

- ^N225: no informa volumen (se excluye igual que en los backtests anteriores, para comparar lo mismo)
- ^BVSP: no informa volumen (se excluye igual que en los backtests anteriores, para comparar lo mismo)
- ^MERV: no informa volumen (se excluye igual que en los backtests anteriores, para comparar lo mismo)
