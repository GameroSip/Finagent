// Duelo: FinAgent vs Gemini a secas vs Gemini con búsqueda de Google, con las mismas preguntas en español e inglés.
//   npm run duel                    todo, con Gemini REAL y datos REALES (necesita GEMINI_API_KEY o evals/.env)
//   npm run duel -- --lang=es       solo español   |   --lang=en   solo inglés
//   npm run duel -- --no-search     sin el brazo de búsqueda de Google
//   npm run duel -- --only=quote-aapl,fx-blue   |   --limit=5   |   --rpm=6   |   --model=gemini-3.5-flash-lite
//   npm run duel -- --diagnose      solo prueba cada fuente de datos desde este entorno (no usa Gemini)
//   npm run duel:fake               prueba del instrumento con modelos falsos y datos congelados (no gasta cuota)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultHttp } from '../../src/http';
import { GeminiError, ModelManager } from '../../src/models';
import { EVALS_DIR, flag, loadEnvFile, realGemini } from '../common';
import { frozenHttp } from '../frozen-data';
import { FatalDuelError } from './arms';
import { diagnoseSources, renderSourceChecks } from './diagnose';
import { fakeDuelGemini } from './fake';
import { DUEL_QUESTIONS, type Lang } from './questions';
import { renderDuelReport } from './report';
import { PreflightError, runDuel } from './run';

async function diagnose() {
  const checks = await diagnoseSources();
  const md = renderSourceChecks(checks, process.env.GITHUB_ACTIONS ? 'servidores de GitHub Actions' : 'este equipo');
  const dir = flag('out') ?? join(EVALS_DIR, 'reports');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  writeFileSync(join(dir, `duelo-fuentes-${stamp}.md`), md);
  console.log('\n' + md);
}

async function main() {
  loadEnvFile();
  if (flag('diagnose') !== undefined) { await diagnose(); return; }
  const fake = flag('fake') !== undefined;
  const frozen = fake || flag('frozen') !== undefined;
  const apiKey = fake ? 'clave-falsa' : process.env.GEMINI_API_KEY ?? '';
  if (!fake && !apiKey) {
    console.error('Falta la clave de Gemini.\n  - Windows (PowerShell):  $env:GEMINI_API_KEY="tu_clave"; npm run duel\n  - Mac/Linux:             GEMINI_API_KEY=tu_clave npm run duel\n  - o copiá evals/.env.example a evals/.env y completala.');
    process.exit(2);
  }
  const langFlag = flag('lang');
  const langs: Lang[] = langFlag === 'es' ? ['es'] : langFlag === 'en' ? ['en'] : ['es', 'en'];
  let questions = DUEL_QUESTIONS;
  const only = flag('only'), limit = Number(flag('limit') ?? 0);
  if (only) questions = questions.filter((q) => only.split(',').includes(q.id));
  if (limit > 0) questions = questions.slice(0, limit);
  if (!questions.length) { console.error('Ninguna pregunta coincide. Disponibles:\n  ' + DUEL_QUESTIONS.map((q) => q.id).join('\n  ')); process.exit(2); }

  const models = new ModelManager();
  if (fake) models.chain = ['gemini-fake-flash'];
  else {
    try { await models.discover(apiKey, true, true); }
    catch (e) { console.error(e instanceof GeminiError && e.kind === 'invalid_key' ? 'La clave de Gemini no es válida.' : `No pude consultar los modelos de Gemini: ${(e as Error).message}`); process.exit(2); }
    const pinned = flag('model') ?? process.env.EVAL_MODEL;
    if (pinned) models.chain = [pinned];
  }

  const rpm = Number(flag('rpm') ?? process.env.EVAL_RPM ?? (fake ? 100000 : 8));
  const search = flag('no-search') === undefined;
  const mode = fake ? 'PRUEBA con modelos falsos y datos congelados' : frozen ? 'Gemini REAL con datos congelados (solo desarrollo)' : 'Gemini REAL con datos de mercado REALES';
  console.log(`\nDuelo FinAgent — ${mode}\n  preguntas: ${questions.length} × ${langs.join('+')}   búsqueda: ${search ? 'sí' : 'no'}   modelos: ${models.chain.slice(0, 3).join(', ')}\n`);

  const dir = flag('out') ?? join(EVALS_DIR, 'reports');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const base = join(dir, `duelo-${fake ? 'falso' : frozen ? 'congelado' : 'real'}-${stamp}`);
  const meta = { when: new Date().toLocaleString('es-AR'), mode, langs, modelChain: models.chain, frozen };

  const t0 = Date.now();
  try {
    const { rows, summary } = await runDuel({
      questions, langs, models, apiKey, search, rpm, pauseMs: fake ? 0 : 1500, preflight: !frozen, log: (s) => console.log(s),
      gemini: fake ? fakeDuelGemini() : realGemini, dataHttp: frozen ? frozenHttp : defaultHttp,
    });
    writeFileSync(`${base}.md`, renderDuelReport(rows, summary, meta));
    writeFileSync(`${base}.json`, JSON.stringify({ meta, summary, rows }, null, 1));
    console.log(`\n──────── RESULTADO (${((Date.now() - t0) / 1000).toFixed(0)} s) ────────`);
    for (const a of summary.arms) console.log(`${a.label.padEnd(30)} datos correctos ${a.factOk}/${a.factTotal} · cifras incorrectas ${a.factWrong} · se abstiene ${a.factAbstain} · trampas ${a.trapOk}/${a.trapTotal}`);
    if (summary.searchUnavailable) console.log(`\n(La búsqueda de Google no estuvo disponible con esta clave: ${summary.searchUnavailable.slice(0, 140)})`);
    console.log(`\nReporte: ${base}.md\n`);
  } catch (e) {
    if (e instanceof PreflightError) {
      writeFileSync(`${base}-diagnostico.md`, `# Duelo: no se pudo correr\n\n${e.message}\n\nEl duelo con datos reales necesita que Yahoo, DolarAPI y ArgentinaDatos respondan desde el entorno donde se ejecuta. ` +
        `Este resultado también es información: un servidor en un centro de datos puede encontrar el mismo bloqueo, y es una razón más para usar un proveedor de datos con licencia.\n`);
      console.error(`\n${e.message}\nSe guardó un diagnóstico en ${base}-diagnostico.md`);
      process.exit(3);
    }
    if (e instanceof FatalDuelError) { console.error('\n' + e.message); process.exit(2); }
    throw e;
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
