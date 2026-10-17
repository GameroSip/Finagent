// Utilidades mínimas de DOM (sin framework).
export type Child = Node | string | number | null | undefined | false;
interface Props {
  class?: string; text?: string; html?: string; attrs?: Record<string, string>; style?: string;
  on?: Record<string, (e: any) => void>;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.style) el.setAttribute('style', props.style);
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const [k, fn] of Object.entries(props.on ?? {})) el.addEventListener(k, fn);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'object' ? c : String(c));
  }
  return el;
}

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function $<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`No se encontró ${sel}`);
  return el;
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  let t = document.querySelector<HTMLElement>('.toast');
  if (!t) { t = h('div', { class: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t!.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 2200);
}

/** Abre un enlace externo (navegador del sistema en la app). */
export const openUrl = (url: string) => { window.open(url, '_blank', 'noopener'); };
