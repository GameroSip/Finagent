-- Estado mínimo de los avisos push: el último valor avisado de cada indicador (dólar, miedo y codicia, fecha del resumen).
-- No hay ningún dato de personas: el servidor manda a tópicos públicos y no sabe quién está suscripto.
CREATE TABLE IF NOT EXISTS push_state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  at INTEGER NOT NULL
);
