// Esquema de la base. Es la ÚNICA fuente: server/migrations/0001_init.sql se verifica contra este texto en los tests.
// No se guarda el texto de las consultas: solo cuántas se hicieron y cuántos tokens usaron.
// users.code: 'device' = cuenta automática de un teléfono (sin registro). Los códigos de invitación (invites) ya no sirven para entrar: desbloquean un PLAN (users.plan_code).
export const SCHEMA_V1 = `CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 2,
  note TEXT,
  created_at TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  device_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0,
  plan_code TEXT,
  UNIQUE (code, device_id)
);
CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  calls INTEGER NOT NULL,
  model TEXT NOT NULL,
  ticket TEXT NOT NULL,
  refunded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  model TEXT NOT NULL,
  in_tokens INTEGER NOT NULL,
  out_tokens INTEGER NOT NULL,
  thoughts INTEGER NOT NULL,
  cached INTEGER NOT NULL,
  cost_usd REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS interest (
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (user_id, plan)
);
CREATE INDEX IF NOT EXISTS idx_calls_ts ON calls (ts);
CREATE INDEX IF NOT EXISTS idx_users_code ON users (code);
`;

// Estadísticas de uso de la beta (migración 0002). `events.props` solo contiene valores de listas cerradas (ver src/telemetry.ts); `feedback.text` es lo que la persona decide escribir en el formulario.
export const SCHEMA_V2 = `CREATE TABLE IF NOT EXISTS consent (
  user_id TEXT PRIMARY KEY,
  analytics INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  props TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  score INTEGER,
  text TEXT,
  version TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_user_day ON events (user_id, day);
CREATE INDEX IF NOT EXISTS idx_events_name_day ON events (name, day);
CREATE INDEX IF NOT EXISTS idx_feedback_ts ON feedback (ts);
`;
export const SCHEMA_SQL = SCHEMA_V1 + SCHEMA_V2;
