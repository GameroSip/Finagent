// Panel lateral de historial de chats (como ChatGPT/Claude/Gemini): buscar, abrir, renombrar y eliminar.
import { deleteChat, groupByDate, listChats, renameChat, searchChats, subscribeChats, type ChatMeta } from '../chats';
import { $, esc, h } from '../ui/dom';
import { timeAgo } from '../ui/format';
import { icon } from '../ui/icons';
import { actionSheet, confirmSheet, promptSheet } from '../ui/sheet';
import type { Overlay } from './asset';
import { t } from '../i18n';

export interface HistoryOpts {
  currentId: string | null;
  /** Chats con una respuesta en curso (se muestran con un indicador). */
  busy: () => Set<string>;
  onSelect(id: string): void;
  onNew(): void;
  onDeleted(id: string): void;
  /** Se llama una vez que el panel terminó de cerrarse. */
  onClosed(): void;
}

export function openHistory(o: HistoryOpts): Overlay {
  const el = h('div', { class: 'drawer-layer' });
  el.innerHTML = `
    <div class="drawer-scrim"></div>
    <aside class="drawer" aria-label="Historial de chats">
      <div class="drawer-head"><h2>Chats</h2><button class="icon-btn" id="d-close" aria-label="Cerrar">${icon('x', 19)}</button></div>
      <div class="search-field">${icon('search', 18)}<input id="d-q" type="text" placeholder="Buscar en tus chats" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" /></div>
      <button class="btn btn-primary btn-block" id="d-new">${icon('squarePen', 18)} Nuevo chat</button>
      <div class="drawer-list" id="d-list"></div>
    </aside>`;
  const list = $('#d-list', el), input = $<HTMLInputElement>('#d-q', el);
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    unsub();
    el.classList.add('leaving');
    setTimeout(() => { el.remove(); o.onClosed(); }, 230);
  }

  function item(m: ChatMeta, snippet?: string): HTMLElement {
    const busy = o.busy().has(m.id);
    const row = h('div', { class: `chat-item${m.id === o.currentId ? ' active' : ''}`, attrs: { 'data-id': m.id, role: 'button', tabindex: '0' } });
    row.innerHTML = `<div class="ci-main"><div class="ci-title" data-notrans>${esc(m.title)}</div>
        <div class="ci-sub">${esc(snippet ?? (m.preview || 'Sin mensajes'))}</div></div>
      ${busy ? '<span class="sp" title="Respondiendo…"></span>' : m.unread ? '<span class="ci-dot" title="Respuesta nueva"></span>' : `<span class="ci-time">${esc(timeAgo(m.updatedAt))}</span>`}
      <button class="ci-more" aria-label="Opciones del chat">${icon('ellipsis', 19)}</button>`;
    return row;
  }

  function render() {
    const q = input.value.trim();
    const rows = q ? searchChats(q) : listChats().map((meta) => ({ meta, snippet: undefined as string | undefined }));
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = q
        ? `<div class="empty-note" style="margin-top:34px">${icon('search', 26)}<div>${esc(t('No encontré chats con "{q}".', { q }))}</div></div>`
        : `<div class="empty-note" style="margin-top:34px">${icon('messageSquare', 28)}<div style="font-weight:700">Todavía no tenés chats</div><div class="muted" style="font-size:13px;max-width:230px">Tus conversaciones se guardan acá para que puedas retomarlas.</div></div>`;
      return;
    }
    const snippets = new Map(rows.map((r) => [r.meta.id, r.snippet]));
    const groups = q ? [{ label: t('Resultados ({n})', { n: rows.length }), items: rows.map((r) => r.meta) }] : groupByDate(rows.map((r) => r.meta));
    for (const g of groups) {
      list.append(h('div', { class: 'd-group', text: g.label }));
      g.items.forEach((m) => list.append(item(m, snippets.get(m.id))));
    }
  }

  function menu(m: ChatMeta) {
    actionSheet(m.title, [
      { label: 'Renombrar', icon: 'pencil', run: async () => {
        const t = await promptSheet({ title: 'Renombrar chat', value: m.title, placeholder: 'Título del chat' });
        if (t) renameChat(m.id, t);
      } },
      { label: 'Eliminar', icon: 'trash', danger: true, run: async () => {
        if (await confirmSheet({ title: '¿Eliminar este chat?', text: 'Se borra la conversación de este teléfono. No se puede deshacer.', confirm: 'Eliminar', danger: true })) {
          deleteChat(m.id); o.onDeleted(m.id);
        }
      } },
    ]);
  }

  // ---- eventos (delegados)
  let pressTimer: number | undefined, pressed = false;
  list.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.chat-item');
    if (!row) return;
    if (pressed) { pressed = false; return; } // el "click" que sigue a un mantener presionado no abre el chat
    const m = listChats().find((x) => x.id === row.dataset.id);
    if (!m) return;
    if ((e.target as HTMLElement).closest('.ci-more')) { menu(m); return; }
    o.onSelect(m.id); close();
  });
  list.addEventListener('touchstart', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.chat-item');
    if (!row) return;
    pressed = false;
    pressTimer = window.setTimeout(() => { const m = listChats().find((x) => x.id === row.dataset.id); if (m) { pressed = true; menu(m); } }, 550);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => list.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));
  list.addEventListener('contextmenu', (e) => e.preventDefault());
  list.addEventListener('keydown', (e) => { if (e.key === 'Enter') (e.target as HTMLElement).closest<HTMLElement>('.chat-item')?.click(); });

  let timer: number | undefined;
  input.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(render, 180); });
  $('#d-new', el).onclick = () => { o.onNew(); close(); };
  $('#d-close', el).onclick = close;
  $('.drawer-scrim', el).addEventListener('click', close);
  const unsub = subscribeChats(render); // el título automático o un renombrado se reflejan al instante

  render();
  return { el, close };
}
