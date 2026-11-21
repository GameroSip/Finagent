// Avisos de actividad del asistente (empieza, verifica, termina) para quien los necesite (las notificaciones), sin que el agente sepa quién escucha.
export type AgentPhase = 'start' | 'verifying' | 'done' | 'fail' | 'aborted';
export interface AgentActivity { phase: AgentPhase; question: string; at: number }
type Listener = (a: AgentActivity) => void;
const listeners = new Set<Listener>();
export function onAgentActivity(fn: Listener): () => void { listeners.add(fn); return () => listeners.delete(fn); }
export function emitAgentActivity(phase: AgentPhase, question: string): void {
  const a = { phase, question, at: Date.now() };
  for (const fn of listeners) { try { fn(a); } catch { /* un oyente roto no frena la respuesta */ } }
}
