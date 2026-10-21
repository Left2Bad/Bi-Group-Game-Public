// Отдельный экземпляр настоящего сервера BI Academy для замеров.
// Код приложения не меняется: перехватывается только глобальный fetch, чтобы записать
// каждый реальный запрос к OpenAI (время, токены, ID запроса и ответа) в raw/openai-calls.jsonl.
// Ключ передаётся через --env-file вне репозитория и в журнал не пишется.
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'raw'), { recursive: true })
mkdirSync(join(root, 'db'), { recursive: true })
const journal = join(root, 'raw', 'openai-calls.jsonl')
process.env.DATABASE_PATH = join(root, 'db', 'measure.sqlite')
process.env.API_ONLY = 'true'
process.env.PORT ??= '3201'

const key = process.env.OPENAI_API_KEY ?? ''
const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.openai.com/')) return realFetch(url, init)
  const startedAt = new Date()
  const request = JSON.parse(init.body)
  let response, payload = null, error = null
  try {
    response = await realFetch(url, init)
    payload = await response.clone().json().catch(() => null)
  } catch (cause) { error = cause?.name ?? 'fetch_error'; throw cause }
  finally {
    const record = {
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAt.getTime(),
      operation: request?.text?.format?.name, model: request?.model, reasoning: request?.reasoning ?? null, serviceTier: request?.service_tier,
      httpStatus: response?.status ?? null, error,
      requestId: response?.headers.get('x-request-id') ?? null, processingMs: Number(response?.headers.get('openai-processing-ms')) || null,
      responseId: payload?.id ?? null, responseStatus: payload?.status ?? null, responseModel: payload?.model ?? null,
      responseServiceTier: payload?.service_tier ?? null, usage: payload?.usage ?? null,
      request: { instruction: request?.input?.[0]?.content, data: request?.input?.[1]?.content },
      output: payload?.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text ?? null,
      providerError: payload?.error ?? null,
    }
    const line = JSON.stringify(record)
    if (key && line.includes(key)) throw new Error('key leak guard')
    appendFileSync(journal, line + '\n')
  }
  return response
}

await import('../../../server/index.mjs')
