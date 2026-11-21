import { describe, expect, it } from 'vitest';
import { ALERT_CFG, evaluateRadar, evaluateRule, LocalEvaluator, newRule, validateRule, type AlertRule, type Quote } from '../src/alerts';
import { FORBIDDEN_CLAIMS } from '../src/about';
import { lookup, type UiLang } from '../src/i18n';
import {
  activeUtcHours, aiMessage, assetMessage, briefMessage, CHANNELS, dolarMessage, fngMessage, fngRegime, inQuiet, linkToString, notifyTexts,
  notifyViolations, parseLink, radarMessage, testMessage, TOPIC_RE, topicName, topicsFor, type NotifyMessage,
} from '../src/notifyTexts';
import { STRESS_TEXTS } from '../src/stress';
import { assertSafe, b64url, FcmClient, MemoryKv, runPushCron, signServiceJwt, type FetchFn } from '../server/push';

const H = 3600_000;
const q = (price: number, changePct = 0, day = '2026-11-20', at = Date.UTC(2026, 10, 20, 15)): Quote => ({ price, changePct, day, at, currency: 'USD' });
const rule = (kind: AlertRule['kind'], value: number, start: Quote | null = null) => newRule({ symbol: 'aapl', name: 'Apple', kind, value }, start, 0);

describe('alertas de activos: enfriamiento e histéresis', () => {
  it('"supera" avisa una vez al cruzar y no repite mientras sigue arriba', () => {
    let r = rule('above', 200, q(190)), t = 10 * H;
    let e = evaluateRule(r, q(199), t); expect(e.fire).toBe(false); r = e.rule;
    e = evaluateRule(r, q(201), t += H); expect(e.fire).toBe(true); r = e.rule;
    for (const p of [202, 205, 199.5, 201]) { e = evaluateRule(r, q(p), t += 7 * H); expect(e.fire, `precio ${p}`).toBe(false); r = e.rule; }   // 199,5 no baja de 200 − 0,5 %: no se rearma
  });
  it('se rearma recién cuando el precio se aleja (histéresis) y respeta el enfriamiento', () => {
    let r = rule('above', 200, q(190)), t = 10 * H;
    r = evaluateRule(r, q(201), t).rule;                                   // avisa
    r = evaluateRule(r, q(198), t += H).rule; expect(r.armed).toBe(true);  // bajó de 199: se rearma
    let e = evaluateRule(r, q(203), t += H); expect(e.fire, 'dentro de las 6 h').toBe(false); r = e.rule;
    e = evaluateRule(r, q(203), t + ALERT_CFG.cooldownMs); expect(e.fire, 'pasado el enfriamiento').toBe(true);
  });
  it('"baja de" es simétrico', () => {
    let r = rule('below', 100, q(110)), t = 0;
    let e = evaluateRule(r, q(99), t += 7 * H); expect(e.fire).toBe(true); r = e.rule;
    e = evaluateRule(r, q(100.2), t += 7 * H); expect(e.fire).toBe(false); expect(e.rule.armed).toBe(false); r = e.rule;   // 100,2 < 100,5: sigue desarmada
    r = evaluateRule(r, q(101), t += H).rule; expect(r.armed).toBe(true);
    expect(evaluateRule(r, q(98), t += 7 * H).fire).toBe(true);
  });
  it('"se mueve X %" avisa como mucho una vez por día de mercado', () => {
    let r = rule('move', 5, q(100, 1)), t = 0;
    let e = evaluateRule(r, q(94, -6), t += 7 * H); expect(e.fire).toBe(true); r = e.rule;
    r = evaluateRule(r, q(98, -2), t += 7 * H).rule;                     // vuelve a armarse (bajó de 3,5 %)…
    expect(evaluateRule(r, q(93, -7), t += 7 * H).fire, 'mismo día').toBe(false);
    expect(evaluateRule(r, q(93, -7, '2026-11-21'), t += 7 * H).fire, 'otro día').toBe(true);
  });
  it('una regla que ya se cumple al crearla no avisa "de una"', () => {
    const r = rule('above', 150, q(160));
    expect(r.armed).toBe(false);
    expect(evaluateRule(r, q(161), 10 * H).fire).toBe(false);
  });
  it('valida el valor contra el precio actual', () => {
    expect(validateRule('above', 150, 160)).toMatch(/más alto/);
    expect(validateRule('below', 170, 160)).toMatch(/más bajo/);
    expect(validateRule('move', 0.1, 160)).toMatch(/0,5/);
    expect(validateRule('above', -1, null)).toMatch(/mayor que cero/);
    expect(validateRule('above', 170, 160)).toBeNull();
  });
  it('el evaluador local no dispara con cotizaciones viejas ni si la fuente falla', async () => {
    const rules = [rule('above', 200, q(190))];
    const old = await new LocalEvaluator({ quotes: async () => ({ AAPL: q(250, 0, '2026-11-01', 0) }) }).run(rules, 30 * 86400_000);
    expect(old.fired).toEqual([]);
    const broken = await new LocalEvaluator({ quotes: async () => { throw new Error('sin red'); } }).run(rules, 0);
    expect(broken.fired).toEqual([]); expect(broken.rules).toEqual(rules);
    const ok = await new LocalEvaluator({ quotes: async () => ({ AAPL: q(201) }) }).run(rules, q(201).at);
    expect(ok.fired.map((f) => f.rule.symbol)).toEqual(['AAPL']); expect(ok.rules[0].armed).toBe(false);
  });
  it('termómetro: el primer nivel se guarda sin avisar; después avisa solo si cambia', () => {
    let s = evaluateRadar(null, 'baja', 0); expect(s.fire).toBeNull();
    s = evaluateRadar(s.state, 'baja', 20 * H); expect(s.fire).toBeNull();
    s = evaluateRadar(s.state, 'alta', 40 * H); expect(s.fire).toEqual({ from: 'baja', to: 'alta' });
    expect(evaluateRadar(s.state, 'media', 41 * H).fire, 'dentro de 12 h').toBeNull();
  });
});

