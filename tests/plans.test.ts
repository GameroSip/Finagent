import { describe, expect, it } from 'vitest';
import { consume, localDates, MemoryUsageStore, modelFor, PLANS, refund, type Plan } from '../src/plans';
import { estimateCostUSD } from '../src/pricing';

const TZ = 'America/Argentina/Cordoba';
const at = (iso: string) => new Date(iso);

describe('planes: límites por usuario', () => {
  it('el plan gratis permite 3 consultas por día y la cuarta se rechaza diciendo cuándo se reinicia', async () => {
    const store = new MemoryUsageStore(), now = at('2026-10-19T15:00:00Z');
    for (let i = 0; i < 3; i++) expect((await consume(store, 'u1', PLANS.free, now, TZ)).ok).toBe(true);
    const r = await consume(store, 'u1', PLANS.free, now, TZ);
    expect(r).toEqual({ ok: false, reason: 'daily', resetsOn: '2026-10-20' });
    expect((await consume(store, 'u1', PLANS.free, at('2026-10-20T15:00:00Z'), TZ)).ok).toBe(true);   // al otro día vuelve a andar
  });
  it('el rechazo no gasta cupo (se devuelve el descuento)', async () => {
    const store = new MemoryUsageStore(), now = at('2026-10-19T15:00:00Z');
    for (let i = 0; i < 6; i++) await consume(store, 'u1', PLANS.free, now, TZ);       // 3 válidas + 3 rechazadas
    expect(store.peek('u1:d:2026-10-19')).toBe(3);
  });
  it('el día es el del usuario (Argentina), no el de Google (medianoche del Pacífico) ni UTC', () => {
    expect(localDates(at('2026-10-19T02:30:00Z'), TZ).day).toBe('2026-10-18');           // 23:30 del 18 en Argentina
    expect(localDates(at('2026-10-19T03:30:00Z'), TZ).day).toBe('2026-10-19');
    expect(localDates(at('2026-12-31T12:00:00Z'), TZ).nextMonth).toBe('2027-01-01');
  });
  it('el límite mensual corta aunque el diario permita más', async () => {
    const store = new MemoryUsageStore(), plan: Plan = { ...PLANS.free, dailyLimit: 3, monthlyLimit: 5 };
    for (let i = 0; i < 3; i++) await consume(store, 'u', plan, at('2026-10-19T15:00:00Z'), TZ);
    for (let i = 0; i < 2; i++) expect((await consume(store, 'u', plan, at('2026-10-20T15:00:00Z'), TZ)).ok).toBe(true);
    expect(await consume(store, 'u', plan, at('2026-10-20T16:00:00Z'), TZ)).toEqual({ ok: false, reason: 'monthly', resetsOn: '2026-11-01' });
  });
  it('si la respuesta falla (cupo de Google, red), se devuelve la consulta', async () => {
    const store = new MemoryUsageStore(), now = at('2026-10-19T15:00:00Z');
    const r = await consume(store, 'u1', PLANS.free, now, TZ);
    expect(r.ok && r.remaining).toEqual({ day: 2, month: 89 });
    if (r.ok) await refund(store, r.ticket);
    expect(store.peek('u1:d:2026-10-19')).toBe(0);
    expect(store.peek('u1:m:2026-10')).toBe(0);
  });
  it('pedidos simultáneos no se cuelan: de 10 al mismo tiempo, solo 3 pasan', async () => {
    const store = new MemoryUsageStore(), now = at('2026-10-19T15:00:00Z');
    const rs = await Promise.all(Array.from({ length: 10 }, () => consume(store, 'u1', PLANS.free, now, TZ)));
    expect(rs.filter((r) => r.ok)).toHaveLength(3);
  });
  it('cada usuario tiene su propio cupo', async () => {
    const store = new MemoryUsageStore(), now = at('2026-10-19T15:00:00Z');
    for (let i = 0; i < 3; i++) await consume(store, 'a', PLANS.free, now, TZ);
    expect((await consume(store, 'a', PLANS.free, now, TZ)).ok).toBe(false);
    expect((await consume(store, 'b', PLANS.free, now, TZ)).ok).toBe(true);
  });
  it('el "análisis profundo" solo existe en los planes que lo incluyen y tiene su propio tope mensual', async () => {
    const store = new MemoryUsageStore(), now = at('2026-10-19T15:00:00Z');
    expect(await consume(store, 'u', PLANS.free, now, TZ, { deep: true })).toEqual({ ok: false, reason: 'no-deep', resetsOn: '' });
    const pro: Plan = { ...PLANS.pro, deepMonthlyLimit: 2 };
    expect((await consume(store, 'p', pro, now, TZ, { deep: true })).ok).toBe(true);
    expect((await consume(store, 'p', pro, now, TZ, { deep: true })).ok).toBe(true);
    expect((await consume(store, 'p', pro, now, TZ, { deep: true })).ok).toBe(false);
    expect((await consume(store, 'p', pro, now, TZ)).ok).toBe(true);                       // las consultas normales siguen
  });
  it('el plan gratis usa el modelo barato y el pro puede pedir el profundo', () => {
    expect(modelFor(PLANS.free)).toBe('gemini-3.5-flash-lite');
    expect(modelFor(PLANS.free, true)).toBe('gemini-3.5-flash-lite');
    expect(modelFor(PLANS.pro, true)).toBe('gemini-3.8-flash');
  });
});

describe('costo estimado con tokens reales', () => {
  const t = (input: number, output: number, thoughts = 0, cached = 0) => ({ input, output, thoughts, cached });
  it('usa los precios oficiales de 3.5 Flash-Lite (USD 0,30 entrada / 2,50 salida por millón)', () => {
    expect(estimateCostUSD('gemini-3.5-flash-lite', t(8475, 354))).toBeCloseTo(0.0034275, 6);
  });
  it('el razonamiento se cobra como salida y los tokens en caché cuestan menos', () => {
    expect(estimateCostUSD('gemini-3.5-flash-lite', t(1000, 100, 400))).toBeCloseTo((1000 * 0.3 + 500 * 2.5) / 1e6, 8);
    expect(estimateCostUSD('gemini-3.5-flash-lite', t(10000, 0, 0, 8000))).toBeCloseTo((2000 * 0.3 + 8000 * 0.03) / 1e6, 8);
  });
  it('3.8 Flash duplica su precio el 1 de enero de 2027, y un modelo desconocido no inventa un costo', () => {
    const antes = estimateCostUSD('gemini-3.8-flash', t(1e6, 1e6), at('2026-12-31T12:00:00Z'))!;
    const despues = estimateCostUSD('gemini-3.8-flash', t(1e6, 1e6), at('2027-01-01T12:00:00Z'))!;
    expect(antes).toBeCloseTo(0.75 + 3.75, 6);
    expect(despues).toBeCloseTo(2 * antes, 6);
    expect(estimateCostUSD('gemini-no-existe', t(1, 1))).toBeNull();
  });
});
