import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/context'

/**
 * Явное согласие сотрудника на передачу результатов руководителю команды.
 * Флажок не отмечен по умолчанию; сервер принимает только согласие, отправленное как true.
 * Отозвать согласие можно, выйдя из команды: руководитель сразу теряет доступ.
 */
export function ConsentField({ className, disabled }: { readonly className?: string | undefined; readonly disabled?: boolean | undefined }) {
  const { t } = useI18n()
  const id = useId()
  return <div className={className}>
    <input id={id} type="checkbox" name="consent" disabled={disabled} aria-describedby={`${id}-details`} />
    <label htmlFor={id}>{t('Согласен(на) передать руководителю команды мои результаты теста, их динамику и мой аватар')}</label>
    <small id={`${id}-details`}>{t('Нужно только для вступления в команду. Данные используются для планирования развития и обучения, а не для аттестации. Согласие можно отозвать, выйдя из команды.')} <Link to="/ethics" target="_blank">{t('Кто и что видит')}</Link></small>
  </div>
}
