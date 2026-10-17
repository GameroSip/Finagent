// Gráficos con TradingView Lightweight Charts™ (Apache-2.0). Colores tomados del tema activo.
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, LineSeries, LineStyle, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function rgba(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export interface Pt { t: number; o?: number; h?: number; l?: number; c: number }
export interface Ema { span: number; values: Array<number | null>; color: string }
export interface PriceChartOpts {
  points: Pt[]; mode: 'line' | 'candles'; intraday?: boolean; height?: number;
  ema?: Ema[]; onHover?: (p: Pt | null) => void;
}
export interface ChartHandle { chart: IChartApi; destroy(): void }

const dedupe = (pts: Pt[]) => {
  const out: Pt[] = [];
  for (const p of [...pts].sort((a, b) => a.t - b.t)) if (!out.length || out[out.length - 1].t !== p.t) out.push(p);
  return out;
};

function baseOptions(height: number, intraday: boolean) {
  return {
    autoSize: true, height,
    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('--muted'), fontFamily: "'Inter Variable', Inter, system-ui, sans-serif", fontSize: 11, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: css('--line'), style: LineStyle.Solid } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.1 } },
    timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true, rightOffset: 2 },
    crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: css('--line-2'), width: 1 as const, style: LineStyle.Dashed, labelVisible: false }, horzLine: { visible: false, labelVisible: false } },
    localization: { locale: 'es-AR', priceFormatter: (p: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: Math.abs(p) < 10 ? 4 : 2 }).format(p) },
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: false },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  };
}

export function mountPriceChart(el: HTMLElement, o: PriceChartOpts): ChartHandle {
  const height = o.height ?? 260;
  el.style.height = `${height}px`;
  const pts = dedupe(o.points);
  const up = pts.length < 2 || pts[pts.length - 1].c >= pts[0].c;
  const color = up ? css('--up') : css('--down');
  const chart = createChart(el, baseOptions(height, !!o.intraday));
  const byTime = new Map<number, Pt>(pts.map((p) => [p.t, p]));
  let main;
  if (o.mode === 'candles' && pts.every((p) => p.o !== undefined)) {
    main = chart.addSeries(CandlestickSeries, { upColor: css('--up'), downColor: css('--down'), borderVisible: false, wickUpColor: css('--up'), wickDownColor: css('--down'), priceLineVisible: false, lastValueVisible: false });
    main.setData(pts.map((p) => ({ time: p.t as UTCTimestamp, open: p.o!, high: p.h!, low: p.l!, close: p.c })));
  } else {
    main = chart.addSeries(AreaSeries, { lineColor: color, topColor: rgba(color, 0.34), bottomColor: rgba(color, 0), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 5, crosshairMarkerBorderColor: css('--bg'), crosshairMarkerBackgroundColor: color });
    main.setData(pts.map((p) => ({ time: p.t as UTCTimestamp, value: p.c })));
  }
  for (const e of o.ema ?? []) {
    const times = o.points.slice(-e.values.length).map((p) => p.t);
    const data = e.values.map((v, i) => (v === null ? null : { time: times[i] as UTCTimestamp, value: v })).filter((x): x is { time: UTCTimestamp; value: number } => !!x);
    if (data.length < 2) continue;
    const s = chart.addSeries(LineSeries, { color: e.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    s.setData(dedupeLine(data));
  }
  if (o.onHover) {
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || param.point.x < 0) return o.onHover!(null);
      o.onHover!(byTime.get(param.time as number) ?? null);
    });
  }
  chart.timeScale().fitContent();
  return { chart, destroy: () => chart.remove() };
}

const dedupeLine = (d: Array<{ time: UTCTimestamp; value: number }>) => {
  const out: typeof d = [];
  for (const p of [...d].sort((a, b) => a.time - b.time)) if (!out.length || out[out.length - 1].time !== p.time) out.push(p);
  return out;
};

export const PALETTE = ['#7C6CFF', '#22D3EE', '#1FD18B', '#FFB547', '#FF6BB5', '#FF8A4C'];

/** Rendimiento comparado (% desde el inicio) de varios activos. */
export function mountCompareChart(el: HTMLElement, lines: Array<{ symbol: string; points: Array<[number, number]> }>, height = 220): ChartHandle {
  el.style.height = `${height}px`;
  const chart = createChart(el, baseOptions(height, false));
  lines.forEach((l, i) => {
    const s = chart.addSeries(LineSeries, { color: PALETTE[i % PALETTE.length], lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      priceFormat: { type: 'custom', formatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%` } });
    s.setData(dedupeLine(l.points.map(([t, v]) => ({ time: t as UTCTimestamp, value: v }))));
  });
  chart.timeScale().fitContent();
  return { chart, destroy: () => chart.remove() };
}
