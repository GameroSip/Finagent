// Almacenamiento de chats: un índice liviano + un registro por chat. Todo vive en el teléfono (localStorage).
// Pensado para no perder datos: si se llena el espacio, primero se quitan las tarjetas gráficas de los chats más
// viejos y recién después se borran chats completos (nunca el que se está guardando).
import type { Turn, ToolCallRecord } from './agent';

export interface ChatMeta {
  id: string;
  title: string;
  titleAuto: boolean;          // true mientras el título lo elige la IA; false si el usuario lo renombró
  createdAt: number;
  updatedAt: number;
  preview: string;
  unread?: boolean;            // respuesta que llegó mientras mirabas otro chat
}

export interface TraceItem {
  name: string; args: Record<string, unknown>; ok: boolean;
  source?: string; asOf?: string | null; fetchedAt?: string; notes?: string[]; error?: string;
}

export interface StoredMsg {
  id: string;
  role: 'user' | 'ai' | 'error';
  at: number;
  text: string;                                       // usuario: lo que se ve; ia: respuesta en markdown; error: mensaje
  prompt?: string;                                    // usuario: el mensaje real si lo que se ve es una etiqueta (sugerencias)
  verification?: { checked: number; ok: boolean; unverified: string[] };
  flags?: { corrected?: boolean; truncated?: boolean };
  trace?: TraceItem[];
  ui?: any[];                                         // tarjetas gráficas (acotadas en tamaño)
  model?: string;
  errKind?: 'invalid_key' | 'busy' | 'unavailable' | 'other' | 'stopped';
  retry?: string;                                     // mensaje para reintentar
}

export interface ChatData { messages: StoredMsg[]; history: Turn[]; numbers: number[] }
export const emptyData = (): ChatData => ({ messages: [], history: [], numbers: [] });

const INDEX_KEY = 'finagent.chats.v1';
const chatKey = (id: string) => `finagent.chat.v1.${id}`;
export const MAX_CHATS = 200;
const MAX_UI_BYTES = 60_000;       // por tarjeta
const MAX_CHAT_BYTES = 700_000;    // por chat

