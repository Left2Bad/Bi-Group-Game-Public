import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { availableQuestions, seedQuestionBank } from './question-bank.ts'
import { seedBankTranslations } from './content-translations.ts'

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('employee', 'manager'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_resets (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      reset_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, manager_id TEXT NOT NULL REFERENCES users(id),
      invite_code TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS attempts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL, result TEXT NOT NULL, saved_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, id)
    );
    CREATE TABLE IF NOT EXISTS avatars (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      params TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dynamic_attempts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      id TEXT NOT NULL, state TEXT NOT NULL, saved_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, id)
    );
    CREATE INDEX IF NOT EXISTS dynamic_attempts_user ON dynamic_attempts(user_id, saved_at DESC);
    CREATE TABLE IF NOT EXISTS assessment_revisions (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dynamic_starts (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      state TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dynamic_actions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      attempt_id TEXT NOT NULL, week INTEGER NOT NULL, completed_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, attempt_id, week)
    );
    CREATE TABLE IF NOT EXISTS route_comments (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, attempt_id TEXT NOT NULL,
      week INTEGER NOT NULL, manager_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS route_comments_attempt ON route_comments(user_id, attempt_id, week);
    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      manager_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scheduled_at INTEGER NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),
      created_at INTEGER NOT NULL, responded_at INTEGER, manager_seen INTEGER NOT NULL DEFAULT 1, employee_seen INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS meetings_employee ON meetings(employee_id, status);
    CREATE INDEX IF NOT EXISTS meetings_manager ON meetings(manager_id, status);
    CREATE INDEX IF NOT EXISTS memberships_team ON memberships(team_id);
    -- «Некорректный вопрос»: manager_id пуст, пока сотрудник не в бригаде; после доставки получатель не меняется.
    CREATE TABLE IF NOT EXISTS question_reports (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL, question TEXT NOT NULL, created_at INTEGER NOT NULL,
      manager_id TEXT REFERENCES users(id) ON DELETE CASCADE, team_name TEXT, delivered_at INTEGER, manager_seen INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, question_id)
    );
    CREATE INDEX IF NOT EXISTS question_reports_manager ON question_reports(manager_id, delivered_at);
    CREATE INDEX IF NOT EXISTS attempts_user ON attempts(user_id, saved_at DESC);
  `)
  // Миграция существующих баз: согласие на передачу результатов руководителю.
  // У прежних участников согласия нет (NULL): руководитель не видит их результаты, пока сотрудник не подтвердит.
  const membershipColumns = (db.prepare('PRAGMA table_info(memberships)').all() as { name: string }[]).map((column) => column.name)
  if (!membershipColumns.includes('consented_at')) db.exec('ALTER TABLE memberships ADD COLUMN consented_at INTEGER')
  if (!membershipColumns.includes('consent_version')) db.exec('ALTER TABLE memberships ADD COLUMN consent_version INTEGER')
  try {
    seedQuestionBank(db)
    // Готовые переводы банка (server/bank/i18n) на казахский и английский.
    seedBankTranslations(db, availableQuestions(db))
  }
  catch (error) { db.close(); throw error }
  return db
}
