// Qué se le dice a la persona sobre cada plan de pago. Lo que EXISTE sale de los datos reales del plan (el servidor es la única fuente);
// lo que todavía NO existe va aparte, marcado como "Próximamente", y sirve para medir interés (el botón de cada plan anota el interés). Nunca se anuncia como incluido algo que no se puede usar.
import type { PlanEntry } from './server';
import { t } from './i18n';

/** Cuántas veces más usos da el plan que el gratuito, redondeado HACIA ABAJO (jamás se infla la promesa). */
export const planMultiplier = (p: Pick<PlanEntry, 'dailyLimit'>, free: Pick<PlanEntry, 'dailyLimit'>): number => Math.max(1, Math.floor(p.dailyLimit / Math.max(1, free.dailyLimit)));

/** Funciones PLANEADAS por plan: todavía no existen en la app. Si una se construye, se mueve a `benefits` (y la prueba de coherencia obliga a revisarlo). */
export const SOON_BY_PLAN: Record<string, string[]> = {
  plus: ['Mi cartera: cargá lo que tenés y mirá cuánto hay en cada moneda', 'Calculadora de escenarios de ahorro e inversión', 'Resumen semanal al abrir la app'],
  pro: ['Mi cartera: cargá lo que tenés y mirá cuánto hay en cada moneda', 'Calculadora de escenarios de ahorro e inversión', 'Resumen semanal al abrir la app', 'Informe de un activo en PDF', 'Acceso anticipado a funciones nuevas'],
};

export interface Pitch { multiplier: number; headline: string; benefits: string[]; soon: string[] }
export function planPitch(p: PlanEntry, free: PlanEntry): Pitch {
  const multiplier = planMultiplier(p, free);
  const benefits: string[] = [t('{n} conversaciones con la IA por día', { n: p.dailyLimit }), t('Sin recordatorios de planes')];
  return { multiplier, headline: multiplier >= 2 ? t('{n}x más usos que el plan gratuito', { n: multiplier }) : t('Más usos que el plan gratuito'), benefits, soon: (SOON_BY_PLAN[p.id] ?? []).map((x) => t(x)) };
}

/** Lo que sigue siendo gratis para todos (todo existe hoy en la app). */
export const FREE_FOREVER = [
  'Mercados del mundo: índices, divisas, cripto y materias primas',
  'Gráficos con Fibonacci, sesiones de mercado, perfil de volumen, RSI, MACD y más',
  'Termómetro de tensión y movimiento esperado de la semana',
  'Mi plan: lo que vas a hacer cuando haya tensión',
  'Búsqueda de cualquier activo, favoritos y estadísticas',
  'Noticias y sentimiento del mercado cripto',
  'Dólar, brecha y riesgo país de Argentina',
  'Conversaciones con IA todos los días',
];
