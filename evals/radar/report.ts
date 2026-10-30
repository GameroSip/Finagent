import { HORIZONS, type Block, type Cell } from '../../src/radarBacktest';
import { RADAR_PARAMS } from '../../src/radar';

const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)} %` : '—');
const num = (x: number) => (Number.isFinite(x) ? (x >= 1000 ? `${(x / 1000).toFixed(1)} mil` : String(x)) : '—');
const rate = (c: Cell) => (c.n ? `${pct(c.rate)} [${pct(c.lo)}–${pct(c.hi)}]` : '—');
const x = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)}×` : '—');

export type Verdict = 'alarma útil' | 'señal débil (termómetro)' | 'detecta volatilidad, no dirección' | 'no se distingue del azar' | 'sin datos suficientes';
/** Regla fija y pública (definida antes de ver resultados). "Alarma útil" exige TODO esto: las caídas tras un rojo son al menos el doble de lo esperado por azar (con el mismo activo), el extremo inferior del intervalo supera lo esperado,
 *  las caídas aumentan claramente más que las subas (si no, solo detecta volatilidad), y se sostiene antes y después de 2015. */
export function verdict(all: Block | undefined, pre: Block | undefined, post: Block | undefined): Verdict {
  if (!all || all.rojoEpisodios.n < 30 || !pre || !post || pre.rojo.n < 30 || post.rojo.n < 30) return 'sin datos suficientes';
  const ok = (b: Block) => Number.isFinite(b.lift) && b.lift >= 2 && b.rojo.lo > b.rojo.exp;
  if (ok(all) && ok(pre) && ok(post) && all.directional >= 1.5) return 'alarma útil';
  if (all.lift >= 1.25 && all.rojo.lo > all.rojo.exp) return all.directional < 1.25 ? 'detecta volatilidad, no dirección' : 'señal débil (termómetro)';
  return 'no se distingue del azar';
}

