import type { ModelManager } from './models';

export type TabId = 'market' | 'chat' | 'watch' | 'settings';

/** Servicios compartidos entre pantallas. */
export interface Ctx {
  models: ModelManager;
  openAsset(symbol: string, name?: string): void;
  openSearch(): void;
  askAI(prompt: string, label?: string): void;
  go(tab: TabId): void;
  logout(): void;
}
export interface View { el: HTMLElement; onShow?(): void }
