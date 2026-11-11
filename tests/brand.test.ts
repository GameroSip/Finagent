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
