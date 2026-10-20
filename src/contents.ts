// Utilidades de la conversación con el modelo. Módulo sin dependencias: lo usan la app y el servidor.

export interface Turn { q: string; a: string }

/** Contexto compacto de la conversación: solo preguntas y respuestas finales (sin llamadas a herramientas ni firmas de pensamiento). */
export function historyToContents(history: Turn[]): any[] {
  return history.flatMap((t) => [
    { role: 'user', parts: [{ text: t.q }] },
    { role: 'model', parts: [{ text: t.a.length > 8000 ? t.a.slice(0, 8000) + '…' : t.a }] },
  ]);
}

/**
 * Al cambiar de modelo a mitad de conversación, las firmas de pensamiento y las llamadas a funciones del modelo
 * anterior no son válidas. Se aplanan a texto plano (conservando los resultados) y se fusionan turnos del mismo rol.
 */
export function flattenContents(contents: any[]): any[] {
  const out: any[] = [];
  for (const c of contents) {
    const parts: any[] = [];
    for (const p of c.parts ?? []) {
      if (p.thought) continue;
      if (p.functionCall) parts.push({ text: `[consulté ${p.functionCall.name}(${JSON.stringify(p.functionCall.args ?? {})})]` });
      else if (p.functionResponse) parts.push({ text: `[resultado de ${p.functionResponse.name}: ${JSON.stringify(p.functionResponse.response?.result ?? {}).slice(0, 6000)}]` });
      else if (typeof p.text === 'string' && p.text) parts.push({ text: p.text });
    }
    if (!parts.length) continue;
    const role = c.role === 'model' ? 'model' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts); else out.push({ role, parts });
  }
  return out;
}
