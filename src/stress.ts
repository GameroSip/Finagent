// Termómetro de tensión: cuántas de las cuatro condiciones de estrés se cumplen hoy (ver radar.ts) y qué pasó, históricamente, después de situaciones parecidas.
// Qué mide y qué NO: el backtest (49 activos, 1927–2026) mostró que tras tensión alta los movimientos grandes son más frecuentes en AMBAS direcciones; no hay evidencia de que anticipe caídas.
// Por eso acá nunca se habla de "riesgo de caída" ni de comprar o vender.
import { classify } from './ui/assetIcon';
import { radarSeries, type DayBar, type RadarConditions } from './radar';
import { RADAR_STATS, type LevelStats, type StressGroup, type StressLevel } from './data/radarStats';

export type { StressGroup, StressLevel };
export interface MarketMeta { instrumentType?: string; gmtoffset?: number; currentTradingPeriod?: { regular?: { start: number; end: number } } }

/** Tipo de activo según el backtest (null = el termómetro no está respaldado: divisas, futuros, fondos…). */
export function stressGroup(symbol: string, instrumentType?: string): StressGroup | null {
  const t = (instrumentType ?? '').toUpperCase(), s = symbol.toUpperCase();
  if (/=X$|=F$/.test(s)) return null;
  if (t === 'INDEX' || s.startsWith('^')) return 'índices';
  if (t === 'ETF') return 'ETF';
  if (t === 'CRYPTOCURRENCY' || classify(symbol).kind === 'crypto') return 'cripto';
  if (t === 'EQUITY' || t === '') return 'acciones';
  return null;
}

/** Quita la rueda en curso: el backtest se midió con ruedas COMPLETAS, y una barra parcial (volumen a medias, cierre provisorio) falsearía las señales. */
export function completedBars<T extends { t: number }>(bars: T[], meta: MarketMeta, nowMs: number): T[] {
  const last = bars[bars.length - 1];
  if (!last) return bars;
  const off = meta.gmtoffset ?? 0, day = (sec: number) => Math.floor((sec + off) / 86400);
  if (day(last.t) !== day(nowMs / 1000)) return bars;                       // la última rueda es de un día anterior: está completa
  const reg = meta.currentTradingPeriod?.regular, crypto = (meta.instrumentType ?? '').toUpperCase() === 'CRYPTOCURRENCY';
  const inProgress = crypto || !reg || nowMs / 1000 < reg.end;                 // cripto no cierra; sin horario conocido se asume en curso (conservador)
  return inProgress ? bars.slice(0, -1) : bars;
}

export type StressResult =
  | { kind: 'ok'; level: StressLevel; score: number; available: number; conditions: RadarConditions; asOf: number; group: StressGroup }
  | { kind: 'unsupported'; reason: 'tipo' | 'volumen' | 'historia' };

const LEVEL: Record<'verde' | 'amarillo' | 'rojo', StressLevel> = { verde: 'baja', amarillo: 'media', rojo: 'alta' };

export function stressNow(bars: DayBar[], symbol: string, meta: MarketMeta, nowMs = Date.now()): StressResult {
  const group = stressGroup(symbol, meta.instrumentType);
  if (!group) return { kind: 'unsupported', reason: 'tipo' };
  const done = completedBars(bars, meta, nowMs), pts = radarSeries(done), p = pts[pts.length - 1];
  if (!p || !p.ready) return { kind: 'unsupported', reason: 'historia' };
  if (p.conditions.volume === null) return { kind: 'unsupported', reason: 'volumen' };   // sin volumen no se puede medir una condición: no se improvisa con tres
  return { kind: 'ok', level: LEVEL[p.level], score: p.score, available: p.available, conditions: p.conditions, asOf: done[done.length - 1].t, group };
}

export const historyOf = (group: StressGroup, level: StressLevel): { assets: number; days: number; stats: LevelStats } => {
  const g = RADAR_STATS.groups[group];
  return { assets: g.assets, days: g.days, stats: g.levels[level] };
};

/** Todos los textos fijos del termómetro (las pruebas verifican que estén traducidos y que no prometan nada indebido). */
export const STRESS_TEXTS = {
  title: 'Termómetro de tensión',
  levels: { baja: 'Tensión baja', media: 'Tensión media', alta: 'Tensión alta' } as Record<StressLevel, string>,
  levelShort: { baja: 'Tras tensión baja', media: 'Tras tensión media', alta: 'Tras tensión alta' } as Record<StressLevel, string>,
  summary: {
    baja: 'No hay señales de tensión. No significa que el activo esté a salvo: los movimientos bruscos siguen siendo posibles.',
    media: 'Hay algunas señales de tensión. Históricamente, los movimientos grandes fueron más frecuentes en situaciones como esta.',
    alta: 'Hay varias señales de tensión a la vez. Históricamente, los movimientos grandes, hacia arriba o hacia abajo, fueron bastante más frecuentes.',
  } as Record<StressLevel, string>,
  conditions: {
    momentum: 'Impulso debilitado tras una sobrecompra',
    support: 'Cierre por debajo del mínimo de las últimas 20 ruedas',
    volume: 'Rueda bajista con volumen inusualmente alto',
    volatility: 'Oscilaciones más amplias que en el último trimestre',
  } as Record<keyof RadarConditions, string>,
  today: 'Qué se cumple hoy',
  after: 'Qué pasó después, en la semana siguiente (5 ruedas)',
  usual: 'Habitual',
  drop: 'Caída de 5 % o más',
  up: 'Suba de 5 % o más',
  groups: { 'índices': 'índices', ETF: 'ETF', acciones: 'acciones', cripto: 'criptomonedas' } as Record<StressGroup, string>,
  usualNote: 'Habitual = frecuencia en un día cualquiera de esos mismos activos.',
  note: 'No predice la dirección ni el momento de ningún movimiento, y no es una señal de compra ni de venta. Se calcula con datos diarios de Yahoo (pueden tener demora o errores). Los umbrales se fijaron antes de medir y no se ajustaron. El historial usa activos que hoy existen, así que la realidad pudo ser algo peor.',
  unsupported: { tipo: 'No disponible para este tipo de activo.', volumen: 'No disponible: este activo no informa volumen.', historia: 'No disponible: faltan datos diarios (se necesitan unos 3 meses).' } as Record<'tipo' | 'volumen' | 'historia', string>,
  plan: {
    title: 'Mi plan', cta: 'Escribir mi plan para días de tensión', edit: 'Editar', yours: 'Tu plan, escrito por vos', local: 'Lo escribís vos y se guarda solo en este teléfono.',
    placeholder: 'Escribí qué vas a hacer (o no hacer) cuando haya tensión alta.', hint: 'Pensalo con calma, ahora: así no decidís con miedo cuando llegue el momento. FinAgent no te dice qué hacer: solo te lo recuerda.',
    save: 'Guardar', remove: 'Borrar plan', saved: 'Plan guardado', removed: 'Plan borrado',
  },
};
export const stressTexts = (): string[] => {
  const T = STRESS_TEXTS, out: string[] = [T.title, T.today, T.after, T.usual, T.drop, T.up, T.usualNote, T.note];
  for (const o of [T.levels, T.levelShort, T.summary, T.conditions, T.groups, T.unsupported, T.plan]) out.push(...Object.values(o));
  return out;
};
