import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbortedError, FinancialAgent } from '../src/agent';
import { chatExists, createChat, deleteAllChats, deleteChat, getMeta, groupByDate, listChats, loadChat, plain, renameChat,
  saveChat, searchChats, setAutoTitle, setUnread, traceOf, uiOf, type ChatData, type ChatMeta, type StoredMsg } from '../src/chats';
import { HttpRequest, HttpResult, setHttp } from '../src/http';
import { ModelManager } from '../src/models';
import { aiTitle, cleanTitle, fallbackTitle } from '../src/titles';

/** localStorage en memoria con tope de espacio, para probar el manejo de cuota llena. */
class MemStorage {
  data = new Map<string, string>();
  constructor(public quota = Infinity) {}
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  clear() { this.data.clear(); }
  used() { let n = 0; for (const [k, v] of this.data) n += k.length + v.length; return n; }
  setItem(k: string, v: string) {
    const prev = this.data.get(k);
    const after = this.used() - (prev === undefined ? 0 : k.length + prev.length) + k.length + v.length;
    if (after > this.quota) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    this.data.set(k, v);
  }
}
let mem: MemStorage;
const useStorage = (quota = Infinity) => { mem = new MemStorage(quota); vi.stubGlobal('localStorage', mem); };
beforeEach(() => { useStorage(); });

const user = (text: string, id = 'u'): StoredMsg => ({ id, role: 'user', at: 1, text });
const ai = (text: string, extra: Partial<StoredMsg> = {}, id = 'a'): StoredMsg => ({ id, role: 'ai', at: 2, text, ...extra });
const data = (...messages: StoredMsg[]): ChatData => ({ messages, history: [{ q: 'q', a: 'a' }], numbers: [1, 2] });

