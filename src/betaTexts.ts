// Textos de la beta que se arman en tiempo de ejecución (listas de votos, motivos de un 👎, tipos de comentario): viven acá, y no dentro de t(),
// para que la prueba de traducciones los vea y exija su versión en inglés y portugués.
import { FEATURES } from './telemetry';

export const WISHES: Record<(typeof FEATURES)[number], [string, string]> = {
  cartera: ['Mi cartera', 'Cargar lo que tengo (acciones, cripto, dólares, plazo fijo) y ver cuánto tengo en cada moneda.'],
  calculadora: ['Calculadora de escenarios', 'Ver cuánto podría juntar con distintos aportes, plazos e inflación.'],
  alertas: ['Avisos en el celular', 'Que la app me avise cuando un activo que sigo se mueve mucho o entra en tensión alta.'],
  cuentas: ['Conectar mis cuentas', 'Traer automáticamente lo que tengo en mi broker o banco.'],
  ejecucion: ['Operar desde FinAgent', 'Comprar o vender desde la app, siempre con mi confirmación.'],
  recomendaciones: ['Recomendaciones personalizadas', 'Que me sugiera qué hacer según mi situación.'],
  tiempo_real: ['Precios en tiempo real', 'Cotizaciones sin demora.'],
};
export const KIND_LABELS: Array<['idea' | 'problema' | 'falta', string]> = [['idea', 'Una idea'], ['problema', 'Algo no funciona'], ['falta', 'Algo que falta']];
export const RATE_REASONS: Array<['wrong' | 'incomplete' | 'confusing' | 'slow' | 'other', string]> = [['wrong', 'La respuesta es incorrecta'], ['incomplete', 'Le faltó información'], ['confusing', 'Es confusa'], ['slow', 'Tardó demasiado'], ['other', 'Otra cosa']];
export const VOTE_LABELS = { vote: 'Me interesa', voted: 'Anotado ✓' } as const;

export const betaTexts = (): string[] => [...Object.values(WISHES).flat(), ...KIND_LABELS.map(([, l]) => l), ...RATE_REASONS.map(([, l]) => l), VOTE_LABELS.vote, VOTE_LABELS.voted];
