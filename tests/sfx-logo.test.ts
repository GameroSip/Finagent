import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRASS, logoSvg, markSvg, MARK_PATH, MARK_POINTS } from '../src/ui/logo';
import { playLaunch, setSound, soundOn } from '../src/ui/sfx';

/** Un AudioContext falso que registra qué se conectó y cuándo se cerró. */
function fakeAudio() {
  const made: any[] = [];
  class Param { v = 0; setValueAtTime = vi.fn(); exponentialRampToValueAtTime = vi.fn(); }
  class Ctx {
    currentTime = 0; sampleRate = 8000; destination = {}; closed = false; started: string[] = []; gains: Array<{ gain: Param }> = [];
    constructor() { made.push(this); }
    resume = vi.fn(async () => {}); close = vi.fn(async () => { this.closed = true; });
    createGain = () => { const g = { gain: new Param(), connect: vi.fn() }; this.gains.push(g); return g; };
    createBiquadFilter = () => ({ type: '', Q: { value: 0 }, frequency: new Param(), connect: vi.fn() });
    createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
    createBufferSource = () => ({ buffer: null, connect: vi.fn(), start: () => this.started.push('ruido'), stop: vi.fn() });
    createOscillator = () => ({ type: '', frequency: new Param(), connect: vi.fn(), start: () => this.started.push('golpe'), stop: vi.fn() });
  }
  (globalThis as any).AudioContext = Ctx;
  return made;
}
// Node no trae localStorage: se simula uno simple (en el teléfono lo da el navegador).
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
afterEach(() => { delete (globalThis as any).AudioContext; vi.useRealTimers(); setSound(true); });

describe('sonido del despegue', () => {
  it('suena una vez (ruido que sube de tono y un golpe grave) y cierra el audio al terminar', () => {
    vi.useFakeTimers();
    const made = fakeAudio();
    expect(playLaunch()).toBe(true);
    expect(made).toHaveLength(1); expect(made[0].started.sort()).toEqual(['golpe', 'ruido']);
    vi.advanceTimersByTime(2500);
    expect(made[0].closed).toBe(true);
  });
  it('con el sonido apagado no crea ningún audio, y la elección se recuerda', () => {
    const made = fakeAudio();
    setSound(false);
    expect(soundOn()).toBe(false); expect(playLaunch()).toBe(false); expect(made).toHaveLength(0);
    setSound(true); expect(soundOn()).toBe(true);
  });
  it('si el sistema no permite audio, no da error ni rompe la carga', () => {
    expect(playLaunch()).toBe(false);                                                    // sin AudioContext
    (globalThis as any).AudioContext = class { constructor() { throw new Error('bloqueado por el sistema'); } };
    expect(playLaunch()).toBe(false);
  });
  it('el volumen general es sutil (nunca fuerte, aunque se abra la app de noche)', () => {
    const made = fakeAudio();
    playLaunch();
    const master = made[0].gains[0].gain.exponentialRampToValueAtTime.mock.calls.map((c: number[]) => c[0]);
    expect(Math.max(...master)).toBeGreaterThan(0.05); expect(Math.max(...master)).toBeLessThanOrEqual(0.25);
  });
});

describe('el logo', () => {
  it('la figura 2D y la que se extruye en 3D son la misma (el trazo sale de los mismos puntos)', () => {
    const d = MARK_POINTS.map(([x, y], i) => `${i === 0 ? 'M' : ''}${i === 0 ? `${x} ${y}` : x === MARK_POINTS[i - 1][0] ? `V${y}` : y === MARK_POINTS[i - 1][1] ? `H${x}` : `L${x} ${y}`}`).join('') + 'Z';
    expect(d).toBe(MARK_PATH);
  });
  it('la figura es una F: tronco, brazo superior y brazo medio, con los terminales inclinados hacia arriba', () => {
    const xs = MARK_POINTS.map((p) => p[0]), ys = MARK_POINTS.map((p) => p[1]);
    expect(Math.min(...xs)).toBe(0); expect(Math.max(...xs)).toBeCloseTo(85.2); expect(Math.min(...ys)).toBe(0); expect(Math.max(...ys)).toBe(100);
    const diagonals = MARK_POINTS.filter((p, i) => { const q = MARK_POINTS[(i + 1) % MARK_POINTS.length]; return p[0] !== q[0] && p[1] !== q[1]; });
    expect(diagonals).toHaveLength(2);
    expect(MARK_POINTS).toHaveLength(10);
  });
  it('los SVG usan el latón de la marca y no quedan restos del destello ni del degradé anterior', () => {
    for (const svg of [markSvg(40), logoSvg(64)]) { expect(svg).toContain(BRASS); expect(svg).not.toMatch(/7C6CFF|22D3EE|linearGradient/i); }
    expect(markSvg(40, 'currentColor')).toContain('currentColor');
  });
});
