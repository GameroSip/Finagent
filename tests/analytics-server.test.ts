import { describe, expect, it } from 'vitest';
import { addDays, computeMetrics, prop, type RawMetrics } from '../server/metrics';
import { AI_TOOLS, cleanEvent, EVENT_NAMES, EVENTS, FEATURES, missQuery, lenBucket, planLen } from '../src/telemetry';
import { ADMIN, makeServer } from './helpers/make-server';

const ev = (n: string, p: Record<string, unknown> = {}, t?: number) => ({ n, p, ...(t !== undefined ? { t } : {}) });
async function userWithConsent(s: Awaited<ReturnType<typeof makeServer>>, device = 'telefono-0001', on = true) {
  const se = await s.session('free', device);
  await s.call('POST', '/v1/consent', { token: se.token, body: { analytics: on } });
  return se;
}
const send = (s: Awaited<ReturnType<typeof makeServer>>, token: string, events: unknown[]) => s.call('POST', '/v1/events', { token, body: { events } });
const rowsOf = async (s: Awaited<ReturnType<typeof makeServer>>) => (await (s.store as any).sql.all('SELECT * FROM events ORDER BY id')) as Array<{ user_id: string; day: string; name: string; props: string | null; ts: number }>;

describe('vocabulario cerrado de eventos', () => {
  it('acepta valores válidos de cada regla y rechaza los inválidos', () => {
    expect(cleanEvent('asset_open', { sym: 'AAPL', group: 'acciones', from: 'search' })).toEqual({ sym: 'AAPL', group: 'acciones', from: 'search' });
    expect(cleanEvent('asset_open', { sym: 'aapl', group: 'acciones', from: 'search' })).toBeNull();                     // minúsculas: no es un símbolo
    expect(cleanEvent('asset_open', { sym: 'ESTO ES UNA FRASE', group: 'acciones', from: 'search' })).toBeNull();
    expect(cleanEvent('asset_open', { sym: 'BTC-USD', group: 'invento', from: 'search' })).toBeNull();
    expect(cleanEvent('tour_slide', { n: 7 })).toEqual({ n: 7 }); expect(cleanEvent('tour_slide', { n: 8 })).toBeNull(); expect(cleanEvent('tour_slide', { n: 2.5 })).toBeNull(); expect(cleanEvent('tour_slide', { n: '3' })).toBeNull();
    expect(cleanEvent('ai_done', { tools: 'get_quote,get_news', ms: 4200, steps: 3, checked: 5, unverified: 0, fixed: false })).toBeTruthy();
    expect(cleanEvent('ai_done', { tools: 'get_quote,herramienta_inventada' })).toBeNull(); expect(cleanEvent('ai_done', { tools: AI_TOOLS.join(',') })).toBeTruthy(); expect(cleanEvent('ai_done', { tools: '' })).toEqual({ tools: '' });
    expect(cleanEvent('ai_done', { ms: -5 })).toBeNull(); expect(cleanEvent('ai_done', { ms: 99999999 })).toBeNull();
    expect(cleanEvent('app_open', { v: '0.10.0', lang: 'es', theme: 'dark', sound: true })).toBeTruthy(); expect(cleanEvent('app_open', { v: '1.0.0-beta; DROP TABLE' })).toBeNull();
  });
  it('un evento desconocido no pasa, y las claves que no están en la lista se ignoran (nunca se guardan)', () => {
    expect(cleanEvent('hackeo', {})).toBeNull(); expect(cleanEvent(undefined, {})).toBeNull(); expect(cleanEvent('__proto__', {})).toBeNull(); expect(cleanEvent('constructor', {})).toBeNull();
    expect(cleanEvent('ai_send', { src: 'typed', chat: 'new', len: 's', text: '¿Cuánto vale Apple? Mi plan es vender todo', email: 'a@b.com' })).toEqual({ src: 'typed', chat: 'new', len: 's' });
    expect(cleanEvent('plan_open', { texto: 'x' })).toEqual({});
  });
  it('NINGÚN evento admite un campo de texto libre: cada regla es una lista, un número acotado o un patrón estricto', () => {
    for (const name of EVENT_NAMES) for (const [k, rule] of Object.entries(EVENTS[name])) {
      const free = rule instanceof RegExp ? /\.\*|\.\+|\\S\*|\\S\+|\[\^/.test(rule.source) : false;                                       // patrones abiertos
      expect(free, `${name}.${k} permite texto libre`).toBe(false);
      if (rule instanceof RegExp) expect(rule.source).toMatch(/\{\d+,\d+\}|\\d/);                                                   // todo patrón tiene largo máximo
    }
    for (const bad of ['hola como estas', 'a'.repeat(30), 'Apple Inc', 'quiero vender todo']) expect(cleanEvent('search_miss', { q: bad })).toBeNull();
    expect(cleanEvent('search_miss', { q: 'pepe24478-usd' })).toEqual({ q: 'pepe24478-usd' });
  });
  it('los tamaños de texto se informan en tres escalones y nunca con la cantidad exacta', () => {
    expect([10, 40, 41, 160, 161, 900].map(lenBucket)).toEqual(['s', 's', 'm', 'm', 'l', 'l']); expect([5, 80, 81, 250, 251].map(planLen)).toEqual(['corto', 'corto', 'medio', 'medio', 'largo']);
    expect(missQuery('  PEPE ')).toBe('pepe'); expect(missQuery('dos palabras')).toBeNull(); expect(missQuery('')).toBeNull();
    expect(FEATURES).toContain('cartera');
  });
});

describe('POST /v1/events: consentimiento, validación y límites', () => {
  it('sin sesión: 401; sin consentimiento guardado en el servidor: no se guarda NADA aunque la app lo mande', async () => {
    const s = await makeServer();
    expect((await s.call('POST', '/v1/events', { body: { events: [ev('plan_open')] } })).status).toBe(401);
    const se = await s.session();
    const r = await send(s, se.token, [ev('plan_open'), ev('screen', { name: 'markets' })]);
    expect(r.json).toEqual({ accepted: 0, dropped: 2, consent: false }); expect(await rowsOf(s)).toHaveLength(0);
  });
  it('con consentimiento se guardan solo los válidos; revocar el consentimiento corta todo de inmediato', async () => {
    const s = await makeServer(), se = await userWithConsent(s);
    const r = await send(s, se.token, [ev('screen', { name: 'markets' }), ev('hackeo'), ev('asset_open', { sym: 'AAPL', group: 'acciones', from: 'market' }), ev('screen', { name: 'no-existe' })]);
    expect(r.json).toEqual({ accepted: 2, dropped: 2, consent: true }); expect((await rowsOf(s)).map((x) => x.name)).toEqual(['screen', 'asset_open']);
    await s.call('POST', '/v1/consent', { token: se.token, body: { analytics: false } });
    expect((await send(s, se.token, [ev('plan_open')])).json).toMatchObject({ accepted: 0, consent: false }); expect(await rowsOf(s)).toHaveLength(2);
    await s.call('POST', '/v1/consent', { token: se.token, body: { analytics: true } });
    expect((await send(s, se.token, [ev('plan_open')])).json.accepted).toBe(1);
  });
  it('el texto que alguien intente colar NO queda guardado en ningún lado de la base', async () => {
    const s = await makeServer(), se = await userWithConsent(s), SECRETO = 'mi plan es vender todo el viernes';
    await send(s, se.token, [ev('ai_send', { src: 'typed', chat: 'new', len: 'm', text: SECRETO, query: SECRETO }), ev('plan_saved', { len: 'corto', plan: SECRETO }), ev('search_miss', { q: SECRETO }), ev('setting', { key: 'lang', value: SECRETO })]);
    const all = JSON.stringify(await rowsOf(s)) + JSON.stringify(await (s.store as any).sql.all('SELECT * FROM feedback')) + JSON.stringify(await (s.store as any).sql.all('SELECT * FROM turns'));
    expect(all).not.toContain('vender'); expect(all).not.toContain('viernes'); expect((await rowsOf(s)).map((x) => x.name)).toEqual(['ai_send', 'plan_saved']);
    expect((await rowsOf(s))[0].props).toBe(JSON.stringify({ src: 'typed', chat: 'new', len: 'm' }));
  });
  it('un lote de 40 eventos usa pocas consultas a la base (el plan gratuito de Cloudflare limita las consultas por pedido) y nunca más de 100 parámetros por consulta', async () => {
    const s = await makeServer(), se = await userWithConsent(s), sql = (s.store as any).sql, log: number[] = [];
    const run = sql.run.bind(sql), all = sql.all.bind(sql);
    let total = 0; sql.run = (q: string, ...p: unknown[]) => { total++; log.push(p.length); return run(q, ...p); }; sql.all = (q: string, ...p: unknown[]) => { total++; log.push(p.length); return all(q, ...p); };
    const r = await send(s, se.token, Array.from({ length: 40 }, (_, i) => ev('asset_open', { sym: 'AAPL', group: 'acciones', from: i % 2 ? 'market' : 'search' })));
    expect(r.json.accepted).toBe(40); expect(total).toBeLessThanOrEqual(10); expect(Math.max(...log)).toBeLessThanOrEqual(100);
    expect((await rowsOf(s))).toHaveLength(40);
  });
  it('máximo 40 eventos por envío y 90 envíos por hora', async () => {
    const s = await makeServer(), se = await userWithConsent(s);
    expect((await send(s, se.token, Array.from({ length: 55 }, () => ev('plan_open')))).json).toMatchObject({ accepted: 40, dropped: 15 });
    let last = 0; for (let i = 0; i < 95; i++) last = (await send(s, se.token, [ev('plan_open')])).status;
    expect(last).toBe(429);
    s.advance(3_700_000); expect((await send(s, se.token, [ev('plan_open')])).status).toBe(200);
  });
  it('las fechas: un evento del futuro se acota a "ahora", uno guardado hasta una semana atrás conserva su día, y uno más viejo se cuenta como de hoy', async () => {
    const s = await makeServer(), se = await userWithConsent(s), now = Date.parse('2026-10-19T15:00:00Z');
    await send(s, se.token, [ev('plan_open', {}, now + 5 * 86400_000), ev('plan_open', {}, now - 3 * 86400_000), ev('plan_open', {}, now - 20 * 86400_000), ev('plan_open', {}, NaN as any), ev('plan_open')]);
    expect((await rowsOf(s)).map((r) => r.day)).toEqual(['2026-10-19', '2026-10-16', '2026-10-19', '2026-10-19', '2026-10-19']);
  });
});

describe('POST /v1/feedback', () => {
  it('guarda solo lo que la persona decide escribir, valida el tipo y el puntaje, acota el largo y limita la frecuencia', async () => {
    const s = await makeServer(), se = await s.session();
    expect((await s.call('POST', '/v1/feedback', { body: { kind: 'idea', text: 'x' } })).status).toBe(401);
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'insulto', text: 'x' } })).status).toBe(400);
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'idea' } })).status).toBe(400);
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'nps', text: 'sin puntaje' } })).status).toBe(400);
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'nps', score: 11 } })).status).toBe(400);
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'idea', text: 'q'.repeat(5000), version: '0.10.0' } })).status).toBe(200);
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'nps', score: 9, version: 'raro; DROP' } })).status).toBe(200);
    const rows = await (s.store as any).sql.all('SELECT * FROM feedback ORDER BY id');
    expect(rows).toHaveLength(2); expect(rows[0].text.length).toBe(1000); expect(rows[0].version).toBe('0.10.0'); expect(rows[1].version).toBeNull(); expect(rows[1].score).toBe(9);
    let st = 200; for (let i = 0; i < 25; i++) st = (await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'idea', text: 'a' } })).status; expect(st).toBe(429);
  });
  it('el comentario se guarda aunque la persona no haya aceptado las estadísticas (es un envío voluntario)', async () => {
    const s = await makeServer(), se = await userWithConsent(s, 'tel-sin-consent', false);
    expect((await s.call('POST', '/v1/feedback', { token: se.token, body: { kind: 'problema', text: 'no carga' } })).status).toBe(200);
  });
});

