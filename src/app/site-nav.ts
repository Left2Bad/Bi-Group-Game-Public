import { msg } from '../i18n/translate'

export interface NavPage {
  readonly path: string
  readonly title: string
  /** Страница открывается только после завершённого теста (см. CompletedAttemptGate в routes.tsx). */
  readonly needsResult?: true
}

/** Основные пункты шапки: путь сотрудника от знакомства до маршрута развития. */
export const primaryPages: readonly NavPage[] = [
  { path: '/', title: msg('Главная') },
  // «Тест» открывает описание с кнопкой старта: отдельный пункт «Перед началом» не нужен.
  { path: '/intro', title: msg('Тест') },
  { path: '/results', title: msg('Профиль'), needsResult: true },
  { path: '/development', title: msg('Маршрут'), needsResult: true },
]

/** Справочные страницы: лежат в выпадающем меню «Ещё», чтобы не перегружать шапку. */
export const morePages: readonly NavPage[] = [
  { path: '/types', title: msg('16 типов') },
  { path: '/demo', title: msg('Пример') },
  { path: '/team', title: msg('Команда') },
  { path: '/ethics', title: msg('Этика и данные') },
]

export const pages: readonly NavPage[] = [...primaryPages, ...morePages]
