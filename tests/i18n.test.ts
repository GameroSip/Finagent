import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ABOUT } from '../src/about';
import { TOUR } from '../src/content/tour';
import { COMING_LANGS, detectLang, getLang, LANGS, locale, lookup, setLang, t, translateText, type UiLang } from '../src/i18n';
import { FREE_FOREVER } from '../src/planPitch';
import { FLOW, VS } from '../src/views/about';

afterEach(() => setLang('es'));
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'i18n' ? [] : walk(p)) : p.endsWith('.ts') ? [p] : []; });
const SRC = walk('src');
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const LANG2: UiLang[] = ['en', 'pt'];
// Siglas y nombres que se escriben igual en todos los idiomas.
const SAME = /^(EMA \d+|VWAP|MACD|RSI \(14\)|Fibonacci)$/;

/** Todos los textos que el código manda por t('…') (se leen del código fuente: si alguien agrega uno nuevo sin traducirlo, esta prueba falla). */
function tKeys(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const f of SRC) {
    const s = readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    for (const m of s.matchAll(/\bt(?:x|r)?\(\s*'((?:[^'\\\n]|\\.)*)'/g)) out.push([m[1].replace(/\\'/g, "'"), f]);
    for (const m of s.matchAll(/\bt(?:x|r)?\(\s*(?:[a-z.?]+\s*\?\s*)?'((?:[^'\\\n]|\\.)*)'\s*:\s*'((?:[^'\\\n]|\\.)*)'/g)) { out.push([m[1].replace(/\\'/g, "'"), f]); out.push([m[2].replace(/\\'/g, "'"), f]); }   // t(cond ? 'a' : 'b')
  }
  return out;
}
/** Textos de los módulos de contenido (se muestran con t() a partir de listas). */
function contentKeys(): string[] {
  const k: string[] = [...Object.values(ABOUT).flat(), ...FREE_FOREVER, ...FLOW.flatMap((f) => [f.title, f.text]), ...VS.flat()];
  for (const s of TOUR) k.push(s.title, s.text, ...(s.bullets ?? []));
  const tools = readFileSync('src/views/chartTools.ts', 'utf8');
  for (const m of tools.matchAll(/(?:label|desc):\s*'((?:[^'\\]|\\.)*)'/g)) k.push(m[1].replace(/\\'/g, "'"));
  for (const m of tools.matchAll(/return '((?:[^'\\]|\\.)*)'/g)) k.push(m[1]);                       // motivos de "no disponible"
  return k.filter((x) => /[a-záéíóúñ]{3}/i.test(x) && !SAME.test(x));
}

describe('el diccionario cubre TODOS los textos de la interfaz', () => {
  it('cada texto armado en código con t() tiene traducción al inglés y al portugués', () => {
    const missing = tKeys().flatMap(([k, f]) => LANG2.filter((l) => lookup(l, k) === null).map((l) => `${l} · ${f.split('/').pop()} · ${k}`));
    expect(missing).toEqual([]);
  });
  it('cada texto de los módulos de contenido (Acerca de, recorrido, planes, herramientas del gráfico) también', () => {
    const missing = contentKeys().flatMap((k) => LANG2.filter((l) => lookup(l, k) === null).map((l) => `${l} · ${k.slice(0, 80)}`));
    expect(missing).toEqual([]);
  });
  it('ninguna traducción pierde ni inventa una {variable} (se mostraría "{n}" en pantalla)', () => {
    for (const l of LANG2) for (const k of [...tKeys().map((x) => x[0]), ...contentKeys()]) {
      const tr = lookup(l, k);
      if (tr !== null) expect(vars(tr), `${l}: ${k.slice(0, 60)}`).toEqual(vars(k));
    }
  });
  it('no hay traducciones vacías y casi todas difieren del español (salvo nombres y siglas)', () => {
    for (const l of LANG2) {
      const keys = [...new Set([...tKeys().map((x) => x[0]), ...contentKeys()])];
      let same = 0;
      for (const k of keys) { const tr = lookup(l, k); if (tr === null) continue; expect(tr.trim().length, `${l}: ${k.slice(0, 50)}`).toBeGreaterThan(0); if (tr === k && !SAME.test(k)) same++; }
      expect(same, `${l}: textos sin traducir (iguales al español)`).toBeLessThan(keys.length * (l === 'pt' ? 0.16 : 0.06));   // el portugués comparte muchas palabras con el español (Mercados, Favoritos, Copiar…)
    }
  });
});