export function buildReport(blocks: Block[], meta: { when: string; used: Array<{ symbol: string; group: string; bars: number; from: string; to: string }>; excluded: Array<{ symbol: string; why: string }>; synthetic: boolean }): string {
  const get = (group: string, h: number, T: number, slice = 'todo') => blocks.find((b) => b.group === group && b.h === h && b.T === T && b.slice === slice);
  const groups = ['todos', 'índices', 'ETF', 'acciones', 'cripto'].filter((g) => blocks.some((b) => b.group === g));
  const L: string[] = [];
  L.push('# Radar de tensión — backtest', '');
  if (meta.synthetic) L.push('> **DATOS SINTÉTICOS (camino aleatorio, sin ninguna señal escondida).** Solo prueban que el circuito funciona; no dicen nada de los mercados reales. Sirven además de control: un radar honesto no debería "funcionar" acá.', '');
  L.push(`Ejecutado: ${meta.when} · ${meta.used.length} activos · períodos: ${meta.used.length ? `${meta.used.map((u) => u.from).sort()[0]} a ${meta.used.map((u) => u.to).sort().slice(-1)[0]}` : '—'}`, '');
  L.push('## Cómo leer esto', '',
    '- **Evento** = el cierre más bajo de las próximas *h* ruedas queda ≥ 5 % (o ≥ 10 %) por debajo del cierre del día. 3 ruedas ≈ las "24 a 72 horas" de la idea original.',
    '- **Esperada por azar** = la frecuencia de caídas de ese mismo activo en un día cualquiera (así no se confunde "activo volátil" con "señal"). **Lift** = caídas tras rojo ÷ esperadas. 1× = el rojo no aporta nada.',
    '- **Lift subas** y **Direccionalidad** = lo mismo para subas ≥ umbral, y el cociente caídas/subas. Cerca de 1× significa que el radar solo detecta que habrá movimientos grandes (volatilidad), no hacia dónde.',
    '- **Precisión** = de cada 100 rojos, cuántos terminaron en caída. **Cobertura** = de todas las caídas, cuántas venían precedidas por un rojo.',
    '- Entre corchetes, intervalo de confianza del 95 % (**optimista**: los días seguidos y los activos que se mueven juntos no son independientes).',
    '- Los umbrales del radar se fijaron antes de mirar datos y no se ajustaron. Universo = activos que hoy existen (**sesgo de supervivencia**: el resultado real sería algo peor).', '');
  L.push('## 1. Qué tan rara es una caída fuerte (días cualquiera)', '', '| Grupo | Horizonte | Días | Caída ≥ 5 % | Caída ≥ 10 % |', '|---|---|---|---|---|');
  for (const g of groups) for (const h of HORIZONS) { const a = get(g, h, 0.05), b = get(g, h, 0.1); if (a && b) L.push(`| ${g} | ${h} ruedas | ${num(a.base.n)} | ${pct(a.base.rate, 2)} | ${pct(b.base.rate, 2)} |`); }
  L.push('');
  for (const T of [0.1, 0.05]) {
    L.push(`## 2. ¿El rojo anticipa una caída ≥ ${T * 100} %?`, '', '| Grupo | Horizonte | Días en rojo | Caída tras rojo | Esperada por azar | Lift caídas | Lift subas | Direccionalidad | Precisión | Cobertura | Episodios (tasa) |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const g of groups) for (const h of HORIZONS) { const b = get(g, h, T); if (b) L.push(`| ${g} | ${h} | ${num(b.rojo.n)} | ${rate(b.rojo)} | ${pct(b.rojo.exp, 2)} | ${x(b.lift)} | ${x(b.liftUp)} | ${x(b.directional)} | ${pct(b.precision)} | ${pct(b.recall)} | ${b.rojoEpisodios.n} (${pct(b.rojoEpisodios.rate)}) |`); }
    L.push('');
  }
  L.push('## 3. ¿Avisa antes o llega tarde? (caída ≥ 5 %, todos los activos)', '', '| Horizonte | Tras rojo (episodio) | Tras rojo que NO venía cayendo | Tras "ya cayó ≥ 5 % en 3 ruedas" |', '|---|---|---|---|');
  const vs = (c: Cell) => `${rate(c)} vs ${pct(c.exp)} esperado (n=${num(c.n)})`;
  for (const h of HORIZONS) { const b = get('todos', h, 0.05); if (b) L.push(`| ${h} ruedas | ${vs(b.rojoEpisodios)} | ${vs(b.rojoSinCaidaPrevia)} | ${vs(b.yaCayo)} |`); }
  L.push('', '*Si el rojo "sin caída previa" no supera lo esperado, el radar no avisa antes: solo confirma una caída que ya empezó.*', '');
  L.push('## 4. Estabilidad en el tiempo (todos los activos)', '', '| Caída | Horizonte | Período | Días en rojo | Caída tras rojo | Esperada | Lift caídas | Direccionalidad |', '|---|---|---|---|---|---|---|---|');
  for (const T of [0.1, 0.05]) for (const h of [5, 20]) for (const s of ['antes de 2015', 'desde 2015']) { const b = get('todos', h, T, s); if (b) L.push(`| ≥ ${T * 100} % | ${h} | ${s} | ${num(b.rojo.n)} | ${rate(b.rojo)} | ${pct(b.rojo.exp, 2)} | ${x(b.lift)} | ${x(b.directional)} |`); }
  L.push('');
  L.push('## 5. Veredicto automático', '', '*Regla fijada de antemano: "alarma útil" solo si las caídas tras rojo son ≥ 2× lo esperado por azar (mismo activo), el límite inferior del intervalo lo supera, las caídas aumentan ≥ 1,5× más que las subas, y se sostiene antes y después de 2015.*', '', '| Caída | Horizonte | Veredicto |', '|---|---|---|');
  for (const T of [0.1, 0.05]) for (const h of HORIZONS) L.push(`| ≥ ${T * 100} % | ${h} ruedas | ${verdict(get('todos', h, T), get('todos', h, T, 'antes de 2015'), get('todos', h, T, 'desde 2015'))} |`);
  L.push('', '## Datos', '', `Parámetros del radar (fijos): ${JSON.stringify(RADAR_PARAMS)}`, '', '| Activo | Grupo | Ruedas | Desde | Hasta |', '|---|---|---|---|---|');
  for (const u of meta.used) L.push(`| ${u.symbol} | ${u.group} | ${u.bars} | ${u.from} | ${u.to} |`);
  if (meta.excluded.length) { L.push('', '**Excluidos:**', ''); for (const e of meta.excluded) L.push(`- ${e.symbol}: ${e.why}`); }
  return L.join('\n') + '\n';
}
