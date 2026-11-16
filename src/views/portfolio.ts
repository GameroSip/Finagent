// Mi cartera: lo que la persona declara tener (cargado a mano o desde un CSV). Se guarda solo en el teléfono.
// Muestra cuánto hay en cada moneda y el reparto; los precios son de Yahoo Finance, con demora.
import { track } from '../analytics';
import type { Ctx, View } from '../ctx';
import { fetchDolares } from '../data/argentina';
import { fetchQuoteCard } from '../data/market';
import { pool } from '../data/net';
import { t } from '../i18n';
import { addHolding, allocation, CASH_CODES, loadPortfolio, parseCsv, parseNum, savePortfolio, totalsByCurrency, valuate, type Holding, type Quote, type Valued } from '../portfolio';
import { assetIcon } from '../ui/assetIcon';
import { $, esc, h, toast } from '../ui/dom';
import { dirClass, fmtNum, fmtPct } from '../ui/format';
import { icon } from '../ui/icons';
import { actionSheet, confirmSheet, openSheet } from '../ui/sheet';
import { openCalculator } from './calculator';
import { exportPortfolioPdf } from './exportPdf';

const PREF = 'finagent.portfolio.prefs.v1';
interface Prefs { base: 'ARS' | 'USD'; rate: number | null }
const readPrefs = (): Prefs => { try { const p = JSON.parse(localStorage.getItem(PREF) ?? '{}'); return { base: p.base === 'USD' ? 'USD' : 'ARS', rate: typeof p.rate === 'number' && p.rate > 0 ? p.rate : null }; } catch { return { base: 'ARS', rate: null }; } };
const writePrefs = (p: Prefs) => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch { /* sin almacenamiento */ } };

