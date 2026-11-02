// GENERADO a partir del backtest del radar (corrida 41114370725 del 30-oct-2026, rama radar-reports). No se edita a mano: si cambia el cálculo, se vuelve a correr el backtest.
// Para cada tipo de activo y nivel de tensión: cuántos días hubo y con qué frecuencia, en las 5 ruedas siguientes, el cierre cayó (o subió) 5 % / 10 % o más respecto de hoy.
// `exp*` = frecuencia habitual de esos mismos activos en un día cualquiera (misma mezcla de activos). Datos: 49 activos, 1927–2026; sesgo de supervivencia (solo activos que hoy existen).
export type StressGroup = 'índices' | 'ETF' | 'acciones' | 'cripto';
export type StressLevel = 'baja' | 'media' | 'alta';
export interface MoveRates { drop: number; up: number; expDrop: number; expUp: number }
export interface LevelStats { n: number; t5: MoveRates; t10: MoveRates }
export interface GroupStats { assets: number; days: number; levels: Record<StressLevel, LevelStats> }
export const RADAR_STATS: { calibrado: string; desde: number; corrida: number; groups: Record<StressGroup, GroupStats> } = {
  calibrado: '2026-10-30', desde: 1927, corrida: 41114370725, groups: {
    'índices': { assets: 7, days: 87524, levels: {
      baja: { n: 84841, t5: { drop: 0.0451, up: 0.0373, expDrop: 0.0474, expUp: 0.0399 }, t10: { drop: 0.0059, up: 0.0037, expDrop: 0.0068, expUp: 0.0044 } },
      media: { n: 2342, t5: { drop: 0.1183, up: 0.1089, expDrop: 0.0496, expUp: 0.0424 }, t10: { drop: 0.0333, up: 0.0218, expDrop: 0.0072, expUp: 0.0046 } },
      alta: { n: 341, t5: { drop: 0.1349, up: 0.2258, expDrop: 0.0482, expUp: 0.0408 }, t10: { drop: 0.0411, up: 0.0499, expDrop: 0.0069, expUp: 0.0045 } },
    } },
    'ETF': { assets: 8, days: 53145, levels: {
      baja: { n: 50584, t5: { drop: 0.0584, up: 0.0528, expDrop: 0.0606, expUp: 0.0566 }, t10: { drop: 0.0091, up: 0.0065, expDrop: 0.0099, expUp: 0.0075 } },
      media: { n: 2057, t5: { drop: 0.0865, up: 0.1152, expDrop: 0.0573, expUp: 0.054 }, t10: { drop: 0.0233, up: 0.0233, expDrop: 0.0093, expUp: 0.007 } },
      alta: { n: 504, t5: { drop: 0.1607, up: 0.1944, expDrop: 0.0635, expUp: 0.0589 }, t10: { drop: 0.0337, up: 0.0357, expDrop: 0.0105, expUp: 0.0078 } },
    } },
    'acciones': { assets: 29, days: 304970, levels: {
      baja: { n: 290753, t5: { drop: 0.1437, up: 0.168, expDrop: 0.1459, expUp: 0.1711 }, t10: { drop: 0.0319, up: 0.043, expDrop: 0.033, expUp: 0.0445 } },
      media: { n: 11909, t5: { drop: 0.2014, up: 0.2412, expDrop: 0.1615, expUp: 0.1885 }, t10: { drop: 0.0581, up: 0.0787, expDrop: 0.0389, expUp: 0.0525 } },
      alta: { n: 2308, t5: { drop: 0.2374, up: 0.3098, expDrop: 0.158, expUp: 0.185 }, t10: { drop: 0.0832, up: 0.1109, expDrop: 0.0375, expUp: 0.0506 } },
    } },
    'cripto': { assets: 5, days: 18363, levels: {
      baja: { n: 16860, t5: { drop: 0.3112, up: 0.33, expDrop: 0.3171, expUp: 0.3401 }, t10: { drop: 0.131, up: 0.1552, expDrop: 0.1375, expUp: 0.1636 } },
      media: { n: 1318, t5: { drop: 0.3832, up: 0.4363, expDrop: 0.317, expUp: 0.34 }, t10: { drop: 0.2102, up: 0.2436, expDrop: 0.1377, expUp: 0.1639 } },
      alta: { n: 185, t5: { drop: 0.3838, up: 0.573, expDrop: 0.3096, expUp: 0.3379 }, t10: { drop: 0.2108, up: 0.3622, expDrop: 0.1327, expUp: 0.1608 } },
    } },
  } };
