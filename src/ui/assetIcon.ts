// Ícono de cada activo: el logo de la empresa o la moneda, y si no se consigue uno bueno, un monograma. Nunca queda un hueco ni un logo equivocado.
//  · Cripto: se busca por símbolo en bibliotecas públicas de íconos.
//  · Acciones, ETF y CEDEAR: se resuelve el sitio web de la empresa (tabla de las más comunes + lo que Yahoo informa al abrir el activo) y de ahí el logo.
//  · Índices, divisas y materias primas: bandera o emoji (sin red).
// Los logos son marcas de terceros que se muestran solo para identificar el activo; se piden en el momento a servicios externos (ver server/README.md).
import { SYMBOL_DOMAINS, TICKER_DOMAINS, domainOf } from '../data/domains';
import { esc, h } from './dom';
import { initials, symbolColor } from './format';

export type AssetKind = 'crypto' | 'equity' | 'index' | 'fx' | 'commodity';
export interface AssetClass { kind: AssetKind; base: string; domain?: string; emoji?: string }

const FLAG: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', ARS: '🇦🇷', BRL: '🇧🇷', MXN: '🇲🇽', CLP: '🇨🇱', COP: '🇨🇴', UYU: '🇺🇾', PEN: '🇵🇪', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿',
  CHF: '🇨🇭', CNY: '🇨🇳', CNH: '🇨🇳', HKD: '🇭🇰', INR: '🇮🇳', KRW: '🇰🇷', SGD: '🇸🇬', SEK: '🇸🇪', NOK: '🇳🇴', DKK: '🇩🇰', TRY: '🇹🇷', ZAR: '🇿🇦', RUB: '🇷🇺', PLN: '🇵🇱' };
const INDEX_FLAG: Record<string, string> = { GSPC: '🇺🇸', IXIC: '🇺🇸', DJI: '🇺🇸', RUT: '🇺🇸', NDX: '🇺🇸', FTSE: '🇬🇧', GDAXI: '🇩🇪', FCHI: '🇫🇷', N225: '🇯🇵', HSI: '🇭🇰', BVSP: '🇧🇷', MERV: '🇦🇷', STOXX50E: '🇪🇺',
  IBEX: '🇪🇸', AXJO: '🇦🇺', KS11: '🇰🇷', BSESN: '🇮🇳', MXX: '🇲🇽', GSPTSE: '🇨🇦', SSEC: '🇨🇳', VIX: '📉', TNX: '🏛️' };
const COMMODITY: Record<string, string> = { GC: '🥇', SI: '🥈', CL: '🛢️', BZ: '🛢️', NG: '🔥', HG: '🟠', PL: '⚪', PA: '⚪', ZC: '🌽', ZS: '🌱', ZW: '🌾', KC: '☕', SB: '🍬', CT: '🧵', CC: '🍫' };

// ------------------------------------------------------------------ almacenamiento (localStorage; en memoria si no hay)
const mem = new Map<string, string>();
const rd = <T,>(k: string, dflt: T): T => { try { const v = globalThis.localStorage?.getItem(k) ?? mem.get(k); return v ? (JSON.parse(v) as T) : dflt; } catch { return dflt; } };
const wr = (k: string, v: unknown) => { const s = JSON.stringify(v); mem.set(k, s); try { globalThis.localStorage?.setItem(k, s); } catch { /* sin almacenamiento */ } };
const DOMAINS_KEY = 'finagent.icon.domains.v1', OK_KEY = 'finagent.icon.ok.v1', MISS_KEY = 'finagent.icon.miss.v1';
const OK_TTL = 14 * 86_400_000, MISS_TTL = 3 * 86_400_000;           // los logos se revalidan cada 14 días; un fallo no se reintenta por 3 días
let logoToken: string = String((import.meta as any).env?.VITE_LOGO_DEV_TOKEN ?? '');
export const setLogoToken = (t: string): void => { logoToken = t; };   // para pruebas

export function classify(symbol: string): AssetClass {
  const s = symbol.trim().toUpperCase();
  if (s.startsWith('^')) return { kind: 'index', base: s.slice(1), emoji: INDEX_FLAG[s.slice(1)] ?? '📊' };
  if (s.endsWith('=X')) { const p = s.slice(0, -2); return { kind: 'fx', base: p, emoji: FLAG[p.slice(0, 3)] ?? '💱' }; }
  if (s.endsWith('=F')) return { kind: 'commodity', base: s.slice(0, -2), emoji: COMMODITY[s.slice(0, -2)] ?? '📦' };
  const c = /^([A-Z0-9]{2,10})-(USD|USDT|USDC|EUR|GBP|BTC|ETH|ARS|BRL|JPY)$/.exec(s);
  if (c && !/^BRK|^BF$/.test(c[1])) return { kind: 'crypto', base: c[1].toLowerCase() };
  const m = /^(.+)\.([A-Z]{1,3})$/.exec(s), suffix = m?.[2], base = m ? m[1] : s;
  // El mismo ticker puede ser otra empresa en otra bolsa: solo se usa el ticker "a secas" sin sufijo o en CEDEARs (.BA, que repiten el ticker de origen).
  const domain = SYMBOL_DOMAINS.get(s) ?? rd<Record<string, string>>(DOMAINS_KEY, {})[s] ?? (!suffix || suffix === 'BA' ? TICKER_DOMAINS.get(base) : undefined);
  return { kind: 'equity', base, ...(domain ? { domain } : {}) };
}

