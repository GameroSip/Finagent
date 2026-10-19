# Evaluación de FinAgent con Gemini real

> Con pocas respuestas no se puede afirmar un porcentaje: 0 alucinaciones en 8 respuestas es compatible con una tasa real de hasta ~37%. La corrida completa (41 respuestas) ya da un número más útil, y `--repeat=2` o `3` lo afina.

Mide **cómo se comporta el modelo de verdad**: si inventa cifras, si hace cuentas de cabeza, si predice precios o recomienda comprar, si
admite cuando un dato no existe. Usa el **mismo agente que la app** y **datos de mercado congelados** (`frozen-data.ts`): un mercado de
mentira, determinista, con valores **distintos de la realidad a propósito** (si el modelo contesta de memoria, se nota).

## Cómo correrlo

**Opción A — En GitHub, sin instalar nada (recomendada)**
1. En tu repositorio: *Settings → Secrets and variables → Actions → New repository secret*. Nombre: `GEMINI_API_KEY`. Valor: tu clave.
2. Pestaña *Actions → "Evaluación con Gemini real" → Run workflow*. Elegí "rápida" la primera vez.
3. Al terminar, el reporte aparece en la propia página de la ejecución y como descarga (`reporte-evaluacion`).
4. Para verificar solo algo puntual (unos minutos), completá el campo **casos** con los ids separados por coma, p. ej. `idioma-ingles,trampa-prediccion,ar-riesgo`.

**Opción B — En tu PC** (Node 22 y `npm ci` hechos)
```
# Windows (PowerShell)
$env:GEMINI_API_KEY="tu_clave"; npm run eval:smoke
# Mac / Linux
GEMINI_API_KEY=tu_clave npm run eval:smoke
```
o copiá `evals/.env.example` a `evals/.env` y pegá la clave (ese archivo no se sube a GitHub).

| Comando | Qué hace |
|---|---|
| `npm run eval:smoke` | 6 casos, unos minutos. Para ver que todo funciona |
| `npm run eval` | Los 38 casos (≈ 25–40 min con el cupo gratuito) |
| `npm run eval -- --category=trampa` | Solo una categoría (`datos`, `tecnico`, `fundamentales`, `rendimiento`, `screener`, `argentina`, `calculo`, `trampa`, `multiturno`…) |
| `npm run eval -- --only=calc-upside,trampa-prediccion` | Casos puntuales |
| `npm run eval -- --repeat=3` | Repite cada caso (el modelo no es determinista: así ves la variación) |
| `npm run eval -- --rpm=5` | Más lento, si ves muchos errores de cupo |
| `npm run eval -- --only-model=gemini-3.8-flash` | Evalúa **solo** ese modelo (sin saltar a otros si se satura; los casos que no puedan correr quedan "sin evaluar") |
| `npm run eval:fake` | Modelo **falso** (no gasta cuota): sirve para probar el evaluador. `-- --fake=descuidado` simula un modelo que se porta mal |

## Cómo leer el reporte (`evals/reports/eval-*.md`)
- **Casos aprobados**: la respuesta que ve el usuario cumple todo (datos correctos, herramientas, sin recomendaciones ni predicciones…).
- **Cifras sin respaldo en el primer borrador**: respuestas cuyo *primer* borrador tenía cifras que no salían de las herramientas. **No siempre son
  errores**: una resta correcta hecha de cabeza también cuenta, y la app la hace respaldar con la calculadora. Por eso el reporte las separa:
  las que **luego se respaldaron** (eran correctas) y las **realmente inventadas** (nunca tuvieron respaldo). Esta última es la que mide alucinación.
- **Rechazos de Gemini**: qué respondió Gemini cuando no atendió un pedido (cupo por minuto o por día, saturación) y cuánto pidió esperar.
- **Respuestas degradadas**: la app no logró respaldar alguna cifra y la quitó del texto final. Si son muchas, hay que mejorar las instrucciones.
- **Borradores con cifras sin respaldo**: la lista de lo que inventó. Es lo más útil para ajustar el prompt.

## Un detalle importante del cupo gratuito
Con el cupo gratuito, los modelos preferidos se saturan rápido y la app pasa sola a los siguientes (la misma lógica que en el teléfono). Por eso un
reporte puede mezclar varios modelos: mirá la tabla **"Por modelo"**. Para comparar un modelo puntual usá `--only-model=...`.
El tiempo que informa el reporte **no incluye** las pausas que el evaluador se impone para no saturar a Gemini.

## El duelo: FinAgent contra otros enfoques (`npm run duel`)
Hace las **mismas 16 preguntas** (11 de datos verificables y 5 trampas), **en español y en inglés**, a tres brazos con el mismo reparto de modelos:
**FinAgent** (herramientas + verificador), **Gemini a secas** (sin herramientas) y **Gemini + búsqueda de Google** (si tu clave lo permite).
Usa datos **reales** (Yahoo, DolarAPI, ArgentinaDatos) y calcula la respuesta correcta justo antes de preguntar.
- En GitHub: *Actions → "Duelo con Gemini real" → Run workflow* (podés elegir idioma, sacar la búsqueda o correr solo algunas preguntas).
- En tu PC: `npm run duel` (o `-- --lang=es`, `-- --no-search`, `-- --only=quote-aapl,fx-blue`). `npm run duel:fake` prueba el instrumento sin gastar cuota.
- **Límites que el reporte avisa:** la respuesta correcta sale de las mismas fuentes que usa FinAgent (no lo valida por sí sola), son pocas preguntas,
  y si Yahoo no responde desde donde corre, lo dice y guarda un diagnóstico en vez de producir números engañosos.

## Qué NO mide
- No comprueba que la *interpretación* sea correcta (p. ej. citar un número real pero atribuido a la empresa equivocada): solo que cada cifra venga de los datos.
- Los datos son sintéticos: no prueba a Yahoo ni a las demás fuentes reales.
- Con el cupo gratuito pueden aparecer errores de Gemini (saturación): esos casos quedan "sin evaluar" y no cuentan en el porcentaje.

Mandame el archivo `.md` del reporte y ajusto el verificador y las instrucciones con lo que aparezca.
