import { describe, expect, it } from 'vitest';
import { RADAR_STATS } from '../src/data/radarStats';
import type { DayBar } from '../src/radar';
import { completedBars, historyOf, stressGroup, stressNow, stressTexts, STRESS_TEXTS } from '../src/stress';
import { synthetic } from '../evals/radar/data';

const DAY = 86400;
const bars = (n: number, startT = 1_700_000_000): DayBar[] => synthetic(11, n).map((b, i) => ({ ...b, t: startT + i * DAY }));

describe('tipo de activo', () => {
  it('índices, ETF, acciones y cripto están respaldados; divisas y futuros no', () => {
    expect(stressGroup('^GSPC')).toBe('índices'); expect(stressGroup('SPY', 'ETF')).toBe('ETF'); expect(stressGroup('AAPL', 'EQUITY')).toBe('acciones'); expect(stressGroup('AAPL')).toBe('acciones');
    expect(stressGroup('BTC-USD')).toBe('cripto'); expect(stressGroup('PEPE24478-USD', 'CRYPTOCURRENCY')).toBe('cripto');
    expect(stressGroup('EURUSD=X')).toBeNull(); expect(stressGroup('GC=F')).toBeNull(); expect(stressGroup('VFIAX', 'MUTUALFUND')).toBeNull(); expect(stressGroup('USDARS=X', 'CURRENCY')).toBeNull();
  });
});

describe('rueda en curso: el backtest se midió con ruedas completas, así que la parcial se descarta', () => {
  const NOW = Date.UTC(2026, 9, 28, 15, 0, 0), sec = NOW / 1000, off = -4 * 3600;     // 28-oct, 15:00 UTC = 11:00 en Nueva York
  const todayOpen = Math.floor((sec + off) / DAY) * DAY - off + 13.5 * 3600;           // la barra de hoy empieza 9:30 locales
  const mk = (lastT: number) => [{ t: lastT - 2 * DAY }, { t: lastT - DAY }, { t: lastT }];
  const period = (end: number) => ({ gmtoffset: off, currentTradingPeriod: { regular: { start: end - 6.5 * 3600, end } } });
  it('con el mercado abierto y una barra de hoy, la quita', () => { expect(completedBars(mk(todayOpen), period(todayOpen + 6.5 * 3600), NOW)).toHaveLength(2); });
  it('si ya cerró, la deja (la barra de hoy está completa)', () => { expect(completedBars(mk(todayOpen), period(sec - 3600), NOW)).toHaveLength(3); });
  it('si la última barra es de un día anterior (fin de semana, feriado), no quita nada', () => { expect(completedBars(mk(todayOpen - 3 * DAY), period(todayOpen + 6.5 * 3600), NOW)).toHaveLength(3); });
  it('cripto nunca cierra: siempre descarta la barra del día', () => { expect(completedBars(mk(todayOpen), { instrumentType: 'CRYPTOCURRENCY', gmtoffset: 0 }, NOW)).toHaveLength(2); });
  it('sin datos del horario del mercado, es conservador: la quita', () => { expect(completedBars(mk(todayOpen), { gmtoffset: off }, NOW)).toHaveLength(2); });
  it('lista vacía no rompe', () => { expect(completedBars([], {}, NOW)).toEqual([]); });
});

describe('resultado del termómetro', () => {
  it('con historia y volumen devuelve nivel, condiciones y fecha de la última rueda completa', () => {
    const b = bars(400), r = stressNow(b, 'AAPL', { instrumentType: 'EQUITY', gmtoffset: 0 }, b[b.length - 1].t * 1000 + 10 * DAY * 1000);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') { expect(['baja', 'media', 'alta']).toContain(r.level); expect(r.available).toBe(4); expect(r.asOf).toBe(b[b.length - 1].t); expect(r.group).toBe('acciones'); expect(Object.keys(r.conditions).sort()).toEqual(['momentum', 'support', 'volatility', 'volume']); }
  });
  it('no inventa: sin volumen, con poca historia o en un tipo no respaldado dice por qué no está disponible', () => {
    const b = bars(400), now = b[b.length - 1].t * 1000 + 10 * DAY * 1000;
    expect(stressNow(b.map((x) => ({ ...x, v: 0 })), 'AAPL', {}, now)).toEqual({ kind: 'unsupported', reason: 'volumen' });
    expect(stressNow(bars(30), 'AAPL', {}, now)).toEqual({ kind: 'unsupported', reason: 'historia' });
    expect(stressNow(b, 'EURUSD=X', {}, now)).toEqual({ kind: 'unsupported', reason: 'tipo' });
  });
});

describe('datos históricos del backtest', () => {
  const G = ['índices', 'ETF', 'acciones', 'cripto'] as const, L = ['baja', 'media', 'alta'] as const;
  it('están completos y son proporciones válidas', () => {
    for (const g of G) for (const l of L) {
      const h = historyOf(g, l); expect(h.assets).toBeGreaterThan(3); expect(h.stats.n).toBeGreaterThan(100);
      for (const T of [h.stats.t5, h.stats.t10]) for (const v of Object.values(T)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
    expect(RADAR_STATS.corrida).toBeGreaterThan(0); expect(RADAR_STATS.desde).toBe(1927);
  });
  it('lo que se dice del nivel alto es verdad en los datos: los movimientos grandes son más frecuentes que lo habitual, en ambas direcciones, en todos los tipos de activo', () => {
    for (const g of G) { const s = historyOf(g, 'alta').stats.t5; expect(s.drop).toBeGreaterThan(s.expDrop); expect(s.up).toBeGreaterThan(s.expUp); }
  });
  it('y la tensión baja NO es "más segura que lo normal": queda en lo habitual (por eso el texto dice que no significa estar a salvo)', () => {
    for (const g of G) { const s = historyOf(g, 'baja').stats.t5; expect(Math.abs(s.drop - s.expDrop)).toBeLessThan(0.03); }
  });
  it('los niveles van de menos a más: la frecuencia de movimientos grandes no baja al subir la tensión', () => {
    for (const g of G) { const d = L.map((l) => historyOf(g, l).stats.t5); expect(d[1].up).toBeGreaterThan(d[0].up); expect(d[2].up).toBeGreaterThan(d[1].up); }
  });
});

describe('textos: no prometen lo que no se probó', () => {
  const all = stressTexts().join(' | ').replace('no es una señal de compra ni de venta', '');   // la única mención permitida es la que lo NIEGA
  it('no recomiendan comprar ni vender, no garantizan y no hablan de "riesgo de caída"', () => {
    expect(all).not.toMatch(/\b(compr[áae]|vend[ée])\b|recomend|garantiz|riesgo de ca[ií]da|probabilidad de ca[ií]da|crash|pánico/i);
  });
  it('aclaran lo esencial: no predice dirección ni momento, no es señal de compra/venta, y baja ≠ a salvo', () => {
    expect(STRESS_TEXTS.note).toMatch(/No predice la dirección ni el momento/); expect(STRESS_TEXTS.note).toMatch(/no es una señal de compra ni de venta/);
    expect(STRESS_TEXTS.summary.baja).toMatch(/No significa que el activo esté a salvo/); expect(STRESS_TEXTS.summary.alta).toMatch(/hacia arriba o hacia abajo/);
  });
  it('"Mi plan" no sugiere ninguna acción', () => { expect(Object.values(STRESS_TEXTS.plan).join(' ')).not.toMatch(/\b(compr|vend|liquidez|cobertura)/i); expect(STRESS_TEXTS.plan.hint).toMatch(/no te dice qué hacer/); });
});
