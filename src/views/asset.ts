// Detalle de un activo: precio, gráfico con rangos, estadísticas, técnico y noticias. Datos reales, sin IA.
import type { Ctx } from '../ctx';
import { snapshot } from '../indicators';
import { activeCount, loadTools, openToolsSheet, saveTools } from './chartTools';
import { metricsFromInfo } from '../tools';
import { adjustBars, fetchChart, fetchInfo, searchSymbols, type Bar, type ChartData } from '../yahoo';
import { isWatched, pushRecent, toggleWatch } from '../store';
import { assetIcon, learnDomain } from '../ui/assetIcon';
import { mountPriceChart, type ChartHandle, type ChartTools, type Pt } from '../ui/chart';
import { $, esc, h, openUrl, safeUrl, toast } from '../ui/dom';
import { dirClass, fmtCompact, fmtNum, fmtPct, fmtPrice, timeAgo } from '../ui/format';
import { icon } from '../ui/icons';
import { locale, t } from '../i18n';

export interface Overlay { el: HTMLElement; close(): void }

const RANGES = ['1D', '1S', '1M', '6M', '1A', '5A'] as const;
type Range = (typeof RANGES)[number];
const RANGE_LABEL: Record<Range, string> = { '1D': 'hoy', '1S': 'última semana', '1M': 'último mes', '6M': '6 meses', '1A': '1 año', '5A': '5 años' };