/** Direcciones a probar, de mejor a peor calidad. */
export function candidates(symbol: string): string[] {
  const c = classify(symbol);
  if (c.kind === 'crypto') return [`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${c.base}.png`, `https://assets.coincap.io/assets/icons/${c.base}@2x.png`];
  if (c.kind === 'equity' && c.domain) {
    return [...(logoToken ? [`https://img.logo.dev/${c.domain}?token=${encodeURIComponent(logoToken)}&size=128&format=png`] : []), `https://www.google.com/s2/favicons?domain=${c.domain}&sz=128`];
  }
  return [];
}

/** Un activo cuyo sitio web aprendimos (al abrirlo, Yahoo lo informa): se recuerda y se actualizan los íconos que ya están en pantalla. */
export function learnDomain(symbol: string, website: unknown): void {
  const d = domainOf(website);
  if (!d) return;
  const s = symbol.trim().toUpperCase(), map = rd<Record<string, string>>(DOMAINS_KEY, {});
  if (map[s] === d) return;
  map[s] = d; wr(DOMAINS_KEY, map);
  const miss = rd<Record<string, number>>(MISS_KEY, {}); delete miss[s]; wr(MISS_KEY, miss);
  if (typeof document === 'undefined') return;
  document.querySelectorAll<HTMLElement>(`.aico[data-sym="${CSS.escape(s)}"]`).forEach((el) => {
    if (el.querySelector('img.ok')) return;
    const u = candidates(s);
    if (!u.length) return;
    el.querySelector('img')?.remove();
    el.append(h('img', { src: u[0], alt: '', 'data-i': '0', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } as never));
  });
}

/** HTML del ícono (reemplaza al avatar de letras). El monograma queda debajo mientras carga el logo, así nunca hay un hueco. */
export function assetIcon(symbol: string, o: { style?: string } = {}): string {
  const s = symbol.trim().toUpperCase(), c = classify(s), style = `background:${symbolColor(s)};${o.style ?? ''}`;
  if (c.emoji) return `<div class="avatar aico emo" style="${esc(style)}" data-sym="${esc(s)}" data-kind="${c.kind}"><span class="aico-t">${c.emoji}</span></div>`;
  const urls = candidates(s), miss = rd<Record<string, number>>(MISS_KEY, {})[s], ok = rd<Record<string, { i: number; t: number }>>(OK_KEY, {})[s];
  const start = ok && Date.now() - ok.t < OK_TTL && ok.i < urls.length ? ok.i : 0;
  const img = urls.length && !(miss && Date.now() - miss < MISS_TTL) ? `<img src="${esc(urls[start])}" alt="" data-i="${start}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  return `<div class="avatar aico" style="${esc(style)}" data-sym="${esc(s)}" data-kind="${c.kind}"><span class="aico-t">${esc(initials(s))}</span>${img}</div>`;
}

/** Se instala una sola vez: maneja la carga de TODOS los logos (pasa al siguiente origen si falla o si la imagen es muy chica/borrosa). */
export function installIconLoader(): void {
  const next = (img: HTMLImageElement) => {
    const el = img.closest<HTMLElement>('.aico'), sym = el?.dataset.sym;
    if (!el || !sym) return;
    const i = Number(img.dataset.i ?? 0) + 1, urls = candidates(sym);
    if (i < urls.length) { img.dataset.i = String(i); img.src = urls[i]; return; }
    img.remove();
    const miss = rd<Record<string, number>>(MISS_KEY, {}); miss[sym] = Date.now(); wr(MISS_KEY, miss);
  };
  document.addEventListener('error', (e) => { const t = e.target; if (t instanceof HTMLImageElement && t.closest('.aico')) next(t); }, true);
  document.addEventListener('load', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLImageElement) || !t.closest('.aico')) return;
    if (t.naturalWidth < 48) return next(t);                                   // una miniatura estirada se ve mal: mejor el siguiente origen o el monograma
    t.classList.add('ok');
    const sym = t.closest<HTMLElement>('.aico')!.dataset.sym!, ok = rd<Record<string, { i: number; t: number }>>(OK_KEY, {});
    ok[sym] = { i: Number(t.dataset.i ?? 0), t: Date.now() }; wr(OK_KEY, ok);
  }, true);
}
