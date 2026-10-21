// Сводка замеров: выгрузка базы в JSON, время этапов, токены и стоимость каждого вызова, разброс повторных оценок.
//   node analyze.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Цены OpenAI для gpt-6-luna, service_tier "fast" (его задаёт сервер), USD за 1M токенов, короткий контекст.
const PRICE = { input: 0.20, cached: 0.02, cacheWrite: 0.25, output: 1.00 }
const TRAITS = ['criticalThinking', 'confidence', 'discipline', 'engagement']

// 1. Выгрузка базы замеров: пользователи без хешей паролей, все попытки целиком.
const db = new DatabaseSync(join(root, 'db', 'measure.sqlite'), { readOnly: true })
mkdirSync(join(root, 'db-export'), { recursive: true })
const users = db.prepare('SELECT id, name, email, role FROM users').all()
const attempts = db.prepare('SELECT user_id, id, state, saved_at FROM dynamic_attempts ORDER BY saved_at').all()
  .map((row) => ({ userId: row.user_id, id: row.id, savedAt: new Date(row.saved_at).toISOString(), state: JSON.parse(row.state) }))
writeFileSync(join(root, 'db-export', 'users.json'), JSON.stringify(users, null, 2))
writeFileSync(join(root, 'db-export', 'dynamic_attempts.json'), JSON.stringify(attempts, null, 2))
db.close()

// 2. Вызовы OpenAI с привязкой к прогону по времени этапа клиента.
const calls = readFileSync(join(root, 'raw', 'openai-calls.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
const cost = (u) => {
  if (!u) return 0
  const cached = u.input_tokens_details?.cached_tokens ?? 0
  const write = u.input_tokens_details?.cache_write_tokens ?? 0
  return ((u.input_tokens - cached - write) * PRICE.input + cached * PRICE.cached + write * PRICE.cacheWrite + u.output_tokens * PRICE.output) / 1e6
}
const runs = readdirSync(join(root, 'runs')).sort().map((id) => {
  const session = JSON.parse(readFileSync(join(root, 'runs', id, 'session.json'), 'utf8'))
  const timeline = readFileSync(join(root, 'runs', id, 'timeline.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  const stages = timeline.filter((item) => item.stage !== 'choice').map((stage) => {
    const end = Date.parse(stage.at), begin = end - stage.ms
    const own = calls.filter((call) => Date.parse(call.startedAt) >= begin - 500 && Date.parse(call.finishedAt) <= end + 500)
    return { stage: stage.stage, status: stage.status, seconds: +(stage.ms / 1000).toFixed(1), error: stage.code,
      calls: own.map((call) => ({ operation: call.operation, responseId: call.responseId, requestId: call.requestId, seconds: +(call.durationMs / 1000).toFixed(1),
        serviceTier: call.responseServiceTier, inputTokens: call.usage?.input_tokens, outputTokens: call.usage?.output_tokens,
        reasoningTokens: call.usage?.output_tokens_details?.reasoning_tokens, usd: +cost(call.usage).toFixed(5) })) }
  })
  let attempt = null
  try { attempt = JSON.parse(readFileSync(join(root, 'runs', id, 'attempt.json'), 'utf8')) } catch { /* без итоговой оценки */ }
  const e = attempt?.evaluation
  return { id, persona: session.persona, jobRole: session.jobRole, attemptId: session.attemptId, stages,
    usd: +stages.filter((s) => !/^(translate_|progress)/.test(s.stage)).flatMap((s) => s.calls).reduce((sum, c) => sum + c.usd, 0).toFixed(5),
    extraUsd: Object.fromEntries(stages.filter((s) => /^(translate_|progress)/.test(s.stage)).map((s) => [s.stage, +s.calls.reduce((sum, c) => sum + c.usd, 0).toFixed(5)])),
    result: e && { traits: Object.fromEntries(TRAITS.map((t) => [t, { final: e.traits[t].finalPercent, choice: e.traits[t].preferencePercent, written: e.traits[t].behaviorPercent }])),
      behaviorLevels: Object.fromEntries(TRAITS.map((t) => [t, e.behavior[t].level])), criteria: Object.fromEntries(Object.entries(e.criteria).map(([k, v]) => [k, v.level])),
      skills: e.skills.map((s) => `${s.name}: ${s.percent}%`), unsafe: e.unsafe, roadmap: e.roadmap.map((w) => w.trait) },
    answersHash: attempt && createHash('sha256').update(JSON.stringify([attempt.choices.map((q) => [q.text, attempt.choiceAnswers[q.id]]), attempt.openQuestions.map((q) => [q.text, attempt.openAnswers[q.id]])])).digest('hex').slice(0, 16) }
})

// 3. Повторяемость: A1 и R1–R5 — одни и те же 15 ответов.
const repeat = runs.filter((run) => run.id === 'A1' || run.id.startsWith('R'))
const spread = Object.fromEntries(TRAITS.map((t) => { const values = repeat.map((run) => run.result.traits[t].final); return [t, { values, min: Math.min(...values), max: Math.max(...values), spread: Math.max(...values) - Math.min(...values) }] }))
const criteriaSame = repeat.map((run) => JSON.stringify(run.result.criteria))
const skillsSame = repeat.map((run) => JSON.stringify(run.result.skills))

// 4. Время и стоимость по этапам среди успешных вызовов.
const allStages = runs.flatMap((run) => run.stages.map((stage) => ({ ...stage, run: run.id })))
const stat = (values) => values.length ? { n: values.length, min: Math.min(...values), median: [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)], max: Math.max(...values), avg: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) } : null
const stageKind = (name) => name.startsWith('open_question') ? 'open_question' : name.startsWith('evaluate') ? 'evaluate' : name
const timing = Object.fromEntries(['start_select_10_ids', 'open_question', 'evaluate', 'translate_kk', 'translate_en', 'progress_analysis'].map((kind) => [kind, stat(allStages.filter((s) => stageKind(s.stage) === kind && s.status < 400).map((s) => s.seconds))]))
const full = runs.filter((run) => ['A1', 'B1', 'C1', 'A2'].includes(run.id))
const fullRun = full.map((run) => ({ id: run.id, aiSeconds: +run.stages.filter((s) => !/^(translate_|progress)/.test(s.stage)).reduce((sum, s) => sum + s.seconds, 0).toFixed(1), usd: run.usd }))
// Локализация (21.10.2026): перевод сгенерированного контента попытки и анализ «до и после» при повторном тесте.
const extra = (name) => runs.map((run) => run.extraUsd?.[name]).filter((value) => value !== undefined)
const avg = (values) => values.length ? +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(5) : null
const localization = { translateKkUsd: avg(extra('translate_kk')), translateEnUsd: avg(extra('translate_en')), progressUsd: avg(extra('progress_analysis')),
  callsByOperation: Object.fromEntries([...new Set(calls.map((c) => c.operation))].map((op) => [op, calls.filter((c) => c.operation === op).length])) }
