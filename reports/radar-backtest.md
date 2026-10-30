# Radar de tensión — backtest

Ejecutado: 2026-10-30 18:22 UTC · 0 activos · períodos: —

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

## 2. ¿El rojo anticipa una caída ≥ 10 %?

| Grupo | Horizonte | Días en rojo | Caída tras rojo | Esperada por azar | Lift caídas | Lift subas | Direccionalidad | Precisión | Cobertura | Episodios (tasa) |
|---|---|---|---|---|---|---|---|---|---|---|

## 2. ¿El rojo anticipa una caída ≥ 5 %?

| Grupo | Horizonte | Días en rojo | Caída tras rojo | Esperada por azar | Lift caídas | Lift subas | Direccionalidad | Precisión | Cobertura | Episodios (tasa) |
|---|---|---|---|---|---|---|---|---|---|---|

## 3. ¿Avisa antes o llega tarde? (caída ≥ 5 %, todos los activos)

| Horizonte | Tras rojo (episodio) | Tras rojo que NO venía cayendo | Tras "ya cayó ≥ 5 % en 3 ruedas" |
|---|---|---|---|

*Si el rojo "sin caída previa" no supera lo esperado, el radar no avisa antes: solo confirma una caída que ya empezó.*

## 4. Estabilidad en el tiempo (todos los activos)

| Caída | Horizonte | Período | Días en rojo | Caída tras rojo | Esperada | Lift caídas | Direccionalidad |
|---|---|---|---|---|---|---|---|

## 5. Veredicto automático

*Regla fijada de antemano: "alarma útil" solo si las caídas tras rojo son ≥ 2× lo esperado por azar (mismo activo), el límite inferior del intervalo lo supera, las caídas aumentan ≥ 1,5× más que las subas, y se sostiene antes y después de 2015.*

| Caída | Horizonte | Veredicto |
|---|---|---|
| ≥ 10 % | 3 ruedas | sin datos suficientes |
| ≥ 10 % | 5 ruedas | sin datos suficientes |
| ≥ 10 % | 20 ruedas | sin datos suficientes |
| ≥ 5 % | 3 ruedas | sin datos suficientes |
| ≥ 5 % | 5 ruedas | sin datos suficientes |
| ≥ 5 % | 20 ruedas | sin datos suficientes |

## Datos

Parámetros del radar (fijos): {"rsiPeriod":14,"rsiHigh":70,"overboughtLookback":10,"rsiFadeLag":5,"supportWindow":20,"volWindow":20,"volMult":1.5,"atrFast":5,"atrSlow":60,"atrRatio":1.4,"warmup":60}

| Activo | Grupo | Ruedas | Desde | Hasta |
|---|---|---|---|---|

**Excluidos:**

- ^GSPC: no se pudo descargar (^GSPC: HTTP 429)
- ^IXIC: no se pudo descargar (^IXIC: HTTP 429)
- ^DJI: no se pudo descargar (^DJI: HTTP 429)
- ^RUT: no se pudo descargar (^RUT: HTTP 429)
- ^FTSE: no se pudo descargar (^FTSE: HTTP 429)
- ^GDAXI: no se pudo descargar (^GDAXI: HTTP 429)
- ^N225: no se pudo descargar (^N225: HTTP 429)
- ^BVSP: no se pudo descargar (^BVSP: HTTP 429)
- ^HSI: no se pudo descargar (^HSI: HTTP 429)
- ^MERV: no se pudo descargar (^MERV: HTTP 429)
- SPY: no se pudo descargar (SPY: HTTP 429)
- QQQ: no se pudo descargar (QQQ: HTTP 429)
- IWM: no se pudo descargar (IWM: HTTP 429)
- EEM: no se pudo descargar (EEM: HTTP 429)
- GLD: no se pudo descargar (GLD: HTTP 429)
- TLT: no se pudo descargar (TLT: HTTP 429)
- XLE: no se pudo descargar (XLE: HTTP 429)
- XLF: no se pudo descargar (XLF: HTTP 429)
- AAPL: no se pudo descargar (AAPL: HTTP 429)
- MSFT: no se pudo descargar (MSFT: HTTP 429)
- AMZN: no se pudo descargar (AMZN: HTTP 429)
- GOOGL: no se pudo descargar (GOOGL: HTTP 429)
- META: no se pudo descargar (META: HTTP 429)
- NVDA: no se pudo descargar (NVDA: HTTP 429)
- TSLA: no se pudo descargar (TSLA: HTTP 429)
- AMD: no se pudo descargar (AMD: HTTP 429)
- NFLX: no se pudo descargar (NFLX: HTTP 429)
- INTC: no se pudo descargar (INTC: HTTP 429)
- KO: no se pudo descargar (KO: HTTP 429)
- PEP: no se pudo descargar (PEP: HTTP 429)
- JNJ: no se pudo descargar (JNJ: HTTP 429)
- PFE: no se pudo descargar (PFE: HTTP 429)
- JPM: no se pudo descargar (JPM: HTTP 429)
- BAC: no se pudo descargar (BAC: HTTP 429)
- XOM: no se pudo descargar (XOM: HTTP 429)
- CVX: no se pudo descargar (CVX: HTTP 429)
- WMT: no se pudo descargar (WMT: HTTP 429)
- DIS: no se pudo descargar (DIS: HTTP 429)
- BA: no se pudo descargar (BA: HTTP 429)
- F: no se pudo descargar (F: HTTP 429)
- T: no se pudo descargar (T: HTTP 429)
- GME: no se pudo descargar (GME: HTTP 429)
- GGAL: no se pudo descargar (GGAL: HTTP 429)
- YPF: no se pudo descargar (YPF: HTTP 429)
- MELI: no se pudo descargar (MELI: HTTP 429)
- VALE: no se pudo descargar (VALE: HTTP 429)
- PBR: no se pudo descargar (PBR: HTTP 429)
- BTC-USD: no se pudo descargar (BTC-USD: HTTP 429)
- ETH-USD: no se pudo descargar (ETH-USD: HTTP 429)
- XRP-USD: no se pudo descargar (XRP-USD: HTTP 429)
- LTC-USD: no se pudo descargar (LTC-USD: HTTP 429)
- DOGE-USD: no se pudo descargar (DOGE-USD: HTTP 429)
