import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinancialAgent } from '../src/agent';
import { setHttp, type HttpRequest } from '../src/http';
import { ModelManager } from '../src/models';
import { clearCache } from '../src/tools';
import { AccessDeniedError, busyMessage, deviceId, ensureSession, fetchMe, forgetDevice, fetchPlans, getInterests, getSession, hasSession, isCodeShape, LimitError, limitMessage, normalizeCode, PlanCodeError,
  planCodeMessage, quotaInfo, redeemPlanCode, registerDevice, resetLabel, sendInterest, ServerBusyError, ServerTransport, setApiBase, signOut } from '../src/server';
import { fetchServerFlags, GoogleError, googleAvailable, googleMessage, registerGoogleProvider, signInWithGoogle } from '../src/server';
import { frozenHttp } from '../evals/frozen-data';
import { ADMIN, makeServer } from './helpers/make-server';

type Srv = Awaited<ReturnType<typeof makeServer>>;

/** La app habla con "https://api.test" y ese pedido lo atiende el servidor real de FinAgent (en memoria); el resto, los datos congelados. */
function bridge(s: Srv, opts: { down?: boolean } = {}) {
  setHttp(async (req: HttpRequest) => {
    const u = new URL(req.url);
    if (u.host !== 'api.test') return frozenHttp(req);
    if (opts.down) throw new Error('sin conexión');
    const res = await s.app(new Request(req.url, { method: req.method ?? 'GET', headers: req.headers, body: req.body !== undefined ? JSON.stringify(req.body) : undefined }));
    return { status: res.status, headers: {}, text: await res.text() };
  });
}
const newAgent = () => new FinancialAgent({ apiKey: '', models: new ModelManager(), transport: new ServerTransport() });
const settle = () => new Promise((r) => setTimeout(r, 25));
const ASK = '¿A cuánto cotiza Apple hoy?';
const quota429 = { status: 429, text: JSON.stringify({ error: { message: 'quota', details: [{ retryDelay: '30s' }] } }) };

beforeEach(() => { setApiBase('https://api.test'); signOut(); clearCache(); });
afterEach(() => { setHttp(); setApiBase(''); });

