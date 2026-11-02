# Backtest de volatilidad y cola izquierda — registro previo

Este documento se publica en un commit **anterior** al código que calcula los resultados. Los criterios no se cambian después de ver los datos.

## Preguntas
1. ¿Un pronóstico de volatilidad (HAR) predice mejor la **magnitud** de los movimientos de la semana siguiente que referencias simples y que el termómetro actual?
2. ¿Ese pronóstico está **calibrado**? Un intervalo "del 90 %" debe contener el 90 % de los casos.
3. Con volatilidad creciente y precio por debajo de su media de 50 ruedas, ¿la **cola izquierda** (las peores semanas) es peor de lo que el propio pronóstico de volatilidad ya explica?
4. En el S&P 500, ¿el VIX pronostica mejor que el modelo propio?

## Datos y reglas generales
- Mismos activos que el backtest del radar (49 con volumen) más `^VIX` solo para la pregunta 4. Precios diarios (apertura, máximo, mínimo, cierre).
- Todo se calcula con información disponible hasta el día evaluado. Los modelos se reajustan **cada 1 de enero** con datos cuyo resultado ya se conocía antes de esa fecha (mínimo 750 ruedas de entrenamiento).
- No se ajusta ningún parámetro a los datos: λ = 0,94 (EWMA, valor estándar), rezagos 1/5/22 (HAR, valor estándar), umbrales del estado de tensión fijados abajo.
- Se informa por separado **antes de 2015** y **desde 2015**, y por tipo de activo.

## Qué se pronostica
Variación diaria promedio de las 5 ruedas siguientes, estimada con el rango apertura-máximo-mínimo-cierre (Garman-Klass). Pérdida: **QLIKE** (robusta al ruido de la medición).

## Modelos comparados
| Modelo | Definición |
|---|---|
| ayer | variación promedio de las últimas 5 ruedas |
| EWMA | media móvil exponencial de retornos al cuadrado, λ = 0,94 |
| HAR | regresión del logaritmo de la variación futura sobre la de 1, 5 y 22 ruedas, ajustada por activo, con corrección de sesgo |
| termómetro | el nivel actual (baja/media/alta) convertido en pronóstico con el promedio histórico de cada nivel |
| VIX (solo S&P 500) | (VIX/100)² / 252, reescalado con una constante estimada en el entrenamiento |

## Criterios de éxito (fijados de antemano)
- **P1 — HAR es un pronóstico sólido:** en *ambos* períodos, HAR tiene menor QLIKE que "ayer" en ≥ 70 % de los activos **y** la mediana de QLIKE(HAR)/QLIKE(EWMA) ≤ 1,02. Si supera a "ayer" pero no cumple lo segundo: "EWMA alcanza (más simple)". Si no supera a "ayer": "no mejora".
- **P1b — el termómetro actual como pronóstico de magnitud** es peor que HAR si la mediana de QLIKE(termómetro)/QLIKE(HAR) > 1,05 en ambos períodos.
- **P2 — calibración** (del mejor entre HAR y EWMA según P1): intervalo del 5 % al 95 % con cobertura entre 87 % y 93 %, y cada cola entre 3 % y 7 %, en ambos períodos.
- **P3 — cola izquierda condicionada.** Estado S = (volatilidad EWMA ÷ raíz del promedio de retornos² de 126 ruedas ≥ 1,25) **y** (cierre < media de 50 ruedas). Con retornos estandarizados por HAR: la cola izquierda en S debe superar el 5 % de forma clara y la derecha no. Exigido en ambos períodos: izquierda ≥ 7,5 % con límite inferior del intervalo (Wilson 95 %) > 5,5 %, derecha ≤ 6,5 %, y izquierda mayor que derecha. Si no: "no hay información de cola izquierda más allá de la volatilidad".
- **P4 — VIX:** "el VIX mejora" solo si su QLIKE medio es menor que el de HAR en ambos períodos.

## Límites conocidos (se declaran antes de medir)
Sesgo de supervivencia (activos que hoy existen); los intervalos de confianza son optimistas (días solapados y activos correlacionados); datos diarios de Yahoo (pueden tener errores); el rango diario es una medida ruidosa; sin costos de operar porque no se evalúa ninguna estrategia, solo pronósticos.
