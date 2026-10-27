// Database layer: built-in node:sqlite, schema and small helpers.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.resolve(import.meta.dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'chemtutor.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('teacher','student')),
  teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  login TEXT UNIQUE,
  pass_hash TEXT,
  name TEXT NOT NULL,
  grade TEXT,                -- класс
  goal TEXT,                 -- ОГЭ / ЕГЭ / школа / олимпиада
  target_score INTEGER,
  phone TEXT,
  telegram TEXT,
  parent_name TEXT,
  parent_contact TEXT,
  rate INTEGER DEFAULT 0,    -- стоимость занятия, ₽
  notes TEXT,                -- приватные заметки преподавателя
  color TEXT,
  invite_code TEXT UNIQUE,
  parent_token TEXT UNIQUE,
  xp INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_active_day TEXT,
  archived INTEGER DEFAULT 0,
  settings TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,          -- ISO local 'YYYY-MM-DDTHH:MM'
  duration INTEGER DEFAULT 60,
  topic TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','done','canceled','missed')),
  price INTEGER DEFAULT 0,
  link TEXT,
  plan TEXT,                       -- план занятия (видно ученику)
  summary TEXT,                    -- итог занятия (видно ученику)
  private_note TEXT,
  rating INTEGER,                  -- оценка ученика за урок 1..5
  series_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS lessons_start ON lessons(start_at);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  date TEXT NOT NULL,
  method TEXT,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  kind TEXT DEFAULT 'note' CHECK (kind IN ('note','file','link')),
  content TEXT,
  url TEXT,
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  for_all INTEGER DEFAULT 1,
  pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS material_access (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (material_id, student_id)
);
CREATE TABLE IF NOT EXISTS material_views (
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (material_id, student_id)
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  stored TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  topic TEXT,
  kind TEXT DEFAULT 'homework' CHECK (kind IN ('homework','test')),
  time_limit INTEGER,              -- минут, для тестов
  show_answers INTEGER DEFAULT 1,  -- показывать разбор после сдачи
  attempts INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  in_bank INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  topic TEXT,
  difficulty INTEGER DEFAULT 1,
  kind TEXT NOT NULL CHECK (kind IN ('single','multi','number','text','open')),
  text TEXT NOT NULL,
  options TEXT,        -- JSON array
  answer TEXT,         -- JSON
  explanation TEXT,
  points INTEGER DEFAULT 1,
  image_id INTEGER REFERENCES files(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_at TEXT,
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned','started','submitted','graded','returned')),
  started_at TEXT,
  submitted_at TEXT,
  score REAL,
  max_score REAL,
  attempt INTEGER DEFAULT 1,
  teacher_comment TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (assignment_id, student_id)
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY,
  target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  value TEXT,              -- JSON
  file_ids TEXT,           -- JSON array
  correct INTEGER,         -- 1/0, NULL = ждёт проверки
  points REAL,
  comment TEXT,
  UNIQUE (target_id, question_id)
);
CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  wrong_value TEXT,
  fixed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (student_id, question_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT,
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  link TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS card_progress (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  box INTEGER DEFAULT 0,
  due_at TEXT,
  PRIMARY KEY (student_id, card_id)
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  section TEXT,
  title TEXT NOT NULL,
  position INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS skills (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  level INTEGER DEFAULT 0,     -- 0..5, ставит преподаватель
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, topic_id)
);
CREATE TABLE IF NOT EXISTS exam_scores (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  title TEXT,
  score REAL NOT NULL,
  max_score REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS activity (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
`);

// ---- helpers ----
export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Insert an object into a table, returns new id. */
export function insert(table, obj) {
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined);
  const r = run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    ...keys.map(k => norm(obj[k])));
  return Number(r.lastInsertRowid);
}

/** Update whitelisted columns from obj. */
export function update(table, id, obj, allowed) {
  const keys = Object.keys(obj).filter(k => allowed.includes(k) && obj[k] !== undefined);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => norm(obj[k])), id);
}

function norm(v) {
  if (v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

export const parseJSON = (s, d = null) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
