// Niveles de IA de FinAgent según la familia del modelo de Google. Módulo PURO (sin interfaz ni traducciones): lo usan la app, el servidor y las pruebas.
export type Tier = 'rapido' | 'avanzado' | 'profundo';
export const TIER_RANK: Record<Tier, number> = { rapido: 0, avanzado: 1, profundo: 2 };

/** Nivel según la familia del modelo (acepta el identificador, "gemini-3.8-flash", o el nombre legible, "Gemini 3.8 Flash"). Sin equivalencia conocida: null. */
export function tierOf(model: string | null | undefined): Tier | null {
  const s = (model ?? '').toLowerCase();
  if (/flash[- ]?lite/.test(s)) return 'rapido';
  if (/(^|[^a-z])pro([^a-z]|$)/.test(s)) return 'profundo';
  if (/flash/.test(s)) return 'avanzado';
  return null;
}

/** ¿Respondió un nivel MENOR que el del plan? (p. ej. el plan es Avanzado y, por saturación, contestó el Rápido). Un nivel mayor (análisis profundo) no es un respaldo. Si falta algún dato, no se afirma nada. */
export function fellBack(usedModel: string | null | undefined, planModel: string | null | undefined): boolean {
  const u = tierOf(usedModel), p = tierOf(planModel);
  return !!u && !!p && TIER_RANK[u] < TIER_RANK[p];
}
