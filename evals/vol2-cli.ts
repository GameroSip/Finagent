// Backtest 3: movimiento esperado con coeficientes por grupo (criterios en evals/radar/PREREGISTRO-VOL2.md).
//   npx tsx evals/vol2-cli.ts [--synthetic|--list]
import { mkdirSync, writeFileSync } from 'node:fs';
import type { DayBar } from '../src/radar';
import { evaluatePooled, finalModels, type PooledGroup } from '../src/volPooled';
import { fetchDaily, synthetic } from './radar/data';
import { UNIVERSE } from './radar/universe';
import { diagnostic, har3Map, report, verdicts } from './radar/vol2';

const args = process.argv.slice(2), isSynthetic = args.includes('--synthetic');
if (args.includes('--list')) { console.log([...UNIVERSE.map(([s]) => s), '^VIX'].join(' ')); process.exit(0); }
const PREREG = process.env.PREREG_COMMIT ?? '3cbd797';
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const state = { blocked: 0 }, assets: Array<{ symbol: string; group: PooledGroup; bars: DayBar[] }> = [], excluded: Array<{ symbol: string; why: string }> = [];
let k = 0;
for (const [symbol, group] of UNIVERSE) {
  try {
    const bars = isSynthetic ? synthetic(4000 + k++ * 7919, 7000, group === 'cripto' ? 0.035 : 0.015) : (await fetchDaily(symbol, state)).bars;
    if (bars.length < 1500) { excluded.push({ symbol, why: `poca historia (${bars.length} ruedas)` }); continue; }
    if (bars.filter((b) => b.v > 0).length < bars.length * 0.6) { excluded.push({ symbol, why: 'no informa volumen (se excluye igual que en los backtests anteriores, para comparar lo mismo)' }); continue; }
    assets.push({ symbol, group: group as PooledGroup, bars }); console.log(`✔ ${symbol.padEnd(9)} ${String(bars.length).padStart(5)} ruedas  ${day(bars[0].t)} → ${day(bars[bars.length - 1].t)}`);
  } catch (e: any) { excluded.push({ symbol, why: `no se pudo descargar (${String(e?.message ?? e).slice(0, 90)})` }); console.log(`✘ ${symbol}: ${e?.message ?? e}`); }
}
let vix: DayBar[] | null = null;
if (isSynthetic) vix = synthetic(77, 7000, 0.011).map((b) => ({ ...b, c: Math.sqrt(252) * 0.011 * 100 * (0.9 + 0.2 * Math.abs(Math.sin(b.t / 3e6))) }));
else { try { vix = (await fetchDaily('^VIX', state)).bars; } catch (e: any) { console.log(`✘ ^VIX: ${e?.message ?? e}`); } }
if (assets.length < 5) { console.error(`Datos insuficientes: ${assets.length} activos.`); process.exitCode = 1; }
const rows = evaluatePooled(assets), har3 = har3Map(assets), models = finalModels(assets);
const md = report(rows, har3, vix, models, { when: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', synthetic: isSynthetic, excluded, prereg: PREREG, assets });
mkdirSync('evals/reports', { recursive: true });
const name = isSynthetic ? 'vol2-backtest-sintetico' : 'vol2-backtest';
writeFileSync(`evals/reports/${name}.md`, md);
writeFileSync(`evals/reports/${name}-modelo.json`, JSON.stringify({ calibrado: new Date().toISOString().slice(0, 10), prereg: PREREG, assets: assets.length, groups: models, veredicto: verdicts(rows, har3, vix) }, null, 1));
writeFileSync(`evals/reports/${name}-diagnostico.md`, diagnostic(assets, rows, har3, vix));
console.log(`\nReporte: evals/reports/${name}.md (${assets.length} activos, ${rows.length} casos)`);
