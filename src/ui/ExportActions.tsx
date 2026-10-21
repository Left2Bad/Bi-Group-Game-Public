import { useState } from 'react'
import { useI18n } from '../i18n/context'
import { downloadTextFile } from './download'
import { Button, StatusMessage } from './primitives'
import styles from './ExportActions.module.css'

export interface ExportFile {
  readonly filename: string
  readonly mime: string
  readonly content: string
}

export type ExportFormat = 'json' | 'csv'

/** Кнопки «Скачать JSON» и «Скачать CSV». Файл собирается в момент нажатия из текущих данных. */
export function ExportActions({ build, note }: {
  readonly build: (format: ExportFormat) => ExportFile
  readonly note: string
}) {
  const { t } = useI18n()
  const [notice, setNotice] = useState<{ readonly text: string; readonly warning: boolean } | null>(null)
  const save = (format: ExportFormat) => {
    try {
      const file = build(format)
      setNotice(downloadTextFile(file.filename, file.mime, file.content)
        ? { text: t('Файл {name} сохранён в загрузках.', { name: file.filename }), warning: false }
        : { text: t('Браузер не дал сохранить файл. Попробуйте другой браузер.'), warning: true })
    } catch {
      setNotice({ text: t('Не удалось собрать файл. Профиль на странице не изменился.'), warning: true })
    }
  }
  return <div className={styles.export}>
    <p>{note}</p>
    <div className={styles.buttons}>
      <Button type="button" tone="secondary" onClick={() => save('json')}>{t('Скачать JSON')}</Button>
      <Button type="button" tone="secondary" onClick={() => save('csv')}>{t('Скачать CSV')}</Button>
    </div>
    {notice && <StatusMessage warning={notice.warning}>{notice.text}</StatusMessage>}
  </div>
}