describe('métricas: retención y uso, con casos armados a mano', () => {
  const raw = (o: Partial<RawMetrics> = {}): RawMetrics => ({ users: 6, consentYes: 5, consentNo: 1, activity: [], firstDay: [], byName: [], rows: [], feedback: [], ...o });
  const act = (user_id: string, days: string[]) => days.map((day) => ({ user_id, day, n: 3 }));
  const TODAY = '2026-10-30';
  it('D1, D7 y semana 2: solo cuentan los usuarios con edad suficiente, y cada tasa trae su base y su intervalo', () => {
    // E y F empezaron el 10-12 (18 días atrás: elegibles para D1, D7 y semana 2). A y B, el 10-20 (10 días: D1 y D7). C, el 10-28 (solo D1). D, hoy (nada).
    const m = computeMetrics(raw({
      firstDay: [{ user_id: 'E', day: '2026-10-12' }, { user_id: 'F', day: '2026-10-12' }, { user_id: 'A', day: '2026-10-20' }, { user_id: 'B', day: '2026-10-20' }, { user_id: 'C', day: '2026-10-28' }, { user_id: 'D', day: TODAY }],
      activity: [...act('E', ['2026-10-12', '2026-10-20']), ...act('F', ['2026-10-12', '2026-10-26']), ...act('A', ['2026-10-20', '2026-10-21', '2026-10-27', '2026-10-30']), ...act('B', ['2026-10-20', '2026-10-29']), ...act('C', ['2026-10-28', '2026-10-29']), ...act('D', [TODAY])],
    }), TODAY, 14);
    expect(m.retention.d1).toMatchObject({ k: 2, n: 5 });                       // volvieron al día siguiente: A (día 21) y C (día 29); D todavía no es elegible
    expect(m.retention.d7).toMatchObject({ k: 1, n: 4 });                       // exactamente al día 7: solo A (día 27); E volvió el día 8 y F el 14, no el 7
    expect(m.retention.w2).toMatchObject({ k: 1, n: 2 });                       // semana 2 = entre el día 7 y el 13: E sí (día 8); F no (día 14, fuera); A y B aún no cumplieron 13 días
    expect(m.retention.d1.rate).toBeCloseTo(0.4); expect(m.retention.d1.lo!).toBeGreaterThan(0.05); expect(m.retention.d1.hi!).toBeLessThan(0.9);
    expect(m.retention.cohorts[0].day).toBe(TODAY);
    expect(m.retention.cohorts.find((c) => c.day === '2026-10-12')).toMatchObject({ size: 2, d1: '0/2', d7: '0/2', w2: '1/2' }); expect(m.retention.cohorts.find((c) => c.day === '2026-10-20')).toMatchObject({ size: 2, d1: '1/2', d7: '1/2', w2: '—' });
  });
  it('sin usuarios elegibles no inventa porcentajes', () => {
    const m = computeMetrics(raw({ firstDay: [{ user_id: 'D', day: TODAY }], activity: act('D', [TODAY]) }), TODAY, 14);
    expect(m.retention.d1).toMatchObject({ k: 0, n: 0, rate: null }); expect(m.retention.d7.rate).toBeNull(); expect(m.retention.w2.lo).toBeNull();
  });
  it('usuarios activos por día, semana y mes, y la "pegajosidad" (activos hoy ÷ activos de la semana)', () => {
    const m = computeMetrics(raw({ firstDay: ['A', 'B', 'C'].map((u) => ({ user_id: u, day: '2026-10-01' })), activity: [...act('A', [TODAY, '2026-10-29']), ...act('B', ['2026-10-29', '2026-10-25']), ...act('C', ['2026-10-05'])] }), TODAY, 14);
    expect(m.active).toMatchObject({ dauToday: 1, wau: 2, mau: 3 }); expect(m.active.stickiness).toBeCloseTo(0.5); expect(m.active.dau).toHaveLength(14); expect(m.active.dau[13]).toEqual({ day: TODAY, users: 1 });
  });
  it('la IA: uso por usuario, herramientas, tiempos, verificador, errores, topes y utilidad (👍/👎)', () => {
    const r = (user_id: string, name: string, props: Record<string, unknown>) => ({ user_id, day: '2026-10-29', name, props: JSON.stringify(props) });
    const m = computeMetrics(raw({
      firstDay: ['A', 'B', 'C'].map((u) => ({ user_id: u, day: '2026-10-29' })), activity: ['A', 'B', 'C'].flatMap((u) => act(u, ['2026-10-29'])),
      rows: [r('A', 'ai_send', { src: 'typed', chat: 'new', len: 's' }), r('A', 'ai_send', { src: 'suggestion', chat: 'follow', len: 'm' }), r('B', 'ai_send', { src: 'typed', chat: 'new', len: 'l' }),
        r('A', 'ai_done', { tools: 'get_quote,get_news', ms: 3000, steps: 2, checked: 6, unverified: 1, fixed: true }), r('B', 'ai_done', { tools: 'get_quote', ms: 9000, steps: 1, checked: 4, unverified: 0, fixed: false }),
        r('B', 'ai_error', { kind: 'network' }), r('C', 'quota_block', { reason: 'daily' }), r('A', 'ai_rate', { rating: 'up' }), r('B', 'ai_rate', { rating: 'down', reason: 'wrong' }), r('A', 'ai_rate', { rating: 'up' })],
    }), TODAY, 14);
    expect(m.ai.sends).toBe(3); expect(m.ai.users).toMatchObject({ k: 2, n: 3 }); expect(m.ai.usage).toEqual({ once: 1, few: 1, some: 0, heavy: 0 }); expect(m.ai.sources).toEqual({ typed: 2, suggestion: 1 });
    expect(m.ai.completed).toMatchObject({ k: 2, n: 3 }); expect(m.ai.errors).toEqual({ network: 1 }); expect(m.ai.quotaBlocks).toBe(1); expect(m.ai.quotaBlockUsers).toBe(1);
    expect(m.ai.latencyMs).toMatchObject({ n: 2 }); expect(m.ai.latencyMs!.median).toBe(6000); expect(m.ai.avgSteps).toBeCloseTo(1.5);
    expect(m.ai.verifier).toMatchObject({ answers: 2, figuresChecked: 10, figuresUnverified: 1 }); expect(m.ai.verifier.fixedShare).toMatchObject({ k: 1, n: 2 });
    expect(m.ai.tools[0]).toMatchObject({ name: 'get_quote', uses: 2, users: 2 }); expect(m.ai.unusedTools).toContain('screen_assets'); expect(m.ai.unusedTools).not.toContain('get_quote');
    expect(m.ai.rating).toMatchObject({ up: 2, down: 1, reasons: { wrong: 1 } }); expect(m.ai.rating.helpful).toMatchObject({ k: 2, n: 3 });
  });
  it('qué piden: activos más abiertos, búsquedas sin resultado y funciones que les interesan (usuarios distintos, no clics repetidos)', () => {
    const r = (user_id: string, name: string, props: Record<string, unknown>) => ({ user_id, day: '2026-10-29', name, props: JSON.stringify(props) });
    const m = computeMetrics(raw({
      firstDay: ['A', 'B', 'C', 'D'].map((u) => ({ user_id: u, day: '2026-10-29' })), activity: act('A', ['2026-10-29']),
      rows: [r('A', 'asset_open', { sym: 'AAPL', group: 'acciones', from: 'market' }), r('A', 'asset_open', { sym: 'AAPL', group: 'acciones', from: 'search' }), r('B', 'asset_open', { sym: 'AAPL', group: 'acciones', from: 'search' }), r('B', 'asset_open', { sym: 'BTC-USD', group: 'cripto', from: 'search' }),
        r('A', 'search_miss', { q: 'pepe' }), r('B', 'search_miss', { q: 'pepe' }), r('B', 'search_miss', { q: 'pepe' }), r('C', 'search_miss', { q: 'bonk' }),
        r('A', 'fakedoor', { feature: 'cartera', action: 'view' }), r('B', 'fakedoor', { feature: 'cartera', action: 'view' })],
      interest: { 'feature:cartera': 2, 'feature:alertas': 1, premium: 3 }, users: 6,
    }), TODAY, 14);
    expect(m.needs.topAssets[0]).toEqual({ sym: 'AAPL', group: 'acciones', users: 2, opens: 3 }); expect(m.needs.searchMisses[0]).toEqual({ q: 'pepe', users: 2, searches: 3 });
    expect(m.needs.features[0]).toMatchObject({ feature: 'cartera', votes: 2, saw: 2, k: 2, n: 6 }); expect(m.needs.features[1]).toMatchObject({ feature: 'alertas', votes: 1 }); expect(m.needs.features.find((f) => f.feature === 'ejecucion')!.votes).toBe(0);                    // las claves de planes no se mezclan con las de funciones
  });
  it('POST /v1/interest con una función: un voto por persona, solo funciones de la lista, y aparece en el tablero', async () => {
    const s = await makeServer(), a = await s.session('free', 'tel-a-12345'), b = await s.session('free', 'tel-b-12345');
    expect((await s.call('POST', '/v1/interest', { token: a.token, body: { feature: 'cartera' } })).json).toEqual({ ok: true, first: true });
    expect((await s.call('POST', '/v1/interest', { token: a.token, body: { feature: 'cartera' } })).json).toEqual({ ok: true, first: false });
    await s.call('POST', '/v1/interest', { token: b.token, body: { feature: 'cartera' } }); await s.call('POST', '/v1/interest', { token: b.token, body: { feature: 'alertas' } });
    expect((await s.call('POST', '/v1/interest', { token: a.token, body: { feature: 'inventada' } })).status).toBe(400); expect((await s.call('POST', '/v1/interest', { body: { feature: 'cartera' } })).status).toBe(401);
    const m = (await s.call('GET', '/v1/admin/metrics', { token: ADMIN })).json;
    expect(m.needs.features[0]).toMatchObject({ feature: 'cartera', votes: 2, n: 2 }); expect(m.needs.features[1]).toMatchObject({ feature: 'alertas', votes: 1 });
    expect((await s.call('POST', '/v1/interest', { token: a.token, body: { plan: 'plus' } })).status).toBe(200);                         // el interés por planes sigue funcionando igual
  });
  it('NPS: promotores (9-10), pasivos (7-8) y detractores (0-6); y avisa cuando la muestra es chica', () => {
    const fb = (id: number, score: number) => ({ id, user_id: `u${id}xxxxxx`, ts: id, kind: 'nps', score, text: null, version: '0.10.0' });
    const m = computeMetrics(raw({ feedback: [10, 9, 8, 7, 3, 9].map((sc, i) => fb(i + 1, sc)) }), TODAY, 14);
    expect(m.feedback.nps).toMatchObject({ n: 6, promoters: 3, passives: 2, detractors: 1, score: 33 }); expect(m.warnings.join(' ')).toMatch(/Muestra chica/);
    expect(computeMetrics(raw({ consentYes: 0, consentNo: 0, users: 10 }), TODAY, 14).warnings.join(' ')).toMatch(/Menos de la mitad/);
    expect(computeMetrics(raw({ feedback: [] }), TODAY, 14).feedback.nps.score).toBeNull();
  });
  it('addDays y prop', () => { expect(addDays('2026-10-31', 1)).toBe('2026-11-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28'); expect(prop(0, 0)).toMatchObject({ rate: null }); expect(prop(5, 10).lo!).toBeLessThan(0.5); });
});