// ------------------------------------------------------------------ acceso seguro a localStorage
function store(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
function readJson<T>(key: string): T | null {
  try { const raw = store()?.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}
function writeRaw(key: string, value: string): boolean {
  try { store()?.setItem(key, value); return !!store(); } catch { return false; } // sin espacio o sin almacenamiento
}
function remove(key: string): void { try { store()?.removeItem(key); } catch { /* nada */ } }

const listeners = new Set<() => void>();
export const subscribeChats = (fn: () => void): (() => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f());

// ------------------------------------------------------------------ índice
function readIndex(): ChatMeta[] {
  const raw = readJson<ChatMeta[]>(INDEX_KEY);
  return Array.isArray(raw) ? raw.filter((m) => m && typeof m.id === 'string') : [];
}
/** `keepId`: chat que nunca se debe borrar para hacer lugar (el que se está guardando). */
function writeIndex(list: ChatMeta[], keepId: string | null = null): void {
  let items = list.slice(0, MAX_CHATS);
  let deletions = 0;
  while (!writeRaw(INDEX_KEY, JSON.stringify(items))) {
    const before = new Set(readIndex().map((m) => m.id));
    const freed = makeRoom(keepId);
    if (!freed || (freed === 'deleted' && ++deletions > MAX_EVICT)) return;
    const after = new Set(readIndex().map((m) => m.id));
    items = items.filter((m) => before.has(m.id) === false || after.has(m.id)); // makeRoom pudo borrar chats: el índice no debe mencionarlos
  }
}

/** Chats ordenados del más reciente al más viejo. */
export const listChats = (): ChatMeta[] => readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
export const getMeta = (id: string): ChatMeta | null => readIndex().find((m) => m.id === id) ?? null;
export const chatExists = (id: string): boolean => getMeta(id) !== null;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function createChat(title = 'Nuevo chat', now = Date.now()): ChatMeta {
  const meta: ChatMeta = { id: newId(), title, titleAuto: true, createdAt: now, updatedAt: now, preview: '' };
  writeIndex([meta, ...readIndex()]);
  emit();
  return meta;
}

export function loadChat(id: string): ChatData | null {
  const d = readJson<ChatData>(chatKey(id));
  if (!d || !Array.isArray(d.messages)) return null;
  return { messages: d.messages, history: Array.isArray(d.history) ? d.history : [], numbers: Array.isArray(d.numbers) ? d.numbers : [] };
}

/** Texto plano de una respuesta en markdown, para la vista previa. */
export function plain(md: string, max = 110): string {
  const t = md.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~|]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
function previewOf(d: ChatData): string {
  for (let i = d.messages.length - 1; i >= 0; i--) if (d.messages[i].role === 'ai') return plain(d.messages[i].text);
  for (let i = d.messages.length - 1; i >= 0; i--) if (d.messages[i].role === 'user') return plain(d.messages[i].text);
  return '';
}

// ------------------------------------------------------------------ guardado con control de espacio
function stripUi(d: ChatData, keepLast = 0): ChatData {
  const aiIdx = d.messages.map((m, i) => (m.ui?.length ? i : -1)).filter((i) => i >= 0);
  const drop = new Set(aiIdx.slice(0, Math.max(0, aiIdx.length - keepLast)));
  return { ...d, messages: d.messages.map((m, i) => (drop.has(i) ? { ...m, ui: undefined } : m)) };
}

type Freed = 'stripped' | 'deleted' | null;
const MAX_EVICT = 10; // tope de chats que se pueden borrar por cada guardado: un problema de espacio no debe arrasar el historial

/** Libera espacio: 1) quita tarjetas gráficas del chat más viejo que aún las tenga; 2) borra el chat más viejo. */
function makeRoom(exceptId: string | null): Freed {
  const others = readIndex().filter((m) => m.id !== exceptId).sort((a, b) => a.updatedAt - b.updatedAt);
  for (const m of others) {
    const d = loadChat(m.id);
    if (d?.messages.some((x) => x.ui?.length)) {
      if (writeRaw(chatKey(m.id), JSON.stringify(stripUi(d)))) return 'stripped';
    }
  }
  const oldest = others[0];
  if (!oldest) return null;
  remove(chatKey(oldest.id));
  writeRaw(INDEX_KEY, JSON.stringify(readIndex().filter((m) => m.id !== oldest.id)));
  return 'deleted';
}

/** Guarda los datos del chat y actualiza su ficha. No hace nada si el chat fue eliminado mientras tanto. */
export function saveChat(id: string, data: ChatData, patch: Partial<ChatMeta> = {}, now = Date.now()): boolean {
  const idx = readIndex();
  const meta = idx.find((m) => m.id === id);
  if (!meta) return false;
  let d = data;
  let json = JSON.stringify(d);
  for (let keep = 8; json.length > MAX_CHAT_BYTES && keep >= 0; keep = keep > 1 ? Math.floor(keep / 2) : keep - 1) {
    d = stripUi(data, keep); json = JSON.stringify(d); // chat enorme: se conservan solo las últimas tarjetas
  }
  let ok = writeRaw(chatKey(id), json);
  for (let deletions = 0; !ok; ) {
    const freed = makeRoom(id);
    if (!freed || (freed === 'deleted' && ++deletions > MAX_EVICT)) return false; // no hay forma de hacer lugar: el llamador avisa
    ok = writeRaw(chatKey(id), json);
  }
  // Se relee el índice: hacer lugar pudo borrar otros chats y no deben reaparecer como fichas sin contenido.
  const fresh = readIndex();
  if (!fresh.some((m) => m.id === id)) return false;
  writeIndex(fresh.map((m) => (m.id === id ? { ...m, ...patch, updatedAt: now, preview: previewOf(d) } : m)), id);
  emit();
  return true;
}

export function renameChat(id: string, title: string): void {
  const t = title.trim().slice(0, 80);
  if (!t) return;
  writeIndex(readIndex().map((m) => (m.id === id ? { ...m, title: t, titleAuto: false } : m)));
  emit();
}
/** Título elegido por la IA: se ignora si el usuario ya renombró el chat. */
export function setAutoTitle(id: string, title: string): void {
  const t = title.trim().slice(0, 80);
  if (!t) return;
  writeIndex(readIndex().map((m) => (m.id === id && m.titleAuto ? { ...m, title: t } : m)));
  emit();
}
export function setUnread(id: string, unread: boolean): void {
  const list = readIndex();
  if (!list.some((m) => m.id === id && !!m.unread !== unread)) return;
  writeIndex(list.map((m) => (m.id === id ? { ...m, unread: unread || undefined } : m)));
  emit();
}
export function deleteChat(id: string): void {
  remove(chatKey(id));
  writeIndex(readIndex().filter((m) => m.id !== id));
  emit();
}
export function deleteAllChats(): void {
  for (const m of readIndex()) remove(chatKey(m.id));
  remove(INDEX_KEY);
  emit();
}

// ------------------------------------------------------------------ búsqueda y agrupación
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Busca en títulos y en el texto de los mensajes (los 100 chats más recientes). */
export function searchChats(query: string): Array<{ meta: ChatMeta; snippet?: string }> {
  const q = norm(query.trim());
  if (!q) return listChats().map((meta) => ({ meta }));
  const out: Array<{ meta: ChatMeta; snippet?: string }> = [];
  for (const meta of listChats().slice(0, 100)) {
    if (norm(meta.title).includes(q)) { out.push({ meta }); continue; }
    const d = loadChat(meta.id);
    const hit = d?.messages.find((m) => m.role !== 'error' && norm(m.text).includes(q));
    if (hit) {
      const t = hit.text.replace(/\s+/g, ' ');
      const at = norm(t).indexOf(q);
      const from = Math.max(0, at - 30);
      out.push({ meta, snippet: (from > 0 ? '…' : '') + plain(t.slice(from, from + 110), 110) });
    }
  }
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Agrupa como ChatGPT: Hoy, Ayer, Últimos 7 días, Últimos 30 días y luego por mes. */
export function groupByDate(list: ChatMeta[], now = Date.now()): Array<{ label: string; items: ChatMeta[] }> {
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  const t0 = day0.getTime(), DAY = 86_400_000;
  const groups: Array<{ label: string; items: ChatMeta[] }> = [];
  const put = (label: string, m: ChatMeta) => {
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, items: [] }; groups.push(g); }
    g.items.push(m);
  };
  for (const m of list) {
    const age = t0 - m.updatedAt;
    if (m.updatedAt >= t0) put('Hoy', m);
    else if (age <= DAY) put('Ayer', m);
    else if (age <= 7 * DAY) put('Últimos 7 días', m);
    else if (age <= 30 * DAY) put('Últimos 30 días', m);
    else put(cap(new Date(m.updatedAt).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })), m);
  }
  return groups;
}

// ------------------------------------------------------------------ de la respuesta del agente a lo que se guarda
export function traceOf(calls: ToolCallRecord[]): TraceItem[] {
  return calls.map((c) => {
    const meta = (c.result as any)?.meta ?? {};
    return c.result?.ok
      ? { name: c.name, args: c.args, ok: true, source: meta.source, asOf: meta.as_of ?? null, fetchedAt: meta.fetched_at, notes: meta.notes ?? [] }
      : { name: c.name, args: c.args, ok: false, error: String((c.result as any)?.error ?? 'error') };
  });
}

/** Tarjetas gráficas de las herramientas, sin duplicados y acotadas en tamaño. */
export function uiOf(calls: ToolCallRecord[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const c of calls) {
    const ui = c.ui;
    if (!ui) continue;
    const key = ui.kind + (ui.symbol ?? ui.title ?? '') + (ui.period ?? '');
    if (seen.has(key)) continue;
    seen.add(key);
    if (JSON.stringify(ui).length <= MAX_UI_BYTES) out.push(ui);
  }
  return out;
}
