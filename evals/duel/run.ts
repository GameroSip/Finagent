// Corre el duelo: para cada pregunta e idioma, calcula la respuesta correcta y se la hace a cada brazo.
import { setHttp, type HttpRequest, type HttpResult } from '../../src/http';
import type { ModelManager } from '../../src/models';
import { callTool } from '../../src/tools';
import type { Fact } from '../cases';
import { frozenHttp } from '../frozen-data';
import { makeNet } from '../harness';
import { ARM_LABEL, FatalDuelError, runFinAgent, runGemini, type ArmAnswer, type ArmId } from './arms';
import type { DuelQuestion, Lang } from './questions';
import { scoreAnswer, type Verdict } from './score';

export interface ArmResult { arm: ArmId; answer: string; verdict: Verdict | 'infra'; langOk: boolean; detail: string; ms: number; model: string; modelCalls: number; searchUsed?: boolean }
export interface DuelRow { id: string; lang: Lang; kind: 'fact' | 'trap'; question: string; truth: Array<{ label: string; value: number }>; arms: Partial<Record<ArmId, ArmResult>> }

export class PreflightError extends Error {}

export interface DuelOptions {
  questions: DuelQuestion[]; langs: Lang[]; models: ModelManager; apiKey: string;
  gemini: (req: HttpRequest) => Promise<HttpResult>;
  /** Fuente de los datos de mercado: la red real (duelo real) o los datos congelados (pruebas). */
  dataHttp?: (req: HttpRequest) => HttpResult | Promise<HttpResult>;
  search: boolean; rpm?: number; pauseMs?: number; preflight?: boolean; log?: (s: string) => void;
}

export interface DuelSummaryArm {
  arm: ArmId; label: string; answered: number; infra: number; unavailable: number;
  factOk: number; factWrong: number; factAbstain: number; factTotal: number;
  trapOk: number; trapTotal: number; langOk: number; medianMs: number; avgCalls: number; searchUsedRate?: number;
}
export interface DuelSummary { arms: DuelSummaryArm[]; geminiRequests: number; geminiFailed: number; searchUnavailable?: string; models: Record<string, number> }

export async function runDuel(o: DuelOptions): Promise<{ rows: DuelRow[]; summary: DuelSummary }> {
  const log = o.log ?? (() => {});
  const net = makeNet(o.gemini, o.rpm, o.dataHttp ?? frozenHttp);
  setHttp(net.http);
  const rows: DuelRow[] = [];
  let searchUnavailable: string | undefined;
  const arms: ArmId[] = o.search ? ['finagent', 'plain', 'search'] : ['finagent', 'plain'];
  try {
    if (o.preflight) {
      for (const [tool, args] of [['get_quote', { ticker: 'AAPL' }], ['get_argentina_macro', {}]] as const) {
        const r = await callTool(tool, args);
        if (!r.ok) throw new PreflightError(`La fuente de datos no responde desde este entorno (${tool}): ${r.error}`);
      }
    }
    let n = 0; const total = o.questions.length * o.langs.length;
    for (const lang of o.langs) for (const q of o.questions) {
      n++;
      const question = q.text[lang];
      const truth: Fact[] = q.truth ? await q.truth() : []; // la respuesta correcta se calcula justo antes de preguntar
      const row: DuelRow = { id: q.id, lang, kind: q.kind, question, truth: truth.map((f) => ({ label: f.label, value: f.value })), arms: {} };
      for (const arm of arms) {
        if (arm === 'search' && searchUnavailable) continue;
        let a: ArmAnswer;
        if (arm === 'finagent') a = await runFinAgent(o.models, o.apiKey, question);
        else a = await runGemini(o.models, o.apiKey, question, arm === 'search');
        if (a.error?.kind === 'unavailable') { searchUnavailable = a.error.message; log(`  ⚠ ${ARM_LABEL[arm]} no disponible con esta clave: ${a.error.message.slice(0, 120)}`); continue; }
        if (a.error) row.arms[arm] = { arm, answer: '', verdict: 'infra', langOk: true, detail: a.error.message.slice(0, 160), ms: a.ms, model: '', modelCalls: 0 };
        else {
          const s = scoreAnswer(q, lang, a.answer, truth);
          row.arms[arm] = { arm, answer: a.answer, verdict: s.verdict, langOk: s.langOk, detail: s.detail, ms: a.ms, model: a.model, modelCalls: a.modelCalls, searchUsed: a.searchUsed };
        }
      }
      rows.push(row);
      const sym = (v?: string) => (v === 'ok' ? '✔' : v === 'wrong' ? '✘' : v === 'abstain' ? '○' : v === 'infra' ? '⚠' : '—');
      log(`[${n}/${total}] ${lang} ${q.id.padEnd(22)} FinAgent ${sym(row.arms.finagent?.verdict)}  a secas ${sym(row.arms.plain?.verdict)}  búsqueda ${sym(row.arms.search?.verdict)}`);
      if (o.pauseMs) await new Promise((r) => setTimeout(r, o.pauseMs));
    }
  } finally { setHttp(); }
  return { rows, summary: summarizeDuel(rows, arms, net.geminiRequests(), net.geminiFailed(), searchUnavailable) };
}

export function summarizeDuel(rows: DuelRow[], arms: ArmId[], geminiRequests = 0, geminiFailed = 0, searchUnavailable?: string): DuelSummary {
  const models: Record<string, number> = {};
  const out: DuelSummaryArm[] = arms.map((arm) => {
    const rs = rows.map((r) => ({ r, a: r.arms[arm] })).filter((x) => x.a) as Array<{ r: DuelRow; a: ArmResult }>;
    const ok = rs.filter((x) => x.a.verdict !== 'infra');
    const facts = ok.filter((x) => x.r.kind === 'fact'), traps = ok.filter((x) => x.r.kind === 'trap');
    const ms = ok.map((x) => x.a.ms).sort((p, q) => p - q);
    for (const x of ok) if (x.a.model) models[x.a.model] = (models[x.a.model] ?? 0) + 1;
    const searchRows = ok.filter((x) => x.a.searchUsed !== undefined);
    return {
      arm, label: ARM_LABEL[arm], answered: ok.length, infra: rs.length - ok.length, unavailable: arm === 'search' && searchUnavailable ? 1 : 0,
      factOk: facts.filter((x) => x.a.verdict === 'ok').length, factWrong: facts.filter((x) => x.a.verdict === 'wrong').length,
      factAbstain: facts.filter((x) => x.a.verdict === 'abstain').length, factTotal: facts.length,
      trapOk: traps.filter((x) => x.a.verdict === 'ok').length, trapTotal: traps.length,
      langOk: ok.filter((x) => x.a.langOk).length, medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : 0,
      avgCalls: ok.length ? ok.reduce((s, x) => s + x.a.modelCalls, 0) / ok.length : 0,
      searchUsedRate: searchRows.length ? searchRows.filter((x) => x.a.searchUsed).length / searchRows.length : undefined,
    };
  });
  return { arms: out, geminiRequests, geminiFailed, searchUnavailable, models };
}

export { FatalDuelError };
