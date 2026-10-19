// Evaluador: corre cada caso con el agente REAL (mismo código que la app), con el modelo que se le indique (Gemini real o uno falso para
// probar el evaluador) y datos de mercado congelados. Mide qué hace el modelo y puntúa con comprobaciones objetivas.
import { FinancialAgent, GeminiError, type AskStats } from '../src/agent';
import { setHttp, type HttpRequest, type HttpResult } from '../src/http';
import { parseQuota, type ModelManager } from '../src/models';
import { clearCache } from '../src/tools';
import { detectLanguage } from '../src/lang';
import { scanNumbers, tokenMatchesValue, verifyAnswer } from '../src/verify';
import type { Category, EvalCase, Fact } from './cases';
import { frozenHttp } from './frozen-data';


export interface TurnRun {
  question: string; answer: string; model: string; ms: number;
  waitedMs: number;        // tiempo que el propio evaluador esperó por el límite de pedidos (no es latencia del modelo)
  tools: string[]; toolOk: boolean[]; results: unknown[];
  stats: AskStats; redacted: number; truncated: boolean;
  /** Cifras del primer borrador que no tenían respaldo pero que luego SÍ se respaldaron con una herramienta (eran correctas: faltaba trazarlas). */
  draftBacked: string[];
  /** Cifras del primer borrador que nunca llegaron a tener respaldo: las realmente inventadas. */
  draftInvented: string[];
}
export interface CaseRun { id: string; turns: TurnRun[]; error?: { kind: 'infra' | 'app'; message: string } }
export interface Check { name: string; ok: boolean; detail?: string }
export interface CaseScore { id: string; category: Category; soft: boolean; checks: Check[]; pass: boolean; infra?: string; warnings: string[]; run: CaseRun }

export class FatalEvalError extends Error {}

/** Nombres de campos y herramientas que el usuario no tiene por qué ver. */
const INTERNAL_PATTERN = '`?(?:meta\\.as_of|meta\\.source|\\bas_of\\b|pct_vs_ema200|get_(?:quote|fundamentals|financials|technicals|performance|news|headlines|market_overview|movers|argentina_macro)|search_ticker|compare_assets|screen_assets|\\bcalculate\\b|returnOnEquity|debtToEquity|trailingEps|forwardEps|dividendRate)`?';
export const INTERNAL_NAMES = new RegExp(INTERNAL_PATTERN);
const INTERNAL_NAMES_G = new RegExp(INTERNAL_PATTERN, 'g');

// ------------------------------------------------------------------ red: datos congelados + Gemini (real o falso) con ritmo controlado
export interface Rejection { status: number; model: string; message: string; quota: string; retryAfterMs?: number }
export interface Net { http: (req: HttpRequest) => Promise<HttpResult>; geminiRequests: () => number; geminiFailed: () => number; waited: () => number; rejections: () => Rejection[] }
export function makeNet(gemini: (req: HttpRequest) => Promise<HttpResult>, rpm = 8, other: (req: HttpRequest) => HttpResult | Promise<HttpResult> = frozenHttp): Net {
  const gap = 60_000 / Math.max(1, rpm);
  let next = 0, count = 0, failed = 0, waited = 0;
  const rejections: Rejection[] = [];
  const record = (req: HttpRequest, status: number, text: string) => {
    const model = /models\/([^:/?]+)/.exec(req.url)?.[1] ?? '?';
    let message = text.slice(0, 220), quota = '';
    try { const j = JSON.parse(text); message = String(j?.error?.message ?? message).slice(0, 220); for (const d of j?.error?.details ?? []) for (const v of d?.violations ?? []) if (v?.quotaId) quota = String(v.quotaId); } catch { /* texto plano */ }
    const q = parseQuota(text);
    rejections.push({ status, model, message, quota: quota || (q.daily ? 'diario' : ''), retryAfterMs: q.retryAfterMs });
  };
  const gate = async () => { const wait = Math.max(0, next - Date.now()); next = Math.max(next, Date.now()) + gap; if (wait) { waited += wait; await new Promise((r) => setTimeout(r, wait)); } };
  return {
    geminiRequests: () => count, geminiFailed: () => failed, waited: () => waited, rejections: () => rejections,
    http: async (req) => {
      if (new URL(req.url).host === 'generativelanguage.googleapis.com') {
        await gate(); count++;
        try { const res = await gemini(req); if (res.status < 200 || res.status >= 300) { failed++; record(req, res.status, res.text); } return res; }
        catch (e: any) { failed++; record(req, 0, String(e?.message ?? e)); throw e; }
      }
      return other(req); // datos congelados (evaluación) o la red real (duelo con datos reales)
    },
  };
}

