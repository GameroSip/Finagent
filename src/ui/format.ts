// Formato de números y fechas según el idioma elegido (es-AR, en-US o pt-BR).
import { locale, t } from '../i18n';
const nf = (min: number, max: number) => new Intl.NumberFormat(locale(), { minimumFractionDigits: min, maximumFractionDigits: max });
const cache = new Map<string, Intl.NumberFormat>();
const fmt = (min: number, max: number) => { const k = `${locale()}-${min}-${max}`; if (!cache.has(k)) cache.set(k, nf(min, max)); return cache.get(k)!; };

export function fmtNum(n: number | null | undefined, max = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return fmt(0, max).format(n);
}

const SYMBOL: Record<string, string> = { USD: 'US$', ARS: '$', EUR: '€', GBP: '£', BRL: 'R$', JPY: '¥' };

/** Precio con símbolo de moneda cuando se conoce (índices y futuros suelen venir sin moneda o en puntos). */
export function fmtPrice(n: number | null | undefined, currency?: string | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const dec = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  const body = fmt(abs >= 100000 ? 0 : 2, dec).format(n);
  const sym = currency ? SYMBOL[currency] ?? currency : '';
  return sym ? `${sym} ${body}` : body;
}

export function fmtPct(n: number | null | undefined, withSign = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const s = withSign && n > 0 ? '+' : '';
  return `${s}${fmt(2, 2).format(n)}%`;
}

export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const units: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, s] of units) if (a >= v) return `${fmt(0, a / v >= 100 ? 0 : 1).format(n / v)} ${s}`;
  return fmt(0, 2).format(n);
}

export const dirClass = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) || Math.abs(n) < 0.005 ? 'flat' : n > 0 ? 'up' : 'down');

export function timeAgo(ts: number | string | null | undefined, now = Date.now()): string {
  const at = typeof ts === 'string' ? Date.parse(ts) : ts;
  if (!at || !Number.isFinite(at)) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return t('ahora');
  const m = Math.floor(s / 60);
  if (m < 60) return t('hace {n} min', { n: m });
  const hr = Math.floor(m / 60);
  if (hr < 24) return t('hace {n} h', { n: hr });
  const d = Math.floor(hr / 24);
  return d === 1 ? t('ayer') : t('hace {n} d', { n: d });
}

export function greeting(d = new Date()): string {
  const hr = d.getHours();
  return t(hr < 6 ? 'Buenas noches' : hr < 13 ? 'Buen día' : hr < 20 ? 'Buenas tardes' : 'Buenas noches');
}

/** Color estable por símbolo (para los avatares). */
export function symbolColor(sym: string): string {
  let hsh = 0;
  for (const ch of sym) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hsh % 360;
  return `hsl(${hue} 12% 26%)`;                                       // gris con un leve tono propio: se distinguen entre sí sin colores estridentes
}
export const initials = (sym: string) => sym.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?';

/** "2026-10-15" -> "15 oct" */
export function fmtDate(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }).replace('.', '') : s;
}