describe('horario de silencio y tópicos por hora', () => {
  it('cubre horarios que cruzan la medianoche', () => {
    const q2308 = { on: true, start: 23, end: 8 };
    expect([22, 23, 0, 7, 8].map((h) => inQuiet(q2308, h))).toEqual([false, true, true, true, false]);
    expect(inQuiet({ on: true, start: 13, end: 15 }, 14)).toBe(true);
    expect(inQuiet({ on: false, start: 0, end: 23 }, 5)).toBe(false);
    expect(inQuiet({ on: true, start: 9, end: 9 }, 9)).toBe(false);
  });
  it('convierte el silencio local a horas UTC (Argentina, UTC−3)', () => {
    const hours = activeUtcHours({ on: true, start: 23, end: 8 }, -180);
    expect(hours).not.toContain(2);    // 23:00 en Argentina
    expect(hours).not.toContain(10);   // 07:00
    expect(hours).toContain(11);       // 08:00
    expect(hours).toHaveLength(15);
    expect(activeUtcHours({ on: false, start: 23, end: 8 }, -180)).toHaveLength(24);
  });
  it('arma los tópicos por categoría, idioma y hora (y nada si está todo apagado)', () => {
    const quiet = { on: true, start: 23, end: 8 };
    expect(topicsFor({ radar: false, digests: false, quiet }, 'es', -180)).toEqual([]);
    const t = topicsFor({ radar: true, digests: true, quiet }, 'es', -180);
    expect(t).toHaveLength(15 * 3);
    expect(t).toContain('macro_dolar_es_h13'); expect(t).toContain('daily_brief_es_h13'); expect(t).toContain('radar_stress_es_h11');
    expect(t.every((x) => TOPIC_RE.test(x))).toBe(true);
    expect(topicName('daily_brief', 'pt', 4)).toBe('daily_brief_pt_h04');
  });
});

