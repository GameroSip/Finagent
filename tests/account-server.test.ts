import { describe, expect, it } from 'vitest';
import { ADMIN, makeServer } from './helpers/make-server';

type S = Awaited<ReturnType<typeof makeServer>>;
const all = (s: S, q: string, ...p: unknown[]) => (s.store as any).sql.all(q, ...p) as Promise<any[]>;
const TABLES = ['users', 'turns', 'calls', 'interest', 'consent', 'events', 'feedback'];
const rowsOf = async (s: S, userId: string) => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await all(s, `SELECT * FROM ${t} WHERE ${t === 'users' ? 'id' : 'user_id'} = ?`, userId)).length])));

/** Una persona que usó TODO: consintió, mandó eventos, comentó, votó, y le consultó al asistente. */
async function usedEverything(s: S, device: string) {
  const se = await s.session('free', device);
  await s.call('POST', '/v1/consent', { token: se.token, body: { analytics: true } });
  await s.call('POST', '/v1/events', { token: se.token, body: { events: [{ n: 'plan_open', p: {} }, { n: 'screen', p: { name: 'markets' } }] } });
  await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'idea', text: 'una idea' } });
  await s.call('POST', '/v1/interest', { token: se.token, body: { feature: 'cartera' } });
  const g = await s.call('POST', '/v1/generate', { token: se.token, body: { contents: [{ role: 'user', parts: [{ text: 'hola' }] }], withTools: false } });
  return { se, generated: g.status };
}

describe('DELETE /v1/account: eliminar la cuenta y todos sus datos', () => {
  it('sin sesión: 401', async () => { const s = await makeServer(); expect((await s.call('DELETE', '/v1/account')).status).toBe(401); });
  it('borra TODO lo de esa persona en las 7 tablas, y no toca a nadie más', async () => {
    const s = await makeServer(), a = await usedEverything(s, 'tel-aaaaaaaa'), b = await usedEverything(s, 'tel-bbbbbbbb');
    expect(a.generated).toBe(200);
    const before = await rowsOf(s, a.se.userId);
    expect(before).toMatchObject({ users: 1, consent: 1, interest: 1, feedback: 1 }); expect(before.events).toBeGreaterThan(0); expect(before.turns + before.calls).toBeGreaterThan(0);
    const bBefore = await rowsOf(s, b.se.userId);
    const r = await s.call('DELETE', '/v1/account', { token: a.se.token });
    expect(r.status).toBe(200); expect(r.json).toEqual({ ok: true });
    for (const t of TABLES) expect((await rowsOf(s, a.se.userId))[t], t).toBe(0);
    expect(await rowsOf(s, b.se.userId)).toEqual(bBefore);                                  // la otra persona queda exactamente igual
  });
  it('la sesión deja de valer en el acto, y borrar dos veces no rompe nada', async () => {
    const s = await makeServer(), a = await s.session('free', 'tel-cccccccc');
    expect((await s.call('DELETE', '/v1/account', { token: a.token })).status).toBe(200);
    expect((await s.call('DELETE', '/v1/account', { token: a.token })).status).toBe(401);
    expect((await s.call('POST', '/v1/generate', { token: a.token, body: { contents: [] } })).status).toBe(401);
    expect((await s.call('POST', '/v1/events', { token: a.token, body: { events: [] } })).status).toBe(401);
  });
  it('el mismo teléfono puede volver a empezar desde cero (nueva cuenta, sin datos anteriores)', async () => {
    const s = await makeServer(), a = await usedEverything(s, 'tel-dddddddd');
    await s.call('DELETE', '/v1/account', { token: a.se.token });
    const again = await s.session('free', 'tel-dddddddd');
    expect(again.userId).not.toBe(a.se.userId); expect(await rowsOf(s, again.userId)).toMatchObject({ users: 1, events: 0, feedback: 0, consent: 0 });
  });
  it('el panel deja de contar a la persona eliminada', async () => {
    const s = await makeServer(), a = await usedEverything(s, 'tel-eeeeeeee'); await usedEverything(s, 'tel-ffffffff');
    expect((await s.call('GET', '/v1/admin/metrics', { token: ADMIN })).json.users.registered).toBe(2);
    await s.call('DELETE', '/v1/account', { token: a.se.token });
    const m = (await s.call('GET', '/v1/admin/metrics', { token: ADMIN })).json;
    expect(m.users.registered).toBe(1); expect(m.users.withData).toBe(1); expect(m.needs.features.find((f: any) => f.feature === 'cartera').votes).toBe(1);
  });
  it('la app (que corre en otro origen) puede pedirlo: el CORS permite DELETE', async () => {
    const s = await makeServer(), r = await s.call('OPTIONS', '/v1/account');
    expect(r.headers.get('access-control-allow-methods')).toMatch(/DELETE/);
  });
});

describe('comentario de tipo "reporte" (señalar una respuesta de la IA)', () => {
  it('se guarda con su texto, aparece en el panel por tipo, y sirve aunque la persona no haya aceptado las estadísticas', async () => {
    const s = await makeServer(), se = await s.session('free', 'tel-gggggggg');
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'reporte', text: 'Peligrosa o engañosa\n---\nRespuesta: comprá todo ya', version: '0.11.0' } })).status).toBe(200);
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'reporte' } })).status).toBe(400);               // sin texto no hay reporte
    const m = (await s.call('GET', '/v1/admin/metrics', { token: ADMIN })).json;
    expect(m.feedback.byKind.reporte).toBe(1); expect(m.feedback.latest[0]).toMatchObject({ kind: 'reporte' }); expect(m.feedback.latest[0].text).toContain('comprá todo ya');
  });
});

describe('tope de cuentas nuevas por dirección IP', () => {
  const ipHdr = { 'cf-connecting-ip': '200.1.2.3' };
  it('por defecto 5 por día; se puede subir desde la configuración (una operadora móvil comparte IP entre muchos clientes)', async () => {
    const small = await makeServer();
    const got: number[] = []; for (let i = 0; i < 7; i++) got.push((await small.device(`telefono-${i}-xxxxx`, ipHdr)).status);
    expect(got.filter((x) => x === 200)).toHaveLength(5); expect(got.slice(5)).toEqual([429, 429]);
    const big = await makeServer({ env: { NEW_ACCOUNTS_PER_IP_DAY: '30' } as any });
    const got2: number[] = []; for (let i = 0; i < 12; i++) got2.push((await big.device(`telefono-${i}-yyyyy`, ipHdr)).status);
    expect(got2.every((x) => x === 200)).toBe(true);
  });
});
