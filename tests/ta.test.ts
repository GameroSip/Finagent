import { describe, expect, it } from 'vitest';
import { bollingerLast } from '../src/indicators';
import { bollinger, classicPivots, fibonacci, previousPeriod, sessionBands, sessionsAt, sma, volumeProfile, vwap, type TBar } from '../src/ta';

const bar = (t: number, o: number, h: number, l: number, c: number, v = 100): TBar => ({ t, o, h, l, c, v });
const utc = (iso: string) => Date.parse(iso) / 1000;

describe('Fibonacci', () => {
  it('tendencia alcista (el mínimo viene antes que el máximo): 0% en el máximo y 100% en el mínimo', () => {
    const f = fibonacci([bar(1, 10, 11, 9, 10), bar(2, 10, 15, 10, 14), bar(3, 14, 20, 14, 19), bar(4, 19, 19, 17, 18)])!;
    expect(f.dir).toBe('up'); expect(f.high).toBe(20); expect(f.low).toBe(9);
    const p = (r: number) => f.levels.find((l) => l.ratio === r)!.price;
    expect(p(0)).toBe(20); expect(p(1)).toBe(9);
    expect(p(0.5)).toBeCloseTo(14.5, 10);
    expect(p(0.618)).toBeCloseTo(20 - 0.618 * 11, 10);       // 13.202
    expect(p(0.382)).toBeCloseTo(20 - 0.382 * 11, 10);
  });
  it('tendencia bajista (el máximo viene antes): 0% en el mínimo y 100% en el máximo', () => {
    const f = fibonacci([bar(1, 20, 20, 18, 19), bar(2, 19, 19, 12, 13), bar(3, 13, 14, 10, 11)])!;
    expect(f.dir).toBe('down');
    expect(f.levels.find((l) => l.ratio === 0)!.price).toBe(10);
    expect(f.levels.find((l) => l.ratio === 1)!.price).toBe(20);
    expect(f.levels.find((l) => l.ratio === 0.5)!.price).toBe(15);
  });
  it('no inventa niveles cuando no hay movimiento o hay pocos datos', () => {
    expect(fibonacci([bar(1, 5, 5, 5, 5), bar(2, 5, 5, 5, 5)])).toBeNull();
    expect(fibonacci([bar(1, 5, 6, 4, 5)])).toBeNull();
  });
});

describe('pivotes', () => {
  it('fórmulas clásicas', () => {
    const p = classicPivots(110, 90, 100);
    expect(p.p).toBeCloseTo(100, 10);
    expect(p.r1).toBeCloseTo(110, 10); expect(p.s1).toBeCloseTo(90, 10);
    expect(p.r2).toBeCloseTo(120, 10); expect(p.s2).toBeCloseTo(80, 10);
    expect(p.r3).toBeCloseTo(130, 10); expect(p.s3).toBeCloseTo(70, 10);
  });
  it('el período anterior es la barra anterior (diario) o el día anterior completo (intradía); sin día anterior no hay pivotes', () => {
    const d = [bar(1, 1, 5, 1, 3), bar(2, 3, 9, 2, 8), bar(3, 8, 10, 7, 9)];
    expect(previousPeriod(d, false)).toEqual({ h: 9, l: 2, c: 8 });
    expect(previousPeriod([d[0]], false)).toBeNull();
    const t1 = utc('2026-10-19T14:00:00Z'), t2 = utc('2026-10-20T14:00:00Z');
    const intra = [bar(t1, 10, 12, 9, 11), bar(t1 + 300, 11, 13, 10, 12), bar(t2, 12, 20, 11, 15)];
    expect(previousPeriod(intra, true)).toEqual({ h: 13, l: 9, c: 12 });
    expect(previousPeriod([intra[2]], true)).toBeNull();
  });
});

describe('VWAP', () => {
  it('promedio ponderado por volumen y se reinicia cada día', () => {
    const t1 = utc('2026-10-19T14:00:00Z'), t2 = utc('2026-10-20T14:00:00Z');
    const v = vwap([bar(t1, 0, 10, 10, 10, 100), bar(t1 + 300, 0, 20, 20, 20, 300), bar(t2, 0, 50, 50, 50, 10)]);
    expect(v[0]).toBeCloseTo(10, 10);
    expect(v[1]).toBeCloseTo((10 * 100 + 20 * 300) / 400, 10);   // 17.5
    expect(v[2]).toBeCloseTo(50, 10);                            // nuevo día: arranca de cero
  });
  it('sin volumen no hay VWAP', () => {
    expect(vwap([bar(1, 1, 1, 1, 1, 0)])[0]).toBeNull();
  });
});