describe('enlaces internos', () => {
  it('ida y vuelta', () => {
    for (const l of [{ to: 'chat' }, { to: 'radar' }, { to: 'market' }, { to: 'settings' }, { to: 'asset', symbol: 'GGAL.BA' }, { to: 'asset', symbol: '^GSPC' }] as const)
      expect(parseLink(linkToString(l as any))).toMatchObject(l);
  });
  it('descarta enlaces raros', () => {
    for (const bad of ['', 'http://x.com', 'asset/', 'asset/<script>', 'radar/x', 'chat/../../', 42, null, 'a'.repeat(200)]) expect(parseLink(bad), String(bad)).toBeNull();
  });
});

describe('miedo y codicia: régimen con histéresis', () => {
  it('no cambia por un punto alrededor del límite', () => {
    expect(fngRegime(20)).toBe('extreme-fear');
    expect(fngRegime(26, 'extreme-fear')).toBe('extreme-fear');
    expect(fngRegime(29, 'extreme-fear')).toBe('fear');
    expect(fngRegime(80, 'greed')).toBe('extreme-greed');
    expect(fngRegime(76, 'greed')).toBe('greed');
  });
});

// Todos los avisos posibles, en los tres idiomas y con valores de ejemplo.
function allMessages(lang: UiLang): NotifyMessage[] {
  const L = STRESS_TEXTS.levels;
  return [
    aiMessage(lang, 'progress'), aiMessage(lang, 'done'), aiMessage(lang, 'fail'), testMessage(lang),
    ...(['above', 'below', 'move'] as const).map((k) => assetMessage(lang, k, { symbol: 'GGAL', name: 'Galicia', value: 5000, price: 5123.5, changePct: -6.2, currency: 'ARS' })),
    radarMessage(lang, L.baja, L.alta), radarMessage(lang, L.alta, L.media),
    fngMessage(lang, 'fear', 'extreme-fear', 12), fngMessage(lang, 'greed', 'neutral', 50),
    ...['blue', 'oficial', 'bolsa'].map((c) => dolarMessage(lang, c, 1250, 1200)),
    briefMessage(lang, { oficial: 1010, blue: 1250, mep: 1220, riesgo: 640 }), briefMessage(lang, { oficial: 1010, blue: 1250, mep: 1220, riesgo: null }),
  ];
}

describe('cumplimiento: ningún aviso promete de más ni recomienda operar', () => {
  for (const lang of ['es', 'en', 'pt'] as UiLang[]) {
    it(`avisos en ${lang}`, () => {
      for (const m of allMessages(lang)) {
        const text = `${m.title} ${m.body}`;
        expect(notifyViolations(text), text).toEqual([]);
        for (const [why, re] of FORBIDDEN_CLAIMS) expect(re.test(text), `${why}: ${text}`).toBe(false);
        expect(text, 'variable sin completar').not.toMatch(/\{\w+\}/);
        expect(m.title.length, `título largo: ${m.title}`).toBeLessThanOrEqual(60);
      }
    });
  }
  it('los textos fijos y los canales también pasan', () => {
    for (const s of [...notifyTexts(), ...CHANNELS.flatMap((c) => [c.name, c.description])]) {
      expect(notifyViolations(s), s).toEqual([]);
      for (const [why, re] of FORBIDDEN_CLAIMS) expect(re.test(s), `${why}: ${s}`).toBe(false);
      for (const l of ['en', 'pt'] as const) { const tr = lookup(l, s); expect(tr, `${l}: falta "${s}"`).not.toBeNull(); expect(/real[- ]time|tempo real|\bbuy\b|\bsell\b|compre\b|venda\b|recommend|recomend/i.test(tr!), `${l}: ${tr}`).toBe(false); }
    }
  });
  it('el detector atrapa lo que no puede salir', () => {
    for (const bad of ['Comprá GGAL ahora', 'Es momento de vender', 'Señal de compra en AAPL', 'Datos en tiempo real', 'Oportunidad única', 'Te recomendamos esperar', 'Deberías revisar tu cartera', 'Va a subir mañana', '¡Urgente!'])
      expect(notifyViolations(bad).length + FORBIDDEN_CLAIMS.filter(([, re]) => re.test(bad)).length, bad).toBeGreaterThan(0);
    expect(() => assertSafe({ title: 'Comprá ya', body: 'x', channel: 'digests', link: { to: 'market' } })).toThrow(/bloqueado/);
  });
  it('los canales de Android son los 4 pedidos, con prioridades distintas', () => {
    expect(CHANNELS.map((c) => c.id)).toEqual(['ai_status', 'radar_stress', 'asset_alerts', 'digests']);
    expect(CHANNELS.find((c) => c.id === 'ai_status')!.sound).toBe(false);
    expect(CHANNELS.find((c) => c.id === 'asset_alerts')!.importance).toBeGreaterThan(CHANNELS.find((c) => c.id === 'digests')!.importance);
  });
});

