// Calculadora segura (sin eval): + - * / % // ** paréntesis, abs, round, min, max, sqrt.

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|\/\/|[-+*/%(),]))/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new Error('expresión no permitida');
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else out.push({ t: 'op', v: m[3] });
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  min: Math.min,
  max: Math.max,
  round: (x: number, n = 0) => {
    const f = 10 ** n;
    const v = Math.abs(x) * f;
    const fl = Math.floor(v);
    const diff = v - fl;
    // redondeo "banker's" como Python
    const r = diff > 0.5 || (diff === 0.5 && fl % 2 === 1) ? fl + 1 : fl;
    return (Math.sign(x) * r) / f;
  },
};

export function evaluate(src: string): number {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;

  function expr(): number {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[i++] as { v: string }).v;
      const b = term();
      a = op === '+' ? a + b : a - b;
    }
    return a;
  }
  function term(): number {
    let a = unary();
    while (isOp('*') || isOp('/') || isOp('%') || isOp('//')) {
      const op = (toks[i++] as { v: string }).v;
      const b = unary();
      if ((op === '/' || op === '%' || op === '//') && b === 0) throw new Error('división por cero');
      if (op === '*') a = a * b;
      else if (op === '/') a = a / b;
      else if (op === '//') a = Math.floor(a / b);
      else a = ((a % b) + b) % b;
    }
    return a;
  }
  function unary(): number {
    if (isOp('-')) { i++; return -unary(); }
    if (isOp('+')) { i++; return unary(); }
    return power();
  }
  function power(): number {
    const base = primary();
    if (isOp('**')) {
      i++;
      const e = unary();
      if (Math.abs(e) > 100) throw new Error('exponente demasiado grande');
      return base ** e;
    }
    return base;
  }
  function primary(): number {
    const t = toks[i++];
    if (!t) throw new Error('expresión incompleta');
    if (t.t === 'num') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const v = expr();
      if (!isOp(')')) throw new Error('falta cerrar paréntesis');
      i++;
      return v;
    }
    if (t.t === 'id') {
      const fn = FUNCS[t.v];
      if (!fn || !isOp('(')) throw new Error('expresión no permitida');
      i++;
      const args: number[] = [];
      if (!isOp(')')) {
        args.push(expr());
        while (isOp(',')) { i++; args.push(expr()); }
      }
      if (!isOp(')')) throw new Error('falta cerrar paréntesis');
      i++;
      return fn(...args);
    }
    throw new Error('expresión no permitida');
  }

  const v = expr();
  if (i < toks.length) throw new Error('expresión no permitida');
  if (!Number.isFinite(v)) throw new Error('resultado no finito');
  return v;
}