describe('la app contra el servidor: se abre y funciona, sin códigos ni claves', () => {
  it('la cuenta se crea sola, la respuesta sale con cifras verificadas y se ve el plan, el modelo y cuántas conversaciones quedan', async () => {
    const s = await makeServer(); bridge(s);
    expect(hasSession()).toBe(false);
    const session = await ensureSession();                               // lo único que hace la app al abrirse
    expect(hasSession()).toBe(true);
    expect(session.plan).toMatchObject({ id: 'free', label: 'Gratis', modelLabel: 'Gemini 3.5 Flash-Lite', dailyLimit: 3 });
    expect(quotaInfo().tier).toBe('free');
    const r = await newAgent().ask(ASK);
    expect(r.answer).toMatch(/343\.46/);
    expect(r.verification.ok).toBe(true);
    expect(r.redacted).toBe(0);
    expect(r.stats.modelCalls).toBe(2);
    expect(r.stats.tokens.input).toBeGreaterThan(0);
    expect(r.model).toBe('gemini-3.5-flash-lite');                     // el modelo fijo del plan
    expect(quotaInfo().remaining).toEqual({ day: 2, month: 89 });       // dos pedidos al modelo = UNA conversación
    expect((await fetchMe()).remaining).toEqual({ day: 2, month: 89 });
  });
  it('pedir la sesión varias veces a la vez crea una sola cuenta', async () => {
    const s = await makeServer(); bridge(s);
    await Promise.all([ensureSession(), ensureSession(), ensureSession()]);
    expect(await s.store.usersByPlan()).toEqual({ free: 1 });
  });
  it('el plan gratis permite 3 conversaciones por día; la cuarta explica qué pasó, cuándo vuelve y qué ofrece el plan de pago', async () => {
    const s = await makeServer(); bridge(s);
    const agent = newAgent();
    for (let i = 0; i < 3; i++) await agent.ask(ASK);
    const err = await agent.ask(ASK).catch((e) => e);
    expect(err).toBeInstanceOf(LimitError);
    expect(err.reason).toBe('daily'); expect(err.resetsOn).toBe('2026-10-20');
    const msg = limitMessage(err, new Date('2026-10-19T15:00:00'));
    expect(msg).toContain('Usaste las 3 conversaciones de hoy de tu plan Gratis');
    expect(msg).toContain('mañana a las 00:00');
    expect(msg).toContain('Mercados');
    expect(msg).toContain('planes de pago (próximamente)');
    expect(quotaInfo().remaining?.day).toBe(0);
    s.setNow('2026-10-20T15:00:00Z');
    expect((await agent.ask(ASK)).answer).toMatch(/343\.46/);
  });
  it('si la sesión venció en el servidor, la app la renueva sola (misma cuenta, mismo cupo) y la persona ni se entera', async () => {
    const s = await makeServer(); bridge(s);
    await newAgent().ask(ASK);                                           // 1 de 3 usada
    s.advance(100 * 86_400_000);                                         // pasan 100 días: la sesión de 90 días venció
    const r = await newAgent().ask(ASK);
    expect(r.answer).toMatch(/343\.46/);
    expect(await s.store.usersByPlan()).toEqual({ free: 1 });            // sigue siendo UNA cuenta: no se regaló otro cupo gratis
    expect(deviceId()).toBe(deviceId());
  });
  it('si le desactivan el acceso, la app lo dice claramente (y no vuelve a crear otra cuenta)', async () => {
    const s = await makeServer(); bridge(s);
    await ensureSession();
    const u = await s.store.findUser('device', deviceId());
    await s.call('POST', '/v1/admin/users', { token: ADMIN, body: { userId: u!.id, disabled: true } });
    const err = await newAgent().ask(ASK).catch((e) => e);
    expect(err).toBeInstanceOf(AccessDeniedError);
    expect(hasSession()).toBe(false);
    expect(await s.store.usersByPlan()).toEqual({ free: 1 });
  });
  it('sin conexión muestra un mensaje claro; no hay "reintentando" disfrazado', async () => {
    const s = await makeServer(); bridge(s, { down: true });
    const err = await ensureSession().catch((e) => e);
    expect(err).toBeInstanceOf(ServerBusyError); expect(err.kind).toBe('network');
    expect(busyMessage(err)).toContain('conexión');
    expect(busyMessage(err)).not.toMatch(/reintentando/i);
  });
});

describe('capacidad: explica qué pasó en vez de "Mucha demanda, reintentando…"', () => {
  it('cupo por minuto de Gemini agotado: dice que hay mucha demanda, cuánto esperar y que no se descontó la conversación', async () => {
    const s = await makeServer({ gemini: async () => quota429 }); bridge(s);
    const err = await newAgent().ask(ASK).catch((e) => e);
    expect(err).toBeInstanceOf(ServerBusyError);
    expect(err).toMatchObject({ kind: 'capacity', scope: 'minute', retryAfterSec: 30, tier: 'free' });
    const m = busyMessage(err);
    expect(m).toContain('Hay mucha demanda en este momento');
    expect(m).toContain('cupo gratuito compartido');                    // la causa real, dicha con honestidad
    expect(m).toContain('30 segundos');
    expect(m).toContain('no se descontó');
    expect(m).not.toMatch(/reintentando/i);
    expect((await fetchMe()).remaining?.day).toBe(3);                    // la conversación no se descontó
  });
  it('capacidad del día agotada: avisa que se reinicia más tarde y que los planes de pago tendrán capacidad reservada', async () => {
    const s = await makeServer({ env: { GLOBAL_DAILY_ANSWERS: '0' } }); bridge(s);
    const err = await newAgent().ask(ASK).catch((e) => e);
    expect(err).toMatchObject({ kind: 'capacity', scope: 'day' });
    const m = busyMessage(err);
    expect(m).toContain('Hoy se agotó la capacidad gratuita de FinAgent');
    expect(m).toContain('no se descontó');
    expect(m).toContain('capacidad reservada');
  });
  it('cuando el servidor usa el nivel de pago, el mensaje no habla de "cupo gratuito"', () => {
    const e = new ServerBusyError('capacity', 20, 'minute', 'paid');
    expect(busyMessage(e)).toContain('Hay mucha demanda en este momento');
    expect(busyMessage(e)).not.toContain('gratuito');
  });
  it('si la respuesta se corta a mitad de camino, la conversación se devuelve sola', async () => {
    let n = 0;
    const s = await makeServer({ gemini: async () => (n++ === 0
      ? { status: 200, text: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'calculate', args: { expression: '1+1' } } }] } }] }) }
      : { status: 503, text: JSON.stringify({ error: { message: 'overloaded' } }) }) });
    bridge(s);
    const err = await newAgent().ask('cuánto es 1+1').catch((e) => e);
    expect(err).toBeInstanceOf(ServerBusyError);
    expect(busyMessage(err)).toContain('no se descontó');
    await settle();
    expect(quotaInfo().remaining?.day).toBe(3);
    expect((await fetchMe()).remaining?.day).toBe(3);
  });
  it('si la IA inventa una cifra, nunca se muestra (el verificador sigue en el teléfono)', async () => {
    let n = 0;
    const s = await makeServer({ gemini: async () => ({ status: 200, text: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: n++ < 2 ? 'Apple rinde 24.572% anual.' : 'No tengo ese dato.' }] } }] }) }) });
    bridge(s);
    const r = await newAgent().ask('¿cuánto rinde Apple?');
    expect(r.verification.ok).toBe(true);
    expect(r.answer).not.toContain('24.572');
  });
});

