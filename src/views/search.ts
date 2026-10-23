// Buscador de activos (pantalla completa).
import type { Ctx } from '../ctx';
import { getRecent, isWatched, toggleWatch } from '../store';
import { searchSymbols } from '../yahoo';
import { assetIcon } from '../ui/assetIcon';
import { $, esc, h } from '../ui/dom';

import { icon } from '../ui/icons';
import type { Overlay } from './asset';
import { t } from '../i18n';

const SUGGEST: Array<[string, string]> = [['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['MELI', 'Mercado Libre'], ['GGAL', 'Grupo Galicia (ADR)'], ['YPFD.BA', 'YPF (BYMA)'], ['AAPL.BA', 'Apple CEDEAR'], ['BTC-USD', 'Bitcoin'], ['^MERV', 'Merval']];

export function openSearchOverlay(ctx: Ctx, onClose?: () => void): Overlay {
  const el = h('div', { class: 'overlay search-ov' });
  el.innerHTML = `
    <div class="ov-bar" style="gap:10px">
      <div class="search-field">${icon('search', 19)}<input id="s-in" type="text" placeholder="Buscar acción, CEDEAR, cripto…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" /></div>
      <button class="btn btn-ghost btn-sm" id="s-cancel">Cancelar</button>
    </div>
    <div class="ov-body" id="s-body" style="padding-top:6px"></div>`;
  const input = $<HTMLInputElement>('#s-in', el), body = $('#s-body', el);
  let timer: number | undefined;
  let seq = 0;
  let closed = false;

  const close = () => { if (closed) return; closed = true; el.classList.add('leaving'); setTimeout(() => { el.remove(); onClose?.(); }, 200); };

  function row(sym: string, nm: string, meta: string) {
    const r = h('div', { class: 'srow' });
    r.innerHTML = `${assetIcon(sym)}
      <div style="flex:1;min-width:0"><div style="font-weight:700">${esc(sym)}</div><div class="muted" style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(nm)}${meta ? ' · ' + esc(meta) : ''}</div></div>
      <button class="icon-btn star-btn" aria-label="Favorito" style="width:38px;height:38px">${icon('star', 18, isWatched(sym))}</button>`;
    r.onclick = (e) => {
      const sb = (e.target as HTMLElement).closest('.star-btn');
      if (sb) { e.stopPropagation(); sb.innerHTML = icon('star', 18, toggleWatch(sym)); return; }
      close(); ctx.openAsset(sym, nm);
    };
    return r;
  }

  function showIdle() {
    body.innerHTML = '';
    const recent = getRecent();
    if (recent.length) {
      body.append(h('div', { class: 'eyebrow', style: 'margin:10px 0 6px;font-weight:600', text: 'Recientes' }));
      recent.forEach((s) => body.append(row(s, '', '')));
    }
    body.append(h('div', { class: 'eyebrow', style: 'margin:16px 0 6px;font-weight:600', text: 'Populares' }));
    SUGGEST.forEach(([s, n]) => body.append(row(s, n, '')));
  }

  async function run(qs: string) {
    const my = ++seq;
    body.innerHTML = '<div class="skeleton" style="height:56px;margin:10px 0"></div>'.repeat(3);
    try {
      const { quotes } = await searchSymbols(qs, 10, 0);
      if (my !== seq || closed) return;
      body.innerHTML = '';
      const list = quotes.filter((x: any) => x?.symbol);
      if (!list.length) { body.innerHTML = `<div class="empty-note">${icon('search', 26)}<div>${esc(t('No encontré resultados para "{q}".', { q: qs }))}</div><div class="muted" style="font-size:12.5px">Probá con el ticker (por ej. AAPL, GGAL.BA, BTC-USD).</div></div>`; return; }
      list.forEach((x: any) => body.append(row(x.symbol, x.longname ?? x.shortname ?? '', [x.exchDisp ?? x.exchange, x.quoteType].filter(Boolean).join(' · '))));
    } catch (e: any) {
      if (my !== seq || closed) return;
      body.innerHTML = `<div class="error-box">${icon('warn', 18)}<span>No pude buscar ahora. Probá de nuevo.</span></div>`;
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (!v) { seq++; showIdle(); return; }
    timer = window.setTimeout(() => void run(v), 280);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = input.value.trim(); if (v) { clearTimeout(timer); void run(v); } } });
  $('#s-cancel', el).onclick = close;
  showIdle();
  setTimeout(() => input.focus(), 120);
  return { el, close };
}
