# Backtest 4: "movimiento esperado" con filtro de calidad de datos — registro previo

Este documento se publica en un commit **anterior** al código que calcula los resultados. Los criterios no se cambian después de ver los datos.

## Por qué existe
El backtest 3 (registro `PREREGISTRO-VOL2.md`, commit `3cbd797`) dio como veredicto oficial **"NO se construye"**: fallaron Q4 y Q5, y la calibración de los índices. El diagnóstico exploratorio mostró que algunos activos traen datos viejos solo con el cierre (apertura = máximo = mínimo = cierre): S&P 500 34 % de las ruedas, Nasdaq 25 %, DAX 15 %, Hang Seng 6 %, WMT 2 %. El modelo toma "rango cero" como "volatilidad cero", y eso contamina el entrenamiento y los cuantiles (los de los índices dieron −26,8 y +47,7).

## Declaración de no independencia
Este es el **segundo intento** de validar este modelo. No es una prueba independiente: antes de escribir la regla vi, en el diagnóstico, que al excluir de la **evaluación** los casos con datos degenerados el criterio Q5 pasaba. Lo que sí es nuevo: (a) la regla se aplica también al **entrenamiento**, (b) se define por una propiedad de los datos (ruedas sin rango), no por resultados, y (c) se mantienen todos los umbrales de éxito sin cambios. Si este intento también falla, el modelo se descarta.

## Único cambio respecto del backtest 3: regla de calidad de datos
Una fila (activo, día t) es **válida** solo si la proporción de ruedas **sin rango** (máximo = mínimo) es **≤ 5 %** tanto en las 250 ruedas previas a t como en las 250 previas a t+5. Las filas no válidas se descartan del **entrenamiento, de los cuantiles y de la evaluación**. Todo lo demás (modelo, reajuste cada 1 de enero con información conocida, 1.500 observaciones mínimas, 250 ruedas de historia, activos y períodos) queda idéntico al backtest 3.

## Criterios de éxito (idénticos a PREREGISTRO-VOL2.md; períodos: antes de 2015 y desde 2015)
- **Q1:** mediana por activo de QLIKE(grupo)/QLIKE(HAR por activo) ≤ 1,03 en ambos períodos. Como el HAR por activo del backtest 2 se entrenó con los datos degenerados, la comparación Q1 se hace **solo con activos con ≤ 1 % de ruedas sin rango en toda su historia** (se excluyen ^GSPC, ^IXIC, ^GDAXI, ^HSI y WMT de Q1, por calidad de datos).
- **Q2:** QLIKE(grupo) < QLIKE(ayer) en ≥ 80 % de los activos y mediana de QLIKE(grupo)/QLIKE(EWMA de Garman-Klass) ≤ 1,00, en ambos períodos.
- **Q3 (por grupo):** cobertura del intervalo 5 %–95 % entre 87 % y 93 % y cada cola entre 3 % y 7 %. Un grupo que falle no muestra el intervalo.
- **Q4 ("todos"):** cobertura entre 85 % y 95 % en los tramos de pronóstico < 0,5× y ≥ 2× (con ≥ 1.000 casos), en ambos períodos.
- **Q5 ("todos"):** variación real posterior ÷ variación de 250 ruedas, por tramo de pronóstico ÷ variación de 250 ruedas (< 0,8; 0,8–1,25; 1,25–2; ≥ 2): crece en cada tramo, ≥ 1,3 en el tramo ≥ 2 y ≤ 0,9 en el tramo < 0,8, en ambos períodos.
- **Q6:** el VIX (reescalado con una constante estimada en el entrenamiento) se usa para el S&P 500 solo si su QLIKE medio es menor que el del modelo por grupo en ambos períodos.

## Reglas de decisión (idénticas)
Se construye el bloque "movimiento esperado" **solo si pasan Q1, Q2, Q4 y Q5**. El intervalo se muestra solo para los grupos que pasen Q3. El VIX se incorpora solo si pasa Q6. **No habrá un tercer intento con otro filtro**: si esto falla, se descarta.

## Límites conocidos
Sesgo de supervivencia; intervalos de confianza optimistas (días solapados y activos correlacionados); datos diarios de Yahoo; antes de 2015 hay menos activos y la cripto solo desde 2017; el filtro reduce los años disponibles de los índices viejos; no se evalúa ninguna estrategia, solo pronósticos.
