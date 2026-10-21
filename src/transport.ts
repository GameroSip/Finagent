// Cómo el agente le pide una "vuelta" al modelo: directo a Gemini con la clave del usuario (modo desarrollo) o a través del servidor de FinAgent (beta).
export interface GenerateArgs { contents: any[]; withTools: boolean; turn?: string }
export interface GenerateResult { data: any; model: string; turn?: string }
export interface Transport {
  generate(a: GenerateArgs): Promise<GenerateResult>;
  /** La respuesta no pudo completarse: devuelve la consulta descontada (el servidor lo hace una sola vez). */
  abandon?(turn: string): Promise<void>;
}