describe('almacenamiento de chats', () => {
  it('crea, guarda y recupera con vista previa de la última respuesta', () => {
    const m = createChat('Mi chat');
    expect(chatExists(m.id)).toBe(true);
    expect(saveChat(m.id, data(user('hola'), ai('## Resumen\n**AAPL** sube 2%'))), 'guardó').toBe(true);
    const back = loadChat(m.id)!;
    expect(back.messages).toHaveLength(2);
    expect(back.history).toEqual([{ q: 'q', a: 'a' }]);
    expect(getMeta(m.id)!.preview).toBe('Resumen AAPL sube 2%');
  });

  it('ordena por actividad reciente y no resucita chats eliminados', () => {
    const a = createChat('A', 1000), b = createChat('B', 2000);
    saveChat(a.id, data(user('x')), {}, 5000);
    expect(listChats().map((m) => m.title)).toEqual(['A', 'B']);
    deleteChat(a.id);
    expect(saveChat(a.id, data(user('x')))).toBe(false);   // el chat se borró mientras llegaba una respuesta
    expect(loadChat(a.id)).toBeNull();
    expect(listChats().map((m) => m.id)).toEqual([b.id]);
  });

  it('el renombrado del usuario gana sobre el título automático', () => {
    const m = createChat('Provisorio');
    setAutoTitle(m.id, 'Análisis de AAPL');
    expect(getMeta(m.id)).toMatchObject({ title: 'Análisis de AAPL', titleAuto: true });
    renameChat(m.id, '  Mi cartera  ');
    setAutoTitle(m.id, 'Otro título de la IA');
    expect(getMeta(m.id)).toMatchObject({ title: 'Mi cartera', titleAuto: false });
    renameChat(m.id, '   ');                                  // vacío: se ignora
    expect(getMeta(m.id)!.title).toBe('Mi cartera');
  });

  it('marca y desmarca no leído, y borra todo', () => {
    const m = createChat('A');
    setUnread(m.id, true);
    expect(getMeta(m.id)!.unread).toBe(true);
    setUnread(m.id, false);
    expect(getMeta(m.id)!.unread).toBeUndefined();
    createChat('B');
    deleteAllChats();
    expect(listChats()).toEqual([]);
    expect([...mem.data.keys()].filter((k) => k.startsWith('finagent.chat'))).toEqual([]);
  });

  it('tolera datos corruptos', () => {
    mem.setItem('finagent.chats.v1', '{no es json');
    expect(listChats()).toEqual([]);
    const m = createChat('A');
    mem.setItem(`finagent.chat.v1.${m.id}`, '[1,2');
    expect(loadChat(m.id)).toBeNull();
  });

  it('agrupa por fecha como ChatGPT', () => {
    const now = new Date(2026, 9, 16, 15, 0).getTime();
    const at = (daysAgo: number, h = 10) => { const d = new Date(2026, 9, 16 - daysAgo, h); return d.getTime(); };
    const mk = (id: string, t: number): ChatMeta => ({ id, title: id, titleAuto: true, createdAt: t, updatedAt: t, preview: '' });
    const g = groupByDate([mk('hoy', at(0)), mk('ayer', at(1)), mk('hace3', at(3)), mk('hace20', at(20)), mk('sep', at(40))], now);
    expect(g.map((x) => x.label)).toEqual(['Hoy', 'Ayer', 'Últimos 7 días', 'Últimos 30 días', 'Septiembre de 2026']);
  });

  it('busca por título y por contenido sin importar tildes ni mayúsculas', () => {
    const a = createChat('Dólar blue'), b = createChat('Otro tema');
    saveChat(a.id, data(user('hola'), ai('ok')));
    saveChat(b.id, data(user('¿Cómo viene la INFLACIÓN de octubre?'), ai('Dato del INDEC')));
    expect(searchChats('dolar').map((r) => r.meta.id)).toEqual([a.id]);
    const r = searchChats('inflacion');
    expect(r.map((x) => x.meta.id)).toEqual([b.id]);
    expect(r[0].snippet).toContain('INFLACIÓN');
    expect(searchChats('')).toHaveLength(2);
    expect(searchChats('zzz')).toEqual([]);
  });

  it('con el espacio lleno quita primero los gráficos de lo más viejo y luego borra, sin tocar el chat que se guarda', () => {
    const chart = { kind: 'chart', bars: Array.from({ length: 300 }, (_, i) => ({ t: i, c: i })) };
    const withUi = () => data(user('q'), ai('respuesta', { ui: [chart] }));
    const one = JSON.stringify(withUi()).length;
    useStorage(Math.floor(one * 2.6));                       // entran ~2 chats con gráficos
    const c1 = createChat('uno', 1), c2 = createChat('dos', 2), c3 = createChat('tres', 3);
    expect(saveChat(c1.id, withUi(), {}, 10)).toBe(true);
    expect(saveChat(c2.id, withUi(), {}, 20)).toBe(true);
    expect(saveChat(c3.id, withUi(), {}, 30)).toBe(true);    // no entra: se libera espacio
    expect(loadChat(c3.id)!.messages[1].ui).toBeDefined();   // el que se guarda conserva todo
    expect(loadChat(c1.id)!.messages[1].ui).toBeUndefined(); // al más viejo se le quitó el gráfico...
    expect(loadChat(c1.id)!.messages[1].text).toBe('respuesta'); // ...pero no el texto
    // Si quitar gráficos ya no alcanza (texto largo), se borran los chats más viejos, nunca el que se guarda.
    const big = () => data(user('q'), ai('x'.repeat(Math.floor(one * 0.9))));
    let last = '';
    for (let i = 0; i < 6; i++) { const m = createChat('b' + i, 100 + i); expect(saveChat(m.id, big(), {}, 100 + i)).toBe(true); last = m.id; }
    expect(chatExists(c1.id)).toBe(false);
    expect(loadChat(last)!.messages[1].text.length).toBe(Math.floor(one * 0.9));
    expect(mem.used()).toBeLessThanOrEqual(mem.quota);
    expect(listChats().every((m) => loadChat(m.id) !== null)).toBe(true); // el índice no menciona chats borrados
  });

  it('plain() limpia markdown', () => {
    expect(plain('## Hola **mundo** [link](https://x.com) `código`')).toBe('Hola mundo link código');
    expect(plain('x'.repeat(300), 20)).toHaveLength(20);
  });

  it('traceOf y uiOf guardan lo justo', () => {
    const calls: any[] = [
      { name: 'get_quote', args: { ticker: 'AAPL' }, result: { ok: true, meta: { source: 'Yahoo', as_of: '2026-10-16', fetched_at: 't', notes: ['n'] }, data: { huge: 1 } },
        ui: { kind: 'chart', symbol: 'AAPL', period: '1y', bars: [1, 2] } },
      { name: 'get_technicals', args: { ticker: 'AAPL' }, result: { ok: false, error: 'boom' }, ui: { kind: 'chart', symbol: 'AAPL', period: '1y', bars: [1] } },
      { name: 'get_news', args: {}, result: { ok: true, meta: {} }, ui: { kind: 'headlines', items: ['x'.repeat(70_000)] } },
    ];
    const t = traceOf(calls);
    expect(t[0]).toEqual({ name: 'get_quote', args: { ticker: 'AAPL' }, ok: true, source: 'Yahoo', asOf: '2026-10-16', fetchedAt: 't', notes: ['n'] });
    expect(t[1]).toEqual({ name: 'get_technicals', args: { ticker: 'AAPL' }, ok: false, error: 'boom' });
    expect(JSON.stringify(t)).not.toContain('huge');         // los datos crudos no se guardan
    expect(uiOf(calls)).toHaveLength(1);                     // duplicado y tarjeta gigante descartados
  });
});

