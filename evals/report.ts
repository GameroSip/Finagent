// Reporte de la evaluación en Markdown (para leer vos y para pasármelo y ajustar el verificador y las instrucciones).
import type { CaseScore, Summary } from './harness';

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const clip = (s: string, n: number) => (s.replace(/\s+/g, ' ').length > n ? s.replace(/\s+/g, ' ').slice(0, n - 1) + '…' : s.replace(/\s+/g, ' '));

export interface ReportMeta { when: string; mode: string; modelChain: string[]; cases: number; repeat: number }

export function renderReport(scores: CaseScore[], s: Summary, meta: ReportMeta): string {
  const L: string[] = [];
  L.push(`# Evaluación de FinAgent — ${meta.when}`, '');
  L.push(`- **Modo:** ${meta.mode}  ·  **Casos:** ${meta.cases}${meta.repeat > 1 ? ` × ${meta.repeat} repeticiones` : ''}  ·  **Pedidos a Gemini:** ${s.geminiRequests} (${s.geminiFailed} rechazados o con error, p. ej. por cupo o saturación)`);
  L.push(`- **Modelos preferidos (en orden):** ${meta.modelChain.join(', ') || '—'}`);
  L.push(`- **Modelos que respondieron:** ${Object.entries(s.models).map(([m, n]) => `${m} (${n})`).join(', ') || '—'}`, '');

  L.push('## Resultado general', '', '| Métrica | Valor |', '|---|---|');
  L.push(`| Casos aprobados | **${s.passed}/${s.scored}** (${pct(s.passRate)}) |`);
  if (s.infraErrors) L.push(`| Casos sin evaluar por errores de Gemini (cupo, saturación) | ${s.infraErrors} |`);
  if (s.softObservations) L.push(`| Observaciones de conducta (no cuentan) | ${s.softPassed}/${s.softObservations} esperadas |`);
  L.push(`| Respuestas con cifras **sin respaldo** en el primer borrador (no necesariamente erróneas) | ${s.draftHallucinatedTurns}/${s.turns} (${pct(s.draftHallucinationRate)}) |`);
  L.push(`| …de esas cifras, las que luego **se respaldaron con una herramienta** (eran correctas: faltaba trazarlas) | ${s.draftNumbersBacked} de ${s.draftNumbers} |`);
  L.push(`| **Cifras realmente inventadas** (sin respaldo ni después de corregir) | **${s.draftNumbersInvented}** en **${s.inventedTurns}/${s.turns}** respuestas (${pct(s.inventedRate)}) |`);
  L.push(`| Respuestas que necesitaron corrección | ${s.correctedTurns} (de ellas, reescritura sin herramientas: ${s.rewrittenTurns}) |`);
  L.push(`| **Respuestas degradadas** (se quitaron cifras del texto final) | **${s.degradedAnswers}** |`);
  L.push(`| Herramientas por respuesta (promedio) · pedidos al modelo por respuesta | ${s.avgToolSteps.toFixed(1)} · ${s.avgModelCalls.toFixed(1)} |`);
  L.push(`| Tiempo mediano por respuesta | ${(s.medianResponseMs / 1000).toFixed(1)} s (sin contar las pausas del evaluador; con ellas: ${(s.medianMs / 1000).toFixed(1)} s) |`, '');

  L.push('## Por modelo', '', '_Con el cupo gratuito los modelos preferidos se saturan y la app pasa a los siguientes: el resultado mezcla varios modelos._', '',
    '| Modelo | Respuestas | Borrador con cifras sin respaldo | Necesitaron corrección | Degradadas |', '|---|---|---|---|---|');
  for (const [m, v] of Object.entries(s.byModel).sort((a, b) => b[1].turns - a[1].turns)) L.push(`| ${m} | ${v.turns} | ${v.hallucinated} (${pct(v.hallucinated / v.turns)}) | ${v.corrected} | ${v.degraded} |`);
  L.push('');

  L.push('## Por categoría', '', '| Categoría | Aprobados |', '|---|---|');
  for (const [cat, v] of Object.entries(s.byCategory)) L.push(`| ${cat} | ${v.passed}/${v.scored} (${pct(v.passed / v.scored)}) |`);
  L.push('');

  const failed = Object.entries(s.failedChecks).sort((a, b) => b[1] - a[1]);
  if (failed.length) { L.push('## Comprobaciones que más fallaron', '', ...failed.slice(0, 12).map(([n, k]) => `- ${n}: ${k}`), ''); }

  const bad = scores.filter((x) => !x.infra && !x.pass);
  L.push(`## Casos que fallaron (${bad.length})`, '');
  if (!bad.length) L.push('Ninguno.', '');
  for (const x of bad) {
    L.push(`### ${x.id}${x.soft ? ' (observación)' : ''}  — ${x.category}`, '');
    L.push(`**Pregunta:** ${x.run.turns.map((t) => t.question).join(' → ') || x.run.id}`, '');
    for (const ch of x.checks.filter((c) => !c.ok)) L.push(`- ✘ ${ch.name}${ch.detail ? ` — ${esc(clip(ch.detail, 300))}` : ''}`);
    const t = x.run.turns[x.run.turns.length - 1];
    if (t) L.push('', `**Respuesta final:** ${clip(t.answer, 500)}`, '', `*Herramientas: ${t.tools.join(', ') || 'ninguna'} · modelo ${t.model}*`);
    L.push('');
  }

  const halluc = scores.filter((x) => !x.infra).flatMap((x) => x.run.turns.map((t, i) => ({ id: x.id, i, t }))).filter(({ t }) => t.stats.draftUnverified.length);
  L.push(`## Borradores con cifras sin respaldo (${halluc.length})`, '', '_Lo que el modelo escribió antes de que la app lo corrigiera. ✔ = luego se respaldó con una herramienta (era correcta); ✘ = nunca tuvo respaldo (inventada)._', '');
  for (const { id, t } of halluc.slice(0, 40)) {
    const tags = [...t.draftBacked.map((x) => `✔ \`${x}\``), ...t.draftInvented.map((x) => `✘ \`${x}\``)].join(' ');
    L.push(`- **${id}** — ${tags} · ${t.stats.corrected ? (t.redacted ? 'quedó degradada' : 'se corrigió') : 'sin corrección'} · «${clip(t.question, 70)}»`);
  }
  L.push('');

  if (s.rejections.length) {
    L.push('## Rechazos de Gemini', '', '_Qué respondió Gemini cuando no atendió un pedido. Sirve para ajustar cuánto espera la app antes de cambiar de modelo._', '',
      '| Estado | Modelo | Veces | Tipo de cupo | Espera que pidió | Mensaje |', '|---|---|---|---|---|---|');
    for (const r of s.rejections.slice(0, 12)) L.push(`| ${r.status || 'red'} | ${r.model} | ${r.count} | ${r.quota || '—'} | ${r.retryAfterS !== undefined ? `${r.retryAfterS} s` : '—'} | ${esc(clip(r.sample, 110))} |`);
    L.push('');
  }
  const warn = scores.filter((x) => x.warnings.length);
  if (warn.length) { L.push('## Avisos', '', ...warn.flatMap((x) => x.warnings.map((w) => `- ${x.id}: ${w}`)), ''); }
  const infra = scores.filter((x) => x.infra);
  if (infra.length) { L.push('## Casos sin evaluar (errores de Gemini)', '', ...infra.map((x) => `- ${x.id}: ${x.infra}`), '', '_Si son muchos: esperá unos minutos, bajá `EVAL_RPM` o corré menos casos con `EVAL_LIMIT`._', ''); }

  L.push('## Detalle de todas las respuestas', '');
  for (const x of scores.filter((x) => !x.infra)) {
    const t = x.run.turns[x.run.turns.length - 1];
    L.push(`- ${x.pass ? '✔' : '✘'} **${x.id}** · herramientas: ${t?.tools.join(', ') || 'ninguna'} · «${clip(t?.answer ?? '', 220)}»`);
  }
  return L.join('\n') + '\n';
}
