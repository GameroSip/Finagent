# Backtest 3: "movimiento esperado" con coeficientes por grupo — registro previo

Este documento se publica en un commit **anterior** al código que calcula los resultados. Los criterios no se cambian después de ver los datos.

## Qué se valida
La versión que podría ir en la app: un pronóstico de volatilidad **con coeficientes comunes por tipo de activo** (índices, ETF, acciones, cripto) y **solo 1 año de datos diarios** del activo, porque eso es lo que la app descarga. El backtest 2 usó un modelo ajustado por activo con 3 o más años de historia; esto es distinto y hay que validarlo de nuevo.

## Modelo (sin parámetros ajustados a los datos más allá de los coeficientes de la regresión)
`ln(variación futura de 5 ruedas) = a + b₁·ln(d) + b₂·ln(s) + b₃·ln(m) + b₄·ln(q)` donde d, s, m, q son el promedio de la variación diaria (Garman-Klass) de las últimas 1, 5, 22 y 250 ruedas. Con corrección de sesgo. Coeficientes **por grupo**, estimados con todos los activos del grupo juntos, y reajustados cada 1 de enero **solo con datos cuyo resultado ya se conocía** (mínimo 1.500 observaciones del grupo). Se necesitan 250 ruedas de historia del activo.

## Lo que se mostraría en la app
- **Rango habitual de la semana:** intervalo del 5 % al 95 % del retorno de 5 ruedas = el pronóstico × los cuantiles 5 % y 95 % de los retornos estandarizados del grupo.
- **Comparación con lo habitual:** pronóstico ÷ variación promedio de las últimas 250 ruedas del propio activo ("X veces lo habitual").
- Para el S&P 500: opcionalmente, el VIX reescalado.

## Criterios de éxito (fijados de antemano; períodos: antes de 2015 y desde 2015)
- **Q1 — no peor que el modelo por activo:** mediana por activo de QLIKE(grupo)/QLIKE(HAR por activo del backtest 2) ≤ 1,03 en ambos períodos, sobre las filas en común.
- **Q2 — mejor que lo simple:** el modelo por grupo tiene menor QLIKE que "ayer" en ≥ 80 % de los activos y mediana de QLIKE(grupo)/QLIKE(EWMA de Garman-Klass) ≤ 1,00, en ambos períodos.
- **Q3 — calibración del intervalo, por grupo:** para "todos" y para cada grupo con datos en el período, cobertura entre 87 % y 93 % y cada cola entre 3 % y 7 %. Un grupo que falle **no muestra el intervalo** en la app.
- **Q4 — calibración condicional ("todos"):** en el tramo de pronóstico < 0,5× y en el de ≥ 2× (pronóstico ÷ su promedio del activo en el período), con ≥ 1.000 casos, cobertura entre 85 % y 95 %, en ambos períodos.
- **Q5 — "X veces lo habitual" significa algo:** se agrupan los días por pronóstico ÷ variación de 250 ruedas en < 0,8; 0,8–1,25; 1,25–2; ≥ 2. La variación real posterior ÷ la variación de 250 ruedas debe **crecer en cada tramo**, ser ≥ 1,3 en el tramo ≥ 2 y ≤ 0,9 en el tramo < 0,8, en ambos períodos ("todos").
- **Q6 — VIX:** el VIX se usa para el S&P 500 solo si su QLIKE medio (reescalado con una constante estimada en el entrenamiento) es menor que el del modelo por grupo en ambos períodos.

## Reglas de decisión
- Se construye el bloque "movimiento esperado" **solo si pasan Q1, Q2, Q4 y Q5**. Si no, no se construye.
- El intervalo se muestra **solo para los grupos que pasen Q3**.
- El VIX se incorpora **solo si pasa Q6**.

## Límites conocidos (declarados antes de medir)
Sesgo de supervivencia (activos que hoy existen); intervalos de confianza optimistas (días solapados y activos correlacionados); datos diarios de Yahoo (pueden tener errores); antes de 2015 hay menos activos y la cripto solo aparece desde 2017; se excluyen los índices sin volumen para comparar lo mismo que en los backtests anteriores; no se evalúa ninguna estrategia de inversión, solo pronósticos.