describe('títulos', () => {
  it('limpia lo que devuelve el modelo', () => {
    expect(cleanTitle('"Análisis de AAPL."')).toBe('Análisis de AAPL');
    expect(cleanTitle('Título: **Dólar y brecha**\nOtra línea')).toBe('Dólar y brecha');
    expect(cleanTitle('  ')).toBe('');
    expect(cleanTitle('palabra '.repeat(30)).length).toBeLessThanOrEqual(49);
    expect(cleanTitle('merval hoy')).toBe('Merval hoy');
  });
  it('arma un título provisorio con la pregunta', () => {
    expect(fallbackTitle('¿Cómo están el dólar, la brecha y el riesgo país hoy? ¿Qué te dice eso?')).toBe('Cómo están el dólar, la brecha');
    expect(fallbackTitle('   ')).toBe('Nuevo chat');
  });

  const mgr = () => { const m = new ModelManager(); m.chain = ['gemini-3.8-flash', 'gemini-3.5-flash-lite']; return m; };
  const ok = (text: string): HttpResult => ({ status: 200, headers: {}, text: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] }) });

  it('pide el título al modelo más liviano', async () => {
    const urls: string[] = [];
    setHttp(async (r: HttpRequest) => { urls.push(r.url); return ok('"Comparación KO vs PEP."'); });
    expect(await aiTitle(mgr(), 'KEY', 'Compará KO y PEP', 'KO tiene…')).toBe('Comparación KO vs PEP');
    expect(urls[0]).toContain('gemini-3.5-flash-lite');
  });
  it('si falla devuelve null y deja el modelo en pausa o descartado', async () => {
    const m = mgr();
    setHttp(async () => ({ status: 429, headers: {}, text: JSON.stringify({ error: { message: 'Resource exhausted' } }) }));
    expect(await aiTitle(m, 'KEY', 'q', 'a')).toBeNull();
    expect(m.pick(['gemini-3.8-flash'])).toBeNull();          // la lite quedó en pausa
    setHttp(async () => ({ status: 404, headers: {}, text: '{}' }));
    expect(await aiTitle(m, 'KEY', 'q', 'a')).toBeNull();
    setHttp(async () => { throw new Error('offline'); });
    expect(await aiTitle(new ModelManager(), 'KEY', 'q', 'a')).toBeNull();
  });
});

describe('agente: contexto por chat', () => {
  const text = (t: string): HttpResult => ({ status: 200, headers: {}, text: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: t }] } }] }) });
  const fcall = (expr: string): HttpResult => ({ status: 200, headers: {}, text: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'calculate', args: { expression: expr } } }] } }] }) });
  const mk = () => { const models = new ModelManager(); models.chain = ['A']; return new FinancialAgent({ apiKey: 'K', models, retryDelayMs: 0 }); };

  it('guarda turnos compactos y los reenvía; restore() recupera un chat guardado', async () => {
    const bodies: any[] = [];
    setHttp(async (r) => { bodies.push(JSON.parse(JSON.stringify(r.body))); return text('Respuesta ' + bodies.length); });
    const agent = mk();
    await agent.ask('primera');
    await agent.ask('segunda');
    expect(agent.history).toEqual([{ q: 'primera', a: 'Respuesta 1' }, { q: 'segunda', a: 'Respuesta 2' }]);
    expect(bodies[1].contents.map((c: any) => c.parts[0].text)).toEqual(['primera', 'Respuesta 1', 'segunda']);

    const other = mk();                                      // como al reabrir el chat tras reiniciar la app
    other.restore(agent.history, agent.priorNumbers);
    await other.ask('tercera');
    expect(bodies[2].contents.map((c: any) => c.parts[0].text)).toEqual(['primera', 'Respuesta 1', 'segunda', 'Respuesta 2', 'tercera']);
  });

  it('un seguimiento puede repetir cifras de herramientas de turnos anteriores', async () => {
    let n = 0;
    setHttp(async () => { n++; return n === 1 ? fcall('1.1*100') : n === 2 ? text('El resultado es 110.') : text('Como vimos, 110.'); });
    const agent = mk();
    const r1 = await agent.ask('multiplicá');
    expect(r1.verification.ok).toBe(true);
    expect(r1.numbers).toContain(110);
    const r2 = await agent.ask('repetime el número');         // sin herramientas nuevas
    expect(r2.verification.ok).toBe(true);
    expect(r2.corrected).toBe(false);
  });

  it('abort() descarta el turno incompleto y avisa con AbortedError', async () => {
    let agent!: FinancialAgent;
    setHttp(async () => { agent.abort(); return fcall('1+1'); });
    agent = mk();
    await expect(agent.ask('algo')).rejects.toBeInstanceOf(AbortedError);
    expect(agent.history).toEqual([]);
    setHttp(async () => text('ok'));                          // y se puede seguir usando
    expect((await agent.ask('otra')).answer).toBe('ok');
  });

  it('popTurn() permite regenerar sin duplicar el turno', async () => {
    let n = 0;
    const bodies: any[] = [];
    setHttp(async (r) => { bodies.push(JSON.parse(JSON.stringify(r.body))); return text('v' + ++n); });
    const agent = mk();
    await agent.ask('pregunta');
    agent.popTurn();
    const r = await agent.ask('pregunta');
    expect(r.answer).toBe('v2');
    expect(bodies[1].contents).toHaveLength(1);
    expect(agent.history).toEqual([{ q: 'pregunta', a: 'v2' }]);
  });
});
