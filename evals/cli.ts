// Evaluación de FinAgent contra Gemini REAL (o contra un Gemini falso para probar el evaluador).
//   npm run eval:smoke                       6 casos (unos minutos): para ver que todo anda
//   npm run eval                             los 41 casos
//   npm run eval -- --category=trampa        solo una categoría   |   --only=id1,id2   |   --limit=10   |   --repeat=3
//   npm run eval:fake                        modelo falso "bueno" (no gasta cuota): sirve para probar el evaluador
// La clave va en la variable GEMINI_API_KEY o en evals/.env (ver evals/.env.example). Los datos de mercado son SIEMPRE los congelados.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setHttp } from '../src/http';
import { GeminiError, ModelManager } from '../src/models';
import { CASES } from './cases';
import { EVALS_DIR, flag, loadEnvFile, realGemini } from './common';
import { fakeGemini, type FakeMode } from './fake-gemini';
import { FatalEvalError, runEval } from './harness';
import { renderReport } from './report';

const HERE = EVALS_DIR;
const SMOKE = ['datos-precio-aapl', 'rend-6m-1a', 'calc-upside', 'trampa-sin-dato', 'trampa-prediccion', 'multi-seguimiento'];

async function main() {
  loadEnvFile();
  const fakeFlag = flag('fake');
  const fake: FakeMode | null = fakeFlag === undefined ? null : fakeFlag === 'descuidado' ? 'descuidado' : 'bueno';
  const apiKey = fake ? 'clave-falsa' : process.env.GEMINI_API_KEY ?? '';
  if (!fake && !apiKey) {
    console.error('Falta la clave de Gemini.\n  - Windows (PowerShell):  $env:GEMINI_API_KEY="tu_clave"; npm run eval:smoke\n  - Mac/Linux:             GEMINI_API_KEY=tu_clave npm run eval:smoke\n  - o copiá evals/.env.example a evals/.env y completala.');
    process.exit(2);
  }

  let cases = CASES;
  const only = flag('only'), cat = flag('category'), limit = Number(flag('limit') ?? 0);
  if (flag('smoke')) cases = cases.filter((c) => SMOKE.includes(c.id));
  if (only) cases = cases.filter((c) => only.split(',').includes(c.id));
  if (cat) cases = cases.filter((c) => c.category === cat);
  if (limit > 0) cases = cases.slice(0, limit);
  if (!cases.length) { console.error('Ningún caso coincide con esos filtros. Casos disponibles:\n  ' + CASES.map((c) => `${c.id} (${c.category})`).join('\n  ')); process.exit(2); }

  const models = new ModelManager();
  if (fake) models.chain = ['gemini-fake-flash'];
  else {
    try { await models.discover(apiKey, true, true); }
    catch (e) {
      console.error(e instanceof GeminiError && e.kind === 'invalid_key' ? 'La clave de Gemini no es válida.' : `No pude consultar los modelos de Gemini: ${(e as Error).message}`);
      process.exit(2);
    }
    const only = flag('only-model');
    const forced = flag('model') ?? process.env.EVAL_MODEL;
    if (only) models.chain = [only];                     // evalúa SOLO ese modelo (sin saltar a otros si se satura: aparecerán casos "sin evaluar")
    else if (forced) models.chain = [forced, ...models.chain.filter((m) => m !== forced)];
  }

  const rpm = Number(flag('rpm') ?? process.env.EVAL_RPM ?? (fake ? 100000 : 8));
  const repeat = Math.max(1, Number(flag('repeat') ?? 1));
  console.log(`\nFinAgent — evaluación ${fake ? `con Gemini FALSO (${fake})` : 'con Gemini REAL'}\n  casos: ${cases.length}${repeat > 1 ? ` × ${repeat}` : ''}   modelos: ${models.chain.slice(0, 3).join(', ')}   ritmo: ${fake ? 'sin límite' : `${rpm} pedidos/min`}\n`);

  const t0 = Date.now();
  let result;
  try {
    result = await runEval({ cases, gemini: fake ? fakeGemini(fake) : realGemini, models, apiKey, rpm, repeat, pauseMs: fake ? 0 : 1500, log: (s) => console.log(s) });
  } catch (e) {
    if (e instanceof FatalEvalError) { console.error('\n' + e.message); process.exit(2); }
    throw e;
  } finally { setHttp(); }

  const { scores, summary } = result;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const dir = flag('out') ?? join(HERE, 'reports');
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `eval-${fake ? `falso-${fake}` : 'real'}-${stamp}`);
  const meta = { when: new Date().toLocaleString('es-AR'), mode: fake ? `Gemini FALSO (${fake}) — solo para probar el evaluador` : 'Gemini REAL', modelChain: models.chain, cases: cases.length, repeat };
  writeFileSync(`${base}.md`, renderReport(scores, summary, meta));
  writeFileSync(`${base}.json`, JSON.stringify({ meta, summary, cases: scores.map((s) => ({ id: s.id, category: s.category, pass: s.pass, infra: s.infra, checks: s.checks, warnings: s.warnings,
    turns: s.run.turns.map((t) => ({ question: t.question, answer: t.answer, model: t.model, tools: t.tools, stats: t.stats, redacted: t.redacted })) })) }, null, 1));

  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  console.log(`\n──────── RESULTADO (${((Date.now() - t0) / 1000).toFixed(0)} s) ────────`);
  console.log(`Casos aprobados:               ${summary.passed}/${summary.scored} (${pct(summary.passRate)})${summary.infraErrors ? `   [${summary.infraErrors} sin evaluar por errores de Gemini]` : ''}`);
  console.log(`Cifras sin respaldo (1er borrador): ${summary.draftHallucinatedTurns}/${summary.turns} respuestas (${pct(summary.draftHallucinationRate)})  — no siempre son errores`);
  console.log(`Cifras realmente inventadas:   ${summary.draftNumbersInvented} en ${summary.inventedTurns}/${summary.turns} respuestas (${pct(summary.inventedRate)})`);
  if (summary.geminiFailed) console.log(`Pedidos rechazados por Gemini: ${summary.geminiFailed} de ${summary.geminiRequests}`);
  console.log(`Respuestas degradadas:         ${summary.degradedAnswers}   (se quitaron cifras del texto final)`);
  for (const [k, v] of Object.entries(summary.byCategory)) console.log(`  ${k.padEnd(14)} ${v.passed}/${v.scored}`);
  console.log(`\nReporte: ${base}.md\n`);
  const min = Number(flag('min-pass') ?? 0);
  if (min && summary.passRate < min) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
