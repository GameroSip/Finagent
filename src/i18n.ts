// Idiomas de la interfaz. El español es la base: las claves de los diccionarios SON el texto en español, así que si falta una traducción se ve el español (nunca queda vacío).
//  · t('texto {n}', { n }) → para los textos que se arman en código.
//  · El texto fijo de las pantallas (HTML) se traduce solo, al mostrarse (translateDom), con los mismos diccionarios.
// La IA responde en el idioma en que escribe la persona; el idioma elegido es el de la interfaz y el que se usa si el mensaje no deja claro cuál es.
import { EN } from './i18n/en';
import { PT } from './i18n/pt';

export type UiLang = 'es' | 'en' | 'pt';
export interface LangInfo { id: UiLang; native: string; badge: string; locale: string }
export const LANGS: LangInfo[] = [
  { id: 'es', native: 'Español', badge: 'ES', locale: 'es-AR' },
  { id: 'en', native: 'English', badge: 'EN', locale: 'en-US' },
  { id: 'pt', native: 'Português', badge: 'PT', locale: 'pt-BR' },
];
/** Idiomas que están en camino (se muestran como "próximamente": no se promete lo que no existe). */
export const COMING_LANGS = ['Français', 'Deutsch', 'Italiano', '中文', '日本語', 'العربية'];

const DICT: Record<UiLang, Record<string, string>> = { es: {}, en: EN, pt: PT };
const KEY = 'finagent.lang.v1';

/** Idioma del dispositivo → idioma de la app (los que no tenemos caen en inglés, el más entendido). */
export function detectLang(nav: { language?: string; languages?: readonly string[] } | undefined = globalThis.navigator): UiLang {
  const l = (nav?.languages?.[0] ?? nav?.language ?? 'en').toLowerCase();
  return l.startsWith('es') ? 'es' : l.startsWith('pt') ? 'pt' : 'en';
}
const isLang = (v: unknown): v is UiLang => v === 'es' || v === 'en' || v === 'pt';
let current: UiLang = (() => { try { const v = globalThis.localStorage?.getItem(KEY); return isLang(v) ? v : detectLang(); } catch { return detectLang(); } })();

export const getLang = (): UiLang => current;
export const hasChosenLang = (): boolean => { try { return isLang(globalThis.localStorage?.getItem(KEY)); } catch { return false; } };
export function setLang(l: UiLang): void { current = l; if (typeof document !== 'undefined') document.documentElement.lang = l; try { globalThis.localStorage?.setItem(KEY, l); } catch { /* sin almacenamiento */ } }
export const locale = (): string => LANGS.find((x) => x.id === current)!.locale;

const fill = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s);
/** Traduce un texto escrito en español (con {variables} opcionales). */
export function t(key: string, vars?: Record<string, string | number>): string { return fill((current === 'es' ? undefined : DICT[current][key]) ?? key, vars); }
/** Para pruebas y herramientas: traducción a un idioma concreto, o null si falta. */
export const lookup = (lang: UiLang, key: string): string | null => (lang === 'es' ? key : DICT[lang][key] ?? null);

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Traduce un texto fijo conservando los espacios de los costados (para nodos de texto del HTML). */
export function translateText(text: string): string {
  if (current === 'es') return text;
  const core = norm(text);
  const tr = core ? DICT[current][core] : undefined;
  return tr === undefined ? text : text.replace(/\S[\s\S]*\S|\S/, () => tr);
}

// ------------------------------------------------------------------ traducción automática del HTML
const SKIP = 'script,style,input,textarea,[data-notrans],.md,.m-user,.bubble-user';
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
function textNodes(root: Node, fn: (n: Text) => void) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (!(n.parentElement?.closest(SKIP))) fn(n as Text);
}
function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { if (!(root.parentElement?.closest(SKIP))) { const v = translateText(root.nodeValue ?? ''); if (v !== root.nodeValue) root.nodeValue = v; } return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  textNodes(root, (n) => { const v = translateText(n.nodeValue ?? ''); if (v !== n.nodeValue) n.nodeValue = v; });
  const els = [root as Element, ...(root as Element).querySelectorAll('*')];
  for (const el of els) { if (el.closest(SKIP)) continue; for (const a of ATTRS) { const v = el.getAttribute(a); if (v) { const tr = translateText(v); if (tr !== v) el.setAttribute(a, tr); } } }
}
/** Traduce lo que ya está en pantalla y todo lo que se agregue después (hojas, avisos, listas que se redibujan). En español no cambia nada. */
export function startDomTranslation(): void {
  document.documentElement.lang = current;
  translateTree(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(translateTree);
      else if (m.type === 'characterData') translateTree(m.target);
      else if (m.target instanceof Element && !m.target.closest(SKIP)) { const v = m.target.getAttribute(m.attributeName!); if (v) { const tr = translateText(v); if (tr !== v) m.target.setAttribute(m.attributeName!, tr); } }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
