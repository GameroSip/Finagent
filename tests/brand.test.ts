import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ABOUT, FORBIDDEN_CLAIMS, aboutTexts } from '../src/about';
import { AGENT_NAME, ENGINE_LABEL, ENGINE_VERSION, POWERED_BY, TIER_LABEL, brandOf, tierOf } from '../src/brand';
import { PLANS } from '../src/plans';
import { planPitch } from '../src/planPitch';
import { SYSTEM_PROMPT } from '../src/prompt';

describe('niveles de IA: se muestran con nombre de FinAgent, pero según el modelo que corresponde de verdad', () => {
  it('la familia del modelo decide el nivel (con el identificador o con el nombre legible)', () => {
    for (const [m, k] of [['gemini-3.5-flash-lite', 'rapido'], ['Gemini 3.5 Flash-Lite', 'rapido'], ['gemini-3.1-flash-lite-preview', 'rapido'], ['gemini-3.8-flash', 'avanzado'], ['Gemini 3.8 Flash', 'avanzado'], ['gemini-3-flash-preview', 'avanzado'], ['gemini-3.1-pro-preview', 'profundo'], ['Gemini 3.1 Pro', 'profundo']] as const) expect(tierOf(m), m).toBe(k);
  });
  it('si no hay equivalencia conocida NO inventa un nombre: muestra el original (o nada)', () => {
    expect(tierOf('otro-modelo-x')).toBeNull(); expect(brandOf('otro-modelo-x')).toBe('otro-modelo-x'); expect(brandOf(undefined)).toBe(''); expect(brandOf('')).toBe('');
  });
  it('los planes muestran su nivel: Gratis → Rápido, Plus y Pro → Avanzado, y el análisis profundo → Profundo', () => {
    expect(brandOf(PLANS.free.modelLabel)).toBe('FinAgent AI Rápido'); expect(brandOf(PLANS.plus.modelLabel)).toBe('FinAgent AI Avanzado'); expect(brandOf(PLANS.pro.modelLabel)).toBe('FinAgent AI Avanzado');
    expect(brandOf(PLANS.pro.deepModelLabel)).toBe('FinAgent AI Profundo');
  });
  it('el plan Plus no se presenta como "más potente" si el nivel es el mismo que el gratuito (no se vende lo que no hay)', () => {
    const e = (p: (typeof PLANS)[keyof typeof PLANS]) => ({ id: p.id, label: p.label, modelLabel: p.modelLabel, dailyLimit: p.dailyLimit, monthlyLimit: p.monthlyLimit, available: p.available, blurb: '', deepModelLabel: p.deepModelLabel ?? null, hasFallback: p.fallbacks.length > 0 });
    expect(planPitch(e(PLANS.plus) as any, e(PLANS.free) as any).benefits.join(' ')).toContain('FinAgent AI Avanzado');
    expect(planPitch({ ...e(PLANS.plus), modelLabel: PLANS.free.modelLabel } as any, e(PLANS.free) as any).benefits.join(' ')).not.toMatch(/más potente/);
  });
  it('los nombres de nivel no se parecen a nombres de modelos de Google (no confunden)', () => { for (const v of Object.values(TIER_LABEL)) expect(v).not.toMatch(/flash|pro\b|gemini|\d/i); });
});

