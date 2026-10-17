// Detección simple del idioma del usuario. El prompt está en español y el modelo liviano tiende a contestar en español aunque le escriban
// en inglés (lo midió la evaluación con Gemini real), así que no se deja librado a una regla del prompt: se le indica explícitamente en cada turno.
export type Lang = 'en' | 'es' | 'other';

// Palabras muy frecuentes de cada idioma. Se evitan las que existen en ambos ("ratio", "stock", "me", "a", "no", "color").
const EN = new Set(['the', 'is', 'are', 'was', 'were', 'what', 'which', 'who', 'how', 'why', 'when', 'where', 'of', 'and', 'to', 'in', 'for', 'with', 'on',
  'at', 'from', 'by', 'about', 'this', 'that', 'these', 'those', 'it', 'its', 'be', 'been', 'has', 'have', 'had', 'does', 'can', 'could', 'should', 'would',
  'will', 'you', 'your', 'price', 'current', 'compared', 'than', 'more', 'less', 'much', 'many', 'tell', 'show', 'give', 'today', 'now', 'buy', 'sell',
  'earnings', 'yield', 'trailing', 'forward', 'market', 'share', 'over', 'last', 'year', 'month', 'my', 'any', 'there', 'their', 'our']);
const ES = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'es', 'son', 'por', 'para', 'con', 'al', 'se', 'su', 'sus', 'como',
  'más', 'mas', 'cuál', 'cual', 'cuánto', 'cuanto', 'qué', 'está', 'esta', 'están', 'estan', 'mi', 'tu', 'lo', 'si', 'pero', 'sobre', 'entre', 'sin', 'hay',
  'hoy', 'tiene', 'tienen', 'dame', 'decime', 'mostrame', 'compará', 'comparame', 'ayer', 'año', 'mes', 'acciones', 'precio', 'cotiza', 'vale']);

export function detectLanguage(text: string): Lang {
  const tokens = (text.toLowerCase().match(/[a-záéíóúñüç]+/g) ?? []).filter((t) => t.length > 0);
  if (tokens.length < 2) return 'other';
  let en = 0, es = 0;
  for (const t of tokens) { if (EN.has(t)) en++; if (ES.has(t)) es++; }
  if (/[¿¡ñáéíóú]/i.test(text) && es >= en) return 'es';
  if ((en >= 2 && en > es * 2) || (en >= 1 && es === 0 && tokens.length >= 3)) return 'en';
  return es > 0 ? 'es' : 'other';
}

/** Texto que se agrega al mensaje que se le manda al modelo (no se muestra ni se guarda): vacío si el usuario escribe en español. */
export function languageHint(userText: string): string {
  return detectLanguage(userText) === 'en' ? '\n\n(The user wrote in English: write the ENTIRE answer in English.)' : '';
}
