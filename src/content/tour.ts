// Contenido del recorrido de bienvenida y de "Acerca de". TODO tiene que ser cierto hoy: tests/intro.test.ts lo controla con las mismas reglas que ABOUT.
// Los textos están en español (idioma base); se muestran con t().
export type SlideId = 'welcome' | 'world' | 'verified' | 'better' | 'charts' | 'backing' | 'plans';
export interface TourSlide { id: SlideId; title: string; text: string; bullets?: string[] }

export const TOUR: TourSlide[] = [
  { id: 'welcome', title: 'Tu analista financiero con IA', text: 'Mercados de todo el mundo, datos reales y cada cifra verificada. Para que entiendas lo que pasa, sin humo.' },
  { id: 'world', title: 'Mercados del mundo', text: 'Acciones, ETF, cripto, divisas, índices y materias primas de la mayoría de las bolsas, con herramientas especiales para Argentina: dólar, brecha, riesgo país y CEDEARs.',
    bullets: ['Algunos mercados o activos pueden no estar disponibles y los precios pueden tener demora.'] },
  { id: 'verified', title: 'Cada cifra, verificada', text: 'La IA redacta, pero no calcula. Los números salen de las herramientas de FinAgent y un verificador controla cada cifra antes de mostrártela. Si algo no se puede respaldar, se corrige o se quita.' },
  { id: 'better', title: 'Por qué es mejor que una IA común', text: 'Una IA sin conectores responde de memoria y puede inventar números. FinAgent trabaja distinto:',
    bullets: ['Usa datos reales y actualizados, no la memoria de la IA.', 'Calcula con herramientas: porcentajes, indicadores y comparaciones exactas.', 'Muestra la fuente y la fecha de cada dato.', 'Avisa cuando no tiene un dato, en lugar de inventarlo.'] },
  { id: 'charts', title: 'Gráficos de nivel profesional', text: 'Fibonacci, sesiones de mercado, perfil de volumen, RSI, MACD y más. Todo gratis, para explorar a tu ritmo.' },
  { id: 'backing', title: 'Qué hay detrás', text: 'Es importante que sepas en qué se apoya lo que ves:',
    bullets: ['IA: modelos Gemini de Google, desarrollados por Google DeepMind. FinAgent es independiente de Google.',
      'Datos: Yahoo Finance, DolarAPI, ArgentinaDatos, Google News y alternative.me. Son fuentes públicas y gratuitas, sin acuerdos comerciales: pueden tener demora o errores.',
      'FinAgent es una herramienta educativa: no da asesoramiento de inversión.'] },
  { id: 'plans', title: 'Empezá gratis', text: 'Tenés conversaciones con IA todos los días y todas las herramientas sin costo. Más adelante habrá planes Plus y Pro con un modelo más potente y más usos.' },
];

/** Fuentes y componentes que aparecen nombrados en la app (los mismos de ABOUT.credits). */
export const BACKING = { ai: 'Google Gemini', data: ['Yahoo Finance', 'DolarAPI', 'ArgentinaDatos', 'Google News', 'alternative.me'], charts: 'TradingView Lightweight Charts™' };

export const tourTexts = (): string[] => TOUR.flatMap((s) => [s.title, s.text, ...(s.bullets ?? [])]);
