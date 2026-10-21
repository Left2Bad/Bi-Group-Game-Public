import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, post, setApiAccount } from './api'

afterEach(() => { setApiAccount(null); vi.useRealTimers(); vi.restoreAllMocks() })

describe('обработка ответов API аккаунтов', () => {
  it('передаёт ошибку конкретного поля и не разлогинивает при неверном пароле', async () => {
    const event = vi.spyOn(window, 'dispatchEvent')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Неверный пароль' }), { status: 401 }))
    await expect(api('/auth/login', post({}))).rejects.toMatchObject({ message: 'Неверный пароль', status: 401 })
    expect(event).not.toHaveBeenCalled()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Email занят', fields: { email: 'Email занят' } }), { status: 409 }))
    try { await api('/auth/register', post({})) } catch (reason) {
      expect(reason).toBeInstanceOf(ApiError)
      expect((reason as ApiError).fields.email).toBe('Email занят')
    }
  })
  it('перепроверяет сессию при потере доступа к личным данным', async () => {
    const event = vi.spyOn(window, 'dispatchEvent')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Войдите' }), { status: 401 }))
    await expect(api('/attempts')).rejects.toBeInstanceOf(ApiError)
    expect(event.mock.calls[0]?.[0].type).toBe('bi-academy:auth-expired')
  })
  it('объясняет HTML вместо JSON и отсутствие сети', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html>Proxy error</html>'))
    await expect(api('/auth/me')).rejects.toThrow('Сервер вернул некорректный ответ')
    fetcher.mockRejectedValueOnce(new TypeError('Network error'))
    await expect(api('/auth/me')).rejects.toThrow('Нет связи с сервером')
  })
  it('завершает зависший запрос, позволяя пользователю повторить вход', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const pending = expect(api('/auth/login', post({}))).rejects.toThrow('Сервер не ответил вовремя')
    await vi.advanceTimersByTimeAsync(15_000)
    await pending
  })
  it('обрывает зависший короткий запрос запуска задачи', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      signal = init?.signal ?? null
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const pending = expect(api('/dynamic/start', post({}))).rejects.toThrow('Сервер не ответил вовремя')
    await vi.advanceTimersByTimeAsync(14_000)
    expect(signal!.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    await pending
  })
})
