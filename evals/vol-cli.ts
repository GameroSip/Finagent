// Backtest de volatilidad y cola izquierda (criterios en evals/radar/PREREGISTRO-VOL.md).
//   npx tsx evals/vol-cli.ts            → datos reales
//   npx tsx evals/vol-cli.ts --synthetic → caminos aleatorios (prueba del circuito, sin internet)
//   npx tsx evals/vol-cli.ts --list      → símbolos a descargar
import { mkdirSync, writeFileSync } from 'node:fs';
import type { DayBar } from '../src/radar';
import type { AssetSeries } from '../src/radarBacktest';
import { fetchDaily, synthetic } from './radar/data';
import { UNIVERSE } from './radar/universe';
import { build, report } from './radar/vol';

const args = process.argv.slice(2), isSynthetic = args.includes('--synthetic');
if (args.includes('--list')) { console.log([...UNIVERSE.map(([s]) => s), '^VIX'].join(' ')); process.exit(0); }
const only = args.find((a) => a.startsWith('--symbols='))?.slice(10).split(',').filter(Boolean);
const PREREG = process.env.PREREG_COMMIT ?? 'fd04292';
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const state = { blocked: 0 }, series: AssetSeries[] = [], excluded: Array<{ symbol: string; why: string }> = [];
let k = 0;
for (const [symbol, group] of UNIVERSE.filter(([s]) => !only || only.includes(s))) {
  try {
    const bars = isSynthetic ? synthetic(2000 + k++ * 7919, 7000, group === 'cripto' ? 0.035 : group === 'acciones' ? 0.018 : 0.011) : (await fetchDaily(symbol, state)).bars;
    if (bars.length < 1500) { excluded.push({ symbol, why: `poca historia (${bars.length} ruedas)` }); continue; }
    if (bars.filter((b) => b.v > 0).length < bars.length * 0.6) { excluded.push({ symbol, why: 'no informa volumen (se excluye igual que en el backtest del radar, para comparar lo mismo)' }); continue; }
    series.push({ symbol, group, bars }); console.log(`✔ ${symbol.padEnd(9)} ${String(bars.length).padStart(5)} ruedas  ${day(bars[0].t)} → ${day(bars[bars.length - 1].t)}`);
  } catch (e: any) { excluded.push({ symbol, why: `no se pudo descargar (${String(e?.message ?? e).slice(0, 90)})` }); console.log(`✘ ${symbol}: ${e?.message ?? e}`); }
}
let vix: DayBar[] | null = null;
if (isSynthetic) vix = synthetic(77, 7000, 0.011).map((b) => ({ ...b, c: Math.sqrt(252) * 0.011 * 100 * (0.9 + 0.2 * Math.abs(Math.sin(b.t / 3e6))) }));
else { try { vix = (await fetchDaily('^VIX', state)).bars; } catch (e: any) { console.log(`✘ ^VIX: ${e?.message ?? e}`); } }
if (series.length < 5) { console.error(`Datos insuficientes: ${series.length} activos.`); process.exitCode = 1; }
const list = build(series);
const md = report(list, vix, { when: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', synthetic: isSynthetic, excluded, commitPrereg: PREREG });
mkdirSync('evals/reports', { recursive: true });
const name = isSynthetic ? 'vol-backtest-sintetico' : 'vol-backtest';
writeFileSync(`evals/reports/${name}.md`, md);
console.log(`\nReporte: evals/reports/${name}.md (${list.length} activos)`);
