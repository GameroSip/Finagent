// Efecto de sonido del despegue, sintetizado con WebAudio (sin archivos): un soplido de ruido que sube de tono y un golpe grave que se apaga. Sutil y corto (~1,4 s).
// Se puede apagar en Ajustes. Si el sistema no permite reproducir audio sin tocar la pantalla, simplemente no suena (nunca da error).
const KEY = 'finagent.sound.v1';
export const soundOn = (): boolean => { try { return globalThis.localStorage?.getItem(KEY) !== '0'; } catch { return true; } };
export const setSound = (on: boolean): void => { try { globalThis.localStorage?.setItem(KEY, on ? '1' : '0'); } catch { /* sin almacenamiento */ } };

export function playLaunch(volume = 0.16): boolean {
  if (!soundOn()) return false;
  try {
    const AC = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!AC) return false;
    const ctx: AudioContext = new AC();
    void ctx.resume?.();
    const t0 = ctx.currentTime + 0.02, dur = 1.45;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(volume, t0 + 0.42);
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    master.connect(ctx.destination);
    // soplido: ruido filtrado cuyo centro sube de grave a agudo (la aceleración)
    const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < n; i++) { b0 = 0.985 * b0 + 0.015 * (Math.random() * 2 - 1); d[i] = (Math.random() * 2 - 1) * 0.55 + b0 * 9; }   // ruido con más cuerpo en los graves
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(180, t0); bp.frequency.exponentialRampToValueAtTime(2800, t0 + dur * 0.85);
    noise.connect(bp); bp.connect(master);
    // golpe grave del encendido
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(78, t0); osc.frequency.exponentialRampToValueAtTime(34, t0 + 0.7);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.9, t0 + 0.05); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75);
    osc.connect(og); og.connect(master);
    noise.start(t0); osc.start(t0); noise.stop(t0 + dur); osc.stop(t0 + 0.8);
    setTimeout(() => void ctx.close?.().catch(() => {}), (dur + 0.4) * 1000);
    return true;
  } catch { return false; }
}
