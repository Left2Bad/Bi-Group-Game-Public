import { useRef, useState } from 'react'
import { ARCHETYPES } from '../../content/archetypes'
import { buildShareCard, SHARE_NAME_MAX, shareUrl } from '../../domain/share'
import { TRAIT_IDS } from '../../domain/types'
import type { AssessmentResult } from '../../domain/types'
import { useI18n } from '../../i18n/context'
import { msg } from '../../i18n/translate'
import { useAvatarChoice } from '../../ui/use-avatar'
import { downloadBlob } from '../../ui/download'
import { Button, Card, StatusMessage } from '../../ui/primitives'
import { svgToPngBlob } from './card-image'
import styles from './ShareProfilePanel.module.css'
import { ShareCardView } from './ShareCardView'

const shortNames = {
  criticalThinking: msg('Мышление'), confidence: msg('Уверенность'), discipline: msg('Дисциплина'), engagement: msg('Вовлечённость'),
} as const

type Notice = { readonly text: string; readonly warning: boolean }

/** Карточка профиля и три способа ей поделиться. Ничего не отправляется: ссылка собирается в браузере. */
export function ShareProfilePanel({ result }: { readonly result: AssessmentResult }) {
  const { t, code: showCode } = useI18n()
  const [avatar] = useAvatarChoice()
  const [name, setName] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const svgNode = useRef<SVGSVGElement | null>(null)
  const urlField = useRef<HTMLInputElement | null>(null)

  const card = buildShareCard(result, name)
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const url = shareUrl(origin, card)
  const archetypeName = ARCHETYPES[card.code]?.name
  const title = archetypeName ? t(archetypeName) : showCode(card.code)
  const summary = TRAIT_IDS.map((id) => `${t(shortNames[id])} ${card.percents[id]}%`).join(', ')
  const text = t('Мой рабочий архетип в BI Academy: «{title}» ({code}). {summary}.', { title, code: showCode(card.code), summary })
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async (value: string, done: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setNotice({ text: done, warning: false })
    } catch {
      urlField.current?.select()
      setNotice({ text: t('Не удалось скопировать автоматически. Ссылка выделена в поле: нажмите Ctrl+C.'), warning: true })
    }
  }

  const sharePage = async () => {
    try {
      await navigator.share({ title: t('Профиль BI Academy'), text, url })
    } catch (error) {
      // Закрытие окна «Поделиться» — не ошибка.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNotice({ text: t('Не удалось открыть окно «Поделиться». Скопируйте ссылку.'), warning: true })
      }
    }
  }

  const savePng = async () => {
    const node = svgNode.current
    if (!node) return
    try {
      const blob = await svgToPngBlob(node)
      const filename = `bi-academy-card-${card.code}.png`
      setNotice(downloadBlob(filename, blob)
        ? { text: t('Файл {name} сохранён в загрузках.', { name: filename }), warning: false }
        : { text: t('Браузер не дал сохранить файл. Попробуйте другой браузер.'), warning: true })
    } catch {
      setNotice({ text: t('Не удалось собрать картинку. Скопируйте ссылку или сделайте снимок экрана.'), warning: true })
    }
  }

  return <Card className={styles.panel} aria-labelledby="share-title">
    <h2 id="share-title">{t('Поделиться карточкой профиля')}</h2>
    <p className={styles.privacy}>{t('В карточке только четыре процента, архетип и имя, которое вы введёте сами. Ответы, даты и рекомендации в неё не попадают. Данные лежат в самой ссылке: сервер их не получает и не хранит. Увидит карточку только тот, кому вы её отправите.')}</p>
    <label className={styles.field}>
      {t('Имя на карточке (необязательно)')}
      <input type="text" value={name} maxLength={SHARE_NAME_MAX} autoComplete="off"
        onChange={(event) => setName(event.target.value)} />
    </label>
    <div className={styles.preview}><ShareCardView card={card} avatar={avatar} svgRef={(node) => { svgNode.current = node }} /></div>
    <label className={styles.field}>
      {t('Ссылка на карточку')}
      <input ref={urlField} type="text" readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
    </label>
    <div className={styles.buttons}>
      <Button type="button" onClick={() => { void copy(url, t('Ссылка скопирована.')) }}>{t('Скопировать ссылку')}</Button>
      {canShare && <Button type="button" tone="secondary" onClick={() => { void sharePage() }}>{t('Поделиться…')}</Button>}
      <Button type="button" tone="secondary" onClick={() => { void savePng() }}>{t('Скачать PNG')}</Button>
      <Button type="button" tone="secondary" onClick={() => { void copy(`${text}\n${url}`, t('Текст со ссылкой скопирован.')) }}>{t('Скопировать текст')}</Button>
    </div>
    {notice && <StatusMessage warning={notice.warning}>{notice.text}</StatusMessage>}
  </Card>
}
