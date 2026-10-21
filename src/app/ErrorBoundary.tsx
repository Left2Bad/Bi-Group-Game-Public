import { Component } from 'react'
import type { ReactNode } from 'react'
import { translatorFor } from '../i18n/dictionaries'
import { isLang } from '../i18n/translate'

export class ErrorBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (this.state.failed) {
      // Запасная страница стоит выше провайдера языка, поэтому язык берётся из атрибута html.
      const documentLang = typeof document === 'undefined' ? null : document.documentElement.lang
      const t = translatorFor(isLang(documentLang) ? documentLang : 'ru')
      return <main role="alert">
        <h1>{t('Не удалось открыть страницу')}</h1>
        <p>{t('Перезагрузите приложение, чтобы попробовать ещё раз.')}</p>
        <a href="/">{t('Открыть главную')}</a>
      </main>
    }
    return this.props.children
  }
}