export function openAssetOverlay(ctx: Ctx, symbol: string, nameHint?: string, onClose?: () => void): Overlay {
  const sym = symbol.toUpperCase();
  pushRecent(sym);
  const el = h('div', { class: 'overlay asset-ov' });
  let name = nameHint ?? sym;
  let range: Range = '6M';
  let tools: ChartTools = loadTools();
  let hasVolume = false, lastIntraday = false, announce = false;
  let mode: 'line' | 'candles' = 'line';
  let handle: ChartHandle | null = null;
  let yearData: ChartData | null = null;
  let yearPromise: Promise<ChartData> | null = null;
  let base = 0;
  let currency: string | null = null;
  let closed = false;
  let drawSeq = 0;
  const cache = new Map<Range, { pts: Pt[]; intraday: boolean; base: number }>();

  el.innerHTML = `
    <div class="ov-bar">
      <button class="icon-btn" id="a-back" aria-label="Volver">${icon('chevronLeft', 22)}</button>
      <div class="ov-title">${assetIcon(sym, { style: 'width:34px;height:34px;border-radius:11px;font-size:11px' })}
        <div style="min-width:0"><div style="font-weight:750;line-height:1.1">${esc(sym)}</div><div class="muted" id="a-name" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(name)}</div></div></div>
      <button class="icon-btn" id="a-star" aria-label="Favorito">${icon('star', 20, isWatched(sym))}</button>
    </div>
    <div class="ov-body">
      <div id="a-head"><div class="skeleton" style="height:40px;width:55%"></div><div class="skeleton" style="height:22px;width:38%;margin-top:10px"></div></div>
      <div class="chart-box"><div id="a-chart"></div><div class="chart-empty hide" id="a-empty"></div></div>
      <div class="chart-controls">
        <div class="seg" id="a-ranges">${RANGES.map((r) => `<button data-r="${r}" class="${r === range ? 'on' : ''}">${r}</button>`).join('')}</div>
        <div class="seg" id="a-mode"><button data-m="line" class="on" aria-label="Línea">${icon('lineChart', 17)}</button><button data-m="candles" aria-label="Velas">${icon('candles', 17)}</button></div>
      </div>
      <div class="chips-row" id="a-toolbar"><button class="chip chip-tools" id="a-tools">${icon('sliders', 15)} Herramientas<span class="chip-n" id="a-tools-n"></span></button></div>
      <div id="a-signals"></div>
      <div class="section" style="margin-top:22px"><div class="section-head"><h2>Estadísticas</h2></div><div id="a-stats" class="stat-grid">${Array.from({ length: 4 }, () => '<div class="skeleton" style="height:64px;border-radius:16px"></div>').join('')}</div></div>
      <div class="section"><div class="section-head"><h2>${icon('newspaper', 19)} Noticias</h2></div><div id="a-news" data-notrans style="display:flex;flex-direction:column;gap:10px"></div></div>
      <p class="muted" style="font-size:11.5px;text-align:center;margin:22px 0 100px;line-height:1.5">Datos de Yahoo Finance con posible demora. Información educativa, no es asesoramiento financiero.</p>
    </div>
    <div class="ov-cta"><button class="btn btn-primary btn-block" id="a-ai">${icon('sparkles', 18)} Analizar con IA</button></div>`;

  const q = <T extends HTMLElement>(sel: string) => $<T>(sel, el);

  // ------------------------------------------------------------ cabecera de precio
  function renderHead(price: number, p: Pt | null, label: string) {
    const shown = p ? p.c : price;
    const chg = base ? (shown / base - 1) * 100 : null;
    const abs = base ? shown - base : null;
    const cls = dirClass(chg);
    const when = p ? new Date(p.t * 1000).toLocaleString(locale(), { day: '2-digit', month: 'short', ...(range === '1D' || range === '1S' ? { hour: '2-digit', minute: '2-digit' } : { year: '2-digit' }) }) : label;
    q('#a-head').innerHTML = `
      <div class="num" style="font-size:38px;font-weight:780;letter-spacing:-.035em;line-height:1.05">${fmtPrice(shown, currency)}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
        <span class="pill ${cls}" style="font-size:13.5px">${cls === 'up' ? icon('arrowUp', 13) : cls === 'down' ? icon('arrowDown', 13) : ''}${fmtPct(chg, false)}</span>
        <span class="num ${cls === 'flat' ? 'muted' : cls}" style="font-size:14px;font-weight:600">${abs === null ? '' : (abs > 0 ? '+' : '') + fmtNum(abs, abs !== null && Math.abs(abs) < 1 ? 4 : 2)}</span>
        <span class="muted" style="font-size:13px">${esc(when)}</span></div>`;
  }

  // ------------------------------------------------------------ datos por rango
  const toPts = (bars: Bar[]): Pt[] => bars.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));

  async function getSeries(r: Range) {
    const hit = cache.get(r);
    if (hit) return hit;
    let out: { pts: Pt[]; intraday: boolean; base: number };
    if (r === '1D') {
      const ch = await fetchChart(sym, '1d', '5m');
      applyMeta(ch);
      out = { pts: toPts(ch.bars), intraday: true, base: ch.meta.chartPreviousClose ?? ch.meta.previousClose ?? ch.bars[0]?.c ?? 0 };
    } else if (r === '1S') {
      const ch = await fetchChart(sym, '5d', '30m');
      out = { pts: toPts(ch.bars), intraday: true, base: ch.bars[0]?.c ?? 0 };
    } else if (r === '5A') {
      const ch = await fetchChart(sym, '5y', '1wk');
      const bars = adjustBars(ch.bars);
      out = { pts: toPts(bars), intraday: false, base: bars[0]?.c ?? 0 };
    } else {
      const yd = await getYear();
      const bars = adjustBars(yd.bars);
      const n = r === '1M' ? 22 : r === '6M' ? 126 : bars.length;
      const slice = bars.slice(-n);
      out = { pts: toPts(slice), intraday: false, base: slice[0]?.c ?? 0 };
    }
    if (out.pts.length < 2) throw new Error('Sin datos para este período');
    cache.set(r, out);
    return out;
  }

  /** Una única descarga del último año (la usan el gráfico y las estadísticas); si falla, se puede reintentar. */
  function getYear(): Promise<ChartData> {
    if (yearData) return Promise.resolve(yearData);
    return (yearPromise ??= fetchChart(sym, '1y', '1d').then((d) => { yearData = d; applyMeta(d); return d; }).finally(() => { yearPromise = null; }));
  }

  function applyMeta(ch: ChartData) {
    currency = sym.startsWith('^') ? null : (ch.meta.currency ?? currency); // los índices cotizan en puntos
    const n = ch.meta.longName ?? ch.meta.shortName;
    if (n && name === sym) { name = n; q('#a-name').textContent = n; }
  }

  async function drawChart() {
    const my = ++drawSeq;
    handle?.destroy(); handle = null;
    const empty = q('#a-empty'), box = q('#a-chart');
    empty.classList.add('hide');
    try {
      const s = await getSeries(range);
      if (closed || my !== drawSeq) return;
      base = s.base;
      const last = s.pts[s.pts.length - 1];
      const label = t(RANGE_LABEL[range]);
      renderHead(last.c, null, label);
      hasVolume = s.pts.some((p) => (p.v ?? 0) > 0);
      lastIntraday = s.intraday;
      requestAnimationFrame(() => {
        if (closed || my !== drawSeq) return;
        handle?.destroy();
        handle = mountPriceChart(box, { points: s.pts, mode, intraday: s.intraday, height: 250, tools, onHover: (p) => renderHead(last.c, p, label) });
        if (announce) { announce = false; handle.notices.slice(0, 2).forEach((n) => toast(n)); }
      });
    } catch (e: any) {
      if (closed || my !== drawSeq) return;
      box.style.height = '0';
      empty.classList.remove('hide');
      empty.innerHTML = `${icon('warn', 22)}<div>${esc(e?.message ?? 'No se pudo cargar el gráfico')}</div><button class="btn btn-ghost btn-sm" id="a-retry">Reintentar</button>`;
      $('#a-retry', empty).onclick = () => { cache.delete(range); void drawChart(); };
      q('#a-head').innerHTML = `<div class="muted">${esc(t('Sin datos de precio disponibles para {s}.', { s: sym }))}</div>`;
    }
  }

  // ------------------------------------------------------------ estadísticas, técnico, noticias
  const stat = (label: string, value: string, sub = '') =>
    `<div class="stat"><div class="eyebrow" style="font-weight:600">${esc(label)}</div><div class="num" style="font-weight:700;font-size:16px;margin-top:3px">${value}</div>${sub ? `<div class="muted" style="font-size:11.5px;margin-top:2px">${sub}</div>` : ''}</div>`;

  async function loadStats() {
    const tiles: string[] = [];
    try {
      const yd = await getYear();
      const m = yd.meta;
      const px = yd.bars[yd.bars.length - 1].c;
      if (m.fiftyTwoWeekLow && m.fiftyTwoWeekHigh) {
        const pos = Math.max(0, Math.min(100, ((px - m.fiftyTwoWeekLow) / (m.fiftyTwoWeekHigh - m.fiftyTwoWeekLow)) * 100));
        tiles.push(`<div class="stat wide"><div class="eyebrow" style="font-weight:600">Rango de 52 semanas</div>
          <div class="range-bar"><i style="left:${pos.toFixed(1)}%"></i></div>
          <div style="display:flex;justify-content:space-between" class="num"><span style="font-weight:650">${fmtNum(m.fiftyTwoWeekLow)}</span><span style="font-weight:650">${fmtNum(m.fiftyTwoWeekHigh)}</span></div></div>`);
      }
      if (m.regularMarketVolume) tiles.push(stat('Volumen', fmtCompact(m.regularMarketVolume)));
      if (m.previousClose ?? m.chartPreviousClose) tiles.push(stat('Cierre previo', fmtPrice(m.previousClose ?? m.chartPreviousClose, currency)));
      if (m.exchangeName ?? m.fullExchangeName) tiles.push(stat('Mercado', esc(m.fullExchangeName ?? m.exchangeName ?? ''), esc(currency ?? '')));
      // señales técnicas con ≥200 barras
      const snap = snapshot(adjustBars(yd.bars));
      if (snap.signals.length) {
        q('#a-signals').innerHTML = `<div class="section" style="margin-top:20px"><div class="section-head"><h2>${icon('activity', 19)} Lectura técnica</h2><span class="muted" style="font-size:12px">descriptiva</span></div>
          <div class="chips-wrap compact">${snap.signals.slice(0, 4).map((s) => `<span class="chip" style="white-space:normal">${esc(t(s))}</span>`).join('')}</div>
          <div class="stat-grid" style="margin-top:12px">${stat('RSI (14)', fmtNum(snap.rsi14, 1))}${stat('vs EMA 200', snap.pct_vs_ema200 === null ? '—' : fmtPct(snap.pct_vs_ema200), snap.pct_vs_ema200 === null ? 'datos insuficientes' : '')}</div></div>`;
      }
    } catch { /* se muestran solo los fundamentales */ }
    q('#a-stats').innerHTML = tiles.join('') || '';
    try {
      const info = await fetchInfo(sym);
      learnDomain(sym, info.website); // Yahoo informa el sitio de la empresa: de ahí sale su logo si no lo teníamos
      if (closed) return;
      const { metrics: mt } = metricsFromInfo(info);
      const f: string[] = [];
      const add = (k: string, label: string, fmt: (v: number) => string, sub?: string) => { if (mt[k]) f.push(stat(label, fmt(mt[k].value), sub ?? '')); };
      add('pe_ttm', 'P/E (TTM)', (v) => fmtNum(v, 1));
      add('pe_forward', 'P/E forward', (v) => fmtNum(v, 1));
      add('dividend_yield_pct', 'Dividendo', (v) => fmtPct(v, false), 'anual indicado');
      add('market_cap', 'Market cap', (v) => fmtCompact(v));
      add('roe_pct', 'ROE', (v) => fmtPct(v, false));
      add('debt_to_equity_ratio', 'Deuda / Patrim.', (v) => `${fmtNum(v, 2)}x`);
      add('beta', 'Beta', (v) => fmtNum(v, 2));
      if (mt.analyst_target_mean && yearData) {
        const px = yearData.bars[yearData.bars.length - 1].c;
        const up = (mt.analyst_target_mean.value / px - 1) * 100;
        f.push(stat('Objetivo analistas', fmtPrice(mt.analyst_target_mean.value, currency), `${up > 0 ? '+' : ''}${fmtNum(up, 1)}% ${t('vs precio · opinión')}`));
      }
      if (f.length) q('#a-stats').insertAdjacentHTML('beforeend', f.join(''));
      else if (!tiles.length) q('#a-stats').innerHTML = '<div class="muted" style="font-size:13px">Sin estadísticas disponibles.</div>';
    } catch {
      if (!tiles.length) q('#a-stats').innerHTML = '<div class="muted" style="font-size:13px">Sin estadísticas disponibles para este activo.</div>';
    }
  }

  async function loadNews() {
    try {
      const { news } = await searchSymbols(sym, 0, 6);
      if (closed) return;
      const box = q('#a-news');
      if (!news.length) { box.innerHTML = '<div class="muted" style="font-size:13px">Sin noticias recientes.</div>'; return; }
      box.innerHTML = '';
      news.filter((n: any) => n?.title && safeUrl(n?.link)).slice(0, 5).forEach((n: any) => {
        const a = h('a', { class: 'card', attrs: { href: safeUrl(n.link)! }, style: 'padding:13px 15px;display:block' });
        a.innerHTML = `<div style="font-weight:620;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(n.title)}</div>
          <div class="muted" style="font-size:12px;margin-top:8px">${esc(n.publisher ?? '')} · ${esc(timeAgo((n.providerPublishTime ?? 0) * 1000))}</div>`;
        a.onclick = (e) => { e.preventDefault(); openUrl(n.link); };
        box.append(a);
      });
    } catch { q('#a-news').innerHTML = '<div class="muted" style="font-size:13px">No se pudieron cargar las noticias.</div>'; }
  }

  // ------------------------------------------------------------ eventos
  const close = () => {
    if (closed) return;
    closed = true; handle?.destroy();
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); onClose?.(); }, 220);
  };
  q('#a-back').onclick = close;
  q('#a-star').onclick = () => {
    const on = toggleWatch(sym);
    q('#a-star').innerHTML = icon('star', 20, on);
    toast(on ? t('{s} agregado a favoritos', { s: sym }) : t('{s} quitado de favoritos', { s: sym }));
  };
  q('#a-ranges').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    range = b.dataset.r as Range;
    q('#a-ranges').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    void drawChart();
  });
  q('#a-mode').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    mode = b.dataset.m as 'line' | 'candles';
    q('#a-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    void drawChart();
  });
  const refreshToolsBadge = () => { const n = activeCount(tools); q('#a-tools-n').textContent = n ? ` · ${n}` : ''; q('#a-tools').classList.toggle('on', n > 0); };
  refreshToolsBadge();
  q('#a-tools').addEventListener('click', () => openToolsSheet({ tools, intraday: lastIntraday, hasVolume, onChange: (t) => { tools = t; saveTools(t); announce = true; refreshToolsBadge(); void drawChart(); } }));
  q('#a-ai').onclick = () => { close(); ctx.askAI(t('Analizá {s}: situación técnica, valuación, riesgos, y el caso alcista y bajista con qué lo invalidaría.', { s: `${sym}${name !== sym ? ` (${name})` : ''}` }), t('Analizar {s}', { s: sym })); };

  void drawChart(); void loadStats(); void loadNews();
  return { el, close };
}