// ------------------------------------------------------------------ ejecución de un caso
export async function runCase(c: EvalCase, models: ModelManager, apiKey: string, net?: Net): Promise<CaseRun> {
  clearCache();
  const agent = new FinancialAgent({ apiKey, models, retryDelayMs: 1500 });
  const run: CaseRun = { id: c.id, turns: [] };
  const seen: unknown[] = []; // todo lo que devolvieron las herramientas en la conversación (un seguimiento puede apoyarse en turnos anteriores)
  for (const q of c.turns) {
    const t0 = Date.now(), w0 = net?.waited() ?? 0;
    try {
      const r = await agent.ask(q);
      seen.push(...r.toolCalls.map((x) => x.result));
      const draftBacked = r.stats.draftUnverified.filter((tok) => verifyAnswer(tok, seen, q).ok);
      run.turns.push({ draftBacked, draftInvented: r.stats.draftUnverified.filter((tok) => !draftBacked.includes(tok)),
        question: q, answer: r.answer, model: r.model, ms: Date.now() - t0, waitedMs: (net?.waited() ?? 0) - w0, tools: r.toolCalls.map((x) => x.name), toolOk: r.toolCalls.map((x) => !!x.result?.ok),
        results: r.toolCalls.map((x) => x.result), stats: r.stats, redacted: r.redacted, truncated: r.truncated,
      });
    } catch (e: any) {
      if (e instanceof GeminiError && e.kind === 'invalid_key') throw new FatalEvalError('La clave de Gemini no es válida o fue revocada.');
      run.error = e instanceof GeminiError ? { kind: 'infra', message: `${e.kind}: ${e.message}` } : { kind: 'app', message: `${e?.name ?? 'Error'}: ${e?.message ?? e}` };
      break;
    }
  }
  return run;
}

// ------------------------------------------------------------------ puntuación
const wordIn = (text: string, w: string) => new RegExp(`(^|[^A-Za-z0-9.])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9])`, 'i').test(text);

export function factPresent(answer: string, f: Fact): boolean {
  const values = [f.value, ...(f.alt ?? [])].filter((v) => typeof v === 'number' && Number.isFinite(v));
  return scanNumbers(answer).some((t) => values.some((v) => tokenMatchesValue(t, v) ||
    (f.tol !== undefined && (!(t.sign < 0 && v > 0) && !(t.sign > 0 && v < 0)) && t.cands.some(([x, d]) => t.scales.some((s) => Math.abs(x * s - Math.abs(v)) <= Math.max(f.tol!, 10 ** -d * s))))));
}

