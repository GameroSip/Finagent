// Qué se le dice a la persona sobre cada plan de pago. Todo sale de los datos reales del plan (el servidor es la única fuente): si cambian los límites o los
// modelos, el mensaje cambia solo y nunca promete de más.
import type { PlanEntry } from './server';
import { t } from './i18n';

/** Cuántas veces más usos da el plan que el gratuito, redondeado HACIA ABAJO (jamás se infla la promesa). */
export const planMultiplier = (p: Pick<PlanEntry, 'dailyLimit'>, free: Pick<PlanEntry, 'dailyLimit'>): number => Math.max(1, Math.floor(p.dailyLimit / Math.max(1, free.dailyLimit)));

export interface Pitch { multiplier: number; headline: string; benefits: string[] }
export function planPitch(p: PlanEntry, free: PlanEntry): Pitch {
  const multiplier = planMultiplier(p, free);
  const benefits: string[] = [];
  if (p.modelLabel !== free.modelLabel) benefits.push(t('Un modelo más potente: {m}', { m: p.modelLabel }));
  if (p.deepModelLabel) benefits.push(t('Análisis profundo con {m}', { m: p.deepModelLabel }));
  if ((p as PlanEntry & { hasFallback?: boolean }).hasFallback) benefits.push(t('Respaldo automático si el modelo principal está saturado'));
  benefits.push(t('Sin recordatorios de planes'));
  return { multiplier, headline: multiplier >= 2 ? t('{n}x más usos que el plan gratuito', { n: multiplier }) : t('Más usos que el plan gratuito'), benefits };
}

/** Lo que sigue siendo gratis para todos (todo existe hoy en la app). */
export const FREE_FOREVER = [
  'Mercados del mundo: índices, divisas, cripto y materias primas',
  'Gráficos con Fibonacci, sesiones de mercado, perfil de volumen, RSI, MACD y más',
  'Búsqueda de cualquier activo, favoritos y estadísticas',
  'Noticias y sentimiento del mercado cripto',
  'Dólar, brecha y riesgo país de Argentina',
  'Conversaciones con IA todos los días',
];
