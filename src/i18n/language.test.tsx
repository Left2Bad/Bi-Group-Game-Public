import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../app/routes'
import { AssessmentFlow } from '../features/assessment/AssessmentFlow'
import { createAssessmentSession } from '../features/assessment/session'
import { createTestModule } from '../features/assessment/test-module'
import { clearAccountData } from '../storage/personal'
import { clearAppData } from '../storage/shared'
import { memoryStorage } from '../storage/test-storage'
import { I18nProvider } from './I18nProvider'
import { LanguageSwitch } from './LanguageSwitch'
import { LANG_STORAGE_KEY } from './translate'

describe('переключатель языка', () => {
  it('показывает три кнопки с подписями на самих языках и атрибутом lang', () => {
    render(<I18nProvider getStorage={() => memoryStorage()}><LanguageSwitch /></I18nProvider>)
    const group = screen.getByRole('group', { name: 'Язык интерфейса' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((button) => [button.textContent, button.getAttribute('lang')])).toEqual([['RU', 'ru'], ['ҚАЗ', 'kk'], ['EN', 'en']])
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('переключает на английский, запоминает выбор, ставит lang у html и описание страницы', () => {
    const storage = memoryStorage()
    const description = document.head.appendChild(document.createElement('meta'))
    description.name = 'description'
    render(<I18nProvider getStorage={() => storage}><LanguageSwitch /></I18nProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(document.documentElement.lang).toBe('en')
    expect(description.content).toMatch(/^BI Academy — 15 work situations/)
    description.remove()
    expect(storage.getItem(LANG_STORAGE_KEY)).toBe('en')
    expect(screen.getByRole('group', { name: 'Interface language' })).toBeVisible()
  })

  it('выбранный язык переживает перезагрузку и не стирается кнопкой «Удалить мои данные»', () => {
    const storage = memoryStorage()
    storage.setItem(LANG_STORAGE_KEY, 'en')
    storage.setItem('bi-academy:draft', '{}')
    expect(clearAppData(() => storage)).toEqual({ ok: true })
    expect(storage.getItem('bi-academy:draft')).toBeNull()
    expect(storage.getItem(LANG_STORAGE_KEY)).toBe('en')
    render(<I18nProvider getStorage={() => storage}><LanguageSwitch /></I18nProvider>)
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('сброс данных аккаунта тоже не стирает язык', () => {
    localStorage.clear()
    localStorage.setItem(LANG_STORAGE_KEY, 'en')
    localStorage.setItem('bi-academy:user:u1:draft', '{}')
    localStorage.setItem('bi-academy:dynamic-text:u1:a:b', 'text')
    expect(clearAccountData('u1')).toBe(true)
    expect(localStorage.getItem('bi-academy:user:u1:draft')).toBeNull()
    expect(localStorage.getItem('bi-academy:dynamic-text:u1:a:b')).toBeNull()
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('en')
    localStorage.clear()
  })

  it('без сохранённого выбора берёт язык браузера, а сохранённый выбор важнее', () => {
    const languages = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-US'])
    const first = render(<I18nProvider getStorage={() => memoryStorage()}><LanguageSwitch /></I18nProvider>)
    expect(document.documentElement.lang).toBe('en')
    first.unmount()
    const storage = memoryStorage()
    storage.setItem(LANG_STORAGE_KEY, 'ru')
    render(<I18nProvider getStorage={() => storage}><LanguageSwitch /></I18nProvider>)
    expect(document.documentElement.lang).toBe('ru')
    languages.mockRestore()
  })
})

describe('английский интерфейс', () => {
  it('переводит шапку, главную и подвал', () => {
    const storage = memoryStorage()
    storage.setItem(LANG_STORAGE_KEY, 'en')
    render(<MemoryRouter><AppRoutes module={null} getStorage={() => storage} /></MemoryRouter>)
    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(navigation.getByRole('link', { name: 'Test' })).toHaveAttribute('href', '/intro')
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument()
    expect(screen.queryByText('Главная')).toBeNull()
    expect(document.title).toBe('Home · BI Academy')
  })

  it('на экране вопроса рамка английская, а текст ситуации и вариантов остаётся русским', () => {
    const storage = memoryStorage()
    storage.setItem(LANG_STORAGE_KEY, 'en')
    const session = createAssessmentSession({ module: createTestModule(), getStorage: () => storage })
    render(<I18nProvider getStorage={() => storage}><AssessmentFlow session={session} onComplete={vi.fn()} /></I18nProvider>)
    expect(screen.getByRole('heading', { name: 'Situation 1 of 15' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    // Текст ситуации и варианты — часть теста: они не переводятся.
    expect(screen.getByRole('radio', { name: 'Демонстрационный вариант B' })).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: 'Демонстрационный вариант B' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Situation 2 of 15' })).toBeVisible()
    expect(session.getSnapshot().draft.answers.Q01).toBe('Q01-B')
  })
})
