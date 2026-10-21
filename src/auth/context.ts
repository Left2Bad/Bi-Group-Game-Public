import { createContext, useContext } from 'react'
import type { AccountUser, Registration } from './api'

export interface AuthValue {
  readonly enabled: boolean
  readonly user: AccountUser | null
  readonly loading: boolean
  readonly error: string | null
  readonly refresh: () => Promise<void>
  readonly login: (email: string, password: string, resetProgress?: boolean) => Promise<AccountUser>
  readonly register: (data: Registration) => Promise<AccountUser>
  readonly logout: () => Promise<void>
}
const unavailable = async (): Promise<never> => { throw new Error('Нет подключения к аккаунту.') }
/** Отдельные компоненты и контроллер теста можно использовать без оболочки приложения. */
export const AuthContext = createContext<AuthValue>({ enabled: false, user: null, loading: false, error: null,
  refresh: async () => {}, login: unavailable, register: unavailable, logout: unavailable })
export const useAuth = () => useContext(AuthContext)
