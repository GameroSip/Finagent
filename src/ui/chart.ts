// Gráficos con TradingView Lightweight Charts™ (Apache-2.0). Colores tomados del tema activo.
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { locale, t } from '../i18n';
import { ema as emaFn, macd as macdFn, rsi as rsiFn } from '../indicators';
import { SESSIONS, bollinger, classicPivots, fibonacci, previousPeriod, sessionBands, volumeProfile, vwap, type SessionId } from '../ta';

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function rgba(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export interface Pt { t: number; o?: number; h?: number; l?: number; c: number; v?: number }
export interface Ema { span: number; values: Array<number | null>; color: string }
/** Herramientas que el usuario puede activar en el gráfico de un activo (todas gratis). */
export interface ChartTools { ema20?: boolean; ema50?: boolean; ema200?: boolean; bollinger?: boolean; fib?: boolean; pivots?: boolean; vwap?: boolean; volume?: boolean; profile?: boolean; sessions?: boolean; rsi?: boolean; macd?: boolean }
export interface PriceChartOpts {
  points: Pt[]; mode: 'line' | 'candles'; intraday?: boolean; height?: number;
  ema?: Ema[]; tools?: ChartTools; onHover?: (p: Pt | null) => void;
}
/** notices: avisos de herramientas que no se pudieron dibujar (por ejemplo, "VWAP solo en gráficos de 1D y 1S"). */
export interface ChartHandle { chart: IChartApi; notices: string[]; destroy(): void }

const PANE_H = 92; // alto de cada panel inferior (RSI, MACD)
export const TOOL_COLORS = { ema20: '#22D3EE', ema50: '#FFB547', ema200: '#FF6BB5', bb: '#8B93FF', vwap: '#FF8A4C', fib: '#FFB547', pivot: '#9AA4B2', profile: '#7C6CFF', asia: '#FF6BB5', london: '#22D3EE', newyork: '#FFB547' } as const;

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
    localization: { locale: locale(), priceFormatter: (p: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: Math.abs(p) < 10 ? 4 : 2 }).format(p) },
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: false },
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
  };
}

