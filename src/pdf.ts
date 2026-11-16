// Generador de PDF mínimo, sin dependencias: texto, tablas simples y notas, en A4 con Helvetica. Todo se arma en el teléfono.
// Solo escribe caracteres Latin-1/WinAnsi (el español completo); lo demás se reemplaza para que nunca salga basura.

export type Block =
  | { t: 'h1' | 'h2' | 'p' | 'note'; text: string }
  | { t: 'table'; head: string[]; rows: string[][]; widths: number[]; align?: Array<'l' | 'r'> }   // widths en fracciones (suman ≈1)
  | { t: 'space'; h?: number };

const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 48;
const WIN: Record<string, number> = { '€': 0x80, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '…': 0x85 };

/** Convierte a una cadena de caracteres de un solo byte (WinAnsi). */
export function toWinAnsi(s: string): string {
  let o = '';
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    o += WIN[ch] !== undefined ? String.fromCharCode(WIN[ch]) : c === 0x2248 ? '~' : c === 0x2212 ? '-' : c < 256 && (c >= 32 || c === 10) ? ch : c < 32 ? ' ' : '?';
  }
  return o;
}
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Ancho aproximado de un texto en Helvetica, en puntos. */
export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of s) {
    w += /[0-9]/.test(ch) ? 0.556 : /[.,:;'|!ilj ]/.test(ch) ? 0.28 : /[mMwW@%]/.test(ch) ? 0.85 : /[A-Z]/.test(ch) ? 0.68 : /[ftr()\-/]/.test(ch) ? 0.34 : 0.54;
  }
  return w * size * (bold ? 1.05 : 1);
}

function wrap(text: string, size: number, maxW: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, bold) > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export function buildPdf(title: string, blocks: Block[], footer = ''): Uint8Array {
  const pages: string[][] = [[]];
  let y = PAGE_H - MARGIN;
  const cur = () => pages[pages.length - 1];
  const newPage = () => { pages.push([]); y = PAGE_H - MARGIN; };
  const need = (h: number) => { if (y - h < MARGIN + 24) newPage(); };
  const text = (x: number, yy: number, s: string, size: number, bold = false, gray = 0) =>
    cur().push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray} g ${x.toFixed(2)} ${yy.toFixed(2)} Td (${esc(toWinAnsi(s))}) Tj ET`);
  const rule = (yy: number) => cur().push(`0.8 G 0.5 w ${MARGIN} ${yy.toFixed(2)} m ${PAGE_W - MARGIN} ${yy.toFixed(2)} l S`);
  const inner = PAGE_W - 2 * MARGIN;

  for (const b of blocks) {
    if (b.t === 'space') { y -= b.h ?? 10; continue; }
    if (b.t !== 'table') {
      const size = b.t === 'h1' ? 20 : b.t === 'h2' ? 13 : b.t === 'note' ? 8.5 : 10;
      const bold = b.t === 'h1' || b.t === 'h2';
      const lead = size * 1.35;
      const lines = wrap(b.text, size, inner, bold);
      need(lead * Math.min(lines.length, 3) + (b.t === 'h2' ? 8 : 0));
      if (b.t === 'h2') y -= 8;
      for (const l of lines) { need(lead); y -= lead; text(MARGIN, y, l, size, bold, b.t === 'note' ? 0.35 : 0); }
      if (b.t === 'h1') { y -= 6; rule(y); y -= 6; }
      continue;
    }
    // tabla
    const cols = b.widths.map((w) => w * inner);
    const xs = cols.map((_, i) => MARGIN + cols.slice(0, i).reduce((a, c) => a + c, 0));
    const size = 9, lead = 15;
    const row = (cells: string[], bold: boolean, gray = 0) => {
      need(lead); y -= lead;
      cells.forEach((c, i) => {
        const right = (b.align?.[i] ?? 'l') === 'r';
        let s = c;
        while (s.length > 1 && textWidth(s, size, bold) > cols[i] - 6) s = s.slice(0, -1);
        if (s !== c) s = `${s.slice(0, -1)}…`;
        const x = right ? xs[i] + cols[i] - 3 - textWidth(s, size, bold) : xs[i] + 3;
        text(x, y, s, size, bold, gray);
      });
    };
    row(b.head, true); y -= 3; rule(y);
    for (const r of b.rows) row(r, false);
    y -= 4;
  }

  const total = pages.length;
  pages.forEach((p, i) => {
    p.push(`BT /F1 8 Tf 0.45 g ${MARGIN} 28 Td (${esc(toWinAnsi(footer))}) Tj ET`);
    const label = `${i + 1} / ${total}`;
    p.push(`BT /F1 8 Tf 0.45 g ${(PAGE_W - MARGIN - textWidth(label, 8)).toFixed(2)} 28 Td (${label}) Tj ET`);
  });

  // objetos: 1 catálogo, 2 páginas, 3 Helvetica, 4 Helvetica-Bold, luego (contenido, página) por cada página, y al final la info
  const objs: string[] = [];
  const pageObjId = (i: number) => 5 + i * 2 + 1;
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObjId(i)} 0 R`).join(' ')}] /Count ${total} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const content = p.join('\n');
    objs[5 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    objs[pageObjId(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
  });
  const infoId = 5 + total * 2;
  objs[infoId] = `<< /Title (${esc(toWinAnsi(title))}) /Producer (FinAgent) >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id <= infoId; id++) { offsets[id] = out.length; out += `${id} 0 obj\n${objs[id]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${infoId + 1}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
