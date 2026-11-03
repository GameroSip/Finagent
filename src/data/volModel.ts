// GENERADO a partir del backtest 4 (corrida 41544663489, 2026-11-02, rama vol-pooled4, registro previo 8d64535). No se edita a mano.
// Pronóstico de volatilidad con coeficientes comunes por tipo de activo, ajustados con todos los datos de cada grupo (solo filas con ≤ 5 % de ruedas sin rango).
// ln(variación diaria promedio de las 5 ruedas siguientes) = a + b1·ln(d) + b2·ln(s) + b3·ln(m) + b4·ln(q);  d, s, m, q = promedio de la variación diaria (Garman-Klass) de las últimas 1, 5, 22 y 250 ruedas.
// Validado (Q1–Q5 del registro previo): mejor que 'ayer' y que EWMA, intervalo 5 %–95 % calibrado por grupo (cobertura 87–92 %) y 'X veces lo habitual' creciente. El VIX NO mejoró al modelo, por eso no se usa.
import type { PModel, PooledGroup } from '../volPooled';

export const VOL_MODEL: { calibrado: string; corrida: number; prereg: string; groups: Record<PooledGroup, PModel> } = {
  calibrado: '2026-11-02', corrida: 41544663489, prereg: '8d64535', groups: {
    'índices': { beta: [-0.628802, 0.138065, 0.32524, 0.309177, 0.167949], bias: 1.174961, q: [-2.169225, 2.085726], rows: 71866, assets: 7 },
    'ETF': { beta: [-0.616068, 0.144238, 0.307341, 0.342989, 0.145774], bias: 1.163882, q: [-2.152075, 1.977064], rows: 51633, assets: 8 },
    'acciones': { beta: [-0.476321, 0.097222, 0.254157, 0.386085, 0.213508], bias: 1.169319, q: [-1.912602, 1.982596], rows: 294647, assets: 29 },
    'cripto': { beta: [-0.95502, 0.149507, 0.313792, 0.208378, 0.206894], bias: 1.406214, q: [-1.647951, 1.931284], rows: 17428, assets: 5 },
  } };
