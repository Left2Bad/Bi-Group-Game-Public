import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../auth/api'
import { AVATAR_OPTIONS, AVATAR_QUESTIONS } from '../../content/avatar'
import { avatarName, DEFAULT_AVATAR } from '../../domain/avatar'
import type { AvatarParams } from '../../domain/avatar'
import { AvatarFigure } from '../../ui/AvatarFigure'
import { Button, Card, Page } from '../../ui/primitives'
import { useAvatarChoice } from '../../ui/use-avatar'
import styles from './AvatarSetupPage.module.css'
import { useI18n } from '../../i18n/context'

import { msg } from '../../i18n/translate'
/** Короткие подписи полей личной карточки — в том же порядке, что и вопросы. */
const FIELD_LABELS = [msg('Вселенная'), msg('Пол'), msg('Стиль'), msg('Роль'), msg('В сложной ситуации'), msg('Мотивация'), msg('Суперсила')] as const

/** Required seven-answer onboarding; defaults are preview only and never count as answers. */
export function AvatarSetupPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [, saveChoice] = useAvatarChoice()
  const [params, setParams] = useState<AvatarParams>(DEFAULT_AVATAR)
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const question = AVATAR_QUESTIONS[index]!
  // На телефоне «Далее» внизу листа: следующий вопрос показываем с начала, под закреплённым превью.
  const sheetRef = useRef<HTMLElement>(null)
  const shown = useRef(index)
  useEffect(() => {
    if (shown.current === index) return
    shown.current = index
    const sheet = sheetRef.current
    const preview = sheet?.parentElement?.querySelector('aside')
    if (!sheet || sheet.getBoundingClientRect().top >= (preview && getComputedStyle(preview).position === 'sticky' ? preview.offsetHeight : 0)) return
    sheet.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }, [index])
  const choose = (value: string) => {
    setParams((current) => ({ ...current, [question.key]: value,
      ...(question.key === 'universe' && value !== 'Животные' ? { animal: null } : {}) }) as AvatarParams)
    setAnswered((current) => new Set(current).add(question.key))
    setError(null)
  }
  const finish = async () => {
    setBusy(true); setError(null)
    try {
      await api('/avatar', { method: 'PUT', body: JSON.stringify({ avatar: params }) })
      saveChoice({ kind: 'custom', params })
      navigate('/intro', { replace: true })
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  return <Page className={styles.page}>
    <header className={styles.header}><p className={styles.eyebrow}>{t('Шаг 1 · Личная карточка')}</p><h1>{t('Создайте своего героя')}</h1>
      <p>{t('Ответьте на семь вопросов. Они определят вид и портрет аватара; результат рабочего теста будет рассчитан отдельно.')}</p></header>
    <div className={styles.layout}>
      <Card ref={sheetRef} className={styles.question}>
        <ol className={styles.steps} aria-hidden="true">{AVATAR_QUESTIONS.map((item, step) => <li key={item.key}
          data-state={step === index ? 'current' : answered.has(item.key) ? 'done' : 'todo'} />)}</ol>
        {/* Ключ по номеру вопроса: при переходе блок появляется заново, как новый лист анкеты. */}
        <div key={index} className={styles.sheet}>
          <p className={styles.eyebrow}>{question.group === 'look' ? t('Как выглядит аватар') : t('Каким его делает характер')}</p>
          <p className={styles.counter}>{t('Вопрос {v} из 7', { v: index + 1 })}</p><h2>{t(question.title)}</h2>
          <div className={styles.options} role="radiogroup" aria-label={t(question.title)}>
            {(AVATAR_OPTIONS[question.key] as readonly string[]).map((value, option) => <button key={value} type="button" role="radio"
              aria-checked={answered.has(question.key) && params[question.key] === value} style={{ '--i': option } as CSSProperties}
              onClick={() => choose(value)}>
              <span className={styles.letter} aria-hidden="true">{String.fromCharCode(1040 + option)}</span>
              <span className={styles.optionText}>{t(value)}{question.hints[option] && <small aria-hidden="true">{t(question.hints[option])}</small>}</span>
            </button>)}
          </div>
        </div>
        {error && <p role="alert" className={styles.error}>{t(error)}</p>}
        <div className={styles.actions}>
          <Button type="button" tone="secondary" disabled={index === 0 || busy} onClick={() => setIndex(index - 1)}>{t('Назад')}</Button>
          <Button type="button" disabled={!answered.has(question.key) || busy}
            onClick={() => { if (index === 6) void finish(); else setIndex(index + 1) }}>
            {busy ? t('Сохраняем…') : index === 6 ? t('Создать аватара') : t('Далее')}
          </Button>
        </div>
      </Card>
      <aside className={styles.preview} aria-label={t('Предпросмотр героя')}>
        {/* Ключ по параметрам: после каждого выбора фигура коротко «подпрыгивает», чтобы изменение было заметно. */}
        <div className={styles.stage}><div key={JSON.stringify(params)} className={styles.figure}>
          <AvatarFigure params={params} size={300} label={t('Аватар: {avatarName}', { avatarName: avatarName(params, t) })} /></div></div>
        <div className={styles.identity}><strong>{avatarName(params, t)}</strong>
          <span className={styles.filled}>{t('Ответов: {size} из 7', { size: answered.size })}</span></div>
        <dl className={styles.fields}>{AVATAR_QUESTIONS.map((item, field) => <div key={item.key} data-filled={answered.has(item.key) || undefined}>
          <dt>{t(FIELD_LABELS[field]!)}</dt><dd>{answered.has(item.key) ? t(params[item.key]) : '—'}</dd>
        </div>)}</dl>
      </aside>
    </div>
  </Page>
}
