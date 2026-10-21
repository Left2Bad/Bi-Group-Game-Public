import { useEffect, useState } from 'react'
import { useI18n } from './context'
import { retryContentTranslation, useContentProgress } from './content-progress'
import { LANG_NAMES, LANGS } from './translate'
import styles from './LanguageSwitch.module.css'

/** Переключатель языка интерфейса. Каждая кнопка подписана на своём языке и помечена атрибутом lang. */
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n()
  return <div className={styles.wrap} data-no-print>
    <div className={styles.switch} role="group" aria-label={t('Язык интерфейса')}>
      {LANGS.map((code) => <button key={code} type="button" lang={code} title={LANG_NAMES[code].full}
        aria-pressed={lang === code} onClick={() => setLang(code)}>{LANG_NAMES[code].short}</button>)}
    </div>
    {lang !== 'ru' && <ContentTranslationBar />}
  </div>
}

/**
 * Полоса под переключателем: сколько сгенерированного контента (вопросы, разбор, план) уже переведено.
 * Видна, пока идёт перевод или после сбоя; по завершении коротко показывает 100% и исчезает.
 */
function ContentTranslationBar() {
  const { t } = useI18n()
  const progress = useContentProgress()
  const [finished, setFinished] = useState(false)
  const active = progress.translating || progress.failed !== null
  const [wasActive, setWasActive] = useState(active)
  if (active !== wasActive) {
    setWasActive(active)
    if (!active && progress.total > 0) setFinished(true)
    if (active) setFinished(false)
  }
  useEffect(() => {
    if (!finished) return
    const timer = setTimeout(() => setFinished(false), 1600)
    return () => clearTimeout(timer)
  }, [finished])
  if (!active && !finished) return null
  const percent = progress.total ? Math.floor(100 * progress.done / progress.total) : 0
  const failed = progress.failed !== null
  return <div className={styles.progress} data-state={failed ? 'failed' : finished ? 'ready' : 'translating'} role="status">
    <progress max={100} value={finished ? 100 : percent} aria-label={t('Перевод сгенерированного контента')} />
    <span title={progress.failed || undefined}>{failed ? t('Перевод не удался: {percent}%', { percent })
      : finished ? t('Перевод готов') : t('Перевод: {percent}%', { percent })}</span>
    {failed && <button type="button" onClick={retryContentTranslation}>{t('Повторить')}</button>}
  </div>
}
