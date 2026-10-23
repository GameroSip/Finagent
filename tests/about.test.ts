import { describe, expect, it } from 'vitest';
import { ABOUT, FORBIDDEN_CLAIMS, aboutTexts } from '../src/about';

describe('textos de presentación de FinAgent', () => {
  it('no prometen nada que hoy no sea cierto (modelo propio entrenado, licencias, respaldo de Google, varias IA, precisión absoluta)', () => {
    for (const t of aboutTexts()) for (const [what, re] of FORBIDDEN_CLAIMS) expect(re.test(t), `${what}: «${t.slice(0, 90)}»`).toBe(false);
  });
  it('el control SÍ atrapa la presentación que se quería usar (las 5 afirmaciones falsas)', () => {
    const wanted = 'FinAgent es una IA propia, con entrenamiento propio, respaldada por Google DeepMind y con decenas de licencias a su favor. Usa varias IA y es 100% confiable.';
    expect(FORBIDDEN_CLAIMS.filter(([, re]) => re.test(wanted)).map(([d]) => d)).toHaveLength(5);
  });
  it('el control atrapa también las promesas de cobertura total y de tiempo real, y la presentación internacional dice sus límites', () => {
    for (const bad of ['Cubrimos todos los mercados del mundo.', 'Cotizaciones en tiempo real de cualquier bolsa.', 'Cobertura total de activos.']) {
      expect(FORBIDDEN_CLAIMS.some(([, re]) => re.test(bad)), bad).toBe(true);
    }
    expect(ABOUT.what).toMatch(/mercados de todo el mundo/);
    expect(ABOUT.what).toMatch(/Argentina/);                       // sigue siendo su especialidad, pero ya no lo único
    expect(ABOUT.coverage).toMatch(/depende de las fuentes/);
    expect(ABOUT.coverage).toMatch(/pueden no estar disponibles/);
    expect(ABOUT.coverage).toMatch(/demora/);
    expect(ABOUT.limits).not.toMatch(/agente registrado ante la CNV/);   // el texto legal ya no es solo argentino
  });
  it('en cambio, lo que SÍ es cierto está dicho con sus nombres reales y sin esconder la tecnología de base', () => {
    expect(ABOUT.what).toMatch(/especializado en finanzas/);
    expect(ABOUT.what).toMatch(/Gemini/);
    expect(ABOUT.what).toMatch(/Google DeepMind/);          // quién desarrolla los modelos: un dato, no un respaldo
    expect(ABOUT.what).toMatch(/herramientas propias/);
    expect(ABOUT.what).toMatch(/verificador/);
    expect(ABOUT.how.join(' ')).toMatch(/fuente y la fecha/);
    expect(ABOUT.limits).toMatch(/no es asesoramiento/i);
    expect(ABOUT.privacy).toMatch(/Google \(Gemini\)/);     // la política de privacidad dice a dónde van las consultas
  });
});
