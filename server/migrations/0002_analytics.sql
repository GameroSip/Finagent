CREATE TABLE IF NOT EXISTS consent (
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
