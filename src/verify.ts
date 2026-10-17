// Verificador numérico (heurístico): ¿cada cifra de la respuesta salió de una herramienta?
// Detecta números que el modelo pudo inventar o recordar de memoria; no prueba que la interpretación sea correcta.

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
// Meses completos y abreviados, en español e inglés (los modelos escriben "16 oct 2026", "Oct 16", "October 16, 2026"...).
const MONTHS_ANY = `${MONTHS}|january|february|march|april|june|july|august|september|october|november|december|ene|feb|mar|abr|may|jun|jul|ago|sept?|set|oct|nov|dic|jan|apr|aug|dec`;
// Los meses fáciles de confundir con palabras ("mar", "may", "set", "sep") solo cuentan como mes si el día va ANTES ("5 may"), no después.
const MONTHS_SAFE = `${MONTHS}|january|february|march|april|june|july|august|september|october|november|december|ene|feb|abr|jun|jul|ago|oct|nov|dic|jan|apr|aug|dec`;
// Parámetros CONVENCIONALES de indicadores ("EMA 20, 50 y 200", "RSI 14", "medias móviles de 50 y 200"): son nombres, no datos.
// Solo valores típicos: un "RSI 56" (que sería un dato) no entra en esta lista y se sigue controlando.
const MA_PARAMS = '5|9|10|12|20|21|26|30|50|100|150|200';
const STRIP: RegExp[] = [
  new RegExp(`\\b(?:EMA|SMA|WMA|MA|MM)\\s?\\(?(?:${MA_PARAMS})\\)?(?:\\s*(?:,|/|y|e)\\s*(?:${MA_PARAMS})\\b)*`, 'g'),
  /\b(?:RSI|ATR|ADX|CCI|MFI|MACD)\s?\(?(?:7|9|12|14|20|21|25|26)\)?(?:\s*[/,]\s*(?:7|9|12|14|20|21|25|26)\b)*/g,
  new RegExp(`\\bmedias?\\s+m[óo]vil(?:es)?(?:\\s+(?:exponencial(?:es)?|simples?))?\\s+de\\s+(?:${MA_PARAMS})(?:\\s*(?:,|y|e)\\s*(?:${MA_PARAMS})\\b)*`, 'gi'),
  // fechas con día y mes abreviado o completo: "16 oct 2026", "16 de oct. de 2026", "16-oct-2026", "16/oct/2026"
  new RegExp(`\\b\\d{1,2}(?:\\s+de\\s+|\\s+|-|/)(?:${MONTHS_ANY})\\b\\.?(?:(?:\\s+de\\s+|\\s+|-|/|,\\s*)\\d{2,4}\\b)?`, 'gi'),
  // "octubre 16, 2026", "Oct 16"
  new RegExp(`\\b(?:${MONTHS_SAFE})\\b\\.?\\s+\\d{1,2}\\b(?:,?\\s+\\d{4}\\b)?`, 'gi'),
  // "16-10-2026", "16.10.2026" y "al 16/10"
  /\b\d{1,2}[-.]\d{1,2}[-.]\d{2,4}\b/g,
  /\b(?:al|el|del|desde|hasta)\s+\d{1,2}\/\d{1,2}\b/gi,
  // horas: "20:00 UTC", "20:00:05", "a las 20:00", "20 hs", "20h", "a las 20"
  /\b\d{1,2}:\d{2}:\d{2}\b/g,
  /\b\d{1,2}:\d{2}\s?(?:UTC|GMT|ART|hs?\b|h\b|horas\b|am\b|pm\b|a\.m\.|p\.m\.)/gi,
  /\b(?:a\s+las|las|hora|cierre\s+de\s+las)\s+\d{1,2}(?::\d{2})?\b/gi,
  /\b\d{1,2}\s?(?:hs|horas|h)\b/gi,
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  new RegExp(`\\b\\d{1,2}\\s+de\\s+(?:${MONTHS})(?:\\s+de\\s+\\d{4})?`, 'gi'),
  new RegExp(`\\b(?:${MONTHS})\\s+(?:de\\s+)?\\d{4}`, 'gi'),
  /S&P\s?500|Nasdaq[- ]?100|MERVAL[- ]?25|Dow\s?30|Russell\s?2000|COVID-19/gi,
  /\(\s*\d+\s*,\s*\d+\s*(?:,\s*\d+\s*)?\)/g, // parámetros tipo MACD (12,26,9)
];
const NUM_SRC =
  String.raw`(?<![\w.,])(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?(?!\d)|\d+(?:[.,]\d+)?)(?:\s?(mil millones|millones|billones|%|[KMBTk])(?![A-Za-z]))?`;
