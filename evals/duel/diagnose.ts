// Diagnóstico de fuentes: prueba cada fuente de datos por separado desde el entorno donde corre (p. ej. los servidores de GitHub).
// Sirve para saber qué fuentes responden desde un centro de datos, que es lo que va a encontrar un servidor propio.
import { resetSession } from '../../src/yahoo';
import { callTool, clearCache } from '../../src/tools';

export interface SourceCheck { label: string; ok: boolean; ms: number; detail: string }

const CHECKS: Array<[string, string, Record<string, unknown>]> = [
  ['Yahoo: precio (chart, sin cookie)', 'get_quote', { ticker: 'AAPL' }],
  ['Yahoo: fundamentales (cookie + crumb)', 'get_fundamentals', { ticker: 'KO' }],
  ['Yahoo: histórico de 5 años', 'get_performance', { ticker: 'MSFT' }],
  ['DolarAPI + ArgentinaDatos', 'get_argentina_macro', {}],
  ['Google News (RSS)', 'get_headlines', {}],
];

export async function diagnoseSources(): Promise<SourceCheck[]> {
  const out: SourceCheck[] = [];
  for (const [label, tool, args] of CHECKS) {
    clearCache(); resetSession();
    const t0 = Date.now();
    try {
      const r = await callTool(tool, args);
      // Algunas herramientas devuelven éxito con datos parciales cuando falla una de sus fuentes: se reporta como falla parcial.
      const partial = r.ok ? ((r as any).meta?.notes ?? []).filter((n: unknown) => /no se pudo|no se pudieron|no pude/i.test(String(n))) : [];
      out.push({ label, ok: r.ok && !partial.length, ms: Date.now() - t0, detail: !r.ok ? String(r.error).slice(0, 160) : partial.length ? `datos parciales: ${partial.join(' ').slice(0, 140)}` : 'responde' });
    } catch (e: any) { out.push({ label, ok: false, ms: Date.now() - t0, detail: String(e?.message ?? e).slice(0, 160) }); }
  }
  return out;
}

export function renderSourceChecks(checks: SourceCheck[], where: string): string {
  const L = [`# Diagnóstico de fuentes — ${new Date().toLocaleString('es-AR')}`, '', `Entorno: ${where}`, '', '| Fuente | Resultado | Tiempo | Detalle |', '|---|---|---|---|'];
  for (const c of checks) L.push(`| ${c.label} | ${c.ok ? '✔ responde' : '✘ falla'} | ${(c.ms / 1000).toFixed(1)} s | ${c.detail.replace(/\|/g, '\\|')} |`);
  L.push('', checks.every((c) => c.ok) ? 'Todas las fuentes responden desde este entorno.' : 'Alguna fuente falla desde este entorno: un servidor en un centro de datos puede encontrar el mismo problema (una razón más para usar un proveedor de datos con licencia).');
  return L.join('\n') + '\n';
}
