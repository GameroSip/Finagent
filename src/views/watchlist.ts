// Favoritos: lista de seguimiento con precio, variación y mini-gráfico.
import type { Ctx, View } from '../ctx';
import { fetchQuoteCard, type QuoteCard } from '../data/market';
import { getWatchlist, subscribe, toggleWatch } from '../store';
import { pool } from '../data/net';
import { assetIcon } from '../ui/assetIcon';
import { $, esc, h } from '../ui/dom';
import { dirClass, fmtPct, fmtPrice } from '../ui/format';
import { icon } from '../ui/icons';
import { confirmSheet } from '../ui/sheet';
import { sparkSvg } from '../ui/spark';
import { t } from '../i18n';

const STARTERS = ['AAPL', 'MSFT', 'NVDA', 'MELI', 'GGAL', 'YPFD.BA', 'BTC-USD', 'AAPL.BA'];

export function createWatchView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  const quotes = new Map<string, QuoteCard>();
  let lastKey = '';
  let lastLoad = 0;

  el.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Tu seguimiento</div><h1 class="title-xl">Favoritos</h1></div>
      <button class="icon-btn" id="w-add" aria-label="Agregar">${icon('plus', 21)}</button></div>
    <div id="w-summary"></div><div id="w-list"></div>`;
  const list = $('#w-list', el), summary = $('#w-summary', el);
  $('#w-add', el).onclick = () => ctx.openSearch();

  function render() {
    const syms = getWatchlist();
    if (!syms.length) {
      summary.innerHTML = '';
      list.innerHTML = `<div class="empty-note" style="margin-top:36px">
        <div class="empty-orb">${icon('star', 30)}</div><div style="font-weight:700;font-size:17px">Todavía no seguís nada</div>
        <div class="muted" style="max-width:260px">Agregá activos con la estrella ★ para ver cómo se mueven de un vistazo.</div>
        <div class="chips-wrap" style="justify-content:center;margin-top:8px">${STARTERS.map((s) => `<button class="chip" data-add="${esc(s)}">${icon('plus', 14)} ${esc(s)}</button>`).join('')}</div></div>`;
      return;
    }
    const loaded = syms.map((s) => quotes.get(s)).filter((x): x is QuoteCard => !!x && x.price !== null && x.changePct !== null);
    if (loaded.length) {
      const avg = loaded.reduce((a, b) => a + (b.changePct ?? 0), 0) / loaded.length;
      const up = loaded.filter((x) => (x.changePct ?? 0) > 0).length;
      summary.innerHTML = `<div class="card" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;background:var(--grad-soft);border-color:var(--line-2)">
        <div><div class="eyebrow">Variación promedio hoy</div><div class="num ${dirClass(avg) === 'down' ? 'down' : dirClass(avg) === 'up' ? 'up' : ''}" style="font-size:26px;font-weight:780;letter-spacing:-.03em">${fmtPct(avg)}</div></div>
        <div style="text-align:right" class="muted"><div style="font-weight:650;color:var(--text)">${up} de ${loaded.length}</div><div style="font-size:12px">en suba</div></div></div>`;
    } else summary.innerHTML = '';
    list.innerHTML = '';
    const wrap = h('div', { class: 'card', style: 'padding:4px 14px' });
    syms.forEach((s, i) => {
      const qd = quotes.get(s);
      const row = h('div', { class: 'wrow', style: i ? 'border-top:1px solid var(--line)' : '' });
      const cls = dirClass(qd?.changePct);
      row.innerHTML = `${assetIcon(s)}
        <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(s)}</div><div class="muted" style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(qd?.name && qd.name !== s ? qd.name : qd?.error ? 'Sin datos' : '…')}</div></div>
        <div class="spk">${qd?.spark.length ? sparkSvg(qd.spark, { w: 74, h: 30 }) : ''}</div>
        <div class="px">${qd?.price !== undefined && qd.price !== null
          ? `<div class="num" style="font-weight:650;margin-bottom:3px">${fmtPrice(qd.price, qd.currency)}</div><span class="pill ${cls}">${fmtPct(qd.changePct, false)}</span>`
          : '<div class="skeleton" style="height:34px;width:78px"></div>'}</div>`;
      // Mantener presionado quita el favorito; al soltar, el navegador igual emite un "click" que NO debe abrir el activo.
      let timer: number | undefined, longPress = false;
      row.onclick = () => { if (longPress) { longPress = false; return; } ctx.openAsset(s, qd?.name); };
      row.addEventListener('contextmenu', (ev) => ev.preventDefault());
      row.addEventListener('touchstart', () => {
        longPress = false;
        timer = window.setTimeout(async () => {
          longPress = true;
          if (await confirmSheet({ title: t('¿Quitar {s} de favoritos?', { s }), confirm: t('Quitar'), danger: true })) toggleWatch(s);
        }, 650);
      }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => row.addEventListener(ev, () => clearTimeout(timer), { passive: true }));
      wrap.append(row);
    });
    list.append(wrap, h('p', { class: 'muted', style: 'font-size:12px;text-align:center;margin-top:12px', text: 'Mantené presionado un activo para quitarlo.' }));
  }

  async function load(force = false) {
    const syms = getWatchlist();
    const key = syms.join(',');
    if (!force && key === lastKey && Date.now() - lastLoad < 60_000) return;
    lastKey = key; lastLoad = Date.now();
    render();
    const todo = syms.filter((s) => force || !quotes.has(s) || quotes.get(s)?.error);
    await pool(todo, 4, async (s) => { quotes.set(s, await fetchQuoteCard(s)); render(); });
  }

  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-add]'); if (b) toggleWatch(b.dataset.add!);
  });
  subscribe(() => { if (!el.classList.contains('hide')) void load(); else lastKey = ''; });
  render();
  return { el, onShow: () => void load() };
}
