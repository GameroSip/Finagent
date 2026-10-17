// Verificador numérico (heurístico): ¿cada cifra de la respuesta salió de una herramienta?
// Detecta números que el modelo pudo inventar o recordar de memoria; no prueba que la interpretación sea correcta.

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const STRIP: RegExp[] = [
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
const UNIT_AFTER = /^\s+(?:d[ií]as?|semanas?|mes(?:es)?|años?|ruedas?|sesiones?|per[ií]odos?|velas?|barras?|trimestres?|horas?|minutos?|empresas?|activos?|acciones|pasos?)\b/i;
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

function matches(x: number, d: number, scale: number, pct: boolean, pool: number[]): boolean {
  const tol = 10 ** -d * scale + 1e-9;
  for (const v of pool) for (const cand of pct ? [v, v * 100] : [v]) if (Math.abs(x - cand) <= tol) return true;
  return false;
}

export interface Verification {
  ok: boolean;
  checked: number;
  unverified: Array<{ text: string; context: string; start: number; end: number }>;
}

export function verifyAnswer(answer: string, toolResults: unknown[], extraText = ''): Verification {
  const pool: number[] = [];
  toolResults.forEach((r) => collectNumbers(r, pool));
  collectNumbers(extraText, pool); // números que puso el propio usuario en su pregunta

  const text = stripNoise(answer || '');
  const unverified: Verification['unverified'] = [];
  let checked = 0;
  for (const m of text.matchAll(numRe())) {
    const tok = m[1], suf = m[2];
    const cands = parseToken(tok);
    const pct = suf === '%';
    if (!suf) {
      const [v0, d0] = cands[0];
      if (d0 === 0 && cands.length === 1 && (v0 <= 10 || (v0 >= 1900 && v0 <= 2100))) continue; // ruido
      const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 24);
      if (d0 === 0 && cands.length === 1 && v0 >= 11 && v0 <= 1000 && UNIT_AFTER.test(after)) continue; // cantidad descriptiva
    }
    const scales = suf && !pct ? SCALE[suf] ?? [1] : [1];
    checked++;
    const ok = cands.some(([v, d]) => scales.some((s) => matches(v * s, d, s, pct, pool)));
    if (!ok) {
      const idx = m.index ?? 0;
      unverified.push({ text: m[0].trim(), context: text.slice(Math.max(0, idx - 40), idx + m[0].length + 40).replace(/\n/g, ' '), start: idx, end: idx + m[0].length });
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
