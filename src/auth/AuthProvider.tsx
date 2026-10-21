import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, post, setApiAccount } from './api'
import type { AccountUser, Registration } from './api'
import { AuthContext } from './context'
import { syncAccountReset } from '../storage/personal'

import { msg } from '../i18n/translate'
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const changing = useRef(false)
  const applyUser = useCallback((next: AccountUser | null) => { setApiAccount(next?.id ?? null); setUser(next) }, [])
  const refresh = useCallback(async () => {
    if (changing.current) return
    const current = ++generation.current
    try {
      const data = await api<{ user: AccountUser | null; resetAt: number }>('/auth/me')
      if (current === generation.current) {
        if (data.user && !syncAccountReset(data.user.id, data.resetAt)) throw new Error(msg('Не удалось очистить старые данные в браузере. Проверьте доступ к хранилищу и повторите вход.'))
        applyUser(data.user); setError(null)
      }
    } catch (reason) { if (current === generation.current) setError((reason as Error).message) }
    finally { if (current === generation.current) setLoading(false) }
  }, [applyUser])
  useEffect(() => {
    void Promise.resolve().then(refresh)
    const sync = () => { void refresh() }
    window.addEventListener('focus', sync)
    window.addEventListener('bi-academy:auth-expired', sync)
    return () => { window.removeEventListener('focus', sync); window.removeEventListener('bi-academy:auth-expired', sync) }
  }, [refresh])
  async function authenticate(path: string, body: unknown) {
    changing.current = true; generation.current++
    try {
      const data = await api<{ user: AccountUser; resetAt: number }>(path, post(body))
      if (!syncAccountReset(data.user.id, data.resetAt)) throw new Error(msg('Не удалось очистить старые данные в браузере. Проверьте доступ к хранилищу и повторите вход.'))
      applyUser(data.user); setError(null)
      return data.user
    } finally { changing.current = false }
  }
  const login = (email: string, password: string, resetProgress = false) => authenticate('/auth/login', { email, password, resetProgress })
  const register = (data: Registration) => authenticate('/auth/register', data)
  async function logout() {
    changing.current = true; generation.current++
    try { await api('/auth/logout', post({})); applyUser(null) }
    finally { changing.current = false }
  }
  return <AuthContext value={{ enabled: true, user, loading, error, refresh, login, register, logout }}>{children}</AuthContext>
}
