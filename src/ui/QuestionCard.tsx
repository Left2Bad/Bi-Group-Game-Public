import type { QuestionViewProps } from '../features/assessment/AssessmentFlow'
import { useI18n } from '../i18n/context'
import { Card } from './primitives'
import styles from './QuestionCard.module.css'

/** Radio-group question UI; the assessment session remains the source of selected state. */
export function QuestionCard({ question, selectedOptionId, onSelect }: QuestionViewProps) {
  const { t } = useI18n()
  return <Card className={styles.card}>
    <p className={styles.context}>{question.context}</p>
    <fieldset className={styles.group}>
      <legend>{question.text}</legend>
      {question.options.map((option, index) => {
        const selected = selectedOptionId === option.id
        return <label className={`${styles.option} ${selected ? styles.selected : ''}`} key={option.id}>
          <input type="radio" name={question.id} value={option.id} checked={selected} onChange={() => onSelect(option.id)} />
          <span className={styles.letter} aria-hidden="true">{String.fromCharCode(65 + index)}</span>
          <span className={styles.optionText}>{option.text}</span>
          <span className={styles.check} aria-hidden="true">{selected ? '✓' : ''}</span>
        </label>
      })}
    </fieldset>
    <p className={styles.hint}>{t('Выберите один ответ. К нему можно будет вернуться.')}</p>
  </Card>
}
