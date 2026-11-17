// Marca como "fichas" las cifras en negrita de una respuesta (solo clases CSS: el texto no se toca,
// así lo que verificó el agente es exactamente lo que se ve).
const FIG = /^[+\-−–]?\s?(?:US\$|\$|€|R\$)?\s?\d[\d.,]*\s?(?:%|pp|x|USD|ARS|EUR|BRL|USDT|M|MM|B|K)?$/i;

export function decorateFigures(root: HTMLElement): void {
  root.querySelectorAll('strong, b').forEach((el) => {
    const s = (el.textContent ?? '').trim();
    if (!s || s.length > 18 || !FIG.test(s)) return;
    el.classList.add('fig', 'num');
    if (/^[+]/.test(s)) el.classList.add('up');
    else if (/^[\-−–]/.test(s)) el.classList.add('down');
  });
}
