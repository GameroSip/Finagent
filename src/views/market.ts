// Pantalla "Mercados": panorama del día con datos reales, sin gastar cuota de IA.
import type { Ctx, View } from '../ctx';
import { fetchDolares, fetchInflacion, fetchRiesgoPais, withBrecha } from '../data/argentina';
import { fetchFearGreed, fetchIndices, fetchWorldGroup, type FearGreed, type QuoteCard, type WorldGroup } from '../data/market';
import { fetchHeadlines, type Headline, type Region } from '../data/news';
import { fetchMovers, MOVER_KINDS, type Mover, type MoverKind } from '../yahoo';
import { getCache, setCache } from '../ui/cache';
import { $, esc, h, openUrl, toast } from '../ui/dom';
import { assetIcon } from '../ui/assetIcon';
import { maybeUpsellCard } from '../ui/upsell';
import { isServerMode } from '../server';
import { openPlans } from './plans';
import { dirClass, fmtDate, fmtNum, fmtPct, fmtPrice, timeAgo } from '../ui/format';
import { icon } from '../ui/icons';
import { sparkSvg } from '../ui/spark';
import { locale, t } from '../i18n';

const STALE_MS = 2 * 60_000;
const INVERTED = new Set(['^VIX']); // si el VIX sube, es una mala señal: se pinta al revés

