import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { api, post } from '../auth/api'
import { useAuth } from '../auth/context'
import { ArchetypeCharacter } from '../ui/ArchetypeCharacter'
import { AvatarFigure } from '../ui/AvatarFigure'
import { useAvatarChoice } from '../ui/use-avatar'
import { Eyebrow } from '../ui/primitives'
import { ProfileIcon } from './ProfileIcons'
import type { ProfileIconName } from './ProfileIcons'
import styles from './LockedProfile.module.css'
import { useI18n } from '../i18n/context'

import { msg } from '../i18n/translate'
/** Код стандартного персонажа для тени «не разблокировано». */
const SHADOW_CODE = 'АРСК'

/** Кнопка рядом с «Ваш профиль»: стирает прохождения, аватар и команды и отправляет создавать героя заново. */
export function ResetAccountButton() {
  const { t } = useI18n()
  const { enabled, user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!enabled || !user) return null
  const reset = async () => {
    const what = user.role === 'manager' ? t('прохождения, аватар и ваши команды') : t('прохождения, аватар и участие в команде')
    if (!window.confirm(t('Сбросить аккаунт {email}? Удалятся {what}. Вход и пароль сохранятся. Это действие нельзя отменить.', { email: user.email, what }))) return
    setBusy(true); setError(null)
    try {
      await api('/auth/reset', post({}))
      // Сразу перезагружаем страницу: при загрузке новая метка сброса очистит данные аккаунта в браузере
      // до того, как синхронизация аватара успеет вернуть старого героя на сервер.
      window.location.assign('/avatar/setup')
    } catch (reason) {
      setError((reason as Error).message); setBusy(false)
    }
  }
  return <span className={styles.resetHost}>
    <button type="button" className={styles.reset} disabled={busy} onClick={() => { void reset() }}>
      <ProfileIcon name="reset" />{busy ? t('Сбрасываем…') : t('Сбросить аккаунт')}
    </button>
    {error && <span role="alert" className={styles.resetError}>{t(error)}</span>}
  </span>
}

/** Заголовок профиля: «Ваш профиль» и справа кнопка сброса аккаунта. */
export function ProfileTitle({ children, resettable }: { readonly children: string; readonly resettable: boolean }) {
  return <div className={styles.titleRow}><h1>{children}</h1>{resettable && <ResetAccountButton />}</div>
}

const PREVIEW: readonly { readonly icon: ProfileIconName; readonly title: string; readonly copy: string }[] = [
  { icon: 'user', title: msg('Рабочий архетип'), copy: msg('Один из 16 типов и код из четырёх букв') },
  { icon: 'chart', title: msg('Четыре качества'), copy: msg('Проценты, уровни и диаграмма профиля') },
  { icon: 'target', title: msg('Сильные стороны и зоны роста'), copy: msg('С основаниями из ваших ответов') },
  { icon: 'book', title: msg('План развития на 30 дней'), copy: msg('Маршрут по неделям под ваш результат') },
]

/** Профиль до первого прохождения: виден только аватар, статистика закрыта до первой аналитики. */
export function LockedProfile() {
  const { t } = useI18n()
  const [choice] = useAvatarChoice()
  const hasAvatar = choice.kind === 'custom'
  return <section className={styles.locked} aria-labelledby="locked-profile-title">
    <div className={styles.hero}>
      <div className={styles.figure}>
        <div className={styles.stage} data-shadow={!hasAvatar || undefined}>
          {hasAvatar
            ? <AvatarFigure params={choice.params} size={360} label={t('Ваш аватар')} />
            : <ArchetypeCharacter code={SHADOW_CODE} size={360} label={t('Персонаж ещё не создан')} />}
          {!hasAvatar && <span className={styles.badge}><ProfileIcon name="lock" />{t('Не разблокировано')}</span>}
        </div>
        {hasAvatar && <Link className={styles.figureLink} to="/avatar/setup">{t('Изменить аватар')}</Link>}
      </div>
      <div className={styles.copy}>
        <Eyebrow className={styles.eyebrow}>{hasAvatar ? t('Ваш герой готов') : t('Профиль пока пуст')}</Eyebrow>
        <h2 id="locked-profile-title">{t('Статистика откроется после первого теста')}</h2>
        <p>{hasAvatar
          ? t('Аватар уже на месте. Архетип, четыре качества и план развития появятся, когда вы ответите на 15 рабочих вопросов.')
          : t('Создайте своего героя, затем пройдите тест: архетип, четыре качества и план развития появятся после 15 рабочих вопросов.')}</p>
        <div className={styles.actions}>
          {!hasAvatar && <Link className={styles.primary} to="/avatar/setup"><ProfileIcon name="user" />{t('Создать аватар')}</Link>}
          <Link className={hasAvatar ? styles.primary : styles.secondary} to="/intro"><ProfileIcon name="answers" />{t('Пройти тест')}</Link>
        </div>
        <Link className={styles.demoLink} to="/demo">{t('Посмотреть пример готового профиля')}</Link>
      </div>
    </div>
    <ul className={styles.preview} aria-label={t('Что появится в профиле')}>
      {PREVIEW.map((item, index) => <li key={item.title} style={{ '--i': index } as CSSProperties}>
        <span className={styles.previewIcon} aria-hidden="true"><ProfileIcon name={item.icon} /></span>
        <span className={styles.previewText}><strong>{t(item.title)}</strong><small>{t(item.copy)}</small></span>
        <span className={styles.previewLock} aria-label={t('Закрыто')}><ProfileIcon name="lock" /></span>
        <span className={styles.previewBars} aria-hidden="true"><i /><i /><i /></span>
      </li>)}
    </ul>
  </section>
}
