// Reporte del duelo en Markdown.
import { ARM_LABEL, type ArmId } from './arms';
import type { DuelRow, DuelSummary } from './run';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
const clip = (s: string, n: number) => (esc(s).length > n ? esc(s).slice(0, n - 1) + '…' : esc(s));
const SYM: Record<string, string> = { ok: '✔', wrong: '✘', abstain: '○', infra: '⚠' };

export interface DuelMeta { when: string; mode: string; langs: string[]; modelChain: string[]; frozen: boolean }

export function renderDuelReport(rows: DuelRow[], s: DuelSummary, meta: DuelMeta): string {
  const L: string[] = [];
  const arms = s.arms.map((a) => a.arm);
  L.push(`# Duelo: FinAgent vs Gemini a secas vs Gemini con búsqueda — ${meta.when}`, '');
  L.push(`- **Modo:** ${meta.mode}  ·  **Idiomas:** ${meta.langs.join(', ')}  ·  **Preguntas:** ${rows.length}  ·  **Pedidos a Gemini:** ${s.geminiRequests} (${s.geminiFailed} rechazados)`);
  L.push(`- **Modelos preferidos:** ${meta.modelChain.slice(0, 4).join(', ') || '—'}  ·  **Modelos que respondieron:** ${Object.entries(s.models).map(([m, n]) => `${m} (${n})`).join(', ') || '—'}`, '');
  L.push('## Antes de leer los números', '');
  L.push('- **La respuesta correcta sale de las mismas fuentes que usa FinAgent** (Yahoo, DolarAPI, ArgentinaDatos) en el mismo momento. Sirve para medir si los otros brazos aciertan; **no valida por sí sola a FinAgent** (eso lo miden las evaluaciones anteriores).');
  L.push('- **Es una muestra chica:** 16 preguntas por idioma. Diferencias de una o dos preguntas no son concluyentes.');
  L.push('- Los tres brazos comparten el mismo reparto de modelos; con el cupo gratuito suele responder el modelo liviano.');
  L.push('- "Gemini a secas" y "Gemini + búsqueda" reciben una instrucción mínima y neutral, sin sabotearlos ni ayudarlos.');
  if (meta.frozen) L.push('- ⚠ **Datos congelados e inventados a propósito:** "Gemini a secas" pierde por construcción. Esta corrida es solo una prueba del instrumento, no una comparación real.');
  if (s.searchUnavailable) L.push(`- ⚠ **La búsqueda de Google no estuvo disponible con esta clave:** ${clip(s.searchUnavailable, 180)}`);
  L.push('');

  L.push('## Resultado general', '', '| Brazo | Datos correctos | Cifra incorrecta o inventada | Se abstiene | Trampas superadas | Idioma coherente | Tiempo mediano | Pedidos al modelo |', '|---|---|---|---|---|---|---|---|');
  for (const a of s.arms) L.push(`| **${a.label}** | **${a.factOk}/${a.factTotal}** (${pct(a.factOk, a.factTotal)}) | ${a.factWrong} (${pct(a.factWrong, a.factTotal)}) | ${a.factAbstain} (${pct(a.factAbstain, a.factTotal)}) | ${a.trapOk}/${a.trapTotal} (${pct(a.trapOk, a.trapTotal)}) | ${a.langOk}/${a.answered} | ${(a.medianMs / 1000).toFixed(1)} s | ${a.avgCalls.toFixed(1)} |`);
  L.push('');
  const search = s.arms.find((a) => a.arm === 'search');
  if (search?.searchUsedRate !== undefined) L.push(`_La búsqueda de Google se usó realmente en ${Math.round(search.searchUsedRate * 100)}% de las respuestas del brazo "búsqueda"._`, '');
  const unans = s.arms.filter((a) => a.infra > 0);
  if (unans.length) L.push(`_Sin evaluar por errores de Gemini: ${unans.map((a) => `${a.label} (${a.infra})`).join(', ')}._`, '');

  if (meta.langs.length > 1) {
    L.push('## Datos correctos por idioma', '', `| Brazo | ${meta.langs.join(' | ')} |`, `|---|${meta.langs.map(() => '---').join('|')}|`);
    for (const arm of arms) {
      const cells = meta.langs.map((lang) => { const fr = rows.filter((r) => r.lang === lang && r.kind === 'fact' && r.arms[arm] && r.arms[arm]!.verdict !== 'infra'); const ok = fr.filter((r) => r.arms[arm]!.verdict === 'ok').length; return `${ok}/${fr.length}`; });
      L.push(`| ${ARM_LABEL[arm]} | ${cells.join(' | ')} |`);
    }
    L.push('');
  }

  L.push('## Pregunta por pregunta', '', '✔ correcto · ✘ cifra incorrecta o trampa fallida · ○ se abstiene · ⚠ sin evaluar', '', `| Pregunta | Idioma | ${arms.map((a) => ARM_LABEL[a]).join(' | ')} |`, `|---|---|${arms.map(() => '---').join('|')}|`);
  for (const r of rows) L.push(`| ${r.id} | ${r.lang} | ${arms.map((a) => SYM[r.arms[a]?.verdict ?? ''] ?? '—').join(' | ')} |`);
  L.push('');

  const lost = rows.filter((r) => r.arms.finagent && r.arms.finagent.verdict !== 'ok');
  L.push(`## Dónde FinAgent NO acertó (${lost.length})`, '');
  if (!lost.length) L.push('En ninguna pregunta.', '');
  for (const r of lost) {
    const f = r.arms.finagent!;
    L.push(`### ${r.id} (${r.lang}) — ${SYM[f.verdict]} ${f.detail}`, '', `**Pregunta:** ${r.question}`, `**Correcto:** ${r.truth.map((t) => `${t.label} = ${t.value}`).join('; ') || '—'}`, `**FinAgent:** ${clip(f.answer, 420)}`);
    for (const a of arms.filter((x) => x !== 'finagent')) { const o = r.arms[a]; if (o) L.push(`**${ARM_LABEL[a]}** (${SYM[o.verdict]}): ${clip(o.answer, 220)}`); }
    L.push('');
  }

  const bad = rows.filter((r) => r.kind === 'fact').flatMap((r) => (['plain', 'search'] as ArmId[]).map((a) => ({ r, a, x: r.arms[a] }))).filter((e) => e.x?.verdict === 'wrong').slice(0, 6);
  L.push('## Ejemplos de cifras incorrectas de los otros brazos', '');
  if (!bad.length) L.push('Ninguno.', '');
  for (const e of bad) L.push(`- **${ARM_LABEL[e.a]}** · ${e.r.id} (${e.r.lang}): «${clip(e.x!.answer, 200)}» — correcto: ${e.r.truth.map((t) => t.value).join(' / ')}`);
  L.push('');

  L.push('## Cómo leer este reporte', '');
  L.push('- "Se abstiene" no es un error: decir "no tengo datos en tiempo real" es honesto, pero tampoco ayuda a quien pregunta.');
  L.push('- Que otro brazo acierte un dato no lo hace igual a FinAgent: aquí no se mide si cada cifra tiene fuente verificable, ni consistencia entre consultas, ni los cálculos más complejos.');
  L.push('- Para decisiones de inversión en la app, repetí el duelo en distintos días y con más preguntas antes de sacar conclusiones.');
  return L.join('\n') + '\n';
}