/** "Viernes 23 de octubre", en el idioma elegido. */
const today = (): string => { const d = new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }); return d.charAt(0).toUpperCase() + d.slice(1); };
const pill = (pct: number | null, invert = false) => {
  const cls = dirClass(pct);
  const shown = invert && cls !== 'flat' ? (cls === 'up' ? 'down' : 'up') : cls;
  const arrow = cls === 'up' ? icon('arrowUp', 12) : cls === 'down' ? icon('arrowDown', 12) : '';
  return `<span class="pill ${shown}">${arrow}${fmtPct(pct)}</span>`;
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
      <div><div class="eyebrow" data-notrans>${esc(today())}</div><h1 class="title-xl">Mercados</h1></div>
      <div style="display:flex;gap:8px">
        <button class="icon-btn" id="m-refresh" aria-label="Actualizar">${icon('refresh', 19)}</button>
        <button class="icon-btn" id="m-search" aria-label="Buscar">${icon('search', 19)}</button>
      </div>
    </div>
    <div id="m-upsell"></div>
    <div id="m-hero"></div>
    <div class="section"><div class="section-head"><h2>${icon('activity', 19)} Índices y activos clave</h2></div><div class="qlist" id="m-indices"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('globe', 19)} Mercados del mundo</h2></div>
      <div class="seg" id="m-seg-world" style="margin-bottom:12px"><button data-g="indices" class="on">Índices</button><button data-g="fx">Divisas</button><button data-g="crypto">Cripto</button><button data-g="commodities">Materias primas</button></div>
      <div class="qlist" id="m-world"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('landmark', 19)} Argentina</h2><span class="more" id="m-ar-time"></span></div><div id="m-ar"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('flame', 19)} Más movidos (EE.UU.)</h2></div>
      <div class="seg" id="m-seg-movers" style="margin-bottom:12px"><button data-k="day_gainers" class="on">Suben</button><button data-k="day_losers">Bajan</button><button data-k="most_actives">Operadas</button></div>
      <div class="card" style="padding:6px 14px" id="m-movers"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('gauge', 19)} Sentimiento cripto</h2></div><div id="m-fng"></div></div>
    <div class="section"><div class="section-head"><h2>${icon('newspaper', 19)} Titulares</h2></div>
      <div class="seg" id="m-seg-news" style="margin-bottom:12px"><button data-r="ar" class="on">Argentina</button><button data-r="us">Global</button></div>
      <div id="m-news" data-notrans style="display:flex;flex-direction:column;gap:10px"></div></div>
    <p class="muted" style="font-size:11.5px;text-align:center;margin-top:28px;line-height:1.5">Datos de Yahoo Finance, DolarAPI, ArgentinaDatos, Google News y alternative.me.<br>Pueden tener demora. Información educativa, no es asesoramiento financiero.</p>`;

  const q = <T extends HTMLElement>(id: string) => $<T>(`#${id}`, el);

  // ------------------------------------------------------------ render por sección
  function renderHero(list: QuoteCard[]) {
    const sp = list.find((i) => i.symbol === '^GSPC' && i.price !== null) ?? list.find((i) => i.price !== null);
    if (!sp) { q('m-hero').innerHTML = ''; return; }
    const cls = dirClass(sp.changePct);
    q('m-hero').innerHTML = `
      <div class="headline-q"><div class="lbl">${esc(sp.name)} · ${esc(t('hoy'))}</div>
        <div class="big"><span class="num">${fmtNum(sp.price)}</span><span class="pill ${cls}" style="font-size:15px">${fmtPct(sp.changePct)}</span></div>
        <div style="margin:10px -2px 0;height:56px">${sparkSvg(sp.spark, { w: 340, h: 56, stroke: 1.6 })}</div></div>
      <button class="link-row" id="m-ai"><span>Resumen del día con IA</span>${icon('arrowUpRight', 16)}</button>`;
    $('#m-ai', el).onclick = () => ctx.askAI(t('Hacé un resumen de cómo está el mercado hoy: índices, qué se mueve más, el contexto de Argentina y la narrativa de los medios. Terminá con 3 puntos a vigilar.'), t('Resumen del día'));
  }

  /** Filas de cotizaciones (índices, divisas, cripto…): ícono, nombre, mini gráfico, precio y variación. */
  function renderCards(targetId: string, list: QuoteCard[]) {
    q(targetId).innerHTML = '';
    for (const i of list) {
      const row = h('button', { class: 'qrow2 idx', attrs: { 'aria-label': i.name } });
      const inv = INVERTED.has(i.symbol);
      row.innerHTML = `${assetIcon(i.symbol, { style: 'width:30px;height:30px;font-size:10px;flex:none' })}<div class="nm"><b>${esc(i.name)}</b><span data-notrans>${esc(i.symbol.replace(/^\^/, ''))}</span></div>` + (i.price === null
        ? `<div></div><div class="px muted" style="font-size:12px">${esc(t('No disponible'))}</div>`
        : `<div>${sparkSvg(i.spark, { w: 64, h: 26, up: inv ? !(i.changePct! >= 0) : undefined })}</div><div class="px"><span class="num">${fmtNum(i.price, i.price > 1000 ? 0 : i.price < 10 ? 4 : 2)}</span>${pill(i.changePct, inv)}</div>`);
      row.onclick = () => ctx.openAsset(i.symbol, i.name);
      q(targetId).append(row);
    }
  }
  const renderIndices = (list: QuoteCard[]) => renderCards('m-indices', list);

  function renderArgentina(d: { dol: ReturnType<typeof withBrecha> | null; rp: { valor: number; fecha: string } | null; inf: Awaited<ReturnType<typeof fetchInflacion>> | null }) {
    const box = q('m-ar');
    const rows: string[] = [];
    const krow = (name: string, sub: string, value: string) => `<div class="krow"><div class="nm"><b>${esc(name)}</b><span>${esc(sub)}</span></div><div class="px"><span class="num">${value}</span></div></div>`;
    const pick: Array<[string, string]> = [['oficial', 'Oficial'], ['blue', 'Blue'], ['bolsa', 'MEP'], ['contadoconliqui', 'CCL']];
    for (const [casa, label] of pick) {
      const r = d.dol?.find((x) => x.casa === casa);
      if (!r) continue;
      rows.push(krow(`${t('Dólar')} ${t(label)}`, `${t('Compra')} ${fmtNum(r.compra, 0)} · ${r.brecha_pct === null ? t('referencia') : `${t('brecha')} ${r.brecha_pct > 0 ? '+' : ''}${fmtNum(r.brecha_pct, 1)}%`}`, esc(fmtPrice(r.venta, 'ARS'))));
    }
    if (d.rp) rows.push(krow(t('Riesgo país'), `${t('al')} ${fmtDate(d.rp.fecha)}`, `${fmtNum(d.rp.valor, 0)} <small class="muted">pb</small>`));
    const m = d.inf?.mensual, a = d.inf?.interanual;
    if (m || a) rows.push(krow(t('Inflación'), a ? `${fmtNum(a.valor, 1)}% ${t('interanual')}` : (m?.fecha ?? ''), `${m ? fmtNum(m.valor, 1) + '%' : '—'} <small class="muted">${esc(t('mens.'))}</small>`));
    box.innerHTML = rows.length ? `<div class="qlist">${rows.join('')}</div>` : errorBox('No se pudieron cargar los datos de Argentina.', 'ar');
    const tm = d.dol?.map((x) => x.fecha).filter(Boolean).sort().pop();
    q('m-ar-time').textContent = tm ? timeAgo(tm) : '';
  }

  function renderMovers(list: Mover[]) {
    const box = q('m-movers');
    box.innerHTML = '';
    list.slice(0, 7).forEach((m, idx) => {
      const row = h('button', { class: 'row', style: `display:flex;align-items:center;gap:12px;width:100%;padding:11px 0;text-align:left;${idx ? 'border-top:1px solid var(--line)' : ''}` });
      row.innerHTML = `${assetIcon(m.symbol)}
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
  /**
   * Pinta el caché y refresca. `isCurrent` evita que una respuesta lenta pise a la de una pestaña más nueva
   * (p. ej. "Suben" -> "Bajan" rápido), y un render que falla con datos viejos no rompe la pantalla.
   */
  async function load<T>(key: string, fetcher: () => Promise<T>, render: (d: T) => void, onFail: () => void, force: boolean, isCurrent: () => boolean = () => true) {
    const tryRender = (d: T) => { try { render(d); return true; } catch { return false; } };
    const c = getCache<T>(key);
    const shown = !!c && isCurrent() && tryRender(c.data);
    if (shown && !force && Date.now() - c!.at < STALE_MS) return;
    try {
      const d = await fetcher();
      setCache(key, d);
      if (isCurrent()) tryRender(d);
    } catch { if (!shown && isCurrent()) onFail(); }
  }

  const fetchIndicesOk = async () => {
    const l = await fetchIndices();
    if (!l.some((i) => i.price !== null)) throw new Error('sin datos'); // falla total: se conserva lo último que andaba
    return l;
  };
  let worldGroup: WorldGroup = 'indices';
  const loadWorld = (force: boolean) => {
    const g = worldGroup;
    return load(`world:${g}`, async () => {
      const l = await fetchWorldGroup(g);
      if (!l.some((i) => i.price !== null)) throw new Error('sin datos');
      return l;
    }, (l) => renderCards('m-world', l), () => { q('m-world').innerHTML = errorBox('No se pudieron cargar estos mercados.', 'world'); }, force, () => g === worldGroup);
  };
  const loadIndices = (force: boolean) => load('indices', fetchIndicesOk, (l) => { renderHero(l); renderIndices(l); },
    () => { q('m-indices').innerHTML = errorBox('No se pudieron cargar los índices.', 'idx'); }, force);
  const loadAr = (force: boolean) => load('argentina', async () => {
    const [dol, rp, inf] = await Promise.all([fetchDolares().then(withBrecha, () => null), fetchRiesgoPais().catch(() => null), fetchInflacion().catch(() => null)]);
    if (!dol && !rp && !inf) throw new Error('sin datos');
    return { dol, rp, inf };
  }, renderArgentina, () => { q('m-ar').innerHTML = errorBox('No se pudieron cargar los datos de Argentina.', 'ar'); }, force);
  const loadMovers = (force: boolean) => { const kind = moverKind; return load(`movers-${kind}`, () => fetchMovers(kind, 8), renderMovers,
    () => { q('m-movers').innerHTML = errorBox('No se pudo cargar el ranking.', 'mov'); }, force, () => moverKind === kind); };
  const loadFng = (force: boolean) => load('fng', fetchFearGreed, (f) => renderFng(f), () => renderFng(null), force);
  const loadNews = (force: boolean) => { const rg = region; return load(`news-${rg}`, () => fetchHeadlines(undefined, rg, 8), renderNews,
    () => { q('m-news').innerHTML = errorBox('No se pudieron cargar los titulares.', 'news'); }, force, () => region === rg); };

  function refresh(force = false) {
    lastRefresh = Date.now();
    void loadIndices(force); void loadWorld(force); void loadAr(force); void loadMovers(force); void loadFng(force); void loadNews(force);
  }

  // skeletons iniciales
  q('m-indices').innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton" style="width:156px;height:118px;border-radius:22px"></div>`).join('');
  q('m-world').innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton" style="width:156px;height:118px;border-radius:22px"></div>`).join('');
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
  $('#m-seg-world', el).addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    worldGroup = b.dataset.g as WorldGroup;
    $('#m-seg-world', el).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    q('m-world').innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton" style="width:156px;height:118px;border-radius:22px"></div>`).join('');
    void loadWorld(false);
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

  const weeklyNudge = async () => {
    if (!isServerMode() || q('m-upsell').childElementCount) return;
    const card = await maybeUpsellCard('weekly', () => void openPlans());
    if (card) q('m-upsell').append(card);
  };
  refresh();
  setTimeout(() => void weeklyNudge(), 1500);
  return { el, onShow: () => { if (Date.now() - lastRefresh > STALE_MS) refresh(); void weeklyNudge(); } };
}
