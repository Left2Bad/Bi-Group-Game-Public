// Клиент замеров: проходит тест через настоящий HTTP API (как браузер), пишет хронологию этапов.
//   node run.mjs start <run> <persona>      регистрация, аватар, старт, 10 выборов, первый открытый вопрос
//   node run.mjs answer <run> <file.txt>    отправить открытый ответ; после пятого запускается оценка
//   node run.mjs retry <run>               повторить оценку после отказа проверки (кнопка «Повторить»)
//   node run.mjs repeat <source> <run>      новый сотрудник с ТЕМИ ЖЕ 15 ответами из <source>, затем оценка
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const base = `http://127.0.0.1:${process.env.PORT ?? 3201}/api`
const [command, runId, arg] = process.argv.slice(2)
const dir = join(root, 'runs', runId)
mkdirSync(dir, { recursive: true })
const sessionFile = join(dir, 'session.json')
const session = existsSync(sessionFile) ? JSON.parse(readFileSync(sessionFile, 'utf8')) : {}
const persist = () => writeFileSync(sessionFile, JSON.stringify(session, null, 2))
const log = (event) => appendFileSync(join(dir, 'timeline.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')

// Предпочтения персон: вес качества при выборе варианта в ситуации (больше — важнее для этой персоны).
const PERSONAS = {
  A: { jobRole: 'Прораб', weights: { discipline: 3, criticalThinking: 2, confidence: 1, engagement: 1 } },
  B: { jobRole: 'Мастер участка', weights: { confidence: 3, engagement: 2, criticalThinking: 0, discipline: 0 } },
  C: { jobRole: 'Инженер ПТО', weights: { criticalThinking: 3, engagement: 2, discipline: 1, confidence: 0 } },
}
const AVATAR = { universe: 'Кино', gender: 'Мужской', palette: 'Яркий', role: 'Лидер', action: 'Сразу в бой', motivation: 'Результат', power: 'Точность', animal: null, skin: '#edbe94' }

async function call(method, path, body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-BI-Academy': '1', ...(session.cookie ? { Cookie: session.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined })
  const cookie = response.headers.get('set-cookie')
  if (cookie) { session.cookie = cookie.split(';')[0]; persist() }
  const data = await response.json().catch(() => null)
  return { status: response.status, data }
}
/** Фоновая задача ИИ: запрос возвращает jobId, клиент опрашивает её раз в секунду, как интерфейс. */
async function aiStage(stage, method, path, body) {
  const startedAt = Date.now()
  let result = await call(method, path, body)
  while (result.status === 202 && result.data?.jobId) {
    const jobId = result.data.jobId
    do { await new Promise((r) => setTimeout(r, 1000)); result = await call('GET', `/dynamic/jobs/${jobId}`) } while (result.status === 202)
  }
  const ms = Date.now() - startedAt
  log({ stage, status: result.status, ms, error: result.data?.error, code: result.data?.code })
  if (result.status >= 400) { console.error(stage, result.status, result.data); process.exit(1) }
  console.log(`${stage}: ${(ms / 1000).toFixed(1)} с`)
  return result.data.attempt
}
const register = async (label) => {
  session.email = `${label.toLowerCase()}-${randomUUID().slice(0, 8)}@measure.test`
  const r = await call('POST', '/auth/register', { name: `Замер ${label}`, email: session.email, password: 'measure-123456', role: 'employee' })
  if (r.status !== 201) throw new Error(`register ${r.status} ${JSON.stringify(r.data)}`)
  const a = await call('PUT', '/avatar', { avatar: AVATAR })
  if (a.status !== 200) throw new Error(`avatar ${a.status}`)
}
const showOpen = (attempt) => {
  const q = attempt.openQuestions.at(-1)
  writeFileSync(join(dir, `open-${q.id}.question.txt`), q.text)
  console.log(`\n${q.id} [${q.trait}]: ${q.text}`)
}
const finish = (attempt) => {
  writeFileSync(join(dir, 'attempt.json'), JSON.stringify(attempt, null, 2))
  const e = attempt.evaluation
  console.log(Object.fromEntries(Object.entries(e.traits).map(([id, t]) => [id, `${t.finalPercent}% (выбор ${t.preferencePercent}, письмо ${t.behaviorPercent})`])))
}

if (command === 'start') {
  const persona = PERSONAS[arg]
  Object.assign(session, { persona: arg, jobRole: persona.jobRole }); persist()
  await register(`${runId}`)
  session.attemptId = randomUUID(); persist()
  let attempt = await aiStage('start_select_10_ids', 'POST', '/dynamic/start', { id: session.attemptId, jobRole: persona.jobRole })
  for (const q of attempt.choices) {
    const score = (o) => persona.weights[q.primaryTrait] * o.primary + persona.weights[q.secondaryTrait] * o.secondary
    const best = [...q.options].sort((a, b) => score(b) - score(a) || (b.primary === 2 || b.primary === 3 ? 1 : -1))[0]
    const r = await call('PUT', `/dynamic/attempts/${attempt.id}/answer`, { questionId: q.id, optionId: best.id })
    if (r.status !== 200) throw new Error(`choice ${q.id} ${r.status}`)
    log({ stage: 'choice', questionId: q.id, bankTraits: [q.primaryTrait, q.secondaryTrait], weights: [best.primary, best.secondary] })
  }
  attempt = await aiStage('open_question_1', 'POST', `/dynamic/attempts/${attempt.id}/next`)
  showOpen(attempt)
} else if (command === 'answer') {
  const text = readFileSync(arg, 'utf8').trim()
  let attempt = (await call('GET', `/dynamic/attempts/${session.attemptId}`)).data.attempt
  const q = attempt.openQuestions.at(-1)
  writeFileSync(join(dir, `open-${q.id}.answer.txt`), text)
  const r = await call('PUT', `/dynamic/attempts/${attempt.id}/answer`, { questionId: q.id, answer: text })
  if (r.status !== 200) throw new Error(`answer ${r.status} ${JSON.stringify(r.data)}`)
  attempt = r.data.attempt
  if (attempt.status === 'open') { attempt = await aiStage(`open_question_${attempt.openQuestions.length + 1}`, 'POST', `/dynamic/attempts/${attempt.id}/next`); showOpen(attempt) }
  else { writeFileSync(join(dir, 'ready-attempt.json'), JSON.stringify(attempt, null, 2)); finish(await aiStage('evaluate', 'POST', `/dynamic/attempts/${attempt.id}/evaluate`)) }
} else if (command === 'retry') {
  // Кнопка «Повторить» в интерфейсе после отказа проверки: тот же запрос оценки для той же попытки.
  finish(await aiStage('evaluate_retry', 'POST', `/dynamic/attempts/${session.attemptId}/evaluate`))
} else if (command === 'repeat') {
  // Те же 15 ответов на те же 15 вопросов: снимок готовой к оценке попытки источника копируется новому сотруднику.
  const source = JSON.parse(readFileSync(join(root, 'runs', arg, 'ready-attempt.json'), 'utf8'))
  Object.assign(session, { persona: `repeat-of-${arg}`, jobRole: source.jobRole, source: arg }); persist()
  await register(runId)
  const me = (await call('GET', '/auth/me')).data.user
  session.attemptId = randomUUID(); persist()
  const copy = { ...source, id: session.attemptId, createdAt: new Date().toISOString() }
  const db = new DatabaseSync(join(root, 'db', 'measure.sqlite'))
  db.prepare('INSERT INTO dynamic_attempts VALUES (?, ?, ?, ?)').run(me.id, copy.id, JSON.stringify(copy), Date.now())
  db.close()
  writeFileSync(join(dir, 'ready-attempt.json'), JSON.stringify(copy, null, 2))
  finish(await aiStage('evaluate', 'POST', `/dynamic/attempts/${copy.id}/evaluate`))
}