export function createPortfolioView(ctx: Ctx): View {
  const el = h('div', { class: 'view' });
  let list: Holding[] = loadPortfolio();
  let prefs = readPrefs();
  const quotes = new Map<string, Quote>();
  let loading = false;
  let valued: Valued[] = [];

  el.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Solo en tu teléfono</div><h1 class="title-xl">Mi cartera</h1></div>
      <button class="icon-btn" id="p-add" aria-label="Agregar">${icon('plus', 21)}</button></div>
    <div id="p-body"></div>`;
  const body = $('#p-body', el);
  $('#p-add', el).onclick = () => openAdd();

  const save = () => { savePortfolio(list); render(); void loadQuotes(); };

  async function loadQuotes(force = false) {
    const syms = [...new Set(list.filter((x) => x.kind === 'asset').map((x) => x.symbol))].filter((s) => force || !quotes.has(s));
    if (!syms.length || loading) { render(); return; }
    loading = true; render();
    await pool(syms, 4, async (s) => { const q = await fetchQuoteCard(s); if (q.price !== null) quotes.set(s, { price: q.price, currency: q.currency }); });
    loading = false; render();
  }
  async function loadRate() {
    if (prefs.rate) return;
    try {
      const rows = await fetchDolares();
      const mep = rows.find((r) => r.casa === 'bolsa')?.venta ?? rows.find((r) => r.casa === 'oficial')?.venta ?? null;
      if (mep) { prefs = { ...prefs, rate: mep }; writePrefs(prefs); render(); }
    } catch { /* se puede cargar a mano */ }
  }

  function render() {
    valued = valuate(list, quotes);
    if (!list.length) {
      body.innerHTML = `<div class="empty-note" style="margin-top:30px"><div class="empty-orb">${icon('landmark', 30)}</div>
        <div style="font-weight:700;font-size:17px">Todavía no cargaste nada</div>
        <div class="muted" style="max-width:290px">Cargá lo que tenés (acciones, cripto, dólares, pesos) y mirá cuánto hay en cada moneda. Queda solo en tu teléfono: FinAgent no lo envía a ningún lado.</div>
        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;justify-content:center"><button class="btn btn-primary" id="p-add2">${icon('plus', 17)} Cargar a mano</button><button class="btn btn-ghost" id="p-csv">Importar un CSV</button><button class="btn btn-ghost" id="p-calc0">Calculadora de aportes</button></div></div>`;
      $('#p-add2', body).onclick = () => openAdd(); $('#p-csv', body).onclick = () => pickCsv(); $('#p-calc0', body).onclick = () => ctx.layer((done) => openCalculator(ctx, null, done));
      return;
    }
    const rate = prefs.rate ?? 0;
    const al = rate > 0 ? allocation(valued, prefs.base, rate) : null;
    const totals = totalsByCurrency(valued);
    const missing = valued.filter((x) => x.value === null).length;
    body.innerHTML = `
      <div class="card" style="background:var(--grad-soft);border-color:var(--line-2)">
        <div class="eyebrow">Total por moneda</div>
        ${totals.length ? totals.map((x) => `<div class="num" style="font-size:24px;font-weight:780;letter-spacing:-.03em;margin-top:4px">${esc(x.currency)} ${fmtNum(x.total)}</div>`).join('') : `<div class="muted" style="margin-top:6px">${loading ? 'Buscando precios…' : 'Sin precios todavía'}</div>`}
        ${missing ? `<div class="muted" style="font-size:12px;margin-top:8px">${missing} sin precio: revisá el símbolo (por ejemplo AAPL, GGAL.BA, BTC-USD).</div>` : ''}
      </div>
      <div class="card" style="margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div class="eyebrow">Todo junto en</div>
          <div class="seg" id="p-base"><button data-b="ARS" class="${prefs.base === 'ARS' ? 'on' : ''}">Pesos</button><button data-b="USD" class="${prefs.base === 'USD' ? 'on' : ''}">Dólares</button></div></div>
        <div class="onb-field"><span class="muted" style="font-size:13px">1 dólar =</span><input id="p-rate" inputmode="decimal" value="${prefs.rate ? esc(String(prefs.rate)) : ''}" placeholder="pesos"/><span class="muted" style="font-size:13px;padding-right:8px">pesos</span></div>
        <div class="muted" style="font-size:11.5px;margin-top:6px">Elegí vos el tipo de cambio (por defecto, el dólar MEP). Sirve para sumar monedas distintas.</div>
        ${al && al.total > 0 ? `<div class="num" style="font-size:22px;font-weight:760;margin-top:10px">${prefs.base} ${fmtNum(al.total)}</div>
          <div style="margin-top:10px">${al.items.slice(0, 8).map((i) => `<div style="display:flex;align-items:center;gap:10px;margin-top:7px;font-size:13px"><span style="width:84px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.symbol)}</span>
            <span style="flex:1;height:7px;border-radius:4px;background:var(--surface-3);overflow:hidden"><span style="display:block;height:100%;width:${Math.max(2, i.pct).toFixed(1)}%;background:var(--brand)"></span></span><span class="num" style="width:52px;text-align:right">${fmtNum(i.pct, 1)}%</span></div>`).join('')}</div>
          ${al.excluded ? `<div class="muted" style="font-size:11.5px;margin-top:8px">${al.excluded} posiciones sin precio o en otra moneda no entran en este total.</div>` : ''}` : ''}
      </div>
      <div class="section-head" style="margin-top:20px"><h2>Tenencias</h2></div>
      <div class="card" style="padding:4px 14px" id="p-rows"></div>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="p-calc">${icon('sliders', 16)} Calculadora de escenarios</button><button class="btn btn-ghost btn-sm" id="p-pdf">${icon('externalLink', 16)} Informe en PDF</button><button class="btn btn-ghost btn-sm" id="p-csv">Importar CSV</button></div>
      <p class="muted" style="font-size:11.5px;line-height:1.5;margin-top:16px">Los precios vienen de Yahoo Finance, con demora. Es información, no asesoramiento financiero ni una recomendación.</p>`;
    const rows = $('#p-rows', body);
    valued.forEach((x, i) => {
      const row = h('div', { class: 'wrow', style: i ? 'border-top:1px solid var(--line)' : '' });
      row.innerHTML = `${x.h.kind === 'cash' ? `<span class="asset-ico" style="display:inline-flex;width:38px;height:38px;border-radius:12px;align-items:center;justify-content:center;background:var(--surface-3)">${icon('dollar', 18)}</span>` : assetIcon(x.h.symbol)}
        <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(x.h.symbol)}</div><div class="muted" style="font-size:12.5px">${fmtNum(x.h.qty, 6)}${x.h.kind === 'cash' ? '' : ' u.'}${x.price !== null && x.h.kind === 'asset' ? ` · ${fmtNum(x.price)}` : ''}</div></div>
        <div style="text-align:right">${x.value !== null ? `<div class="num" style="font-weight:650">${esc(x.currency ?? '')} ${fmtNum(x.value)}</div>${x.gainPct !== null ? `<span class="pill ${dirClass(x.gainPct)}">${fmtPct(x.gainPct)}</span>` : ''}` : `<div class="muted" style="font-size:12.5px">${loading ? '…' : 'sin precio'}</div>`}</div>`;
      row.onclick = () => rowMenu(x.h);
      rows.append(row);
    });
    $('#p-base', body).onclick = (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-b]'); if (b) { prefs = { ...prefs, base: b.dataset.b === 'USD' ? 'USD' : 'ARS' }; writePrefs(prefs); render(); } };
    const rateIn = $<HTMLInputElement>('#p-rate', body);
    rateIn.onchange = () => { const n = parseNum(rateIn.value); prefs = { ...prefs, rate: n && n > 0 ? n : null }; writePrefs(prefs); render(); };
    $('#p-calc', body).onclick = () => { if (!prefs.rate) { toast(t('Primero indicá el valor del dólar en pesos')); return; } ctx.layer((done) => openCalculator(ctx, { valued, base: prefs.base, rate: prefs.rate! }, done)); };
    $('#p-pdf', body).onclick = () => { if (!prefs.rate) { toast(t('Primero indicá el valor del dólar en pesos')); return; } void exportPortfolioPdf(valued, prefs.base, prefs.rate); };
    $('#p-csv', body).onclick = () => pickCsv();
  }

  function rowMenu(x: Holding) {
    actionSheet(x.symbol, [
      { label: t('Cambiar cantidad o costo'), icon: 'pencil', run: () => openAdd(x) },
      ...(x.kind === 'asset' ? [{ label: t('Ver el activo'), icon: 'lineChart' as const, run: () => ctx.openAsset(x.symbol, undefined, 'watchlist') }] : []),
      { label: t('Quitar de mi cartera'), icon: 'trash', danger: true, run: async () => { if (await confirmSheet({ title: t('¿Quitar {s}?', { s: x.symbol }), confirm: t('Quitar'), danger: true })) { list = list.filter((y) => y.id !== x.id); track('portfolio_op', { op: 'remove' }); save(); } } },
    ]);
  }

  function openAdd(edit?: Holding) {
    const c = h('div');
    let kind: 'asset' | 'cash' = edit?.kind ?? 'asset';
    c.innerHTML = `<h3 class="sheet-title">${edit ? 'Editar ' + esc(edit.symbol) : 'Agregar a mi cartera'}</h3>
      ${edit ? '' : `<div class="seg" id="ad-kind" style="margin-top:10px"><button data-k="asset" class="on">Activo</button><button data-k="cash">Efectivo o plazo fijo</button></div>`}
      <div class="onb-field" ${edit ? 'hidden' : ''}><input id="ad-sym" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Símbolo (AAPL, GGAL.BA, BTC-USD)" value="${esc(edit?.symbol ?? '')}"/></div>
      <div class="onb-field"><input id="ad-qty" inputmode="decimal" placeholder="Cantidad" value="${edit ? esc(String(edit.qty)) : ''}"/></div>
      <div class="onb-field" id="ad-cost-w"><input id="ad-cost" inputmode="decimal" placeholder="Precio promedio de compra (opcional)" value="${edit?.cost != null ? esc(String(edit.cost)) : ''}"/></div>
      <div class="muted" id="ad-hint" style="font-size:12px;margin-top:8px"></div>
      <div class="sheet-actions"><button class="btn btn-ghost" data-r="0">Cancelar</button><button class="btn btn-primary" data-r="1">Guardar</button></div>`;
    const sym = $<HTMLInputElement>('#ad-sym', c), qty = $<HTMLInputElement>('#ad-qty', c), cost = $<HTMLInputElement>('#ad-cost', c);
    const sync = () => {
      $('#ad-cost-w', c).hidden = kind === 'cash';
      sym.placeholder = kind === 'cash' ? `Moneda (${CASH_CODES.slice(0, 4).join(', ')})` : 'Símbolo (AAPL, GGAL.BA, BTC-USD)';
      $('#ad-hint', c).textContent = kind === 'cash' ? 'Efectivo, cuenta o plazo fijo: poné la moneda y el monto.' : 'El costo sirve para ver cuánto ganaste o perdiste; es opcional. Ojo: 100.000 se lee como cien mil.';
    };
    sync();
    const close = openSheet(c);
    c.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (k) { kind = k.dataset.k === 'cash' ? 'cash' : 'asset'; c.querySelectorAll('#ad-kind button').forEach((b) => b.classList.toggle('on', b === k)); sync(); return; }
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      if (!b) return;
      if (b.dataset.r !== '1') { close(); return; }
      const s = sym.value.trim().toUpperCase().replace(/\s+/g, ''), q = parseNum(qty.value), co = cost.value.trim() ? parseNum(cost.value) : null;
      if (!/^[A-Z0-9.^=\-]{1,20}$/.test(s) || q === null || q < 0 || (cost.value.trim() && co === null)) { $('#ad-hint', c).textContent = 'Revisá el símbolo y los números.'; return; }
      if (edit) list = list.map((y) => (y.id === edit.id ? { ...y, qty: q, cost: edit.kind === 'cash' ? null : co } : y));
      else { list = addHolding(list, { kind, symbol: s, qty: q, cost: kind === 'cash' ? null : co }); track('portfolio_op', { op: 'add' }); }
      close(); save();
    });
  }

  function pickCsv() {
    const inp = h('input', { attrs: { type: 'file', accept: '.csv,.txt,text/csv,text/plain' }, style: 'display:none' });
    document.body.append(inp);                                         // dentro del documento: el selector de archivos de Android lo exige más seguido
    inp.addEventListener('cancel', () => inp.remove());
    inp.onchange = async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return;
      if (f.size > 500_000) { toast(t('El archivo es demasiado grande')); return; }
      const r = parseCsv(await f.text());
      if (!r.rows.length) { toast(t('No encontré posiciones. Hacen falta columnas de símbolo y cantidad.')); return; }
      const skip = r.skipped.length ? t(' Se saltean {n} filas que no se entendieron.', { n: r.skipped.length }) : '';
      if (await confirmSheet({ title: t('¿Importar {n} posiciones?', { n: r.rows.length }), text: t('Se suman a lo que ya tenés en la cartera.') + skip, confirm: t('Importar') })) {
        for (const row of r.rows) list = addHolding(list, row);
        track('portfolio_op', { op: 'import' });
        save();
      }
    };
    inp.click();
  }

  render();
  return {
    el,
    onShow: () => { list = loadPortfolio(); prefs = readPrefs(); render(); void loadQuotes(); void loadRate(); },
  };
}
