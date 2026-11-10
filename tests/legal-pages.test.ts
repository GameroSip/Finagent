import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ABOUT } from '../src/about';
import { REPORT_REASONS } from '../src/betaTexts';

const priv = readFileSync('docs/privacidad.html', 'utf8'), del = readFileSync('docs/eliminar-cuenta.html', 'utf8'), idx = readFileSync('docs/index.html', 'utf8');
const text = (h: string) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('páginas que Google Play exige (política de privacidad y eliminación de cuenta)', () => {
  it('son páginas completas, en español y legibles en el teléfono', () => { for (const h of [priv, del, idx]) { expect(h).toMatch(/<html lang="es">/); expect(h).toContain('name="viewport"'); expect(h).toMatch(/<title>[^<]+<\/title>/); expect(h.trim().endsWith('</html>')).toBe(true); } });
  it('la política dice lo mismo que la app: Gemini, Cloudflare, fuentes de datos, que el servidor no guarda las consultas, y que es opcional y revocable', () => {
    const t = text(priv);
    for (const s of ['Google (Gemini)', 'Cloudflare', 'Yahoo Finance', 'DolarAPI', 'ArgentinaDatos', 'CoinGecko', 'El servidor no lo guarda', 'nunca incluyen', 'Ajustes → Beta', 'No vendemos datos', 'no mostramos publicidad', 'menores de 18', 'No es asesoramiento de inversión', 'nivel gratuito']) expect(t, s).toContain(s);
    for (const s of ['no guarda el texto de tus consultas en el servidor', 'Tu historial queda en este teléfono']) expect(ABOUT.privacyServer).toContain(s);       // lo que la app dice en "Acerca de" coincide con la política
  });
  it('el camino para eliminar la cuenta es EXACTAMENTE el de la app, y ambas páginas lo explican', () => {
    for (const h of [priv, del]) expect(text(h)).toContain('Eliminar mi cuenta y mis datos');
    expect(text(del)).toContain('Eliminar todo'); expect(ABOUT.deletion).toContain('Eliminar mi cuenta y mis datos');
    expect(text(del)).toMatch(/no podemos reconocer cuál era tu cuenta/);                  // se dice con honestidad el límite de una cuenta anónima
  });
  it('lo que falta completar está marcado de forma visible y uniforme (nada inventado)', () => {
    const marks = [...(priv + del).matchAll(/\[COMPLETAR: ([^\]]+)\]/g)].map((m) => m[1]);
    expect(marks.length).toBeGreaterThanOrEqual(5); expect(new Set(marks)).toEqual(new Set(['fecha', 'nombre o razón social del responsable', 'correo de contacto']));
    expect(text(priv + del)).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);                        // ningún correo escrito: lo completa la persona
  });
  it('no promete lo que la app no hace', () => { const t = text(priv + del + idx).toLowerCase(); for (const bad of ['garantiz', 'cifrado de extremo', 'anónimo total', 'nunca compartimos', 'tiempo real', 'asesor financiero registrado']) expect(t, bad).not.toContain(bad); });
  it('los motivos de reporte cubren lo que pide la política de IA generativa de Google Play (ofensivo y peligroso o engañoso)', () => { const m = REPORT_REASONS.map(([k]) => k); expect(m).toContain('offensive'); expect(m).toContain('harmful'); });
});

describe('guía de Google Play: los textos de la ficha respetan los límites de la tienda', () => {
  const g = readFileSync('docs/PLAY-STORE.md', 'utf8');
  it('la descripción breve tiene como máximo 80 caracteres y la completa 4.000 (y las cuentas de la guía son ciertas)', () => {
    const short = /Descripción breve \(≤80\):\*\* `([^`]+)`\s+\((\d+) caracteres\)/.exec(g)!, long = /```\n([\s\S]*?)\n```/.exec(g.slice(g.indexOf('Descripción completa')))!;
    expect(short[1].length).toBeLessThanOrEqual(80); expect(Number(short[2])).toBe(short[1].length);
    expect(long[1].length).toBeLessThanOrEqual(4000); expect(g).toContain(`${long[1].length} caracteres de 4.000`);
  });
  it('la ficha no promete lo que Google Play prohíbe ni lo que la app no hace', () => {
    const long = /```\n([\s\S]*?)\n```/.exec(g.slice(g.indexOf('Descripción completa')))![1].toLowerCase();
    for (const bad of ['garantiz', 'ganá', 'ganancias', 'rentabilidad', 'asesor financiero', 'recomendaciones de inversión', 'tiempo real', '#1', 'el mejor']) expect(long, bad).not.toContain(bad);
    expect(long).toContain('no es asesoramiento de inversión'); expect(long).toContain('versión beta');
  });
});