export async function scoreCase(c: EvalCase, run: CaseRun): Promise<CaseScore> {
  const base = { id: c.id, category: c.category, soft: !!c.soft, run, warnings: [] as string[] };
  if (run.error?.kind === 'infra') return { ...base, checks: [], pass: false, infra: run.error.message };
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail: ok ? undefined : detail });
  if (run.error) { add('la app no falló', false, run.error.message); return { ...base, checks, pass: false }; }

  const last = run.turns[run.turns.length - 1];
  const used = new Set(run.turns.flatMap((t) => t.tools));
  const answer = last.answer;

  for (const t of c.tools ?? []) add(`usó ${t}`, used.has(t), `herramientas usadas: ${[...used].join(', ') || 'ninguna'}`);
  if (c.anyTool) add(`usó alguna de ${c.anyTool.join(' / ')}`, c.anyTool.some((t) => used.has(t)), `herramientas usadas: ${[...used].join(', ') || 'ninguna'}`);

  const factSets: Array<[number, Fact[]]> = [];
  if (c.facts) factSets.push([run.turns.length - 1, await c.facts()]);
  for (const [i, fn] of (c.factsByTurn ?? []).entries()) if (fn && run.turns[i]) factSets.push([i, await fn()]);
  for (const [i, facts] of factSets) for (const f of facts) {
    add(`reporta ${f.label}${run.turns.length > 1 ? ` (turno ${i + 1})` : ''}`, factPresent(run.turns[i].answer, f), `esperado ${f.value}${f.alt?.length ? ` (o ${f.alt.join('/')})` : ''}; respuesta: «${run.turns[i].answer.replace(/\s+/g, ' ').slice(0, 220)}»`);
  }
  if (c.mentions) for (const tk of await c.mentions()) add(`nombra a ${tk}`, wordIn(answer, tk), `no aparece en la respuesta`);
  for (const [d, re] of c.includes ?? []) add(d, re.test(answer), `no se encontró en: «${answer.replace(/\s+/g, ' ').slice(0, 220)}»`);
  for (const [d, re] of c.excludes ?? []) add(`NO ${d}`, !re.test(answer), `coincidió con ${re}: «${answer.match(re)?.[0] ?? ''}»`);
  if (c.language) add(`responde en ${c.language === 'en' ? 'inglés' : 'español'}`, detectLanguage(answer) === c.language, `idioma detectado: ${detectLanguage(answer)}; respuesta: «${answer.replace(/\s+/g, ' ').slice(0, 160)}»`);
  if (c.noInvention) {
    const tried = last.stats.draftUnverified;
    add('no intenta inventar cifras (su borrador no tuvo cifras sin respaldo)', tried.length === 0 && last.redacted === 0, `cifras que escribió sin respaldo: ${tried.join(', ') || '(se quitaron del texto)'}`);
  }

  // comprobaciones universales: se re-verifica la respuesta final con TODO lo que devolvieron las herramientas en la conversación
  const pool = run.turns.flatMap((t) => t.results);
  const v = verifyAnswer(answer, pool, c.turns.join('\n'));
  add('la respuesta final no tiene cifras sin respaldo', v.ok, `sin respaldo: ${v.unverified.map((u) => u.text).join(', ')}`);

  const warnings = [...base.warnings];
  for (const [i, t] of run.turns.entries()) {
    if (t.redacted > 0) warnings.push(`turno ${i + 1}: se quitaron ${t.redacted} cifra(s) sin respaldo (respuesta degradada)`);
    if (t.truncated) warnings.push(`turno ${i + 1}: llegó al límite de pasos`);
    if (INTERNAL_NAMES.test(t.answer)) warnings.push(`turno ${i + 1}: muestra nombres internos al usuario (${[...new Set(t.answer.match(INTERNAL_NAMES_G) ?? [])].join(', ')})`);
    if (t.toolOk.some((ok) => !ok)) warnings.push(`turno ${i + 1}: alguna herramienta devolvió error`);
  }
  return { ...base, checks, warnings, pass: checks.every((x) => x.ok) };
}