const totalUsd = +calls.reduce((sum, call) => sum + cost(call.usage), 0).toFixed(4)
const perAttempt = +(fullRun.reduce((sum, r) => sum + r.usd, 0) / fullRun.length).toFixed(4)

const summary = { generatedAt: new Date().toISOString(), model: [...new Set(calls.map((c) => c.responseModel))], serviceTier: [...new Set(calls.map((c) => c.responseServiceTier))],
  reasoning: [...new Set(calls.map((c) => c.reasoning?.effort))], price: PRICE, openaiCalls: calls.length, failedChecks: allStages.filter((s) => s.status >= 400).map((s) => ({ run: s.run, stage: s.stage, code: s.error })),
  totalUsd, perFullAttemptUsd: perAttempt, per10000EmployeesUsd: +(perAttempt * 10000).toFixed(0), localization, timing, fullRun, repeatability: { runs: repeat.map((r) => r.id), spread, sameAnswers: new Set(repeat.map((r) => r.answersHash)).size === 1,
    criteriaIdentical: new Set(criteriaSame).size === 1, skillsIdentical: new Set(skillsSame).size === 1 }, runs }
writeFileSync(join(root, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ ...summary, runs: runs.map((r) => ({ id: r.id, role: r.jobRole, usd: r.usd, traits: r.result && Object.fromEntries(TRAITS.map((t) => [t, r.result.traits[t].final])), levels: r.result?.behaviorLevels, criteria: r.result?.criteria, skills: r.result?.skills, unsafe: r.result?.unsafe, hash: r.answersHash })) }, null, 1))