export function mountPriceChart(el: HTMLElement, o: PriceChartOpts): ChartHandle {
  const tools = o.tools ?? {};
  const extraPanes = (tools.rsi ? 1 : 0) + (tools.macd ? 1 : 0);
  const mainH = o.height ?? 260;
  const height = mainH + extraPanes * PANE_H;
  el.style.height = `${height}px`;
  el.style.position = 'relative';
  const notices: string[] = [];
  const pts = dedupe(o.points);
  const up = pts.length < 2 || pts[pts.length - 1].c >= pts[0].c;
  const color = up ? css('--up') : css('--down');
  const chart = createChart(el, baseOptions(height, !!o.intraday));
  const byTime = new Map<number, Pt>(pts.map((p) => [p.t, p]));
  const T = (t: number) => t as UTCTimestamp;
  const line = (data: Array<number | null>, opt: Record<string, unknown>, pane = 0) => {
    const d = data.map((v, i) => (v === null ? null : { time: T(pts[i].t), value: v })).filter((x): x is { time: UTCTimestamp; value: number } => !!x);
    if (d.length < 2) return null;
    const s = chart.addSeries(LineSeries, { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineWidth: 2, ...opt }, pane);
    s.setData(d);
    return s;
  };
  let main;
  if (o.mode === 'candles' && pts.every((p) => p.o !== undefined)) {
    main = chart.addSeries(CandlestickSeries, { upColor: css('--up'), downColor: css('--down'), borderVisible: false, wickUpColor: css('--up'), wickDownColor: css('--down'), priceLineVisible: false, lastValueVisible: false });
    main.setData(pts.map((p) => ({ time: T(p.t), open: p.o!, high: p.h!, low: p.l!, close: p.c })));
  } else {
    main = chart.addSeries(AreaSeries, { lineColor: color, topColor: rgba(color, 0.34), bottomColor: rgba(color, 0), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    main.setData(pts.map((p) => ({ time: T(p.t), value: p.c })));
  }
  const closes = pts.map((p) => p.c);
  const hasOhlc = pts.every((p) => p.o !== undefined && p.h !== undefined && p.l !== undefined);
  const hasVol = pts.some((p) => (p.v ?? 0) > 0);

  // EMAs que ya pasaban las tarjetas del chat (se conservan tal cual)
  for (const e of o.ema ?? []) {
    const times = o.points.slice(-e.values.length).map((p) => p.t);
    const data = e.values.map((v, i) => (v === null ? null : { time: times[i] as UTCTimestamp, value: v })).filter((x): x is { time: UTCTimestamp; value: number } => !!x);
    if (data.length < 2) continue;
    chart.addSeries(LineSeries, { color: e.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(dedupeLine(data));
  }
  // Herramientas del usuario
  for (const span of [20, 50, 200] as const) {
    if (!tools[`ema${span}` as const]) continue;
    if (closes.length < span) { notices.push(t('La EMA {n} necesita al menos {n} velas: elegí un rango más largo.', { n: span })); continue; }
    line(emaFn(closes, span), { color: TOOL_COLORS[`ema${span}` as const] });
  }
  if (tools.bollinger) {
    if (closes.length < 20) notices.push(t('Las bandas de Bollinger necesitan al menos 20 velas.'));
    else { const b = bollinger(closes); line(b.upper, { color: TOOL_COLORS.bb, lineWidth: 1 }); line(b.lower, { color: TOOL_COLORS.bb, lineWidth: 1 }); line(b.mid, { color: TOOL_COLORS.bb, lineWidth: 1, lineStyle: LineStyle.Dashed }); }
  }
  if (tools.vwap) {
    if (!o.intraday) notices.push(t('El VWAP solo se muestra en los gráficos de 1D y 1S.'));
    else if (!hasVol) notices.push(t('Este activo no informa volumen: no se puede calcular el VWAP.'));
    else line(vwap(pts as Required<Pick<Pt, 't' | 'o' | 'h' | 'l' | 'c'>>[]), { color: TOOL_COLORS.vwap });
  }
  if (tools.fib) {
    const f = hasOhlc ? fibonacci(pts as never) : null;
    if (!f) notices.push(t('No hay un movimiento claro para trazar Fibonacci en este rango.'));
    else for (const l of f.levels) main.createPriceLine({ price: l.price, color: l.ratio === 0.618 ? '#FFB547' : l.ratio === 0.382 || l.ratio === 0.5 ? '#FFD28A' : rgba('#FFB547', 0.6), lineWidth: 1, lineStyle: l.ratio === 0 || l.ratio === 1 ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: [0, 0.382, 0.5, 0.618, 1].includes(l.ratio), title: `${+(l.ratio * 100).toFixed(1)}%` });
  }
  if (tools.pivots) {
    const prev = hasOhlc ? previousPeriod(pts as never, !!o.intraday) : null;
    if (!prev) notices.push(t(o.intraday ? 'Los pivotes necesitan datos del día anterior: probá con el rango 1S.' : 'No hay datos suficientes para calcular los pivotes.'));
    else {
      const p = classicPivots(prev.h, prev.l, prev.c);
      const add = (price: number, title: string, col: string) => main.createPriceLine({ price, color: col, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: ['P', 'R1', 'S1'].includes(title), title });
      add(p.p, 'P', TOOL_COLORS.pivot);
      ([['R1', p.r1], ['R2', p.r2], ['R3', p.r3]] as const).forEach(([t, v]) => add(v, t, css('--down')));
      ([['S1', p.s1], ['S2', p.s2], ['S3', p.s3]] as const).forEach(([t, v]) => add(v, t, css('--up')));
    }
  }
  if (tools.volume) {
    if (!hasVol) notices.push(t('Este activo no informa volumen.'));
    else {
      const vs = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '', priceLineVisible: false, lastValueVisible: false });
      vs.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vs.setData(pts.map((p, i) => ({ time: T(p.t), value: p.v ?? 0, color: rgba(((p.o ?? (pts[i - 1]?.c ?? p.c)) <= p.c ? css('--up') : css('--down')), 0.45) })));
    }
  }
  // Paneles inferiores
  let pane = 1;
  if (tools.rsi) {
    if (closes.length < 16) notices.push(t('El RSI necesita al menos 16 velas.'));
    else {
      const s = line(rsiFn(closes), { color: '#8B93FF', lastValueVisible: true }, pane);
      for (const [v, c] of [[70, css('--down')], [50, css('--line-2')], [30, css('--up')]] as const) s?.createPriceLine({ price: v, color: c, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: v !== 50, title: '' });
      pane++;
    }
  }
  if (tools.macd) {
    if (closes.length < 35) notices.push(t('El MACD necesita al menos 35 velas.'));
    else {
      const m = macdFn(closes);
      const hs = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      hs.setData(m.hist.map((v, i) => ({ time: T(pts[i].t), value: v, color: rgba(v >= 0 ? css('--up') : css('--down'), 0.6) })));
      line(m.line, { color: '#22D3EE', lineWidth: 1 }, pane); line(m.signal, { color: '#FFB547', lineWidth: 1 }, pane);
      pane++;
    }
  }
  const panes = chart.panes();
  for (let i = 1; i < panes.length; i++) panes[i].setHeight(PANE_H);

  // Capa propia (canvas) para lo que el gráfico no trae: sesiones de mercado y perfil de volumen
  const vp = tools.profile ? (hasOhlc && hasVol ? volumeProfile(pts as never) : null) : null;
  if (tools.profile && !vp) notices.push(t(hasVol ? 'No hay datos suficientes para el perfil de volumen.' : 'Este activo no informa volumen: no hay perfil de volumen.'));
  if (vp) {
    const pl = (price: number, title: string, col: string) => main.createPriceLine({ price, color: col, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: title === 'POC', title });
    pl((vp.poc.lo + vp.poc.hi) / 2, 'POC', '#FFB547'); pl(vp.vah, 'VAH', TOOL_COLORS.profile); pl(vp.val, 'VAL', TOOL_COLORS.profile);
  }
  const bands = tools.sessions ? (o.intraday ? sessionBands(pts.map((p) => p.t)) : []) : [];
  if (tools.sessions && !o.intraday) notices.push(t('Las sesiones de mercado solo se muestran en los gráficos de 1D y 1S.'));
  if (tools.sessions && o.intraday && !bands.length) notices.push(t('En este rango no hay horas de Asia, Londres ni Nueva York (fin de semana o mercado cerrado).'));
  let cv: HTMLCanvasElement | null = null, ro: ResizeObserver | null = null;
  const draw = () => {
    if (!cv) return;
    const w = el.clientWidth, ph = chart.panes()[0]?.getHeight() ?? mainH, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(ph * dpr); cv.style.width = `${w}px`; cv.style.height = `${ph}px`;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, ph);
    const ts = chart.timeScale();
    const x0 = pts[0] ? ts.timeToCoordinate(T(pts[0].t)) : null, x1 = pts[1] ? ts.timeToCoordinate(T(pts[1].t)) : null;
    const bw = (x0 !== null && x1 !== null ? Math.abs(x1 - x0) : 0) || ts.options().barSpacing || 6;
    const plotRight = w - (chart.priceScale('right').width() || 0);
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    const labelled = new Map<string, number>(); // última posición donde se escribió el nombre de cada sesión
    bands.forEach((b) => {
      const xa = ts.timeToCoordinate(T(b.from)), xb = ts.timeToCoordinate(T(b.to));
      if (xa === null || xb === null) return;
      const col = TOOL_COLORS[b.id as SessionId], left = Math.max(0, xa - bw / 2), right = Math.min(plotRight, xb + bw / 2);
      if (right <= left) return;
      ctx.fillStyle = rgba(col, 0.1); ctx.fillRect(left, 0, right - left, ph);
      const lx = left + 4, prev = labelled.get(b.id);
      if (right - left > 44 && (prev === undefined || lx - prev > 90)) { ctx.fillStyle = rgba(col, 0.95); ctx.fillText(t(SESSIONS.find((s) => s.id === b.id)!.label), lx, 12 + SESSIONS.findIndex((s) => s.id === b.id) * 12); labelled.set(b.id, lx); }
    });
    if (vp) {
      const maxVol = Math.max(...vp.bins.map((b) => b.vol)), maxW = plotRight * 0.3;
      vp.bins.forEach((bin) => {
        const ya = main.priceToCoordinate(bin.hi), yb = main.priceToCoordinate(bin.lo);
        if (ya === null || yb === null) return;
        const inVA = bin.lo >= vp.val - 1e-9 && bin.hi <= vp.vah + 1e-9, isPoc = bin === vp.poc, bwid = (bin.vol / maxVol) * maxW;
        ctx.fillStyle = isPoc ? rgba('#FFB547', 0.75) : inVA ? rgba(TOOL_COLORS.profile, 0.42) : rgba(TOOL_COLORS.profile, 0.2);
        ctx.fillRect(plotRight - bwid, ya, bwid, Math.max(1, yb - ya - 1));
      });
    }
  };
  if (bands.length || vp) {
    cv = document.createElement('canvas');
    cv.className = 'chart-overlay';
    cv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    el.append(cv);
    const redraw = () => requestAnimationFrame(draw); // un cuadro después: el gráfico ya reescaló sus ejes
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    ro = new ResizeObserver(redraw); ro.observe(el);
  }

  if (o.onHover) {
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || param.point.x < 0) return o.onHover!(null);
      o.onHover!(byTime.get(param.time as number) ?? null);
    });
  }
  chart.timeScale().fitContent();
  requestAnimationFrame(() => requestAnimationFrame(draw));
  return { chart, notices, destroy: () => { ro?.disconnect(); chart.remove(); } };
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
  return { chart, notices: [], destroy: () => chart.remove() };
}
