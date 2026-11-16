// Tareas sueltas (pasar voz a texto, leer un archivo, leer una cartera): NO son el asistente financiero.
// Llevan su propia instrucción corta y una configuración fija (temperatura 0, y salida JSON con esquema para la cartera), en el servidor y en el modo con clave.
export type Task = 'transcribe' | 'read' | 'portfolio';
export const TASK_NAMES: readonly Task[] = ['transcribe', 'read', 'portfolio'];

const POSITION = {
  type: 'OBJECT',
  properties: {
    symbol: { type: 'STRING', description: 'Ticker tal como figura en la captura, en mayúsculas, sin el nombre de la empresa' },
    name: { type: 'STRING', description: 'Nombre del activo si figura' },
    asset_type: { type: 'STRING', enum: ['accion_ar', 'cedear', 'bono_ar', 'fci', 'cripto', 'accion_us', 'etf', 'otro'] },
    quantity: { type: 'NUMBER', description: 'Cantidad de nominales/unidades/cuotapartes' },
    avg_cost: { type: 'NUMBER', description: 'Precio promedio de compra por unidad (PPC), si figura' },
    last_price: { type: 'NUMBER', description: 'Último precio por unidad, si figura' },
    market_value: { type: 'NUMBER', description: 'Valuación o valor total de la posición, si figura' },
    currency: { type: 'STRING', description: 'Moneda de los precios: ARS, USD, etc.' },
  },
  required: ['symbol', 'quantity'],
};
export const PORTFOLIO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    broker: { type: 'STRING', description: 'Nombre del broker o app (IOL, Balanz, Cocos, PPI, Bull Market, Binance, Interactive Brokers…) si se reconoce' },
    positions: { type: 'ARRAY', items: POSITION },
    cash: { type: 'ARRAY', items: { type: 'OBJECT', properties: { currency: { type: 'STRING' }, amount: { type: 'NUMBER' } }, required: ['currency', 'amount'] } },
    notes: { type: 'STRING', description: 'Qué no se pudo leer o qué es dudoso' },
  },
  required: ['positions'],
};

export const TASKS: Record<Task, { system: string; config: Record<string, unknown> }> = {
  transcribe: {
    system: 'Sos un transcriptor de voz de alta precisión. Transcribís fielmente lo que dice la persona, sin responder, resumir ni comentar.',
    config: { temperature: 0 },
  },
  read: {
    system: 'Sos un lector de documentos de alta precisión (OCR). Copiás el texto y las cifras tal como están, sin interpretar ni agregar nada.',
    config: { temperature: 0 },
  },
  portfolio: {
    system: 'Sos un extractor de datos de alta precisión para capturas de pantalla y PDF de brokers y billeteras. Leés la cartera de inversión y devolvés SOLO JSON con el esquema pedido. No inventás datos: lo que no se ve, se omite.',
    config: { temperature: 0, responseMimeType: 'application/json', responseSchema: PORTFOLIO_SCHEMA },
  },
};
export const isTask = (x: unknown): x is Task => typeof x === 'string' && (TASK_NAMES as readonly string[]).includes(x);
