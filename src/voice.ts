// Dictado por voz. Tres motores, del mejor al de respaldo:
//  1) 'native': el reconocedor de voz de Android (texto en vivo mientras hablás, entiende pausas y muletillas, no gasta consultas);
//  2) 'web':    el reconocedor del navegador (computadora y algunos navegadores);
//  3) 'record': se graba y Gemini lo pasa a texto al terminar (solo si los anteriores no están).
import { Capacitor } from '@capacitor/core';
import { AttachError, canRecord, startRecording, type Recorder, type Recording } from './attach';
import { t } from './i18n';

export type Engine = 'native' | 'web' | 'record';
export interface DictationHooks {
  /** Texto reconocido hasta ahora (solo 'native' y 'web'). */
  onText(text: string): void;
  /** Volumen de la voz, 0 a 1. */
  onLevel(v: number): void;
  /** El motor se detuvo solo (límite de tiempo o error); `text` es lo que alcanzó a entender. */
  onAutoEnd(r: DictationResult): void;
}
export type DictationResult = { text: string; rec?: undefined } | { text?: undefined; rec: Recording };
export interface Dictation { engine: Engine; finish(): Promise<DictationResult>; cancel(): void }

export const MAX_DICTATION_SECONDS = 180;
const SpeechCtor = (): any => (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
export const nativeVoice = (): boolean => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
/** ¿Hay alguna forma de dictar en este dispositivo? */
export const canDictate = (): boolean => nativeVoice() || !!SpeechCtor() || canRecord();
const join = (a: string, b: string) => `${a} ${b}`.replace(/\s+/g, ' ').trim();

class Unsupported extends Error {}

async function startNative(lang: string, hooks: DictationHooks): Promise<Dictation> {
  const { SpeechRecognition: SR } = await import('@capgo/capacitor-speech-recognition');
  if (!(await SR.available()).available) throw new Unsupported();
  let perm = await SR.checkPermissions();
  if (perm.speechRecognition !== 'granted') perm = await SR.requestPermissions();
  if (perm.speechRecognition !== 'granted') throw new AttachError(t('No pude usar el micrófono: revisá el permiso de la app'));

  let base = '', partial = '', stopping = false, dead = false, restarts = 0, lastStart = 0;
  const handles: Array<{ remove(): Promise<void> | void }> = [];
  const commit = () => { if (partial) { base = join(base, partial); partial = ''; } };
  const shown = () => join(base, partial);
  const begin = async () => {
    lastStart = Date.now();
    await SR.start({ language: lang, maxResults: 1, partialResults: true, popup: false, muteRecognizerBeep: true, addPunctuation: true });
  };
  const cleanup = () => { dead = true; for (const h of handles) void Promise.resolve(h.remove()).catch(() => {}); clearTimeout(limit); };
  // Android corta el reconocimiento tras unos segundos de silencio: se guarda lo dicho y se vuelve a escuchar, así se puede pausar.
  const restart = async () => {
    if (stopping || dead) return;
    commit();
    if (++restarts > 200) { cleanup(); hooks.onAutoEnd({ text: shown() }); return; }
    const wait = Math.max(0, 350 - (Date.now() - lastStart));
    await new Promise((r) => setTimeout(r, wait));
    if (stopping || dead) return;
    try { await begin(); } catch { cleanup(); hooks.onAutoEnd({ text: shown() }); }
  };
  handles.push(await SR.addListener('partialResults', (e: any) => {
    const m = e?.matches?.[0] ?? e?.accumulatedText ?? '';
    if (typeof m === 'string' && m) { partial = m; hooks.onText(shown()); }
  }));
  handles.push(await SR.addListener('audioLevel', (e: any) => { const l = Number(e?.level); hooks.onLevel(l > 1 ? Math.max(0, Math.min(1, (l + 2) / 12)) : Math.max(0, Math.min(1, l || 0))); }));
  handles.push(await SR.addListener('listeningState', (e: any) => { if ((e?.state === 'stopped' || e?.status === 'stopped') && !stopping) void restart(); }));
  handles.push(await SR.addListener('error', (e: any) => {
    const code = String(e?.code ?? e?.message ?? '');
    if (/no.?match|speech.?timeout|no.?speech|client|busy/i.test(code)) { void restart(); return; }       // pausa larga o silencio: es normal
    if (/permission|insufficient/i.test(code)) { cleanup(); hooks.onAutoEnd({ text: shown() }); }
    else void restart();
  }));
  const limit = setTimeout(() => { if (!stopping && !dead) { stopping = true; void SR.stop().catch(() => {}); setTimeout(() => { commit(); cleanup(); hooks.onAutoEnd({ text: shown() }); }, 500); } }, MAX_DICTATION_SECONDS * 1000);
  try { await begin(); } catch (e) { cleanup(); throw e; }
  return {
    engine: 'native',
    async finish() {
      stopping = true;
      try { await SR.stop(); } catch { /* ya estaba detenido */ }
      await new Promise((r) => setTimeout(r, 450));                 // llega el último trozo
      if (!partial) { try { const l = await SR.getLastPartialResult(); if (l.available && l.text && !shown().endsWith(l.text)) partial = l.text; } catch { /* sin último trozo */ } }
      commit(); cleanup();
      return { text: base };
    },
    cancel() { stopping = true; void SR.stop().catch(() => {}); cleanup(); },
  };
}

function startWeb(lang: string, hooks: DictationHooks): Dictation {
  const R = SpeechCtor();
  const rec = new R();
  rec.lang = lang; rec.continuous = true; rec.interimResults = true;
  let finals = '', interim = '', stopping = false, dead = false;
  rec.onresult = (e: any) => {
    let f = '', i = '';
    for (let k = 0; k < e.results.length; k++) { const r = e.results[k]; (r.isFinal ? (f += r[0].transcript) : (i += r[0].transcript)); }
    finals = f; interim = i; hooks.onText(join(finals, interim)); hooks.onLevel(0.6);
  };
  rec.onend = () => { if (stopping || dead) return; try { finals = join(finals, interim); interim = ''; rec.start(); } catch { dead = true; hooks.onAutoEnd({ text: finals }); } };
  rec.onerror = (e: any) => { if (/not-allowed|service-not-allowed/.test(e?.error ?? '')) { dead = true; hooks.onAutoEnd({ text: join(finals, interim) }); } };
  rec.start();
  return {
    engine: 'web',
    finish: () => new Promise((resolve) => {
      stopping = true;
      const done = () => resolve({ text: join(finals, interim) });
      rec.onend = done; try { rec.stop(); } catch { done(); }
      setTimeout(done, 1200);
    }),
    cancel() { stopping = true; try { rec.abort(); } catch { /* ya parado */ } },
  };
}

/** Empieza a dictar con el mejor motor disponible. Si el nativo falla por algo que no sea el permiso, se pasa al siguiente. */
export async function startDictation(lang: string, hooks: DictationHooks): Promise<Dictation> {
  if (nativeVoice()) {
    try { return await startNative(lang, hooks); }
    catch (e) { if (e instanceof AttachError) throw e; /* sin reconocedor en este teléfono: respaldo */ }
  } else if (SpeechCtor()) {
    try { return startWeb(lang, hooks); } catch { /* respaldo */ }
  }
  if (!canRecord()) throw new AttachError(t('Este dispositivo no permite dictar'));
  const r: Recorder = await startRecording((rec) => hooks.onAutoEnd({ rec }), hooks.onLevel);
  return { engine: 'record', finish: async () => ({ rec: await r.stop() }), cancel: () => r.cancel() };
}