describe('administración: tablero y exportación', () => {
  it('métricas y CSV solo con el token de administrador', async () => {
    const s = await makeServer();
    for (const p of ['/v1/admin/metrics', '/v1/admin/events.csv']) { expect((await s.call('GET', p)).status).toBe(401); expect((await s.call('GET', p, { token: 'cualquiera' })).status).toBe(401); expect((await s.call('GET', p, { token: ADMIN })).status).toBe(200); }
  });
  it('de punta a punta: usuarios que vuelven en días distintos producen la retención esperada en el tablero', async () => {
    const s = await makeServer();
    const A = await userWithConsent(s, 'tel-aaaaaaaa'), B = await userWithConsent(s, 'tel-bbbbbbbb'), C = await userWithConsent(s, 'tel-cccccccc', false);
    await send(s, A.token, [ev('app_open', { v: '0.10.0', lang: 'es', theme: 'dark', sound: true }), ev('ai_send', { src: 'typed', chat: 'new', len: 's' })]); await send(s, B.token, [ev('app_open', { v: '0.10.0' })]); await send(s, C.token, [ev('app_open', { v: '0.10.0' })]);
    s.setNow('2026-10-20T15:00:00Z'); await send(s, A.token, [ev('app_open', { v: '0.10.0' })]);
    s.setNow('2026-10-26T15:00:00Z'); await send(s, A.token, [ev('app_open', { v: '0.10.0' })]);
    s.setNow('2026-10-27T15:00:00Z');
    const m = (await s.call('GET', '/v1/admin/metrics?days=14', { token: ADMIN })).json;
    expect(m.users).toMatchObject({ registered: 3, withData: 2, consentYes: 2, consentNo: 1 }); expect(m.retention.d1).toMatchObject({ k: 1, n: 2 }); expect(m.retention.d7).toMatchObject({ k: 1, n: 2 }); expect(m.retention.w2.n).toBe(0);
    expect(m.ai.sends).toBe(1); expect(m.warnings.length).toBeGreaterThan(0);
    const csv = await (await s.app(new Request('https://api.test/v1/admin/events.csv?days=30', { headers: { authorization: `Bearer ${ADMIN}` } }))).text();
    expect(csv.split('\n')[0]).toBe('usuario,fecha_hora,dia,evento,propiedades'); expect(csv).toContain('app_open'); expect(csv).not.toContain(A.userId);           // el id completo no sale: solo 8 caracteres
    expect(csv.split('\n').filter(Boolean).length).toBe(1 + 5);
  });
});
