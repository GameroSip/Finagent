// Contenido de los informes en PDF. Solo muestra datos y cuentas reales de la persona; nada de recomendaciones.
import { t, locale } from './i18n';
import type { Block } from './pdf';
import { allocation, totalsByCurrency, type ScenarioResult, type Valued } from './portfolio';
import type { Bar } from './yahoo';

const nf = (n: number, d = 2) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : ''}${nf(n)}%`);
const money = (n: number | null, c: string | null) => (n === null || !Number.isFinite(n) ? '—' : `${c ?? ''} ${nf(n)}`.trim());
const day = (d = new Date()) => d.toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' });

export const disclaimer = (): string =>
  t('Informe informativo generado en tu teléfono con los datos que cargaste y datos públicos con demora. No es asesoramiento financiero ni una recomendación personalizada ni una predicción. Las inversiones pueden perder valor.');

export function portfolioBlocks(v: Valued[], base: 'ARS' | 'USD', rate: number, sc?: ScenarioResult | null, now = new Date()): Block[] {
  const al = allocation(v, base, rate);
  const out: Block[] = [
    { t: 'h1', text: t('Mi cartera') }, { t: 'p', text: t('Fecha: {d}', { d: day(now) }) }, { t: 'space', h: 4 },
    { t: 'h2', text: t('Total por moneda') },
    { t: 'table', head: [t('Moneda'), t('Total')], widths: [0.4, 0.6], align: ['l', 'r'], rows: totalsByCurrency(v).map((x) => [x.currency, nf(x.total)]) },
  ];
  if (al.items.length) out.push({ t: 'p', text: t('En {b}, con un dólar a {r} pesos (el que elegiste): {total}', { b: base, r: nf(rate), total: nf(al.total) }) });
  out.push({ t: 'h2', text: t('Tenencias') }, {
    t: 'table', head: [t('Activo'), t('Cantidad'), t('Precio'), t('Valor'), t('Vs. costo')], widths: [0.22, 0.16, 0.2, 0.24, 0.18], align: ['l', 'r', 'r', 'r', 'r'],
    rows: v.map((x) => [x.h.symbol, nf(x.h.qty, x.h.qty % 1 ? 4 : 0), x.price === null ? '—' : nf(x.price), money(x.value, x.currency), pct(x.gainPct)]),
  });
  if (al.items.length) out.push({ t: 'h2', text: t('Reparto en {b}', { b: base }) }, {
    t: 'table', head: [t('Activo'), t('Valor'), t('Parte')], widths: [0.4, 0.35, 0.25], align: ['l', 'r', 'r'], rows: al.items.map((i) => [i.symbol, nf(i.value), `${nf(i.pct, 1)}%`]),
  });
  if (al.excluded) out.push({ t: 'note', text: t('{n} posiciones sin precio o en otra moneda no entran en el reparto ni en el total convertido.', { n: al.excluded }) });
  if (sc) out.push(...scenarioBlocks(sc));
  out.push({ t: 'space', h: 8 }, { t: 'note', text: disclaimer() }, { t: 'note', text: t('Datos de mercado: Yahoo Finance, con demora.') });
  return out;
}

export function scenarioBlocks(sc: ScenarioResult): Block[] {
  return [
    { t: 'h2', text: t('Escenario con tus supuestos') },
    { t: 'p', text: t('Dólar: de {a} a {b} pesos. Resultado en {c}: de {x} a {y} ({p}).', { a: nf(sc.rateBefore), b: nf(sc.rateAfter), c: sc.base, x: nf(sc.before), y: nf(sc.after), p: pct(sc.deltaPct) }) },
    { t: 'table', head: [t('Activo'), t('Antes'), t('Después'), t('Cambio')], widths: [0.34, 0.24, 0.24, 0.18], align: ['l', 'r', 'r', 'r'], rows: sc.rows.map((r) => [r.symbol, nf(r.before), nf(r.after), pct(r.deltaPct)]) },
    { t: 'note', text: t('Es una cuenta con supuestos que elegiste, no una predicción. No considera que los activos en pesos que cotizan en el país suelen moverse con el dólar.') },
  ];
}

export interface AssetFacts { symbol: string; name: string; currency: string | null; price: number | null; changePct: number | null; asOf: string; bars: Bar[] }

/** Estadísticas del último año a partir de los cierres diarios. Todas son cuentas sobre datos pasados. */
export function assetStats(bars: Bar[]) {
  const c = bars.map((b) => b.adjc ?? b.c).filter((x) => Number.isFinite(x) && x > 0);
  if (c.length < 20) return null;
  const last = c[c.length - 1];
  const back = (days: number) => (c.length > days ? (last / c[c.length - 1 - days] - 1) * 100 : null);
  let peak = c[0], dd = 0;
  for (const x of c) { peak = Math.max(peak, x); dd = Math.min(dd, x / peak - 1); }
  const r = c.slice(1).map((x, i) => Math.log(x / c[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const vol = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100;
  const hi = Math.max(...bars.map((b) => b.h)), lo = Math.min(...bars.map((b) => b.l));
  return { m1: back(21), m6: back(126), y1: c.length > 240 ? back(c.length - 1) : null, vol, dd: dd * 100, hi, lo };
}

export function assetBlocks(f: AssetFacts, now = new Date()): Block[] {
  const s = assetStats(f.bars);
  const rows: string[][] = [[t('Precio'), money(f.price, f.currency)], [t('Variación del día'), pct(f.changePct)]];
  if (s) rows.push([t('Último mes'), pct(s.m1)], [t('6 meses'), pct(s.m6)], [t('1 año'), pct(s.y1)], [t('Volatilidad anualizada (1 año)'), `${nf(s.vol)}%`], [t('Mayor caída desde un máximo (1 año)'), pct(s.dd)], [t('Máximo del año'), nf(s.hi)], [t('Mínimo del año'), nf(s.lo)]);
  return [
    { t: 'h1', text: `${f.name} (${f.symbol})` }, { t: 'p', text: t('Fecha: {d}', { d: day(now) }) + ` · ${t('Datos al {x}', { x: f.asOf })}` }, { t: 'space', h: 4 },
    { t: 'table', head: [t('Dato'), t('Valor')], widths: [0.62, 0.38], align: ['l', 'r'], rows },
    { t: 'note', text: t('Rendimientos con precios ajustados por dividendos y splits. La volatilidad y la caída máxima describen el pasado y no anticipan lo que vendrá.') },
    { t: 'space', h: 8 }, { t: 'note', text: disclaimer() }, { t: 'note', text: t('Datos de mercado: Yahoo Finance, con demora.') },
  ];
}