const SCALE: Record<string, number[]> = {
  k: [1e3], K: [1e3], M: [1e6], B: [1e9], T: [1e12],
  millones: [1e6], 'mil millones': [1e9], billones: [1e12, 1e9],
};

// El ruido (fechas, nombres de índices…) se tapa con espacios del MISMO largo: las posiciones siguen coincidiendo con el texto original.
const stripNoise = (t: string) => STRIP.reduce((acc, p) => acc.replace(p, (m) => ' '.repeat(m.length)), t);

// "últimos 30 días", "200 ruedas", "52 semanas": cantidades descriptivas, no datos financieros que haya que respaldar.
// Admite listas: en "20, 50 y 200 ruedas" la unidad va solo al final y vale para todas las cantidades.
const UNIT_AFTER = /^(?:\s*(?:,|y|e|o|\/)\s*\d{1,4}\b)*\s+(?:d[ií]as?|semanas?|mes(?:es)?|años?|ruedas?|sesiones?|per[ií]odos?|velas?|barras?|trimestres?|horas?|minutos?|empresas?|activos?|acciones|pasos?)\b/i;
const numRe = () => new RegExp(NUM_SRC, 'g');

/** Interpretaciones posibles [valor, decimales] (1.234 puede ser miles o decimal). */
export function parseToken(tok: string): Array<[number, number]> {
  const hasDot = tok.includes('.'), hasCom = tok.includes(',');
  if (hasDot && hasCom) {
    const dec = tok.lastIndexOf('.') > tok.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    const s = tok.split(thou).join('').replace(dec, '.');
    return [[parseFloat(s), (s.split('.')[1] ?? '').length]];
  }
  const sep = hasDot ? '.' : hasCom ? ',' : null;
  if (sep === null) return [[parseFloat(tok), 0]];
  const parts = tok.split(sep);
  if (parts.length > 2) return [[parseFloat(parts.join('')), 0]];
  const [intp, frac] = parts;
  if (frac.length === 3 && intp.length >= 1 && intp.length <= 3 && intp !== '0') {
    return [[parseFloat(intp + frac), 0], [parseFloat(intp + '.' + frac), 3]];
  }
  return [[parseFloat(intp + '.' + frac), frac.length]];
}

/** Junta todos los números de un resultado de herramienta (hojas numéricas, texto y dígitos en claves). */
export function collectNumbers(obj: unknown, pool: number[] = []): number[] {
  if (obj === null || obj === undefined || typeof obj === 'boolean') return pool;
  if (typeof obj === 'number') { if (Number.isFinite(obj)) pool.push(obj); }
  else if (typeof obj === 'string') {
    for (const m of stripNoise(obj).matchAll(numRe())) for (const [v] of parseToken(m[1])) pool.push(v);
  } else if (Array.isArray(obj)) obj.forEach((v) => collectNumbers(v, pool));
  else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      for (const d of k.match(/\d+(?:\.\d+)?/g) ?? []) pool.push(parseFloat(d));
      collectNumbers(v, pool);
    }
  }
  return pool;
}

/**
 * `sign`: el signo que el texto escribió explícitamente (-1 con "-", +1 con "+", 0 si no puso ninguno).
 * Un "-3.21%" solo respalda un dato negativo (y "+3.21%" uno positivo); sin signo ("cayó 3.21%") alcanza con la magnitud,
 * porque el sentido lo da la palabra. Así se detectan errores de signo sin marcar como falsos las cifras negativas.
 */
function matches(x: number, d: number, scale: number, pct: boolean, pool: number[], sign: number): boolean {
  const tol = 10 ** -d * scale + 1e-9;
  for (const v of pool) {
    for (const cand of pct ? [v, v * 100] : [v]) {
      if (sign < 0 && cand > 0) continue;
      if (sign > 0 && cand < 0) continue;
      if (Math.abs(x - Math.abs(cand)) <= tol) return true;
    }
  }
  return false;
}

export interface Verification {
  ok: boolean;
  checked: number;
  unverified: Array<{ text: string; context: string; start: number; end: number }>;
}

