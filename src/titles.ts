// Título automático de cada chat (como ChatGPT/Claude/Gemini): lo elige la IA tras la primera respuesta.
// Si la IA no responde, queda un título razonable armado con la pregunta.
import { http } from './http';
import { API_ROOT, GeminiError, ModelManager } from './models';

const SYSTEM = 'Generás títulos breves para conversaciones de un chat de finanzas. Respondé ÚNICAMENTE con el título: ' +
  '2 a 5 palabras, en español, sin comillas, sin punto final, sin emojis ni markdown. Nombrá el tema concreto ' +
  '(el activo, el mercado o la pregunta); no uses títulos genéricos como "Consulta financiera" o "Análisis".';

/** Deja solo un título limpio: sin markdown, sin comillas, sin puntuación final, con largo acotado. */
export function cleanTitle(raw: string, max = 48): string {
  let t = (raw.split('\n').map((l) => l.trim()).find(Boolean) ?? '')
    .replace(/^(t[ií]tulo|title)\s*:\s*/i, '')
    .replace(/[*_#>`~]/g, '')
    .replace(/^["'“”‘’«»\s]+|["'“”‘’«»\s]+$/g, '')
    .replace(/[\s.:;,\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    t = cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2))).trimEnd() + '…';
  }
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** Título provisional a partir de la pregunta (se usa hasta que la IA elige uno, o si no puede). */
export function fallbackTitle(question: string): string {
  const first = question.split(/[.?!¿\n]/).map((s) => s.trim()).find(Boolean) ?? question;
  const words = first.split(/\s+/).slice(0, 7);
  while (words.length > 2 && /^(y|e|o|u|de|del|la|el|los|las|un|una|que|en|a|con|para|por|al|mi|tu|su)$/i.test(words[words.length - 1].replace(/[,;:]+$/, ''))) words.pop(); // no terminar en "y", "de"…
  return cleanTitle(words.join(' ')) || 'Nuevo chat';
}

/** Modelo para el título: el más liviano disponible (Flash-Lite) o, si no hay, el preferido. */
function titleModel(models: ModelManager): string | null {
  const lite = models.chain.find((id) => id.includes('flash-lite'));
  if (lite && models.pick(models.chain.filter((id) => id !== lite)) === lite) return lite;
  return models.pick();
}

/** Pide un título a Gemini. Devuelve null ante cualquier problema (no es crítico). */
export async function aiTitle(models: ModelManager, apiKey: string, question: string, answer: string): Promise<string | null> {
  const model = titleModel(models);
  if (!model) return null;
  try {
    const res = await http({
      url: `${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, method: 'POST',
      headers: { 'x-goog-api-key': apiKey }, timeoutMs: 25000,
      body: {
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `Pregunta del usuario:\n${question.slice(0, 400)}\n\nRespuesta del asistente (inicio):\n${answer.slice(0, 500)}\n\nTítulo:` }] }],
      },
    });
    if (res.status < 200 || res.status >= 300) {
      let msg = res.text.slice(0, 200);
      try { msg = JSON.parse(res.text)?.error?.message ?? msg; } catch { /* texto plano */ }
      const e = new GeminiError(res.status, msg);
      if (e.kind === 'unavailable') models.markUnavailable(model); else if (e.kind === 'busy') models.markCooldown(model);
      return null;
    }
    const parts: any[] = JSON.parse(res.text)?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
    return cleanTitle(text) || null;
  } catch { return null; }
}
