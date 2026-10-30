// Radar de tensión: cuatro condiciones de estrés calculadas con datos DIARIOS. Cada una usa solo información hasta el día evaluado (no mira el futuro).
// Los umbrales están fijados de antemano y NO se ajustaron a ningún dato histórico (si se ajustaran, el backtest se volvería optimista).
// No predice precios: cuenta cuántas condiciones de estrés se cumplen hoy.
import { atr, rsi } from './indicators';

export interface DayBar { t: number; o: number; h: number; l: number; c: number; v: number }
export type Level = 'verde' | 'amarillo' | 'rojo';
export interface RadarConditions {
  momentum: boolean;          // agotamiento: el RSI estuvo en sobrecompra hace poco y hoy se debilita
  support: boolean;           // ruptura: el cierre perfora el mínimo de las últimas 20 ruedas
  volume: boolean | null;     // presión vendedora: rueda bajista con volumen muy superior al habitual (null si el activo no informa volumen)
  volatility: boolean;        // nerviosismo: las oscilaciones de la última semana se ensanchan frente al último trimestre
}
export interface RadarPoint { i: number; ready: boolean; conditions: RadarConditions; score: number; available: number; level: Level }

export const RADAR_PARAMS = {
  rsiPeriod: 14, rsiHigh: 70, overboughtLookback: 10, rsiFadeLag: 5,
  supportWindow: 20,
  volWindow: 20, volMult: 1.5,
  atrFast: 5, atrSlow: 60, atrRatio: 1.4,
  warmup: 60,
} as const;
export type RadarParams = typeof RADAR_PARAMS;

/** Verde: menos de la mitad de las condiciones disponibles. Amarillo: la mitad. Rojo: tres de cada cuatro o más. */
export function levelOf(score: number, available: number): Level {
  const share = available > 0 ? score / available : 0;
  return share >= 0.75 ? 'rojo' : share >= 0.5 ? 'amarillo' : 'verde';
}

export function radarSeries(bars: DayBar[], p: RadarParams = RADAR_PARAMS): RadarPoint[] {
  const n = bars.length, close = bars.map((b) => b.c);
  const rs = rsi(close, p.rsiPeriod), aFast = atr(bars, p.atrFast), aSlow = atr(bars, p.atrSlow);
  const out: RadarPoint[] = [];
  for (let i = 0; i < n; i++) {
    const none: RadarConditions = { momentum: false, support: false, volume: null, volatility: false };
    const ready = i >= p.warmup && rs[i] !== null && aSlow[i] !== null;
    if (!ready) { out.push({ i, ready, conditions: none, score: 0, available: 0, level: 'verde' }); continue; }
    let hi = -Infinity;
    for (let k = i - p.overboughtLookback + 1; k <= i; k++) { const v = rs[k]; if (v !== null && v > hi) hi = v; }
    const rNow = rs[i] as number, rPrev = rs[i - p.rsiFadeLag];
    const momentum = hi >= p.rsiHigh && rPrev !== null && rNow < rPrev;
    let lowest = Infinity;
    for (let k = i - p.supportWindow; k < i; k++) lowest = Math.min(lowest, bars[k].l);
    const support = close[i] < lowest;
    let volSum = 0, volDays = 0;
    for (let k = i - p.volWindow; k < i; k++) { if (bars[k].v > 0) { volSum += bars[k].v; volDays++; } }
    const volumeKnown = volDays >= p.volWindow * 0.8 && bars[i].v > 0;
    const volume = volumeKnown ? close[i] < close[i - 1] && bars[i].v >= p.volMult * (volSum / volDays) : null;
    const fast = aFast[i], slow = aSlow[i];
    const volatility = fast !== null && slow !== null && slow > 0 && fast / slow >= p.atrRatio;
    const conditions: RadarConditions = { momentum, support, volume, volatility };
    const flags = [momentum, support, volume, volatility].filter((x) => x !== null) as boolean[];
    const score = flags.filter(Boolean).length, available = flags.length;
    out.push({ i, ready, conditions, score, available, level: levelOf(score, available) });
  }
  return out;
}
