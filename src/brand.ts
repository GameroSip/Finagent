// Marca de la IA de FinAgent. Reglas (las verifica tests/brand.test.ts):
//  - "FinAgent AI" es el nombre del ASISTENTE (un agente con herramientas de datos, verificador de cifras y modelos propios de volatilidad).
//    NO es un modelo de lenguaje propio: corre sobre modelos Gemini de Google, y la app lo dice siempre (Acerca de, política de privacidad, ficha de Play).
//  - Los niveles (Rápido, Avanzado, Profundo) son nombres de FinAgent para modelos Gemini de distinto tamaño. Se muestra el nivel del modelo que corresponde
//    de verdad; si no hay equivalencia conocida se muestra el nombre original (no se inventa una).
//  - Nunca decir que el modelo de lenguaje es propio, entrenado o ajustado por FinAgent mientras no lo sea (ver FORBIDDEN_CLAIMS en about.ts).
import { t } from './i18n';

export const AGENT_NAME = 'FinAgent AI';
/** Versión del motor = instrucciones + herramientas + verificador + modelos de volatilidad. Sube cuando cambia algo que afecta las respuestas. */
export const ENGINE_VERSION = '1.0';
export const POWERED_BY = 'Impulsado por Gemini de Google';

export type Tier = 'rapido' | 'avanzado' | 'profundo';
export const TIER_LABEL: Record<Tier, string> = { rapido: 'Rápido', avanzado: 'Avanzado', profundo: 'Profundo' };

/** Nivel según la familia del modelo (acepta el identificador, "gemini-3.8-flash", o el nombre legible, "Gemini 3.8 Flash"). */
export function tierOf(model: string | null | undefined): Tier | null {
  const s = (model ?? '').toLowerCase();
  if (/flash[- ]?lite/.test(s)) return 'rapido';
  if (/(^|[^a-z])pro([^a-z]|$)/.test(s)) return 'profundo';
  if (/flash/.test(s)) return 'avanzado';
  return null;
}
/** "FinAgent AI Avanzado". Sin equivalencia conocida, devuelve el nombre original tal cual. */
export const brandOf = (model: string | null | undefined): string => { const k = tierOf(model); return k ? `${AGENT_NAME} ${t(TIER_LABEL[k])}` : (model ?? ''); };
export const ENGINE_LABEL = (): string => `${t('Motor')} FinAgent v${ENGINE_VERSION}`;