describe('la marca no puede decir lo que no es cierto', () => {
  const texts = [AGENT_NAME, POWERED_BY, ENGINE_LABEL(), ...aboutTexts(), ...Object.values(TIER_LABEL)];
  it('ningún texto de marca ni de "Acerca de" pasa por las afirmaciones prohibidas (modelo propio, entrenado, ajustado, propietario…)', () => {
    for (const x of texts) for (const [why, re] of FORBIDDEN_CLAIMS) expect(re.test(x), `${why}: «${x.slice(0, 70)}»`).toBe(false);
  });
  it('la guarda detecta justamente las frases que sugirió el chat con Gemini', () => {
    const bad = ['FinAgent v1: nuestro motor propietario de inteligencia financiera', 'IA entrenada o ajustada específicamente con algoritmos financieros', 'una IA propia entrenada con métricas de riesgo', 'nuestro propio modelo ajustado con datos de mercado', 'IA fine-tuned para finanzas'];
    for (const b of bad) expect(FORBIDDEN_CLAIMS.some(([, re]) => re.test(b)), b).toBe(true);
  });
  it('"Acerca de" dice que corre sobre Gemini de Google y que el modelo de lenguaje no se modifica; y explica que se usa un nivel menor si el del plan no está disponible', () => {
    expect(ABOUT.engine).toMatch(/modelos Gemini de Google/); expect(ABOUT.engine).toMatch(/no entrena ni ajusta el modelo de lenguaje/); expect(ABOUT.tiers).toMatch(/uno menor/); expect(POWERED_BY).toMatch(/Gemini de Google/);
  });
  it('el asistente conoce su identidad y se le ordena ser honesto sobre qué es', () => {
    expect(SYSTEM_PROMPT).toContain('Te llamás FinAgent AI'); expect(SYSTEM_PROMPT).toMatch(/modelos Gemini de Google/); expect(SYSTEM_PROMPT).toMatch(/nunca digas que sos un modelo propio, entrenado o ajustado/);
  });
  it('la versión del motor es un número válido y se muestra junto a la versión de la app', () => { expect(ENGINE_VERSION).toMatch(/^\d+\.\d+$/); expect(ENGINE_LABEL()).toBe(`Motor FinAgent v${ENGINE_VERSION}`); });
  it('lo que se publica afuera de la app tampoco miente: ficha de Play, política de privacidad y página inicial', () => {
    const guide = readFileSync('docs/PLAY-STORE.md', 'utf8'), listing = /```\n([\s\S]*?)\n```/.exec(guide.slice(guide.indexOf('Descripción completa')))![1];
    const strip = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
    for (const [name, txt] of [['ficha de Play', listing], ['privacidad', strip(readFileSync('docs/privacidad.html', 'utf8'))], ['inicio', strip(readFileSync('docs/index.html', 'utf8'))]] as const)
      for (const [why, re] of FORBIDDEN_CLAIMS) expect(re.test(txt), `${name}: ${why}`).toBe(false);
    expect(listing).toContain('FinAgent AI'); expect(listing).toMatch(/Gemini de Google/);
  });
});

import { fellBack } from '../src/tiers';
import { answerTier } from '../src/brand';
import { VS } from '../src/views/about';
import { TOUR } from '../src/content/tour';
import { computeMetrics } from '../server/metrics';
import { makeServer, ADMIN } from './helpers/make-server';

describe('qué nivel respondió de verdad', () => {
  it('es un respaldo solo si respondió un nivel MENOR que el del plan (un nivel mayor, como el análisis profundo, no lo es)', () => {
    expect(fellBack('gemini-3.5-flash-lite', 'Gemini 3.8 Flash')).toBe(true);        // plan Avanzado, respondió Rápido
    expect(fellBack('gemini-3.8-flash', 'Gemini 3.8 Flash')).toBe(false);
    expect(fellBack('gemini-3.1-pro-preview', 'Gemini 3.8 Flash')).toBe(false);      // análisis profundo: mayor, no es respaldo
    expect(fellBack('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite')).toBe(false);  // plan gratuito
  });
  it('si falta algún dato, no se afirma nada (ni se muestra un nivel inventado)', () => {
    expect(fellBack(undefined, 'Gemini 3.8 Flash')).toBe(false); expect(fellBack('gemini-3.5-flash-lite', undefined)).toBe(false); expect(fellBack('modelo-x', 'Gemini 3.8 Flash')).toBe(false);
    expect(answerTier(undefined, 'Gemini 3.8 Flash')).toBeNull(); expect(answerTier('modelo-x', 'Gemini 3.8 Flash')).toBeNull();
  });
  it('el pie de la respuesta dice el nivel con nombre de FinAgent y, si hubo respaldo, cuál era el del plan', () => {
    expect(answerTier('gemini-3.5-flash-lite', 'Gemini 3.8 Flash')).toEqual({ used: 'FinAgent AI Rápido', plan: 'FinAgent AI Avanzado', fallback: true });
    expect(answerTier('gemini-3.8-flash', 'Gemini 3.8 Flash')).toEqual({ used: 'FinAgent AI Avanzado', plan: 'FinAgent AI Avanzado', fallback: false });
    expect(answerTier('gemini-3.5-flash-lite', undefined)).toMatchObject({ used: 'FinAgent AI Rápido', fallback: false });   // mensajes viejos, sin plan guardado: no afirma respaldo
  });
});

