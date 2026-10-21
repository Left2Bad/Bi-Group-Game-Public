import { useMemo } from 'react'
import { assessConsistency } from '../domain/consistency'
import { attemptCsvRows, attemptFileName, ATTEMPT_CSV_HEADER, buildAttemptExport, toCsv, toJson } from '../domain/export'
import type { AssessmentResult, Question } from '../domain/types'
import { ShareProfilePanel } from '../features/share/ShareProfilePanel'
import { useI18n } from '../i18n/context'
import { ExportActions } from '../ui/ExportActions'
import type { ExportFile, ExportFormat } from '../ui/ExportActions'
import { Card } from '../ui/primitives'

/** Сохранение результата в файл и карточка профиля: оба действия запускает сам пользователь. */
export function ProfileTools({ result, questions }: { readonly result: AssessmentResult; readonly questions: readonly Question[] }) {
  const { t } = useI18n()
  const consistency = useMemo(() => assessConsistency(result, questions), [result, questions])
  const build = (format: ExportFormat): ExportFile => {
    const data = buildAttemptExport({ result, questions, consistency, exportedAt: new Date().toISOString() })
    return format === 'json'
      ? { filename: attemptFileName(data, 'json'), mime: 'application/json', content: toJson(data) }
      : { filename: attemptFileName(data, 'csv'), mime: 'text/csv', content: toCsv(ATTEMPT_CSV_HEADER, attemptCsvRows(data)) }
  }
  return <>
    <ShareProfilePanel result={result} />
    <Card aria-labelledby="export-title">
      <h2 id="export-title">{t('Сохранить результат в файл')}</h2>
      <ExportActions build={build}
        note={t('Файл содержит проценты, баллы, ваши ответы по ситуациям и индикатор согласованности. Он нужен для передачи в систему обучения. Отправляйте его только тем, кому доверяете.')} />
    </Card>
  </>
}
