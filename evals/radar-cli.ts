// Backtest del radar de tensión.   npx tsx evals/radar-cli.ts            → con datos reales de Yahoo (necesita internet)
//                                  npx tsx evals/radar-cli.ts --synthetic → con caminos aleatorios (prueba del circuito, sin internet)
import { mkdirSync, writeFileSync } from 'node:fs';
import { backtest, type AssetSeries } from '../src/radarBacktest';
import { fetchDaily, synthetic } from './radar/data';
import { buildReport } from './radar/report';
import { UNIVERSE } from './radar/universe';

const args = process.argv.slice(2), isSynthetic = args.includes('--synthetic'), strict = args.includes('--strict');   // --strict: solo días con las 4 condiciones medibles y datos de rango reales
const only = args.find((a) => a.startsWith('--symbols='))?.slice(10).split(',').filter(Boolean);
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const state = { blocked: 0 };
const series: AssetSeries[] = [], excluded: Array<{ symbol: string; why: string }> = [];
const list = UNIVERSE.filter(([s]) => !only || only.includes(s));
if (args.includes('--list')) { console.log(list.map(([s]) => s).join(' ')); process.exit(0); }
let k = 0;
for (const [symbol, group] of list) {
  try {
    const bars = isSynthetic ? synthetic(1000 + k++ * 7919, 6000, group === 'cripto' ? 0.035 : group === 'acciones' ? 0.018 : 0.011) : (await fetchDaily(symbol, state)).bars;
    if (bars.length < 500) { excluded.push({ symbol, why: `poca historia (${bars.length} ruedas)` }); continue; }
    if (bars.filter((b) => b.v > 0).length < bars.length * 0.6) { excluded.push({ symbol, why: 'no informa volumen (la condición de volumen no se puede medir)' }); continue; }
    series.push({ symbol, group, bars });
    console.log(`✔ ${symbol.padEnd(9)} ${String(bars.length).padStart(5)} ruedas  ${day(bars[0].t)} → ${day(bars[bars.length - 1].t)}`);
  } catch (e: any) { excluded.push({ symbol, why: `no se pudo descargar (${String(e?.message ?? e).slice(0, 90)})` }); console.log(`✘ ${symbol}: ${e?.message ?? e}`); }
  if (!isSynthetic && state.blocked < 4) await sleep(300);
}
if (series.length < 5) { console.error(`Datos insuficientes: solo ${series.length} activos utilizables.`); process.exitCode = 1; }
const blocks = backtest(series, { strict });
const md = buildReport(blocks, { when: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', synthetic: isSynthetic, excluded, used: series.map((s) => ({ symbol: s.symbol, group: s.group, bars: s.bars.length, from: day(s.bars[0].t), to: day(s.bars[s.bars.length - 1].t) })) });
mkdirSync('evals/reports', { recursive: true });
const name = (isSynthetic ? 'radar-backtest-sintetico' : 'radar-backtest') + (strict ? '-estricto' : '');
writeFileSync(`evals/reports/${name}.md`, md); writeFileSync(`evals/reports/${name}.json`, JSON.stringify(blocks));
console.log(`\nReporte: evals/reports/${name}.md (${series.length} activos, ${blocks.length} bloques)`);