describe('el panel mide qué nivel respondió', () => {
  const raw = (calls: Array<{ model: string; plan: string; n: number }>) => ({ users: 5, consentYes: 5, consentNo: 0, activity: [], firstDay: [], byName: [], rows: [], feedback: [], calls });
  it('cuenta pedidos por nivel y, en planes de pago, cuántos respondió el nivel Rápido (señal de saturación del nivel del plan)', () => {
    const m = computeMetrics(raw([{ model: 'gemini-3.5-flash-lite', plan: 'free', n: 40 }, { model: 'gemini-3.8-flash', plan: 'plus', n: 30 }, { model: 'gemini-3.5-flash-lite', plan: 'plus', n: 10 }, { model: 'gemini-3.1-pro-preview', plan: 'pro', n: 5 }, { model: 'raro', plan: 'free', n: 2 }]), '2026-11-10', 14);
    expect(m.ai.tiers.calls).toEqual({ rapido: 50, avanzado: 30, profundo: 5, otro: 2 }); expect(m.ai.tiers.total).toBe(87);
    expect(m.ai.tiers.paidFellBack).toMatchObject({ k: 10, n: 45 });                      // solo cuentan los planes de pago: 10 de 45 (30+10+5)
  });
  it('los pedidos del plan gratuito no cuentan como "respaldo" (ahí el nivel esperado ya es el Rápido), y sin datos no inventa porcentajes', () => {
    expect(computeMetrics(raw([{ model: 'gemini-3.5-flash-lite', plan: 'free', n: 99 }]), '2026-11-10', 14).ai.tiers.paidFellBack).toMatchObject({ k: 0, n: 0, rate: null });
    expect(computeMetrics(raw([]), '2026-11-10', 14).ai.tiers.total).toBe(0);
  });
  it('de punta a punta: una consulta real al servidor aparece en el panel como pedido del nivel Rápido', async () => {
    const s = await makeServer(), se = await s.session('free', 'tel-nivel-0001');
    await s.call('POST', '/v1/generate', { token: se.token, body: { contents: [{ role: 'user', parts: [{ text: 'hola' }] }], withTools: false } });
    const m = (await s.call('GET', '/v1/admin/metrics', { token: ADMIN })).json;
    expect(m.ai.tiers.total).toBeGreaterThan(0); expect(m.ai.tiers.calls.rapido).toBeGreaterThan(0);
  });
});

describe('la comparación con una IA común se sostiene', () => {
  it('compara con una IA SIN HERRAMIENTAS, reconoce que otras sí las usan, y no afirma superioridad', () => {
    expect(VS.length).toBe(5); expect(ABOUT.vsNote).toMatch(/Algunas IA también usan búsqueda o herramientas/); expect(ABOUT.vsNote).toMatch(/además verifica cada cifra/);
    const slide = TOUR.find((x) => x.id === 'better')!; expect(slide.title).toBe('En qué se diferencia de una IA común'); expect(slide.text).toMatch(/sin herramientas de datos/);
    for (const x of [slide.title, slide.text, ...(slide.bullets ?? []), ...VS.flat(), ABOUT.vsNote]) for (const [why, re] of FORBIDDEN_CLAIMS) expect(re.test(x), `${why}: «${x.slice(0, 60)}»`).toBe(false);
  });
  it('la guarda detecta las frases de superioridad (incluida la que había antes) y no frena la nueva', () => {
    const sup = FORBIDDEN_CLAIMS.find(([w]) => /mejor que otras IA/.test(w))![1];
    for (const bad of ['Por qué es mejor que una IA común', 'La mejor IA financiera', 'mejor que ChatGPT', 'Número 1 en finanzas', 'supera a ChatGPT']) expect(sup.test(bad), bad).toBe(true);
    for (const ok of ['En qué se diferencia de una IA común', 'Una IA sin herramientas de datos responde de memoria']) expect(sup.test(ok), ok).toBe(false);
  });
});
