// Замер локализации и анализа прогресса через настоящий HTTP API стенда.
//   node localize.mjs translate <run> <kk|en>   перевод готовой попытки прогона (как при переключении языка в интерфейсе)
//   node localize.mjs progress <first> <last>   первая попытка <first> копируется сотруднику <last> как более ранняя,
//                                               затем запрашивается анализ «до и после» для попытки <last>
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = `http://127.0.0.1:${process.env.PORT ?? 3201}/api`
const [command, runId, arg] = process.argv.slice(2)
const session = JSON.parse(readFileSync(join(root, 'runs', runId, 'session.json'), 'utf8'))
const log = (event) => appendFileSync(join(root, 'runs', runId, 'timeline.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')
let cookie = ''
async function call(method, path, body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined })
  const set = response.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  return { status: response.status, data: await response.json().catch(() => null) }
}
const login = await call('POST', '/auth/login', { email: session.email, password: 'measure-123456' })
if (login.status !== 200) throw new Error(`login ${login.status}`)

if (command === 'translate') {
  // Интерфейс повторяет запрос раз в секунду, пока перевод не готов; так же делает замер.
  const startedAt = Date.now()
  let r
  do {
    r = await call('POST', `/dynamic/attempts/${session.attemptId}/translation`, { lang: arg })
    if (r.status !== 200) throw new Error(`translation ${r.status} ${JSON.stringify(r.data)}`)
    if (r.data.state === 'translating') await new Promise((done) => setTimeout(done, 1000))
  } while (r.data.state === 'translating')
  const ms = Date.now() - startedAt
  log({ stage: `translate_${arg}`, status: r.data.state === 'ready' ? 200 : 500, ms, total: r.data.total, error: r.data.error })
  console.log(`translate_${arg}: ${r.data.state}, строк ${r.data.total}, ${(ms / 1000).toFixed(1)} с`)
} else if (command === 'progress') {
  const first = JSON.parse(readFileSync(join(root, 'runs', runId, 'attempt.json'), 'utf8'))
  const target = JSON.parse(readFileSync(join(root, 'runs', arg, 'session.json'), 'utf8'))
  const db = new DatabaseSync(join(root, 'db', 'measure.sqlite'))
  const owner = db.prepare('SELECT id FROM users WHERE email = ?').get(target.email).id
  const earlier = { ...first, id: `${first.id}-first`, createdAt: '2026-09-20T08:00:00.000Z', completedAt: '2026-09-20T08:30:00.000Z' }
  db.prepare('INSERT OR IGNORE INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(owner, earlier.id, JSON.stringify(earlier), Date.parse(earlier.completedAt))
  db.close()
  // Вход под сотрудником <last>.
  cookie = ''
  const relog = await call('POST', '/auth/login', { email: target.email, password: 'measure-123456' })
  if (relog.status !== 200) throw new Error(`login ${relog.status}`)
  const startedAt = Date.now()
  let r = await call('POST', `/dynamic/attempts/${target.attemptId}/progress`)
  while (r.status === 202 && r.data?.jobId) {
    const jobId = r.data.jobId
    do { await new Promise((done) => setTimeout(done, 1000)); r = await call('GET', `/dynamic/jobs/${jobId}`) } while (r.status === 202)
  }
  const ms = Date.now() - startedAt
  appendFileSync(join(root, 'runs', arg, 'timeline.jsonl'), JSON.stringify({ at: new Date().toISOString(), stage: 'progress_analysis', status: r.status, ms, firstFrom: runId }) + '\n')
  console.log(`progress_analysis: ${r.status}, ${(ms / 1000).toFixed(1)} с`, r.data?.attempt?.evaluation?.progress?.professionalism?.verdict ?? r.data?.error)
}