describe('planes: lo que ve la persona', () => {
  it('el catálogo muestra el plan gratis disponible y los de pago como próximamente, con modelo y conversaciones por día', async () => {
    const s = await makeServer(); bridge(s);
    const { tier, plans } = await fetchPlans();
    expect(tier).toBe('free');
    expect(plans.find((p) => p.id === 'free')).toMatchObject({ available: true, modelLabel: 'Gemini 3.5 Flash-Lite', dailyLimit: 3 });
    const paid = plans.filter((p) => !p.available);
    expect(paid.map((p) => [p.id, p.modelLabel, p.dailyLimit])).toEqual([['plus', 'Gemini 3.8 Flash', 10], ['pro', 'Gemini 3.8 Flash', 30]]);
    expect(paid[1].deepModelLabel).toBe('Gemini 3.1 Pro');
  });
  it('"Avisame" anota el interés en el servidor y lo recuerda en el teléfono', async () => {
    const s = await makeServer(); bridge(s);
    expect(getInterests()).toEqual([]);
    await sendInterest('plus');
    expect(getInterests()).toEqual(['plus']);
    expect((await s.call('GET', '/v1/admin/usage', { token: ADMIN })).json.interest).toEqual({ plus: 1 });
  });
  it('un código de plan desbloquea un plan más potente; los errores se explican', async () => {
    const s = await makeServer(); bridge(s);
    const [code, code2] = await s.invite('plus', 2, 1);
    const r = await redeemPlanCode(code.toLowerCase());
    expect(r).toMatchObject({ unchanged: false, plan: { id: 'plus', modelLabel: 'Gemini 3.8 Flash', dailyLimit: 10 } });
    await settle();
    expect(quotaInfo().plan?.id).toBe('plus');
    expect(quotaInfo().remaining?.day).toBe(10);
    expect((await redeemPlanCode(code)).unchanged).toBe(true);
    const bad = await redeemPlanCode('FA-ZZZZ-ZZZZ').catch((e) => e);
    expect(bad).toBeInstanceOf(PlanCodeError); expect(bad.code).toBe('code');
    expect(planCodeMessage(bad)).toContain('no es válido');
    forgetDevice(); signOut();                                            // OTRO teléfono (o la app reinstalada): cuenta nueva
    const used = await redeemPlanCode(code).catch((e) => e);              // el código era de 1 solo uso y ya se gastó
    expect(used).toBeInstanceOf(PlanCodeError); expect(used.code).toBe('used');
    expect(planCodeMessage(used)).toContain('máximo de veces');
    expect((await redeemPlanCode(code2)).unchanged).toBe(false);          // y otro código distinto sí funciona
    expect(await s.store.usersByPlan()).toEqual({ plus: 2 });
  });
  it('el código se escribe como quiera la persona', () => {
    expect(normalizeCode('fak7p29xqm')).toBe('FA-K7P2-9XQM');
    expect(normalizeCode(' FA-K7P2-9XQM ')).toBe('FA-K7P2-9XQM');
    expect(isCodeShape('FA-K7P2-9XQM')).toBe(true);
    expect(isCodeShape('hola')).toBe(false);
  });
  it('el identificador del teléfono sobrevive a "cerrar sesión": no se crea otra cuenta (ni otro cupo gratis)', async () => {
    const s = await makeServer(); bridge(s);
    const id1 = deviceId();
    await registerDevice();
    signOut();
    expect(getSession()).toBeNull();
    expect(deviceId()).toBe(id1);
    await registerDevice();
    expect(await s.store.usersByPlan()).toEqual({ free: 1 });
  });
  it('las fechas de reinicio se dicen en lenguaje natural', () => {
    expect(resetLabel('2026-10-20', new Date('2026-10-19T15:00:00'))).toBe('mañana a las 00:00');
    expect(resetLabel('2026-11-01', new Date('2026-10-19T15:00:00'))).toBe('el 01/11');
    expect(resetLabel('basura')).toBe('más tarde');
  });
});


