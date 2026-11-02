// Backtest del radar: ¿qué pasó DESPUÉS de cada nivel? Todo con las mismas funciones que usaría la app. Puro y determinista (sin red).
import { radarSeries, type DayBar, type Level } from './radar';

export type Group = 'índices' | 'ETF' | 'acciones' | 'cripto';
export interface AssetSeries { symbol: string; group: Group; bars: DayBar[] }

export const HORIZONS = [3, 5, 20] as const;        // ruedas hacia adelante (3 ≈ las "24 a 72 horas" de la idea original)
export const DROPS = [0.05, 0.1] as const;           // caída máxima desde el cierre del día: ≥5 % y ≥10 % (el 10 % es el umbral de la idea)
export const SPLIT_DATE = Date.UTC(2015, 0, 1) / 1000;

/** Intervalo de confianza de Wilson al 95 % para una proporción (sirve con pocos casos). */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
}
export const median = (a: number[]): number => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const quantile = (a: number[], q: number): number => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

/** Peor cierre de las próximas `h` ruedas respecto del cierre de hoy (negativo = caída). null si no hay suficientes datos hacia adelante. */
export function forwardMin(bars: DayBar[], i: number, h: number): number | null {
  if (i + h >= bars.length) return null;
  let m = Infinity;
  for (let k = i + 1; k <= i + h; k++) m = Math.min(m, bars[k].c);
  return m / bars[i].c - 1;
}
/** Mejor cierre de las próximas `h` ruedas respecto del cierre de hoy (positivo = suba). Sirve de espejo: ¿el rojo anticipa caídas o solo movimientos grandes en cualquier dirección? */
export function forwardMax(bars: DayBar[], i: number, h: number): number | null {
  if (i + h >= bars.length) return null;
  let m = -Infinity;
  for (let k = i + 1; k <= i + h; k++) m = Math.max(m, bars[k].c);
  return m / bars[i].c - 1;
}
export const forwardRet = (bars: DayBar[], i: number, h: number): number | null => (i + h >= bars.length ? null : bars[i + h].c / bars[i].c - 1);

/** `exp`/`expUp` = tasa que se ESPERARÍA por azar con la misma mezcla de activos (cada día se compara con la tasa base de su propio activo, para no confundir "activo volátil" con "señal"). */
export interface Cell { n: number; events: number; rate: number; lo: number; hi: number; exp: number; ups: number; upRate: number; expUp: number; meanRet: number; medRet: number; p10Ret: number }
type BaseRates = Map<string, { drop: number; up: number }>;
export function baseRates(rows: Array<{ asset: string; drop: number; up: number }>, T: number): BaseRates {
  const acc = new Map<string, { n: number; d: number; u: number }>();
  for (const r of rows) { const a = acc.get(r.asset) ?? { n: 0, d: 0, u: 0 }; a.n++; if (r.drop <= -T) a.d++; if (r.up >= T) a.u++; acc.set(r.asset, a); }
  return new Map([...acc].map(([k, v]) => [k, { drop: v.d / v.n, up: v.u / v.n }]));
}
function cell(rows: Array<{ asset: string; drop: number; up: number; ret: number }>, T: number, base: BaseRates): Cell {
  const n = rows.length, events = rows.filter((r) => r.drop <= -T).length, ups = rows.filter((r) => r.up >= T).length, [lo, hi] = wilson(events, n), rets = rows.map((r) => r.ret);
  const mean = (f: (r: { asset: string }) => number) => (n ? rows.reduce((t, r) => t + f(r), 0) / n : NaN);
  return { n, events, rate: n ? events / n : NaN, lo, hi, exp: mean((r) => base.get(r.asset)?.drop ?? 0), ups, upRate: n ? ups / n : NaN, expUp: mean((r) => base.get(r.asset)?.up ?? 0),
    meanRet: n ? rets.reduce((t, x) => t + x, 0) / n : NaN, medRet: median(rets), p10Ret: quantile(rets, 0.1) };
}

export type Slice = 'todo' | 'antes de 2015' | 'desde 2015';
export interface Row { level: Level; drop: number; up: number; ret: number; episode: boolean; priorFall3: number | null; t: number; asset: string }

