// Pantalla "Mercados": panorama del día con datos reales, sin gastar cuota de IA.
import type { Ctx, View } from '../ctx';
import { fetchDolares, fetchInflacion, fetchRiesgoPais, withBrecha } from '../data/argentina';
import { fetchFearGreed, fetchIndices, type FearGreed, type QuoteCard } from '../data/market';
import { fetchHeadlines, type Headline, type Region } from '../data/news';
import { fetchMovers, MOVER_KINDS, type Mover, type MoverKind } from '../yahoo';
import { getCache, setCache } from '../ui/cache';
import { $, esc, h, openUrl, toast } from '../ui/dom';
import { dirClass, fmtDate, fmtNum, fmtPct, fmtPrice, greeting, initials, symbolColor, timeAgo } from '../ui/format';
import { icon } from '../ui/icons';
import { sparkSvg } from '../ui/spark';

const STALE_MS = 2 * 60_000;
const INVERTED = new Set(['^VIX']); // si el VIX sube, es una mala señal: se pinta al revés

const pill = (pct: number | null, invert = false) => {
  const cls = dirClass(pct);
  const shown = invert && cls !== 'flat' ? (cls === 'up' ? 'down' : 'up') : cls;
  const arrow = cls === 'up' ? icon('arrowUp', 12) : cls === 'down' ? icon('arrowDown', 12) : '';
  return `<span class="pill ${shown}">${arrow}${fmtPct(pct, false)}</span>`;
};

const skeleton = (n: number, hgt: number) => Array.from({ length: n }, () => `<div class="skeleton" style="height:${hgt}px"></div>`).join('');

function gauge(fg: FearGreed): string {
  const v = Math.max(0, Math.min(100, fg.value));
  const th = Math.PI * (1 - v / 100);
  const x = 100 + 78 * Math.cos(th), y = 98 - 78 * Math.sin(th);
  return `<svg viewBox="0 0 200 118" width="100%" aria-hidden="true">
    <defs><linearGradient id="fgg" x1="0" x2="1"><stop offset="0" stop-color="var(--down)"/><stop offset=".5" stop-color="var(--warn)"/><stop offset="1" stop-color="var(--up)"/></linearGradient></defs>
    <path d="M22 98 A78 78 0 0 1 178 98" fill="none" stroke="var(--surface-3)" stroke-width="13" stroke-linecap="round"/>
    <path d="M22 98 A78 78 0 0 1 178 98" fill="none" stroke="url(#fgg)" stroke-width="13" stroke-linecap="round" opacity=".95"/>
    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="#fff" stroke="var(--bg)" stroke-width="4"/>
    <text x="100" y="92" text-anchor="middle" font-size="34" font-weight="750" fill="var(--text)" font-family="Inter Variable, system-ui">${Math.round(fg.value)}</text></svg>`;
}

