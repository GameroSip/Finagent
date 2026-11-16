import { beforeEach, describe, expect, it, vi } from 'vitest';

// Reconocedor nativo simulado: se puede disparar cualquier evento a mano.
const h = vi.hoisted(() => {
  const listeners: Record<string, Array<(e: any) => void>> = {};
  const SR = {
    calls: { start: 0, stop: 0 }, perm: 'granted', available: true,
    available_: async () => ({ available: SR.available }),
  };
  return { listeners, SR };
});
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: () => ({}) }));
vi.mock('@capgo/capacitor-speech-recognition', () => ({
  SpeechRecognition: {
    available: () => h.SR.available_(),
    checkPermissions: async () => ({ speechRecognition: h.SR.perm }),
    requestPermissions: async () => ({ speechRecognition: h.SR.perm }),
    start: async () => { h.SR.calls.start++; },
    stop: async () => { h.SR.calls.stop++; },
    getLastPartialResult: async () => ({ available: false, text: '' }),
    addListener: async (name: string, fn: (e: any) => void) => { (h.listeners[name] ??= []).push(fn); return { remove: async () => { h.listeners[name] = (h.listeners[name] ?? []).filter((x) => x !== fn); } }; },
  },
}));
const emit = (name: string, e: any) => (h.listeners[name] ?? []).slice().forEach((f) => f(e));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

import { startDictation } from '../src/voice';

beforeEach(() => { for (const k of Object.keys(h.listeners)) delete h.listeners[k]; h.SR.calls.start = 0; h.SR.calls.stop = 0; h.SR.perm = 'granted'; h.SR.available = true; });

describe('dictado nativo (Android)', () => {
  it('muestra el texto en vivo y conserva lo dicho aunque Android corte por una pausa', async () => {
    const seen: string[] = [];
    const d = await startDictation('es-AR', { onText: (t) => seen.push(t), onLevel: () => {}, onAutoEnd: () => {} });
    expect(d.engine).toBe('native');
    expect(h.SR.calls.start).toBe(1);
    emit('partialResults', { matches: ['cómo'] });
    emit('partialResults', { matches: ['cómo viene'] });
    emit('listeningState', { state: 'stopped' });          // pausa larga: Android corta solo
    await wait(450);
    expect(h.SR.calls.start).toBe(2);                      // volvió a escuchar
    emit('partialResults', { matches: ['el dólar'] });
    expect(seen.at(-1)).toBe('cómo viene el dólar');       // lo anterior no se perdió
    const r = await d.finish();
    expect(r.text).toBe('cómo viene el dólar');
  });
  it('un error de "no entendí nada" no corta el dictado: vuelve a escuchar', async () => {
    const d = await startDictation('es-AR', { onText: () => {}, onLevel: () => {}, onAutoEnd: () => {} });
    emit('error', { code: 'no_match', message: 'No match' });
    await wait(450);
    expect(h.SR.calls.start).toBe(2);
    d.cancel();
  });
  it('sin permiso del micrófono avisa en vez de grabar a oscuras', async () => {
    h.SR.perm = 'denied';
    await expect(startDictation('es-AR', { onText: () => {}, onLevel: () => {}, onAutoEnd: () => {} })).rejects.toThrow(/micrófono/);
  });
  it('convierte el volumen del reconocedor a 0–1', async () => {
    const lv: number[] = [];
    const d = await startDictation('es-AR', { onText: () => {}, onLevel: (v) => lv.push(v), onAutoEnd: () => {} });
    emit('audioLevel', { level: 10 }); emit('audioLevel', { level: -2 }); emit('audioLevel', { level: 0.4 });
    expect(lv[0]).toBe(1); expect(lv[1]).toBe(0); expect(lv[2]).toBeCloseTo(0.4);
    d.cancel();
  });
});
