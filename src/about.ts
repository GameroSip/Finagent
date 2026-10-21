// Textos de presentación de FinAgent. TODA afirmación de acá tiene que ser verdadera HOY: hay un test (tests/about.test.ts) que bloquea
// las frases que prometen lo que no existe (modelo propio entrenado, licencias de datos, respaldo de Google, varias IA, precisión absoluta).
// Cuando algo pase a ser cierto (se compra una licencia, se suma un segundo proveedor de IA), se agrega acá con su nombre concreto.

export const ABOUT = {
  what: 'FinAgent es un asistente de inteligencia artificial especializado en finanzas. Combina modelos Gemini, desarrollados por Google DeepMind, con herramientas propias que obtienen y calculan los datos, y un verificador que controla cada cifra antes de mostrártela.',
  how: [
    'La IA redacta; no calcula. Los porcentajes, indicadores y comparaciones los calculan las herramientas de FinAgent.',
    'Cada cifra se compara con los datos. Si no se puede respaldar, se corrige o se quita de la respuesta.',
    'Cada respuesta indica la fuente y la fecha de los datos.',
  ],
  limits: 'FinAgent es una herramienta de información con fines educativos. No es asesoramiento de inversión ni un agente registrado ante la CNV, no recomienda comprar o vender y no predice precios. Los datos pueden tener demora o errores y la IA puede equivocarse: tomá tus decisiones con criterio propio.',
  // Versión actual de la app: todo corre en el teléfono con la clave del propio usuario.
  // Cuando exista el servidor de FinAgent, este texto DEBE cambiar (las consultas pasarán por servidores de FinAgent y proveedores de IA externos).
  privacy: 'Tus preguntas se envían a Google (Gemini) con tu propia clave. FinAgent no tiene servidor propio ni guarda tus datos fuera de tu teléfono.',
  // Versión con servidor (beta): las consultas pasan por servidores de FinAgent. Es verdad porque el servidor registra solo números, nunca el texto (lo verifica tests/server.test.ts).
  privacyServer: 'Tus preguntas se procesan en los servidores de FinAgent y se envían a Google (Gemini) para generar la respuesta. FinAgent no guarda el texto de tus consultas en el servidor: solo cuenta cuántas hacés y cuántos tokens usan, para aplicar los límites de tu plan. Tu historial queda en este teléfono.',
  // Se muestra mientras el servidor use el nivel GRATUITO de Gemini (el servidor informa su nivel): en ese nivel Google puede usar las consultas para mejorar sus productos.
  freeTier: 'Por ahora FinAgent usa el nivel gratuito de Gemini: Google puede usar lo que escribas para mejorar sus productos. No incluyas datos personales ni información financiera sensible en tus consultas.',
  credits: 'Gráficos: TradingView Lightweight Charts™ (tradingview.com). Iconos: Lucide. Tipografía: Inter. Datos: Yahoo Finance, DolarAPI, ArgentinaDatos, Google News, alternative.me. IA: Google Gemini.',
};

/** Todo el texto visible de la presentación, en una lista (para controlarlo). */
export const aboutTexts = (): string[] => [ABOUT.what, ...ABOUT.how, ABOUT.limits, ABOUT.privacy, ABOUT.privacyServer, ABOUT.freeTier, ABOUT.credits];

/** Frases que NO pueden aparecer en la presentación de la app mientras no sean ciertas. */
export const FORBIDDEN_CLAIMS: Array<[string, RegExp]> = [
  ['dice que entrenó un modelo propio', /entrenad[oa]s?\s+(por|con|en)\b|entrenamiento\s+propio|entrenamos|modelo\s+propio|\bia\s+propia|nuestro\s+(propio\s+)?modelo/i],
  ['promete licencias que no existen', /decenas\s+de\s+licencias|licencias\s+a\s+su\s+favor|datos\s+licenciados|licenciad[oa]s/i],
  ['dice que Google o DeepMind la respaldan o avalan', /(respaldad[oa]|avalad[oa]|certificad[oa]|patrocinad[oa])\s+por\s+(google|deepmind)|alianza\s+con\s+google/i],
  ['dice que usa varias IA sin que sea así', /varias\s+(ia|ias|inteligencias)|m[úu]ltiples\s+(ia|modelos)|respaldos?\s+de\s+otras\s+ia/i],
  ['promete precisión absoluta', /100\s*%\s*(preciso|exacto|confiable|seguro)|sin\s+errores|garantiz/i],
];