export function createMarketView(ctx: Ctx): View {
  const el = h('div', { class: 'view', attrs: { id: 'view-market' } });
  let lastRefresh = 0;
  let moverKind: MoverKind = 'day_gainers';
  let region: Region = 'ar';

  el.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">${greeting()}</div><h1 class="title-xl">Mercados</h1></div>
      <div style="display:flex;gap:8px">
        <button class="icon-btn" id="m-refresh" aria-label="Actualizar">${icon('refresh', 19)}</button>
        <button class="icon-btn" id="m-search" aria-label="Buscar">${icon('search', 19)}</button>
      </div>
    </div>
    <div id="m-hero"></div>
    <div class="section"><div class="section-head"><h2>${icon('activity', 19)} Índices y activos clave</h2></div><div class="scroll-x" id="m-indices"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('landmark', 19)} Argentina</h2><span class="more" id="m-ar-time"></span></div><div id="m-ar"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('flame', 19)} Más movidos (EE.UU.)</h2></div>
      <div class="seg" id="m-seg-movers" style="margin-bottom:12px"><button data-k="day_gainers" class="on">Suben</button><button data-k="day_losers">Bajan</button><button data-k="most_actives">Operadas</button></div>
      <div class="card" style="padding:6px 14px" id="m-movers"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('gauge', 19)} Sentimiento cripto</h2></div><div id="m-fng"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('newspaper', 19)} Titulares</h2></div>
      <div class="seg" id="m-seg-news" style="margin-bottom:12px"><button data-r="ar" class="on">Argentina</button><button data-r="us">Global</button></div>
      <div id="m-news" style="display:flex;flex-direction:column;gap:10px"></div></div>
    <p class="muted" style="font-size:11.5px;text-align:center;margin-top:28px;line-height:1.5">Datos de Yahoo Finance, DolarAPI, ArgentinaDatos, Google News y alternative.me.<br>Pueden tener demora. Información educativa, no es asesoramiento financiero.</p>`;

  const q = <T extends HTMLElement>(id: string) => $<T>(`#${id}`, el);

  // ------------------------------------------------------------ render por sección
  function renderHero(list: QuoteCard[]) {
    const sp = list.find((i) => i.symbol === '^GSPC' && i.price !== null) ?? list.find((i) => i.price !== null);
    if (!sp) { q('m-hero').innerHTML = ''; return; }
    const cls = dirClass(sp.changePct);
    q('m-hero').innerHTML = `
      <div class="card hero" style="position:relative;overflow:hidden;padding:18px 18px 16px;border-color:var(--line-2);background:linear-gradient(160deg,var(--surface-2),var(--surface))">
        <div style="position:absolute;right:-60px;top:-70px;width:220px;height:220px;border-radius:50%;background:radial-gradient(closest-side,var(--aurora-a),transparent)"></div>
        <div style="position:relative">
          <div class="eyebrow" style="display:flex;align-items:center;gap:6px">${esc(sp.name)} · hoy</div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-top:6px"><span class="num" style="font-size:34px;font-weight:750;letter-spacing:-.03em">${fmtNum(sp.price)}</span>
            <span class="pill ${cls}" style="font-size:13.5px">${cls === 'up' ? icon('arrowUp', 13) : cls === 'down' ? icon('arrowDown', 13) : ''}${fmtPct(sp.changePct, false)}</span></div>
          <div style="margin:12px -4px 4px;height:62px">${sparkSvg(sp.spark, { w: 320, h: 62, stroke: 2.2 })}</div>
          <button class="btn btn-primary btn-block" id="m-ai" style="margin-top:12px">${icon('sparkles', 18)} Resumen del día con IA</button>
        </div>
      </div>`;
    $('#m-ai', el).onclick = () => ctx.askAI('Hacé un resumen de cómo está el mercado hoy: índices, qué se mueve más, el contexto de Argentina y la narrativa de los medios. Terminá con 3 puntos a vigilar.', 'Resumen del día');
  }

  function renderIndices(list: QuoteCard[]) {
    q('m-indices').innerHTML = '';
    for (const i of list) {
      const card = h('button', { class: 'card idx', attrs: { 'aria-label': i.name }, style: 'width:156px;padding:13px 13px 8px;text-align:left' });
      card.innerHTML = i.price === null
        ? `<div class="eyebrow" style="font-weight:600">${esc(i.name)}</div><div class="muted" style="font-size:12px;margin:10px 0 22px">No disponible</div>`
        : `<div class="eyebrow" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.name)}</div>
           <div class="num" style="font-size:17px;font-weight:700;margin:5px 0 6px;letter-spacing:-.01em">${fmtNum(i.price, i.price > 1000 ? 0 : 2)}</div>
           ${pill(i.changePct, INVERTED.has(i.symbol))}<div style="margin:8px -2px 0;height:32px">${sparkSvg(i.spark, { w: 130, h: 32, up: INVERTED.has(i.symbol) ? !(i.changePct! >= 0) : undefined })}</div>`;
      card.onclick = () => ctx.openAsset(i.symbol, i.name);
      q('m-indices').append(card);
    }
  }

  function renderArgentina(d: { dol: ReturnType<typeof withBrecha> | null; rp: { valor: number; fecha: string } | null; inf: Awaited<ReturnType<typeof fetchInflacion>> | null }) {
    const box = q('m-ar');
    const tiles: string[] = [];
    const pick: Array<[string, string]> = [['oficial', 'Oficial'], ['blue', 'Blue'], ['bolsa', 'MEP'], ['contadoconliqui', 'CCL']];
    for (const [casa, label] of pick) {
      const r = d.dol?.find((x) => x.casa === casa);
      if (!r) continue;
      tiles.push(`<div class="card" style="padding:14px"><div class="eyebrow" style="font-weight:600">Dólar ${label}</div>
        <div class="num" style="font-size:22px;font-weight:750;letter-spacing:-.02em;margin:4px 0 8px">${fmtPrice(r.venta, 'ARS')}</div>
        <div class="tile-sub"><span class="muted num" style="font-size:12.5px">Compra ${fmtNum(r.compra, 0)}</span>
        ${r.brecha_pct === null ? '<span class="pill flat">referencia</span>' : `<span class="pill flat">brecha ${r.brecha_pct > 0 ? '+' : ''}${fmtNum(r.brecha_pct, 1)}%</span>`}</div></div>`);
    }
    if (d.rp) tiles.push(`<div class="card" style="padding:14px"><div class="eyebrow" style="font-weight:600">Riesgo país</div>
        <div class="num" style="font-size:22px;font-weight:750;letter-spacing:-.02em;margin:4px 0 8px">${fmtNum(d.rp.valor, 0)} <span class="muted" style="font-size:13px;font-weight:600">pb</span></div>
        <span class="muted" style="font-size:12.5px">al ${esc(fmtDate(d.rp.fecha))}</span></div>`);
    const m = d.inf?.mensual, a = d.inf?.interanual;
    if (m || a) tiles.push(`<div class="card" style="padding:14px"><div class="eyebrow" style="font-weight:600">Inflación</div>
        <div class="num" style="font-size:22px;font-weight:750;letter-spacing:-.02em;margin:4px 0 8px">${m ? fmtNum(m.valor, 1) + '%' : '—'} <span class="muted" style="font-size:13px;font-weight:600">mens.</span></div>
        <span class="muted" style="font-size:12px">${a ? fmtNum(a.valor, 1) + '% interanual' : esc(m?.fecha ?? '')}</span></div>`);
    box.innerHTML = tiles.length ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${tiles.join('')}</div>` : errorBox('No se pudieron cargar los datos de Argentina.', 'ar');
    const t = d.dol?.map((x) => x.fecha).filter(Boolean).sort().pop();
    q('m-ar-time').textContent = t ? timeAgo(t) : '';
  }

  function renderMovers(list: Mover[]) {
    const box = q('m-movers');
    box.innerHTML = '';
    list.slice(0, 7).forEach((m, idx) => {
      const row = h('button', { class: 'row', style: `display:flex;align-items:center;gap:12px;width:100%;padding:11px 0;text-align:left;${idx ? 'border-top:1px solid var(--line)' : ''}` });
      row.innerHTML = `<div class="avatar" style="background:${symbolColor(m.symbol)}">${esc(initials(m.symbol))}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(m.symbol)}</div><div class="muted" style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.name)}</div></div>
        <div style="text-align:right"><div class="num" style="font-weight:650;margin-bottom:3px">${fmtPrice(m.price, m.currency === 'USD' || !m.currency ? 'USD' : m.currency)}</div>${pill(m.changePct)}</div>`;
      row.onclick = () => ctx.openAsset(m.symbol, m.name);
      box.append(row);
    });
  }

  function renderFng(f: FearGreed | null) {
    const box = q('m-fng');
    if (!f) { box.innerHTML = errorBox('No se pudo cargar el índice de miedo y codicia.', 'fng'); return; }
    const color = f.value < 30 ? 'var(--down)' : f.value < 55 ? 'var(--warn)' : 'var(--up)';
    box.innerHTML = `<div class="card" style="display:flex;align-items:center;gap:16px;padding:14px 18px"><div style="width:150px;flex:none">${gauge(f)}</div>
      <div><div style="font-weight:750;font-size:19px;color:${color}">${esc(f.labelEs)}</div>
      <div class="muted" style="font-size:12.5px;margin-top:3px">Índice de miedo y codicia del mercado cripto (0 = pánico, 100 = euforia).</div></div></div>`;
  }

  function renderNews(list: Headline[]) {
    const box = q('m-news');
    box.innerHTML = '';
    list.slice(0, 6).forEach((n) => {
      const a = h('a', { class: 'card', attrs: { href: n.url, target: '_blank', rel: 'noopener' }, style: 'padding:13px 15px;display:block' });
      a.innerHTML = `<div style="font-weight:620;line-height:1.35;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(n.title)}</div>
        <div class="muted" style="font-size:12px;margin-top:8px;display:flex;align-items:center;gap:6px">${esc(n.source ?? 'Medio')} · ${esc(timeAgo(n.ts))}<span style="margin-left:auto">${icon('arrowUpRight', 14)}</span></div>`;
      a.addEventListener('click', (e) => { e.preventDefault(); openUrl(n.url); });
      box.append(a);
    });
  }

  function errorBox(msg: string, retryKey: string) {
    return `<div class="error-box">${icon('warn', 18)}<span>${esc(msg)}</span><button data-retry="${retryKey}">Reintentar</button></div>`;
  }

  // ------------------------------------------------------------ carga (pinta caché y refresca)
  async function load<T>(key: string, fetcher: () => Promise<T>, render: (d: T) => void, onFail: () => void, force: boolean) {
    const c = getCache<T>(key);
    if (c) render(c.data);
    if (c && !force && Date.now() - c.at < STALE_MS) return;
    try { const d = await fetcher(); setCache(key, d); render(d); } catch { if (!c) onFail(); }
  }

  const loadIndices = (force: boolean) => load('indices', fetchIndices, (l) => { renderHero(l); renderIndices(l); },
    () => { q('m-indices').innerHTML = errorBox('No se pudieron cargar los índices.', 'idx'); }, force);
  const loadAr = (force: boolean) => load('argentina', async () => {
    const [dol, rp, inf] = await Promise.all([fetchDolares().then(withBrecha, () => null), fetchRiesgoPais().catch(() => null), fetchInflacion().catch(() => null)]);
    if (!dol && !rp && !inf) throw new Error('sin datos');
    return { dol, rp, inf };
  }, renderArgentina, () => { q('m-ar').innerHTML = errorBox('No se pudieron cargar los datos de Argentina.', 'ar'); }, force);
  const loadMovers = (force: boolean) => load(`movers-${moverKind}`, () => fetchMovers(moverKind, 8), renderMovers,
    () => { q('m-movers').innerHTML = errorBox('No se pudo cargar el ranking.', 'mov'); }, force);
  const loadFng = (force: boolean) => load('fng', fetchFearGreed, (f) => renderFng(f), () => renderFng(null), force);
  const loadNews = (force: boolean) => load(`news-${region}`, () => fetchHeadlines(undefined, region, 8), renderNews,
    () => { q('m-news').innerHTML = errorBox('No se pudieron cargar los titulares.', 'news'); }, force);

  function refresh(force = false) {
    lastRefresh = Date.now();
    void loadIndices(force); void loadAr(force); void loadMovers(force); void loadFng(force); void loadNews(force);
  }

  // skeletons iniciales
  q('m-indices').innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton" style="width:156px;height:118px;border-radius:22px"></div>`).join('');
  q('m-ar').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${skeleton(4, 92)}</div>`;
  q('m-movers').innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton" style="height:44px;margin:9px 0"></div>`).join('');
  q('m-news').innerHTML = skeleton(3, 78);

  // ------------------------------------------------------------ eventos
  q('m-search').onclick = () => ctx.openSearch();
  q('m-refresh').onclick = () => { refresh(true); toast('Actualizando datos…'); };
  $('#m-seg-movers', el).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    moverKind = b.dataset.k as MoverKind;
    if (!MOVER_KINDS.includes(moverKind)) return;
    $('#m-seg-movers', el).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    void loadMovers(false);
  });
  $('#m-seg-news', el).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    region = b.dataset.r as Region;
    $('#m-seg-news', el).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    void loadNews(false);
  });
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-retry]'); if (!b) return;
    refresh(true);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !el.classList.contains('hide') && Date.now() - lastRefresh > STALE_MS) refresh(); });

  refresh();
  return { el, onShow: () => { if (Date.now() - lastRefresh > STALE_MS) refresh(); } };
}
