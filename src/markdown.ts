// Renderizador de markdown mínimo y SEGURO: escapa todo el HTML antes de formatear y solo admite enlaces http(s).
// Cubre lo que producen los modelos: títulos, listas (anidadas), tablas, código, citas, enlaces, negrita/cursiva/tachado.
import { safeUrl } from './url';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(raw: string): string {
  return raw.split(/(`[^`\n]+`)/g).map((part) => {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return `<code>${esc(part.slice(1, -1))}</code>`;
    let t = esc(part);
    t = t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label: string, url: string) => {
      const u = safeUrl(url.replace(/&amp;/g, '&'));
      return u ? `<a href="${esc(u)}" class="mdlink" target="_blank" rel="noopener">${label}</a>` : m;
    });
    return t
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
      .replace(/~~([^~\n]+?)~~/g, '<del>$1</del>')
      .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
  }).join('');
}

const LIST_RE = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/;
const TABLE_RE = /^\s*\|.*\|\s*$/;
const HR_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const indentOf = (s: string) => s.replace(/\t/g, '    ').length;

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  const stack: Array<{ type: 'ul' | 'ol'; indent: number }> = [];
  let para: string[] = [];

  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const closeTo = (indent: number) => {
    while (stack.length && stack[stack.length - 1].indent > indent) out.push(`</li></${stack.pop()!.type}>`);
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];

    if (/^\s*```/.test(ln)) { // bloque de código (si no se cierra, llega hasta el final)
      flushPara(); closeTo(-1);
      const buf: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]); i++) buf.push(lines[i]);
      out.push(`<pre class="code"><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (/^\s*$/.test(ln)) {
      flushPara();
      if (stack.length) { // una línea en blanco no corta la lista si sigue otro ítem o texto indentado
        let j = i + 1;
        while (j < lines.length && /^\s*$/.test(lines[j])) j++;
        if (!(j < lines.length && (LIST_RE.test(lines[j]) || /^\s{2,}\S/.test(lines[j])))) closeTo(-1);
      }
      continue;
    }

    if (TABLE_RE.test(ln)) {
      flushPara(); closeTo(-1);
      const rows: string[][] = [];
      for (; i < lines.length && TABLE_RE.test(lines[i]); i++) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      i--;
      if (rows.length) {
        const [head, ...body] = rows;
        out.push('<div class="tbl"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      }
      continue;
    }

    const h = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(ln);
    if (h) { flushPara(); closeTo(-1); out.push(`<h4>${inline(h[1])}</h4>`); continue; }

    if (HR_RE.test(ln)) { flushPara(); closeTo(-1); out.push('<hr>'); continue; }

    if (/^\s{0,3}>/.test(ln)) {
      flushPara(); closeTo(-1);
      const buf: string[] = [];
      for (; i < lines.length && /^\s{0,3}>/.test(lines[i]); i++) buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
      i--;
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
      continue;
    }

    const li = LIST_RE.exec(ln);
    if (li) {
      flushPara();
      const ind = indentOf(li[1]);
      const type: 'ul' | 'ol' = /\d/.test(li[2]) ? 'ol' : 'ul';
      closeTo(ind);
      const top = stack[stack.length - 1];
      if (!top || top.indent < ind) {
        const start = type === 'ol' && parseInt(li[2], 10) !== 1 ? ` start="${parseInt(li[2], 10)}"` : '';
        out.push(`<${type}${start}>`); stack.push({ type, indent: ind });
      } else if (top.type !== type) {
        out.push(`</li></${stack.pop()!.type}><${type}>`); stack.push({ type, indent: ind });
      } else out.push('</li>');
      out.push(`<li>${inline(li[3])}`);
      continue;
    }

    if (stack.length && /^\s{2,}\S/.test(ln)) { out.push(`<br>${inline(ln.trim())}`); continue; } // continuación de ítem
    closeTo(-1);
    para.push(ln.trim());
  }
  flushPara(); closeTo(-1);
  return out.join('');
}
