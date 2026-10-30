import { describe, expect, it } from 'vitest';
import { buildReport, verdict } from '../evals/radar/report';
import { synthetic } from '../evals/radar/data';
import { levelOf, radarSeries, RADAR_PARAMS, type DayBar } from '../src/radar';
import { backtest, baseRates, forwardMax, forwardMin, forwardRet, median, quantile, wilson, type AssetSeries, type Block, type Cell } from '../src/radarBacktest';

/** Barras planas (precio 100, rango 99,5–100,5, volumen 1 M) para armar escenarios a mano. */
const flat = (n: number, o: Partial<DayBar> = {}): DayBar[] => Array.from({ length: n }, (_, i) => ({ t: 1_000_000 + i * 86400, o: 100, h: 100.5, l: 99.5, c: 100, v: 1_000_000, ...o }));
const last = <T,>(a: T[]) => a[a.length - 1];

describe('radar: nunca usa información del futuro', () => {
  it('el resultado de cada día es idéntico con la serie completa o cortada en ese día', () => {
    const bars = synthetic(42, 700), full = radarSeries(bars);
    for (const k of [80, 150, 301, 555, 700]) {
      const cut = radarSeries(bars.slice(0, k));
      for (let i = 0; i < k; i++) expect({ s: cut[i].score, l: cut[i].level, c: cut[i].conditions }).toEqual({ s: full[i].score, l: full[i].level, c: full[i].conditions });
    }
  });
  it('cambiar los datos FUTUROS no altera las señales pasadas', () => {
    const bars = synthetic(7, 500), a = radarSeries(bars);
    const tampered = bars.map((b, i) => (i > 300 ? { ...b, c: b.c * 0.5, l: b.l * 0.5, h: b.h * 0.5, v: b.v * 9 } : b)), c = radarSeries(tampered);
    for (let i = 0; i <= 300; i++) expect(c[i].conditions).toEqual(a[i].conditions);
  });
  it('los primeros días (calentamiento) no emiten ninguna señal', () => {
    const pts = radarSeries(synthetic(3, 200));
    expect(pts.slice(0, RADAR_PARAMS.warmup).every((p) => !p.ready && p.level === 'verde' && p.score === 0)).toBe(true);
  });
});

describe('radar: cada condición se dispara cuando corresponde', () => {
  it('ruptura de soporte: el cierre perfora el mínimo de las últimas 20 ruedas', () => {
    const b = flat(80); b.push({ ...b[0], c: 98, l: 97.5, h: 100, o: 100 });
    expect(last(radarSeries(b)).conditions.support).toBe(true);
    const ok = flat(80); ok.push({ ...ok[0], c: 99.6, l: 99.4 });
    expect(last(radarSeries(ok)).conditions.support).toBe(false);
  });
  it('volumen: solo cuenta en una rueda BAJISTA y con volumen ≥ 1,5× el habitual', () => {
    const mk = (c: number, v: number) => { const b = flat(80); b.push({ ...b[0], c, v }); return last(radarSeries(b)).conditions.volume; };
    expect(mk(99, 2_000_000)).toBe(true);
    expect(mk(99, 1_200_000)).toBe(false);          // baja, pero sin volumen anormal
    expect(mk(101, 3_000_000)).toBe(false);         // volumen alto, pero la rueda subió
  });
  it('si el activo no informa volumen, esa condición no se puede medir (null) y quedan 3 disponibles', () => {
    const p = last(radarSeries(flat(90, { v: 0 })));
    expect(p.conditions.volume).toBeNull(); expect(p.available).toBe(3);
  });
  it('volatilidad: se dispara cuando el rango de la última semana se ensancha frente al trimestre', () => {
    const b = flat(80); for (let k = 0; k < 5; k++) b.push({ ...b[0], h: 104, l: 96, c: k % 2 ? 97 : 103 });
    expect(last(radarSeries(b)).conditions.volatility).toBe(true);
    expect(last(radarSeries(flat(90))).conditions.volatility).toBe(false);
  });
  it('agotamiento: sube fuerte (RSI alto) y después el impulso se debilita', () => {
    const b: DayBar[] = []; let p = 100;
    for (let i = 0; i < 70; i++) { p *= i < 50 ? 1.01 : i < 56 ? 1.0 : 0.994; b.push({ t: i * 86400, o: p, h: p * 1.004, l: p * 0.996, c: p, v: 1e6 }); }
    const pts = radarSeries(b);
    expect(pts.slice(58).some((x) => x.conditions.momentum)).toBe(true);
    expect(pts.slice(0, 50).every((x) => !x.conditions.momentum)).toBe(true);           // mientras sube sin debilitarse, no
  });
});

