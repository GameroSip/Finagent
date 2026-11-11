// Salvaguardas de la privacidad: lo que el código pide registrar tiene que coincidir con el vocabulario cerrado, y nunca llevar texto libre.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_HTML } from '../server/admin-page';
import { VERSION } from '../src/version';
import { EVENTS } from '../src/telemetry';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
const files = walk('src').filter((f) => !f.endsWith('telemetry.ts') && !f.endsWith('analytics.ts'));
const calls = files.flatMap((f) => { const s = readFileSync(f, 'utf8'); return [...s.matchAll(/\btrack\('([a-z_]+)'(?:,\s*(\{[^;]*?\}))?\)/g)].map((m) => ({ file: f, name: m[1], props: m[2] ?? '' })); });

describe('cada track() del código usa el vocabulario cerrado', () => {
  it('hay llamadas, y todas piden un evento que existe', () => { expect(calls.length).toBeGreaterThan(30); for (const c of calls) expect(Object.keys(EVENTS), `${c.file}: ${c.name}`).toContain(c.name); });
  it('los campos que se pasan existen en la definición del evento (en llamadas de un solo nivel)', () => {
    for (const c of calls) { if (!c.props || (c.props.match(/\{/g) ?? []).length > 1) continue; const keys = [...c.props.matchAll(/([a-zA-Z]+):/g)].map((m) => m[1]); for (const k of keys) expect(Object.keys(EVENTS[c.name]), `${c.file}: ${c.name}.${k}`).toContain(k); }
  });
  it('ningún evento del vocabulario quedó sin usar (no hay definiciones muertas)', () => { const used = new Set(calls.map((c) => c.name)); used.add('app_open'); for (const n of Object.keys(EVENTS)) expect(used, n).toContain(n); });
  it('nunca se le pasa a track() un campo de texto libre', () => {
    for (const c of calls) for (const k of ['text', 'query', 'prompt', 'message', 'content', 'email', 'plan', 'nombre', 'name:']) expect(c.props.includes(`${k.replace(':', '')}:`) && !(c.name === 'screen' && k === 'name:'), `${c.file}: ${c.name} pasa «${k}»`).toBe(false);
  });
  it('las búsquedas sin resultado solo se envían después de pasar por missQuery() (sin frases ni espacios)', () => {
    const s = readFileSync('src/views/search.ts', 'utf8'); expect(s).toMatch(/missQuery\(qs\)/); expect(s).toMatch(/track\('search_miss', \{ q: mq \}\)/);
  });
});

describe('versión y panel', () => {
  it('la versión es la misma en la app, el paquete y el servidor', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).version).toBe(VERSION); expect(readFileSync('server/worker.ts', 'utf8')).toContain(`version: '${VERSION}'`);
  });
  it('el script del panel compila, nunca usa innerHTML y todos los elementos que busca existen', () => {
    const js = /<script>([\s\S]*)<\/script>/.exec(ADMIN_HTML)![1];
    expect(() => new Function(js)).not.toThrow(); expect(js).not.toContain('innerHTML');
    const ids = new Set([...ADMIN_HTML.matchAll(/id="([a-z0-9-]+)"/g)].map((m) => m[1]));
    for (const m of js.matchAll(/\$\('([a-z0-9-]+)'\)/g)) expect(ids, `#${m[1]}`).toContain(m[1]);
    for (const s of ['Beta: uso, retención y qué piden', '¿Vuelven?', 'Asistente de IA', 'Búsquedas sin resultado', 'Votos por funciones', 'Comentarios y recomendación']) expect(ADMIN_HTML + js).toContain(s);
  });
  it('el panel inserta los comentarios de la gente solo como texto (textContent)', () => {
    const js = /<script>([\s\S]*)<\/script>/.exec(ADMIN_HTML)![1]; expect(js).toMatch(/function mk\(tag,text,cls\)\{[^}]*textContent=text/); expect(js).not.toMatch(/insertAdjacentHTML|outerHTML|document\.write/);
  });
});

describe('indicador de estado en modo servidor', () => {
  it('con servidor se chequea el servidor de FinAgent, no a Google (la clave de Gemini está en el servidor: llamarla desde el teléfono daba un falso "Permission denied")', () => {
    const s = readFileSync('src/views/settings.ts', 'utf8');
    expect(s).toMatch(/isServerMode\(\) \? \{ name: 'FinAgent AI · servidor', run: \(\) => pingServer\(\) \}/); expect(s).toContain("name: 'Google Gemini · modelos'");
    expect(readFileSync('src/server.ts', 'utf8')).toMatch(/export async function pingServer[\s\S]{0,260}'\/health'/);
  });
});
