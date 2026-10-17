import type { ModelManager } from './models';
import type { Overlay } from './views/asset';

export type TabId = 'market' | 'chat' | 'watch' | 'settings';

/** Servicios compartidos entre pantallas. */
export interface Ctx {
  models: ModelManager;
  openAsset(symbol: string, name?: string): void;
  openSearch(): void;
  /** Abre una pantalla superpuesta que participa del botón "atrás". `make` recibe `done`, que debe llamarse al terminar de cerrarse. */
  layer(make: (done: () => void) => Overlay): void;
  /** Inicia una conversación NUEVA con este mensaje (como "Analizar con IA" desde otra pantalla). */
  askAI(prompt: string, label?: string): void;
  go(tab: TabId): void;
  logout(): void;
}
export interface View { el: HTMLElement; onShow?(): void }