describe('inicio de sesión con Google desde la app', () => {
  const b64u = (b: ArrayBuffer | string) => Buffer.from(typeof b === 'string' ? b : new Uint8Array(b)).toString('base64url');
  async function kit() {
    const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey), keys = [{ kid: 'k1', n: jwk.n!, e: jwk.e!, kty: 'RSA' }];
    const nowSec = Date.parse('2026-10-19T15:00:00Z') / 1000;
    const token = async (aud = 'cid-app') => { const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1' })), p = b64u(JSON.stringify({ iss: 'accounts.google.com', aud, sub: '777', exp: nowSec + 3600, iat: nowSec })); return `${h}.${p}.${b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${h}.${p}`)))}`; };
    return { jwks: async () => keys, token };
  }
  afterEach(() => registerGoogleProvider(null));
  it('el botón de Google solo está disponible si hay proveedor en el teléfono Y el servidor lo habilitó', async () => {
    const k = await kit(), on = await makeServer({ env: { GOOGLE_CLIENT_ID: 'cid-app' }, jwks: k.jwks }), off = await makeServer();
    bridge(off); await fetchServerFlags(); registerGoogleProvider(async () => 'x');
    expect(googleAvailable()).toBe(false);
    bridge(on); await fetchServerFlags();
    expect(googleAvailable()).toBe(true);
    registerGoogleProvider(null);
    expect(googleAvailable()).toBe(false);
    await expect(signInWithGoogle()).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('un invitado con plan y uso inicia sesión con Google y lo conserva todo', async () => {
    const k = await kit(), s = await makeServer({ env: { GOOGLE_CLIENT_ID: 'cid-app' }, jwks: k.jwks }); bridge(s);
    await ensureSession();
    await newAgent().ask(ASK);
    registerGoogleProvider(async () => k.token());
    const g = await signInWithGoogle();
    expect(g.plan.id).toBe('free');
    await settle();
    expect((await fetchMe()).remaining?.day).toBe(2);
    expect(await s.store.usersByPlan()).toEqual({});
  });
  it('los fallos se explican: cancelado, token inválido, cuenta desactivada', async () => {
    const k = await kit(), s = await makeServer({ env: { GOOGLE_CLIENT_ID: 'cid-app' }, jwks: k.jwks }); bridge(s);
    registerGoogleProvider(async () => { throw new Error('usuario canceló'); });
    const c = await signInWithGoogle().catch((e) => e);
    expect(c).toBeInstanceOf(GoogleError); expect(c.code).toBe('cancelled'); expect(googleMessage(c)).toContain('Cancelaste');
    registerGoogleProvider(async () => k.token('otra-app'));
    const bad = await signInWithGoogle().catch((e) => e);
    expect(bad.code).toBe('token'); expect(googleMessage(bad)).toContain('no pudo verificar');
    registerGoogleProvider(async () => k.token());
    const ok = await signInWithGoogle();
    const uid = JSON.parse(Buffer.from(ok.token.split('.')[1], 'base64url').toString()).sub;
    await s.call('POST', '/v1/admin/users', { token: ADMIN, body: { userId: uid, disabled: true } });
    await expect(signInWithGoogle()).rejects.toBeInstanceOf(AccessDeniedError);
  });
});