describe('las traducciones respetan las mismas reglas de honestidad que el español', () => {
  const FALSE_CLAIMS: Record<'en' | 'pt', Array<[string, RegExp]>> = {
    en: [['modelo propio entrenado', /trained (by|with|on) (us|ourselves)|own (trained )?model|proprietary model/i], ['licencias', /dozens of licenses|licensed data|data licenses/i], ['respaldo de Google', /(backed|endorsed|certified|sponsored|partnered) (up )?(by|with) (google|deepmind)/i],
      ['varias IA', /multiple (ais|models)|several (ais|models)/i], ['precisión absoluta', /100\s*%\s*(accurate|precise|reliable|safe)|error[- ]free|guarantee/i], ['cobertura total / tiempo real', /all (the )?markets|total coverage|real[- ]time/i]],
    pt: [['modelo propio entrenado', /treinad[oa] (por|com) n[óo]s|modelo pr[óo]prio/i], ['licencias', /dezenas de licen[çc]as|dados licenciados/i], ['respaldo de Google', /(respaldad[oa]|avalizad[oa]|certificad[oa]|patrocinad[oa]) pel[oa] (google|deepmind)/i],
      ['varias IA', /v[áa]rias (ias|intelig[êe]ncias)|m[úu]ltiplas (ias|modelos)/i], ['precisión absoluta', /100\s*%\s*(preciso|exato|confi[áa]vel|seguro)|sem erros|garant/i], ['cobertura total / tiempo real', /todos os mercados|cobertura total|em tempo real/i]],
  };
  it('en inglés y portugués, ni el recorrido ni "Acerca de" prometen lo que no existe', () => {
    for (const l of ['en', 'pt'] as const) for (const k of contentKeys()) { const tr = lookup(l, k) ?? k; for (const [what, re] of FALSE_CLAIMS[l]) expect(re.test(tr), `${l} · ${what}: «${tr.slice(0, 80)}»`).toBe(false); }
  });
  it('lo que se dice de Google y de las fuentes es lo mismo en los tres idiomas', () => {
    const k = TOUR.find((s) => s.id === 'backing')!.bullets!;
    expect(lookup('en', k[0])).toMatch(/independent of Google/); expect(lookup('pt', k[0])).toMatch(/independente do Google/);
    expect(lookup('en', k[1])).toMatch(/no commercial agreements/); expect(lookup('pt', k[1])).toMatch(/sem acordos comerciais/);
    expect(lookup('en', k[2])).toMatch(/does not provide investment advice/); expect(lookup('pt', k[2])).toMatch(/não oferece assessoria/);
  });
});

describe('cómo funciona el cambio de idioma', () => {
  it('detecta el idioma del dispositivo: español, portugués e inglés; los demás caen en inglés', () => {
    expect(detectLang({ language: 'es-AR' })).toBe('es'); expect(detectLang({ languages: ['pt-BR', 'en'] })).toBe('pt'); expect(detectLang({ language: 'en-GB' })).toBe('en');
    expect(detectLang({ language: 'fr-FR' })).toBe('en'); expect(detectLang({ language: 'ja' })).toBe('en'); expect(detectLang(undefined)).toBe('en');
  });
  it('t() traduce con variables, y si falta una traducción muestra el español (nunca queda vacío ni muestra la clave rota)', () => {
    expect(t('{n} conversaciones por día', { n: 3 })).toBe('3 conversaciones por día');
    setLang('en');
    expect(t('{n} conversaciones por día', { n: 3 })).toBe('3 conversations per day');
    expect(t('Cotización de {s}', { s: 'AAPL' })).toBe('Quote for AAPL');
    setLang('pt');
    expect(t('Cotización de {s}', { s: 'AAPL' })).toBe('Cotação de AAPL');
    expect(t('un texto que nadie tradujo {x}', { x: 1 })).toBe('un texto que nadie tradujo 1');
    expect(t('Hola {n}')).toBe('Hola {n}');
  });
  it('el formato de números y fechas sigue al idioma', () => {
    setLang('es'); expect(locale()).toBe('es-AR'); setLang('en'); expect(locale()).toBe('en-US'); setLang('pt'); expect(locale()).toBe('pt-BR');
    expect(getLang()).toBe('pt');
    expect(LANGS.map((l) => l.id)).toEqual(['es', 'en', 'pt']);
    expect(COMING_LANGS.length).toBeGreaterThan(3);
  });
  it('el traductor de pantalla conserva los espacios y no toca lo que no es una clave', () => {
    setLang('en');
    expect(translateText('  Ajustes  ')).toBe('  Settings  ');
    expect(translateText('\n   Mercados\n ')).toBe('\n   Markets\n ');
    expect(translateText('Texto de un usuario cualquiera')).toBe('Texto de un usuario cualquiera');
    expect(translateText('Pegá "$&" acá')).toBe('Pegá "$&" acá');
    setLang('es'); expect(translateText('  Ajustes ')).toBe('  Ajustes ');
  });
  it('los nombres de cada idioma se muestran en su propio idioma', () => {
    expect(LANGS.map((l) => l.native)).toEqual(['Español', 'English', 'Português']);
  });
});