describe('semáforo', () => {
  it('verde < mitad, amarillo = mitad, rojo ≥ 75 % de las condiciones disponibles', () => {
    expect([[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [2, 3], [3, 3], [0, 0]].map(([s, a]) => levelOf(s, a))).toEqual(['verde', 'verde', 'amarillo', 'rojo', 'rojo', 'amarillo', 'rojo', 'verde']);
  });
});

describe('estadística del backtest', () => {
  it('intervalo de Wilson, mediana y cuantiles', () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
    const [lo, hi] = wilson(50, 100); expect(lo).toBeCloseTo(0.404, 2); expect(hi).toBeCloseTo(0.596, 2);
    expect(wilson(0, 50)[0]).toBe(0); expect(wilson(3, 3)[1]).toBe(1);
    expect(median([3, 1, 2])).toBe(2); expect(median([1, 2, 3, 4])).toBe(2.5); expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.1)).toBe(1);
  });
  it('las caídas y subas futuras se miran desde el día SIGUIENTE (hoy no cuenta) y no se inventan al final de la serie', () => {
    const b = flat(6).map((x, i) => ({ ...x, c: [100, 95, 90, 105, 110, 80][i] }));
    expect(forwardMin(b, 0, 2)).toBeCloseTo(-0.1); expect(forwardMax(b, 0, 4)).toBeCloseTo(0.1); expect(forwardRet(b, 0, 3)).toBeCloseTo(0.05);
    expect(forwardMin(b, 4, 3)).toBeNull(); expect(forwardMax(b, 5, 1)).toBeNull();
  });
  it('la tasa esperada se calcula con la tasa base de CADA activo (no mezcla un activo volátil con uno tranquilo)', () => {
    const rows = [...Array(10)].map((_, i) => ({ asset: 'VOLATIL', drop: i < 5 ? -0.2 : -0.01, up: 0 })).concat([...Array(10)].map(() => ({ asset: 'CALMO', drop: -0.01, up: 0 })));
    const br = baseRates(rows, 0.1);
    expect(br.get('VOLATIL')!.drop).toBe(0.5); expect(br.get('CALMO')!.drop).toBe(0);
  });
});

describe('backtest completo', () => {
  const mix = (): AssetSeries[] => ['índices', 'ETF', 'acciones', 'acciones', 'cripto', 'cripto'].map((g, k) => ({ symbol: `S${k}`, group: g as AssetSeries['group'], bars: synthetic(900 + k * 31, 5000, g === 'cripto' ? 0.035 : g === 'acciones' ? 0.018 : 0.01) }));
  it('control: sobre un camino aleatorio sin señal escondida, el rojo NO mejora al azar y el veredicto lo dice', () => {
    const blocks = backtest(mix()), all = blocks.find((b) => b.group === 'todos' && b.h === 5 && b.T === 0.05 && b.slice === 'todo')!;
    expect(all.rojo.n).toBeGreaterThan(100);
    expect(all.lift).toBeGreaterThan(0.8); expect(all.lift).toBeLessThan(1.25);          // ≈ 1×: la mezcla de activos NO fabrica una señal falsa
    for (const T of [0.05, 0.1]) for (const h of [3, 5, 20]) {
      const g = (s: string) => blocks.find((b) => b.group === 'todos' && b.h === h && b.T === T && b.slice === s);
      expect(verdict(g('todo'), g('antes de 2015'), g('desde 2015'))).not.toBe('alarma útil');
    }
  });
  it('el reporte sale completo, sin NaN y con la advertencia de datos sintéticos', () => {
    const md = buildReport(backtest(mix()), { when: 'test', synthetic: true, excluded: [{ symbol: 'X', why: 'sin volumen' }], used: [{ symbol: 'S0', group: 'índices', bars: 10, from: '2000-01-01', to: '2016-01-01' }] });
    for (const h of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5. Veredicto', 'SINTÉTICOS', 'sin volumen']) expect(md).toContain(h);
    expect(md).not.toMatch(/NaN|undefined/);
  });
});

describe('veredicto (regla fija)', () => {
  const cell = (o: Partial<Cell> = {}): Cell => ({ n: 500, events: 50, rate: 0.1, lo: 0.08, hi: 0.13, exp: 0.04, ups: 20, upRate: 0.04, expUp: 0.04, meanRet: 0, medRet: 0, p10Ret: -0.05, ...o });
  const blk = (o: Partial<Block> = {}): Block => ({ group: 'todos', assets: 50, h: 5, T: 0.1, slice: 'todo', base: cell(), verde: cell(), amarillo: cell(), rojo: cell(), rojoEpisodios: cell(), rojoSinCaidaPrevia: cell(), yaCayo: cell(), lift: 2.5, liftUp: 1.0, directional: 2.5, precision: 0.1, recall: 0.02, ...o });
  it('"alarma útil" solo con lift ≥ 2×, intervalo por encima de lo esperado, dirección clara y estable en los dos períodos', () => {
    expect(verdict(blk(), blk(), blk())).toBe('alarma útil');
    expect(verdict(blk(), blk({ lift: 1.4 }), blk())).not.toBe('alarma útil');                   // no se sostiene antes de 2015
    expect(verdict(blk({ directional: 1.1, lift: 2.5, liftUp: 2.3 }), blk(), blk())).toBe('detecta volatilidad, no dirección');
  });
  it('sin ventaja sobre el azar, o con muy pocos casos, lo dice', () => {
    const nada = blk({ lift: 1.0, rojo: cell({ lo: 0.03, exp: 0.04 }) });
    expect(verdict(nada, nada, nada)).toBe('no se distingue del azar');
    const poco = blk({ rojo: cell({ n: 10 }) });
    expect(verdict(poco, poco, poco)).toBe('sin datos suficientes');
    expect(verdict(undefined, undefined, undefined)).toBe('sin datos suficientes');
  });
});