// ---------------------------------------------------------------- servidor
async function testAccount() {
  const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
  return { kp, sa: { project_id: 'finagent-test', client_email: 'push@finagent-test.iam.gserviceaccount.com', private_key: pem } };
}
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

describe('servidor: FCM HTTP v1 con Web Crypto', () => {
  it('firma el JWT de la cuenta de servicio (RS256) y la firma se verifica', async () => {
    const { kp, sa } = await testAccount();
    const jwt = await signServiceJwt(sa, 1_800_000_000), [h, b, s] = jwt.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(b)))).toMatchObject({ iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/firebase.messaging', exp: 1_800_003_600 });
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${b}`))).toBe(true);
    expect(b64url('??>')).toBe('Pz8-');
  });
  it('pide el token una vez, lo reutiliza y manda al tópico con canal y enlace', async () => {
    const { sa } = await testAccount(), calls: Array<{ url: string; body: any; auth?: string }> = [];
    const f: FetchFn = async (url, init) => {
      calls.push({ url, body: typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init?.body, auth: (init?.headers as any)?.authorization });
      return new Response(JSON.stringify(url.includes('oauth2') ? { access_token: 'tok-1', expires_in: 3600 } : { name: 'ok' }), { status: 200 });
    };
    const c = new FcmClient(sa, f, () => 1_800_000_000_000);
    await c.send('macro_dolar_es_h13', 'macro_dolar', dolarMessage('es', 'blue', 1250, 1200));
    await c.send('macro_dolar_en_h13', 'macro_dolar', dolarMessage('en', 'blue', 1250, 1200));
    expect(calls.filter((x) => x.url.includes('oauth2'))).toHaveLength(1);
    const send = calls.find((x) => x.url.includes('fcm.googleapis.com'))!;
    expect(send.url).toBe('https://fcm.googleapis.com/v1/projects/finagent-test/messages:send');
    expect(send.auth).toBe('Bearer tok-1');
    expect(send.body.message).toMatchObject({ topic: 'macro_dolar_es_h13', data: { link: 'market', topic: 'macro_dolar', channel: 'digests' }, android: { notification: { channel_id: 'digests' } } });
    expect(JSON.stringify(send.body)).not.toMatch(/token|user|device/i);   // nada que identifique a nadie
  });
});

describe('servidor: control periódico', () => {
  const sources = (o: { blue?: number; oficial?: number; bolsa?: number; fng?: number; riesgo?: number }): FetchFn => async (url) => {
    if (url.includes('dolarapi')) return new Response(JSON.stringify([{ casa: 'oficial', venta: o.oficial ?? 1000 }, { casa: 'blue', venta: o.blue ?? 1200 }, { casa: 'bolsa', venta: o.bolsa ?? 1180 }]));
    if (url.includes('alternative.me')) return new Response(JSON.stringify({ data: [{ value: String(o.fng ?? 50) }] }));
    if (url.includes('riesgo-pais')) return new Response(JSON.stringify({ valor: o.riesgo ?? 700 }));
    return new Response('{}', { status: 404 });
  };
  const sender = () => { const sent: Array<{ topic: string; msg: NotifyMessage }> = []; return { sent, send: async (topic: string, _b: any, msg: NotifyMessage) => { assertSafe(msg); sent.push({ topic, msg }); } }; };
  const at = (iso: string) => new Date(iso);

  it('la primera vez solo guarda la referencia; avisa cuando el dólar se mueve 2 % o más, una vez', async () => {
    const kv = new MemoryKv(), s = sender();
    await runPushCron({ kv, sender: s, fetchFn: sources({}), now: at('2026-11-20T15:00:00Z') });
    expect(s.sent).toEqual([]);
    await runPushCron({ kv, sender: s, fetchFn: sources({ blue: 1215 }), now: at('2026-11-20T15:15:00Z') });   // +1,25 %
    expect(s.sent).toEqual([]);
    await runPushCron({ kv, sender: s, fetchFn: sources({ blue: 1230 }), now: at('2026-11-20T15:30:00Z') });   // +2,5 % desde el último aviso
    expect(s.sent.map((x) => x.topic)).toEqual(['macro_dolar_es_h15', 'macro_dolar_en_h15', 'macro_dolar_pt_h15']);
    expect(s.sent[0].msg.title).toBe('Dólar blue: $1.230');
    expect(s.sent[0].msg.body).toContain('+2,50 %');
    await runPushCron({ kv, sender: s, fetchFn: sources({ blue: 1260 }), now: at('2026-11-20T16:00:00Z') });   // +2,4 % pero dentro del enfriamiento de 3 h
    expect(s.sent).toHaveLength(3);
  });
  it('miedo y codicia: avisa solo al cambiar de régimen', async () => {
    const kv = new MemoryKv(), s = sender();
    await runPushCron({ kv, sender: s, fetchFn: sources({ fng: 50 }), now: at('2026-11-20T15:00:00Z') });
    await runPushCron({ kv, sender: s, fetchFn: sources({ fng: 53 }), now: at('2026-11-20T15:15:00Z') });
    expect(s.sent).toEqual([]);
    await runPushCron({ kv, sender: s, fetchFn: sources({ fng: 30 }), now: at('2026-11-20T15:30:00Z') });
    expect(s.sent.map((x) => x.topic)).toContain('radar_stress_es_h15');
    expect(s.sent.find((x) => x.topic === 'radar_stress_es_h15')!.msg.title).toBe('Miedo y codicia (cripto): miedo');
  });
  it('resumen diario: una sola vez, de lunes a viernes, a la hora configurada', async () => {
    const kv = new MemoryKv(), s = sender();
    await runPushCron({ kv, sender: s, fetchFn: sources({}), now: at('2026-11-20T13:00:00Z') });   // viernes 10:00 ART
    await runPushCron({ kv, sender: s, fetchFn: sources({}), now: at('2026-11-20T13:15:00Z') });
    const brief = s.sent.filter((x) => x.topic.startsWith('daily_brief'));
    expect(brief.map((x) => x.topic)).toEqual(['daily_brief_es_h13', 'daily_brief_en_h13', 'daily_brief_pt_h13']);
    expect(brief[0].msg.body).toBe('Dólar oficial $1.000 · blue $1.200 · MEP $1.180 · riesgo país 700 puntos.');
    await runPushCron({ kv, sender: s, fetchFn: sources({}), now: at('2026-11-21T13:00:00Z') });   // sábado
    expect(s.sent.filter((x) => x.topic.startsWith('daily_brief'))).toHaveLength(3);
  });
  it('si una fuente falla, sigue con las demás y lo informa', async () => {
    const kv = new MemoryKv(), s = sender();
    const r = await runPushCron({ kv, sender: s, fetchFn: async (u) => (u.includes('dolarapi') ? new Response('x', { status: 503 }) : sources({ fng: 10 })(u)), now: at('2026-11-20T13:00:00Z') });
    expect(r.errors.join(' ')).toMatch(/dolarapi/);
    expect(await kv.get('fng:regime')).toBe('extreme-fear');
  });
});