// ------------------------------------------------------------------ resumen
export interface Summary {
  casesRun: number; infraErrors: number; scored: number; passed: number; passRate: number; softObservations: number; softPassed: number;
  byCategory: Record<string, { scored: number; passed: number }>;
  turns: number; draftHallucinatedTurns: number; draftHallucinationRate: number; avgDraftUnverified: number;
  correctedTurns: number; rewrittenTurns: number; degradedAnswers: number; leakTurns: number;
  avgToolSteps: number; avgModelCalls: number; medianMs: number; geminiRequests: number;
  failedChecks: Record<string, number>; models: Record<string, number>;
  geminiFailed: number; medianResponseMs: number;
  draftNumbers: number; draftNumbersBacked: number; draftNumbersInvented: number; inventedTurns: number; inventedRate: number;
  rejections: Array<{ status: number; model: string; quota: string; count: number; sample: string; retryAfterS?: number }>;
  byModel: Record<string, { turns: number; hallucinated: number; degraded: number; corrected: number }>;
}
export function summarize(scores: CaseScore[], geminiRequests: number, geminiFailed = 0, rejected: Rejection[] = []): Summary {
  const infra = scores.filter((s) => s.infra);
  const ok = scores.filter((s) => !s.infra);
  const hard = ok.filter((s) => !s.soft), soft = ok.filter((s) => s.soft);
  const turns = ok.flatMap((s) => s.run.turns);
  const by: Summary['byCategory'] = {};
  for (const s of hard) { (by[s.category] ??= { scored: 0, passed: 0 }).scored++; if (s.pass) by[s.category].passed++; }
  const failed: Record<string, number> = {};
  for (const s of ok) for (const ch of s.checks) if (!ch.ok) failed[ch.name.replace(/ \(turno \d+\)/, '')] = (failed[ch.name.replace(/ \(turno \d+\)/, '')] ?? 0) + 1;
  const models: Record<string, number> = {};
  for (const t of turns) models[t.model] = (models[t.model] ?? 0) + 1;
  const sum = (f: (t: (typeof turns)[number]) => number) => turns.reduce((a, t) => a + f(t), 0);
  const hallucinated = turns.filter((t) => t.stats.draftUnverified.length > 0).length;
  const ms = turns.map((t) => t.ms).sort((a, b) => a - b);
  const net = turns.map((t) => Math.max(0, t.ms - t.waitedMs)).sort((a, b) => a - b);
  const byModel: Summary['byModel'] = {};
  for (const t of turns) {
    const m = (byModel[t.model] ??= { turns: 0, hallucinated: 0, degraded: 0, corrected: 0 });
    m.turns++; if (t.stats.draftUnverified.length) m.hallucinated++; if (t.redacted) m.degraded++; if (t.stats.corrected) m.corrected++;
  }
  return {
    casesRun: scores.length, infraErrors: infra.length, scored: hard.length, passed: hard.filter((s) => s.pass).length,
    passRate: hard.length ? hard.filter((s) => s.pass).length / hard.length : 0, softObservations: soft.length, softPassed: soft.filter((s) => s.pass).length,
    byCategory: by, turns: turns.length, draftHallucinatedTurns: hallucinated, draftHallucinationRate: turns.length ? hallucinated / turns.length : 0,
    avgDraftUnverified: turns.length ? sum((t) => t.stats.draftUnverified.length) / turns.length : 0,
    leakTurns: turns.filter((t) => INTERNAL_NAMES.test(t.answer)).length, correctedTurns: turns.filter((t) => t.stats.corrected).length, rewrittenTurns: turns.filter((t) => t.stats.rewritten).length, degradedAnswers: turns.filter((t) => t.redacted > 0).length,
    avgToolSteps: turns.length ? sum((t) => t.stats.toolSteps) / turns.length : 0, avgModelCalls: turns.length ? sum((t) => t.stats.modelCalls) / turns.length : 0,
    medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : 0, geminiRequests, failedChecks: failed, models, geminiFailed, byModel,
    medianResponseMs: net.length ? net[Math.floor(net.length / 2)] : 0,
    draftNumbers: sum((t) => t.draftBacked.length + t.draftInvented.length), draftNumbersBacked: sum((t) => t.draftBacked.length),
    draftNumbersInvented: sum((t) => t.draftInvented.length), inventedTurns: turns.filter((t) => t.draftInvented.length > 0).length,
    inventedRate: turns.length ? turns.filter((t) => t.draftInvented.length > 0).length / turns.length : 0,
    rejections: groupRejections(rejected),
  };
}

export function groupRejections(list: Rejection[]): Summary['rejections'] {
  const g = new Map<string, Summary['rejections'][number]>();
  for (const r of list) {
    const k = `${r.status}|${r.model}|${r.quota}`;
    const cur = g.get(k) ?? { status: r.status, model: r.model, quota: r.quota, count: 0, sample: r.message, retryAfterS: r.retryAfterMs !== undefined ? Math.round(r.retryAfterMs / 1000) : undefined };
    cur.count++; g.set(k, cur);
  }
  return [...g.values()].sort((a, b) => b.count - a.count);
}

// ------------------------------------------------------------------ orquestación
export interface EvalOptions {
  cases: EvalCase[]; gemini: (req: HttpRequest) => Promise<HttpResult>; models: ModelManager; apiKey: string;
  rpm?: number; pauseMs?: number; repeat?: number; log?: (s: string) => void;
}
export async function runEval(o: EvalOptions): Promise<{ scores: CaseScore[]; summary: Summary }> {
  const log = o.log ?? (() => {});
  const net = makeNet(o.gemini, o.rpm);
  setHttp(net.http);
  const scores: CaseScore[] = [];
  try {
    for (let rep = 0; rep < (o.repeat ?? 1); rep++) {
      for (const [i, c] of o.cases.entries()) {
        const run = await runCase(c, o.models, o.apiKey, net);
        const s = await scoreCase(c, run);
        if (rep > 0) s.id = `${s.id}#${rep + 1}`;
        scores.push(s);
        const tag = s.infra ? 'INFRA' : s.pass ? ' OK  ' : 'FALLA';
        log(`[${i + 1}/${o.cases.length}] ${tag} ${s.id}${s.infra ? ` — ${s.infra.slice(0, 80)}` : s.pass ? '' : ` — ${s.checks.filter((x) => !x.ok).map((x) => x.name).join('; ').slice(0, 110)}`}`);
        if (o.pauseMs) await new Promise((r) => setTimeout(r, o.pauseMs));
      }
    }
  } finally { setHttp(); }
  return { scores, summary: summarize(scores, net.geminiRequests(), net.geminiFailed(), net.rejections()) };
}
