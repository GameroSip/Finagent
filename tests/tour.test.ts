import { describe, expect, it } from 'vitest';
import { ease, placeCard, shouldAutoStart, tourTexts, TOUR_TEXTS } from '../src/tour';
import { homeTexts } from '../src/views/home';
import { FORBIDDEN_CLAIMS } from '../src/about';

describe('recorrido interactivo del inicio', () => {
  it('se lanza solo una vez y nunca en pruebas automatizadas ni con ?skipTour=1', () => {
    expect(shouldAutoStart({ done: false, search: '', webdriver: false })).toBe(true);
    expect(shouldAutoStart({ done: true, search: '', webdriver: false })).toBe(false);
    expect(shouldAutoStart({ done: false, search: '', webdriver: true })).toBe(false);
    expect(shouldAutoStart({ done: false, search: '?a=1&skipTour=1', webdriver: false })).toBe(false);
    expect(shouldAutoStart({ done: false, search: '?skipTour=0', webdriver: false })).toBe(true);
  });
  it('la tarjeta va abajo si entra, si no arriba, y nunca se sale de la pantalla (teléfono chico 568 px)', () => {
    expect(placeCard({ top: 80, bottom: 200, left: 0, right: 0 }, 800, 260, 30, 20)).toEqual({ side: 'below', top: 214 });
    expect(placeCard({ top: 500, bottom: 700, left: 0, right: 0 }, 800, 260, 30, 20)).toEqual({ side: 'above', top: 226 });
    for (const [top, bottom] of [[40, 520], [10, 560], [300, 340], [-50, 700]]) {
      const p = placeCard({ top, bottom, left: 0, right: 0 }, 568, 300, 24, 16);
      expect(p.top).toBeGreaterThanOrEqual(24);
      expect(p.top + 300).toBeLessThanOrEqual(568 - 16);
    }
  });
  it('la curva de movimiento va de 0 a 1 sin pasarse y frena al final', () => {
    expect(ease(0)).toBeCloseTo(0, 5); expect(ease(1)).toBeCloseTo(1, 5);
    let prev = 0; for (let x = 0.05; x <= 1; x += 0.05) { const y = ease(x); expect(y).toBeGreaterThanOrEqual(prev - 1e-9); expect(y).toBeLessThanOrEqual(1 + 1e-9); prev = y; }
    expect(ease(0.5)).toBeGreaterThan(0.8);
  });
  it('cinco pasos con 2 o 3 cosas concretas cada uno, uno por tarjeta del menú', () => {
    expect(TOUR_TEXTS.steps.map((s) => s.target)).toEqual(['chat', 'market', 'radar', 'portfolio', 'calc']);
    for (const s of TOUR_TEXTS.steps) { expect(s.chips.length).toBeGreaterThanOrEqual(2); expect(s.chips.length).toBeLessThanOrEqual(3); }
  });
  it('ni el menú ni el recorrido prometen tiempo real, asesoramiento ni nada de lo prohibido', () => {
    for (const x of [...tourTexts(), ...homeTexts()]) {
      for (const [name, re] of FORBIDDEN_CLAIMS) expect(re.test(x), `${name}: ${x}`).toBe(false);
      expect(/asesoramiento|asesor[ií]a|recomendaci[oó]n de inversi/i.test(x), x).toBe(false);
    }
  });
});
