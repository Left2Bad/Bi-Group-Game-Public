import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { memoryStorage } from '../storage/test-storage'
import { AppRoutes } from './routes'

function renderIntro() {
  return render(<MemoryRouter initialEntries={['/intro']}><AppRoutes getStorage={() => memoryStorage()} /></MemoryRouter>)
}

describe('страница «Перед началом»', () => {
  it('объясняет, как отвечать, сколько это займёт, что будет в конце и кто видит ответы', () => {
    renderIntro()
    expect(screen.getByRole('heading', { name: 'Перед началом' })).toBeVisible()
    for (const name of ['Как отвечать', 'Время и условия', 'Что вы получите', 'Кто видит ваши ответы', 'Ваши данные']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    expect(screen.getByText(/не отправляются на сервер/)).toBeInTheDocument()
    expect(screen.getByText(/не психологический диагноз/)).toBeInTheDocument()
    expect(screen.getByText('10–15 минут')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Посмотреть пример профиля' })).toHaveAttribute('href', '/demo')
  })

  it('главная кнопка первая среди элементов управления, удаление данных остаётся видимым', () => {
    renderIntro()
    const main = screen.getByRole('main')
    const first = main.querySelector('a[href], button, select, input')
    expect(first).toHaveTextContent('Начать тест')
    expect(within(main).getByRole('link', { name: 'Начать тест' })).toHaveAttribute('href', '/assessment')
    expect(within(main).getByRole('button', { name: 'Удалить мои данные' })).toBeVisible()
  })

  it('без сохранённых ответов не предлагает «Начать заново» и «Пройти ещё раз»', () => {
    renderIntro()
    expect(screen.queryByRole('button', { name: 'Начать заново' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Пройти ещё раз' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
