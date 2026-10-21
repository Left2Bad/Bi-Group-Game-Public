import type { FormEvent } from 'react'
import type { Translate } from '../i18n/translate'
import type { FieldErrors } from '../domain/account-validation'

/** Отмечаем поля и переводим фокус; текст ошибки показывает уже существующий блок формы. */
export function showFieldErrors(form: HTMLFormElement, errors: FieldErrors, t: Translate) {
  let first: HTMLInputElement | undefined
  for (const [name, message] of Object.entries(errors)) {
    const input = form.elements.namedItem(name)
    if (input instanceof HTMLInputElement) {
      input.setCustomValidity(t(message)); input.setAttribute('aria-invalid', 'true')
      first ??= input
    }
  }
  first?.focus()
}

export function clearFieldError(event: FormEvent<HTMLFormElement>) {
  if (event.target instanceof HTMLInputElement) {
    event.target.setCustomValidity('')
    event.target.removeAttribute('aria-invalid')
  }
}
