// Hojas inferiores reutilizables: confirmar, pedir un texto y menú de acciones. Reemplazan a confirm()/prompt() nativos.
import { $, esc, h } from './dom';
import { icon, type IconName } from './icons';

const stack: Array<() => void> = [];

/** Cierra la hoja de más arriba (lo usa el botón "atrás" de Android). Devuelve true si cerró alguna. */
export function closeTopSheet(): boolean {
  const close = stack[stack.length - 1];
  if (!close) return false;
  close();
  return true;
}

/** Muestra `content` en una hoja. `onDismiss` se llama siempre al cerrarse (por la acción, el fondo o "atrás"). */
export function openSheet(content: HTMLElement, onDismiss?: () => void): () => void {
  const back = h('div', { class: 'sheet-back' }), card = h('div', { class: 'sheet' });
  card.append(content); back.append(card); document.body.append(back);
  requestAnimationFrame(() => back.classList.add('show'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(close);
    if (i >= 0) stack.splice(i, 1);
    back.classList.remove('show');
    setTimeout(() => back.remove(), 220);
    onDismiss?.();
  };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  stack.push(close);
  return close;
}

export function confirmSheet(o: { title: string; text?: string; confirm?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const c = h('div');
    c.innerHTML = `<h3 class="sheet-title">${esc(o.title)}</h3>${o.text ? `<p class="muted sheet-text">${esc(o.text)}</p>` : ''}
      <div class="sheet-actions"><button class="btn btn-ghost" data-r="0">${esc(o.cancel ?? 'Cancelar')}</button><button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(o.confirm ?? 'Aceptar')}</button></div>`;
    let decided = false;
    const decide = (v: boolean) => { if (!decided) { decided = true; resolve(v); } };
    const close = openSheet(c, () => decide(false));
    c.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      if (b) { decide(b.dataset.r === '1'); close(); }
    });
  });
}

/** Pide un texto. Devuelve el texto (sin espacios sobrantes) o null si se cancela o queda vacío. */
export function promptSheet(o: { title: string; value?: string; placeholder?: string; confirm?: string; maxLength?: number }): Promise<string | null> {
  return new Promise((resolve) => {
    const c = h('div');
    c.innerHTML = `<h3 class="sheet-title">${esc(o.title)}</h3>
      <div class="onb-field" style="margin-top:14px"><input id="ps-in" type="text" maxlength="${o.maxLength ?? 80}" autocomplete="off" autocapitalize="sentences" spellcheck="false" placeholder="${esc(o.placeholder ?? '')}" /></div>
      <div class="sheet-actions"><button class="btn btn-ghost" data-r="0">Cancelar</button><button class="btn btn-primary" data-r="1">${esc(o.confirm ?? 'Guardar')}</button></div>`;
    const input = $<HTMLInputElement>('#ps-in', c);
    input.value = o.value ?? '';
    let decided = false;
    const decide = (v: string | null) => { if (!decided) { decided = true; resolve(v); } };
    const close = openSheet(c, () => decide(null));
    const submit = () => { const v = input.value.trim(); decide(v || null); close(); };
    c.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      if (b) { if (b.dataset.r === '1') submit(); else close(); }
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setTimeout(() => { input.focus(); input.select(); }, 280);
  });
}

export interface SheetAction { label: string; icon?: IconName; danger?: boolean; run: () => void }

/** Menú de acciones (p. ej. Renombrar / Eliminar). */
export function actionSheet(title: string, actions: SheetAction[]): void {
  const c = h('div');
  c.innerHTML = `<h3 class="sheet-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}</h3>
    <div class="act-list">${actions.map((a, i) => `<button class="act-row ${a.danger ? 'danger' : ''}" data-i="${i}">${a.icon ? icon(a.icon, 19) : ''}<span>${esc(a.label)}</span></button>`).join('')}</div>`;
  const close = openSheet(c);
  c.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (b) { close(); actions[Number(b.dataset.i)].run(); }
  });
}
