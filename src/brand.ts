// Marca de la IA de FinAgent. Reglas (las verifica tests/brand.test.ts):
//  - "FinAgent AI" es el nombre del ASISTENTE (un agente con herramientas de datos, verificador de cifras y modelos propios de volatilidad).
//    NO es un modelo de lenguaje propio: corre sobre modelos Gemini de Google, y la app lo dice siempre (Acerca de, política de privacidad, ficha de Play).
//  - Los niveles (Rápido, Avanzado, Profundo) son nombres de FinAgent para modelos Gemini de distinto tamaño. Se muestra el nivel del modelo que corresponde
//    de verdad; si no hay equivalencia conocida se muestra el nombre original (no se inventa una).
//  - Nunca decir que el modelo de lenguaje es propio, entrenado o ajustado por FinAgent mientras no lo sea (ver FORBIDDEN_CLAIMS en about.ts).
import { t } from './i18n';
import { fellBack, tierOf, type Tier } from './tiers';

export const AGENT_NAME = 'FinAgent AI';
/** Versión del motor = instrucciones + herramientas + verificador + modelos de volatilidad. Sube cuando cambia algo que afecta las respuestas. */
export const ENGINE_VERSION = '1.0';
export const POWERED_BY = 'Impulsado por Gemini de Google';

export { type Tier, tierOf };
export const TIER_LABEL: Record<Tier, string> = { rapido: 'Rápido', avanzado: 'Avanzado', profundo: 'Profundo' };

/** "FinAgent AI Avanzado". Sin equivalencia conocida, devuelve el nombre original tal cual. */
export const brandOf = (model: string | null | undefined): string => { const k = tierOf(model); return k ? `${AGENT_NAME} ${t(TIER_LABEL[k])}` : (model ?? ''); };
export const ENGINE_LABEL = (): string => `${t('Motor')} FinAgent v${ENGINE_VERSION}`;

/** Qué nivel respondió de verdad una respuesta y si fue un respaldo del nivel del plan. Si no se sabe qué modelo respondió, no se muestra nada (no se supone). */
export function answerTier(usedModel: string | null | undefined, planModel: string | null | undefined): { used: string; plan: string; fallback: boolean } | null {
  if (!tierOf(usedModel)) return null;
  return { used: brandOf(usedModel), plan: brandOf(planModel), fallback: fellBack(usedModel, planModel) };
}