/** Filas evaluables (con datos hacia adelante) de una serie: una por día, con el nivel del radar ese día. */
export function rowsFor(a: AssetSeries, h: number): Row[] {
  const pts = radarSeries(a.bars), rows: Row[] = [];
  let sinceRed = 99;                                    // ruedas desde el último rojo (para agrupar rojos seguidos en un solo "episodio")
  for (const pt of pts) {
    const isRed = pt.ready && pt.level === 'rojo';
    const episode = isRed && sinceRed >= 5;
    sinceRed = isRed ? 0 : sinceRed + 1;
    if (!pt.ready) continue;
    const drop = forwardMin(a.bars, pt.i, h), up = forwardMax(a.bars, pt.i, h), ret = forwardRet(a.bars, pt.i, h);
    if (drop === null || up === null || ret === null) continue;
    rows.push({ level: pt.level, drop, up, ret, episode, priorFall3: pt.i >= 3 ? a.bars[pt.i].c / a.bars[pt.i - 3].c - 1 : null, t: a.bars[pt.i].t, asset: a.symbol });
  }
  return rows;
}

export interface Block {
  group: string; assets: number; h: number; T: number; slice: Slice;
  base: Cell; verde: Cell; amarillo: Cell; rojo: Cell; rojoEpisodios: Cell;
  rojoSinCaidaPrevia: Cell;           // rojos que NO venían ya cayendo (≥3 % en 3 ruedas): el "aviso temprano" genuino
  yaCayo: Cell;                       // referencia simple: días en que ya había caído ≥5 % en 3 ruedas
  lift: number;                       // caídas tras rojo ÷ caídas esperadas por azar (misma mezcla de activos)
  liftUp: number;                     // lo mismo para SUBAS ≥ T: si es parecido al lift de caídas, el radar solo detecta movimientos grandes, no dirección
  directional: number;                // lift de caídas ÷ lift de subas (≈ 1 = sin dirección)
  precision: number; recall: number;
}

export function backtest(assets: AssetSeries[]) {
  const groups: Array<[string, AssetSeries[]]> = [['todos', assets], ...(['índices', 'ETF', 'acciones', 'cripto'] as Group[]).map((g) => [g, assets.filter((a) => a.group === g)] as [string, AssetSeries[]])];
  const blocks: Block[] = [];
  for (const [name, list] of groups) {
    if (!list.length) continue;
    for (const h of HORIZONS) {
      const all = list.flatMap((a) => rowsFor(a, h));
      for (const slice of ['todo', 'antes de 2015', 'desde 2015'] as Slice[]) {
        const rows = all.filter((r) => slice === 'todo' || (slice === 'antes de 2015' ? r.t < SPLIT_DATE : r.t >= SPLIT_DATE));
        if (!rows.length) continue;
        for (const T of DROPS) {
          const br = baseRates(rows, T), base = cell(rows, T, br), red = rows.filter((r) => r.level === 'rojo'), redCell = cell(red, T, br);
          const eventsAll = rows.filter((r) => r.drop <= -T).length;
          const liftDrop = redCell.exp > 0 ? redCell.rate / redCell.exp : NaN, liftUp = redCell.expUp > 0 ? redCell.upRate / redCell.expUp : NaN;
          blocks.push({
            group: name, assets: new Set(rows.map((r) => r.asset)).size, h, T, slice, base,
            verde: cell(rows.filter((r) => r.level === 'verde'), T, br), amarillo: cell(rows.filter((r) => r.level === 'amarillo'), T, br), rojo: redCell,
            rojoEpisodios: cell(red.filter((r) => r.episode), T, br),
            rojoSinCaidaPrevia: cell(red.filter((r) => r.episode && r.priorFall3 !== null && r.priorFall3 > -0.03), T, br),
            yaCayo: cell(rows.filter((r) => r.priorFall3 !== null && r.priorFall3 <= -0.05), T, br),
            lift: liftDrop, liftUp, directional: liftUp > 0 ? liftDrop / liftUp : NaN,
            precision: redCell.rate, recall: eventsAll ? redCell.events / eventsAll : NaN,
          });
        }
      }
    }
  }
  return blocks;
}
