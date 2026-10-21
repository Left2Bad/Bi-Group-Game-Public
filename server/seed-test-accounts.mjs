// Создаёт или пересоздаёт тестовые аккаунты в базе сервера.
// Локально: npm run seed:test-accounts. В контейнере: docker compose exec academy node server/seed-test-accounts.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { openDatabase } from './database.ts'
import { seedTestAccounts } from './test-accounts.ts'

const databasePath = process.env.DATABASE_PATH ?? fileURLToPath(new URL('../data/academy.sqlite', import.meta.url))
/** @type {import('../src/dynamic/test-accounts.ts').TestAccounts} */
const fixture = JSON.parse(readFileSync(new URL('./test-accounts.json', import.meta.url), 'utf8'))
const db = openDatabase(databasePath)
try { seedTestAccounts(db, fixture) }
finally { db.close() }

console.info(`База: ${databasePath}`)
console.info(`Пароль у всех: ${fixture.password}. Код команды «${fixture.team.name}»: ${fixture.team.inviteCode}`)
console.table([{ role: 'Руководитель', name: fixture.manager.name, email: fixture.manager.email, note: fixture.manager.note },
  ...fixture.employees.map((item) => ({ role: 'Сотрудник', name: item.name, email: item.email, note: item.note }))])
