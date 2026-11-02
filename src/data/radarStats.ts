// GENERADO a partir del backtest ESTRICTO del radar (corrida 41544872287, 2-nov-2026, rama radar-estricto). No se edita a mano.
// Solo días con las 4 condiciones medibles y datos de rango reales (≤ 5 % de ruedas sin rango en las 250 previas): los índices viejos con solo el cierre quedaron afuera.
// Para cada tipo de activo y nivel de tensión: cuántos días hubo y con qué frecuencia, en las 5 ruedas siguientes, el cierre cayó (o subió) 5 % / 10 % o más respecto de hoy.
// `exp*` = frecuencia habitual de esos mismos activos en un día cualquiera (misma mezcla de activos). Sesgo de supervivencia (solo activos que hoy existen).
export type StressGroup = 'índices' | 'ETF' | 'acciones' | 'cripto';
export type StressLevel = 'baja' | 'media' | 'alta';
export interface MoveRates { drop: number; up: number; expDrop: number; expUp: number }
export interface LevelStats { n: number; t5: MoveRates; t10: MoveRates }
export interface GroupStats { assets: number; days: number; desde: number; hasta: number; levels: Record<StressLevel, LevelStats> }
export const RADAR_STATS: { calibrado: string; corrida: number; groups: Record<StressGroup, GroupStats> } = {
  calibrado: '2026-11-02', corrida: 41544872287, groups: {
    'índices': { assets: 7, days: 64335, desde: 1962, hasta: 2026, levels: {
      baja: { n: 62650, t5: { drop: 0.0423, up: 0.0349, expDrop: 0.0447, expUp: 0.0375 }, t10: { drop: 0.0055, up: 0.0031, expDrop: 0.0063, expUp: 0.0037 } },
      media: { n: 1407, t5: { drop: 0.1336, up: 0.1166, expDrop: 0.0487, expUp: 0.0413 }, t10: { drop: 0.0341, up: 0.0213, expDrop: 0.0069, expUp: 0.0042 } },
      alta: { n: 278, t5: { drop: 0.1583, up: 0.2554, expDrop: 0.0466, expUp: 0.0386 }, t10: { drop: 0.0468, up: 0.054, expDrop: 0.0065, expUp: 0.004 } },
    } },
    'ETF': { assets: 8, days: 51641, desde: 1994, hasta: 2026, levels: {
      baja: { n: 49165, t5: { drop: 0.0585, up: 0.0515, expDrop: 0.0607, expUp: 0.0555 }, t10: { drop: 0.0093, up: 0.0065, expDrop: 0.0101, expUp: 0.0074 } },
      media: { n: 1985, t5: { drop: 0.0882, up: 0.1169, expDrop: 0.0572, expUp: 0.0528 }, t10: { drop: 0.0242, up: 0.0237, expDrop: 0.0094, expUp: 0.0069 } },
      alta: { n: 491, t5: { drop: 0.1609, up: 0.1935, expDrop: 0.0635, expUp: 0.0574 }, t10: { drop: 0.0346, up: 0.0326, expDrop: 0.0106, expUp: 0.0076 } },
    } },
    'acciones': { assets: 29, days: 294714, desde: 1962, hasta: 2026, levels: {
      baja: { n: 281087, t5: { drop: 0.1425, up: 0.1667, expDrop: 0.1447, expUp: 0.1697 }, t10: { drop: 0.0314, up: 0.0421, expDrop: 0.0326, expUp: 0.0437 } },
      media: { n: 11395, t5: { drop: 0.2001, up: 0.2392, expDrop: 0.1608, expUp: 0.1876 }, t10: { drop: 0.0577, up: 0.0787, expDrop: 0.0385, expUp: 0.0518 } },
      alta: { n: 2232, t5: { drop: 0.2401, up: 0.3051, expDrop: 0.1577, expUp: 0.1846 }, t10: { drop: 0.0838, up: 0.1084, expDrop: 0.0373, expUp: 0.0501 } },
    } },
    'cripto': { assets: 5, days: 17433, desde: 2015, hasta: 2026, levels: {
      baja: { n: 15991, t5: { drop: 0.3029, up: 0.3296, expDrop: 0.3088, expUp: 0.3399 }, t10: { drop: 0.1229, up: 0.1543, expDrop: 0.1295, expUp: 0.1627 } },
      media: { n: 1266, t5: { drop: 0.372, up: 0.4392, expDrop: 0.3089, expUp: 0.3399 }, t10: { drop: 0.2006, up: 0.2441, expDrop: 0.1299, expUp: 0.1632 } },
      alta: { n: 176, t5: { drop: 0.3864, up: 0.5625, expDrop: 0.3022, expUp: 0.3382 }, t10: { drop: 0.2159, up: 0.3466, expDrop: 0.1257, expUp: 0.1605 } },
    } },
  } };
