import { useContext, useEffect, useState } from 'react'
import type { AvatarParams } from '../domain/avatar'
import { PersonalStorageContext } from '../storage/personal'
import { STORAGE_KEYS } from '../storage/shared'
import { useAvatarChoice } from '../ui/use-avatar'
import { api } from './api'
import { useAuth } from './context'

/** Сравнение без учёта порядка ключей: сервер возвращает параметры в собственном порядке. */
const sameAvatar = (left: AvatarParams | null, right: AvatarParams | null) => left === null || right === null ? left === right
  : (Object.keys(left) as (keyof AvatarParams)[]).every((key) => left[key] === right[key]) && Object.keys(left).length === Object.keys(right).length

/**
 * Синхронизирует аватар сотрудника с сервером, чтобы руководитель видел его в карточке развития.
 * На новом устройстве, где аватар ещё не выбирали, герой восстанавливается с сервера.
 * Явный выбор «персонаж по тесту» удаляет аватар на сервере. Ошибки сети не мешают работе: попытка повторится при следующем изменении.
 */
export function AccountAvatarSync() {
  const { user, enabled } = useAuth()
  const employee = enabled && Boolean(user)
  const getStorage = useContext(PersonalStorageContext)
  const [choice, saveChoice] = useAvatarChoice()
  /** undefined — сервер ещё не ответил; null — на сервере персонаж по тесту. */
  const [server, setServer] = useState<AvatarParams | null | undefined>(undefined)

  useEffect(() => {
    if (!employee) return
    let live = true
    api<{ avatar: AvatarParams | null }>('/avatar').then(({ avatar }) => { if (live) setServer(avatar) }).catch(() => { /* Повторим при следующем входе. */ })
    return () => { live = false }
  }, [employee])

  useEffect(() => {
    if (!employee || server === undefined) return
    let explicit = false
    try { explicit = getStorage().getItem(STORAGE_KEYS.avatar) !== null } catch { /* Хранилище недоступно: считаем, что выбора не было. */ }
    if (!explicit && server) { saveChoice({ kind: 'custom', params: server }); return }
    const desired = choice.kind === 'custom' ? choice.params : null
    if (sameAvatar(desired, server)) return
    let live = true
    api<{ avatar: AvatarParams | null }>('/avatar', { method: 'PUT', body: JSON.stringify({ avatar: desired }) })
      .then(({ avatar }) => { if (live) setServer(avatar) }).catch(() => { /* Аватар остаётся в браузере; руководитель увидит его после следующей синхронизации. */ })
    return () => { live = false }
  }, [employee, server, choice, getStorage, saveChoice])

  return null
}