describe('perfil de volumen', () => {
  const bars = [bar(1, 10, 12, 10, 11, 1000), bar(2, 11, 12, 10, 11, 1000), bar(3, 11, 20, 11, 19, 100), bar(4, 19, 20, 18, 19, 100)];
  it('conserva todo el volumen y encuentra el POC donde se operó más', () => {
    const vp = volumeProfile(bars, 10)!;
    expect(vp.total).toBeCloseTo(2200, 6);
    expect(vp.bins.reduce((a, b) => a + b.vol, 0)).toBeCloseTo(2200, 6);
    expect(vp.poc.lo).toBeGreaterThanOrEqual(10); expect(vp.poc.hi).toBeLessThanOrEqual(12.5);   // el volumen se concentró entre 10 y 12
  });
  it('el área de valor contiene al menos el 70% del volumen y deja afuera las franjas casi vacías', () => {
    const vp = volumeProfile(bars, 10)!;
    const inside = vp.bins.filter((b) => b.lo >= vp.val - 1e-9 && b.hi <= vp.vah + 1e-9).reduce((a, b) => a + b.vol, 0);
    expect(inside / vp.total).toBeGreaterThanOrEqual(0.7);
    expect(vp.vah).toBeLessThan(20); expect(vp.val).toBeGreaterThanOrEqual(10);
  });
  it('una barra sin rango se asigna a su franja; sin volumen o sin variación no hay perfil', () => {
    const vp = volumeProfile([bar(1, 10, 10, 10, 10, 50), bar(2, 10, 20, 10, 15, 50)], 5)!;
    expect(vp.total).toBeCloseTo(100, 6);
    expect(volumeProfile([bar(1, 1, 2, 1, 1, 0), bar(2, 1, 2, 1, 1, 0)])).toBeNull();
    expect(volumeProfile([bar(1, 5, 5, 5, 5, 10), bar(2, 5, 5, 5, 5, 10)])).toBeNull();
  });
});

describe('sesiones de mercado (hora local de cada plaza)', () => {
  it('en octubre (EE.UU. y Londres con horario de verano) a las 14:30 UTC están abiertas Londres y Nueva York', () => {
    expect(sessionsAt(utc('2026-10-20T14:30:00Z')).sort()).toEqual(['london', 'newyork']);   // 15:30 en Londres, 10:30 en Nueva York
  });
  it('de madrugada solo Asia; de noche, ninguna', () => {
    expect(sessionsAt(utc('2026-10-20T03:00:00Z'))).toEqual(['asia']);                       // 12:00 en Tokio
    expect(sessionsAt(utc('2026-10-20T22:30:00Z'))).toEqual([]);
  });
  it('el horario de verano se respeta solo: el mismo instante UTC da otra sesión en octubre que en diciembre', () => {
    // Londres abre a las 08:00 locales: 07:00 UTC con horario de verano (octubre) y 08:00 UTC en invierno (diciembre).
    expect(sessionsAt(utc('2026-10-20T07:30:00Z'))).toContain('london');
    expect(sessionsAt(utc('2026-12-15T07:30:00Z'))).not.toContain('london');
    expect(sessionsAt(utc('2026-12-15T08:30:00Z'))).toContain('london');
    // Nueva York abre a las 08:00 locales: 12:00 UTC en octubre y 13:00 UTC en diciembre.
    expect(sessionsAt(utc('2026-10-20T12:30:00Z'))).toContain('newyork');
    expect(sessionsAt(utc('2026-12-15T12:30:00Z'))).not.toContain('newyork');
    expect(sessionsAt(utc('2026-12-15T13:30:00Z'))).toContain('newyork');
  });
  it('los fines de semana no hay sesiones', () => {
    expect(sessionsAt(utc('2026-10-24T14:30:00Z'))).toEqual([]);                             // sábado
  });
  it('arma tramos continuos por sesión sobre una serie de velas', () => {
    const t0 = utc('2026-10-20T00:00:00Z'), times = Array.from({ length: 24 }, (_, i) => t0 + i * 3600);
    const bands = sessionBands(times);
    const asia = bands.find((b) => b.id === 'asia')!, ny = bands.find((b) => b.id === 'newyork')!, ldn = bands.find((b) => b.id === 'london')!;
    expect(asia).toEqual({ id: 'asia', from: t0, to: t0 + 8 * 3600 });                      // 00:00–08:59 UTC (09:00–17:59 en Tokio)
    expect(ldn.from).toBe(t0 + 7 * 3600);                                                    // 07:00 UTC = 08:00 BST
    expect(ny.from).toBe(t0 + 12 * 3600); expect(ny.to).toBe(t0 + 20 * 3600);              // 12:00–20:59 UTC = 08:00–16:59 EDT
  });
});

describe('medias y bandas', () => {
  it('la media móvil simple y las bandas de Bollinger coinciden con el cálculo puntual existente', () => {
    const close = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.3);
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    const b = bollinger(close, 20, 2), last = bollingerLast(close, 20, 2);
    expect(b.upper.at(-1)).toBeCloseTo(last.upper, 10);
    expect(b.mid.at(-1)).toBeCloseTo(last.mid, 10);
    expect(b.lower.at(-1)).toBeCloseTo(last.lower, 10);
    expect(b.upper[18]).toBeNull(); expect(b.upper[19]).not.toBeNull();
  });
});
