import { beforeEach, describe, expect, it, vi } from 'vitest';

const srv = vi.hoisted(() => ({ on: true, consent: vi.fn(async (_on: boolean) => {}), events: vi.fn(async (b: Array<{ n: string }>) => ({ accepted: b.length, dropped: 0, consent: true })) }));
vi.mock('../src/server', () => ({ isServerMode: () => srv.on, sendConsent: srv.consent, sendEvents: srv.events }));

const mem = new Map<string, string>();
const load = async () => { vi.resetModules(); return await import('../src/analytics'); };
const queue = () => JSON.parse(mem.get('finagent.evq.v1') ?? '[]') as Array<{ n: string; p: Record<string, unknown> }>;

beforeEach(() => {
  mem.clear(); srv.on = true; srv.consent.mockClear(); srv.events.mockClear();
  srv.consent.mockImplementation(async () => {}); srv.events.mockImplementation(async (b: Array<{ n: string }>) => ({ accepted: b.length, dropped: 0, consent: true }));
  (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  vi.useFakeTimers();
});

describe('estadísticas de la app: consentimiento', () => {
  it('sin servidor (desarrollo) nunca registra nada, aunque haya un consentimiento guardado', async () => {
    srv.on = false; mem.set('finagent.analytics.v1', '1');
    const a = await load(); a.track('plan_open');
    expect(a.analyticsOn()).toBe(false); expect(queue()).toHaveLength(0);
  });
  it('sin decisión no registra nada; "no" tampoco; solo "sí" abre el registro', async () => {
    const a = await load();
    a.track('plan_open'); expect(a.hasDecided()).toBe(false); expect(queue()).toHaveLength(0);
    await a.setAnalytics(false); a.track('plan_open'); expect(a.hasDecided()).toBe(true); expect(a.analyticsOn()).toBe(false); expect(queue()).toHaveLength(0);
    await a.setAnalytics(true); a.track('plan_open'); expect(a.analyticsOn()).toBe(true); expect(queue()).toHaveLength(1);
  });
  it('aceptar o rechazar se le comunica al servidor, y apagar BORRA todo lo que estaba pendiente', async () => {
    const a = await load(); await a.setAnalytics(true);
    a.track('plan_open'); a.track('screen', { name: 'markets' }); expect(queue()).toHaveLength(2);
    await a.setAnalytics(false);
    expect(srv.consent.mock.calls.map((c) => c[0])).toEqual([true, false]); expect(queue()).toHaveLength(0); a.track('plan_open'); expect(queue()).toHaveLength(0);
  });
  it('si no hay conexión al decidir, el consentimiento se reenvía antes de los eventos (el servidor lo exige)', async () => {
    srv.consent.mockRejectedValueOnce(new Error('sin red'));
    const a = await load(); await a.setAnalytics(true); a.track('plan_open');
    const order: string[] = []; srv.consent.mockImplementation(async () => { order.push('consent'); }); srv.events.mockImplementation(async (b: Array<{ n: string }>) => { order.push('events'); return { accepted: b.length, dropped: 0, consent: true }; });
    await a.flush(); expect(order).toEqual(['consent', 'events']); expect(queue()).toHaveLength(0);
  });
  it('si el servidor responde que no tiene el consentimiento, se lo reenvía una vez y se reintenta', async () => {
    const a = await load(); await a.setAnalytics(true); a.track('plan_open'); srv.consent.mockClear();
    srv.events.mockImplementationOnce(async () => ({ accepted: 0, dropped: 1, consent: false }));
    await a.flush(); expect(srv.consent).toHaveBeenCalledWith(true); expect(srv.events).toHaveBeenCalledTimes(2); expect(queue()).toHaveLength(0);
  });
});

describe('estadísticas de la app: qué se registra y cómo se envía', () => {
  it('solo valores del vocabulario: lo inválido se descarta en el teléfono y las claves de más se ignoran', async () => {
    const a = await load(); await a.setAnalytics(true);
    a.track('asset_open', { sym: 'AAPL', group: 'acciones', from: 'market' }); a.track('asset_open', { sym: 'AAPL', group: 'inventado', from: 'market' });
    a.track('ai_send', { src: 'typed', chat: 'new', len: 's', text: 'mi plan es vender todo', prompt: 'hola' } as any);
    a.track('evento_que_no_existe' as any);
    const q = queue(); expect(q.map((x) => x.n)).toEqual(['asset_open', 'ai_send']);
    expect(JSON.stringify(q)).not.toContain('vender'); expect(JSON.stringify(q)).not.toContain('hola'); expect(q[1].p).toEqual({ src: 'typed', chat: 'new', len: 's' });
  });
  it('envía en lotes de 40, en orden, y vacía la cola', async () => {
    const a = await load(); await a.setAnalytics(true);
    for (let i = 0; i < 95; i++) a.track('tour_slide', { n: (i % 7) + 1 });
    await a.flush(); expect(srv.events.mock.calls.map((c) => c[0].length)).toEqual([40, 40, 15]); expect(queue()).toHaveLength(0);
  });
  it('si falla el envío, no pierde nada (hasta 200) y reintenta después', async () => {
    const a = await load(); await a.setAnalytics(true);
    for (let i = 0; i < 3; i++) a.track('plan_open');
    srv.events.mockRejectedValueOnce(new Error('sin red')); await a.flush(); expect(queue()).toHaveLength(3);
    await a.flush(); expect(queue()).toHaveLength(0);
  });
  it('la cola está acotada: con 250 eventos sin conexión quedan los 200 más recientes', async () => {
    const a = await load(); await a.setAnalytics(true); srv.events.mockRejectedValue(new Error('sin red'));
    for (let i = 0; i < 250; i++) a.track('tour_slide', { n: (i % 7) + 1 });
    expect(queue()).toHaveLength(200);
  });
  it('la apertura de la app informa versión, idioma, tema y sonido (y nada más)', async () => {
    const a = await load(); await a.setAnalytics(true); a.trackAppOpen();
    const e = queue()[0]; expect(e.n).toBe('app_open'); expect(Object.keys(e.p).sort()).toEqual(['lang', 'sound', 'theme', 'v']); expect(String(e.p.v)).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