/** Una cifra encontrada en un texto, con todo lo necesario para compararla con datos. */
export interface NumToken {
  text: string; start: number; end: number;       // posición exacta en el texto original (incluye el signo si lo hay)
  at: number; len: number;                        // posición del número en sí (sin signo)
  cands: Array<[number, number]>;                 // interpretaciones posibles [valor, decimales] ("1.234" puede ser miles o decimal)
  scales: number[]; pct: boolean;
  sign: number;                                   // -1 / +1 si el texto lo escribió explícitamente, 0 si no
  skip: boolean;                                  // ruido: enteros chicos, años, "30 días"…
  label?: number;                                 // "6M" puede ser una etiqueta de período (6 meses) y no 6 millones: se acepta si ese número EXACTO está en los datos
}

/** Encuentra todas las cifras de un texto. Las posiciones coinciden con el texto original. */
export function scanNumbers(answer: string): NumToken[] {
  const text = stripNoise(answer || '');
  const out: NumToken[] = [];
  for (const m of text.matchAll(numRe())) {
    const idx = m.index ?? 0, tok = m[1], suf = m[2];
    const cands = parseToken(tok);
    const pct = suf === '%';
    let skip = false;
    if (!suf) {
      const [v0, d0] = cands[0];
      if (d0 === 0 && cands.length === 1 && (v0 <= 10 || (v0 >= 1900 && v0 <= 2100))) skip = true; // ruido
      const after = text.slice(idx + m[0].length, idx + m[0].length + 48);
      if (d0 === 0 && cands.length === 1 && v0 >= 11 && v0 <= 1000 && UNIT_AFTER.test(after)) skip = true; // cantidad descriptiva
    }
    // Signo explícito pegado a la cifra ("-3.21%", "−3,2", "+1.5%"); un guion entre cifras ("5-7%") es un rango, no un signo.
    const prev = idx > 0 ? text[idx - 1] : '';
    const hasSign = prev !== '' && '-−–+'.includes(prev) && !/[\w)]/.test(idx > 1 ? text[idx - 2] : ' ');
    const start = hasSign ? idx - 1 : idx; // el signo viaja con la cifra (también al quitarla del texto)
    out.push({
      text: text.slice(start, idx + m[0].length).trim(), start, end: idx + m[0].length, at: idx, len: m[0].length,
      cands, scales: suf && !pct ? SCALE[suf] ?? [1] : [1], pct, sign: hasSign ? (prev === '+' ? 1 : -1) : 0, skip,
      // "M" es ambigua: "6M" puede ser 6 millones o 6 meses (etiquetas de rendimiento: 1M, 3M, 6M, 12M).
      ...(suf === 'M' && cands.length === 1 && cands[0][1] === 0 && cands[0][0] <= 24 ? { label: cands[0][0] } : {}),
    });
  }
  return out;
}

/** ¿Esta cifra del texto corresponde al valor esperado, con el redondeo que mostró? (el signo explícito debe coincidir) */
export function tokenMatchesValue(t: NumToken, expected: number): boolean {
  if (t.sign < 0 && expected > 0) return false;
  if (t.sign > 0 && expected < 0) return false;
  return t.cands.some(([v, d]) => t.scales.some((s) => Math.abs(v * s - Math.abs(expected)) <= 10 ** -d * s + 1e-9));
}

export function verifyAnswer(answer: string, toolResults: unknown[], extraText = ''): Verification {
  const pool: number[] = [];
  toolResults.forEach((r) => collectNumbers(r, pool));
  collectNumbers(extraText, pool); // números que puso el propio usuario en su pregunta

  const text = stripNoise(answer || '');
  const unverified: Verification['unverified'] = [];
  let checked = 0;
  for (const t of scanNumbers(answer)) {
    if (t.skip) continue;
    checked++;
    const ok = t.cands.some(([v, d]) => t.scales.some((s) => matches(v * s, d, s, t.pct, pool, t.sign)))
      || (t.label !== undefined && pool.some((v) => Math.abs(v) === t.label)); // etiqueta de período: coincidencia exacta, sin la tolerancia de ±1 de los enteros
    if (!ok) {
      unverified.push({ text: t.text, context: text.slice(Math.max(0, t.at - 40), t.at + t.len + 40).replace(/\n/g, ' '), start: t.start, end: t.end });
    }
  }
  return { ok: unverified.length === 0, checked, unverified };
}

export const REDACTED = '[dato no verificado]';

/** Quita del texto las cifras que no se pudieron respaldar (nunca se le muestra al usuario un número sin sustento). */
export function redactUnverified(answer: string, unverified: Array<{ start: number; end: number }>): string {
  let out = answer;
  for (const u of [...unverified].sort((a, b) => b.start - a.start)) out = out.slice(0, u.start) + REDACTED + out.slice(u.end);
  return out;
}
