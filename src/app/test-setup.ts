import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom сообщает язык браузера en-US, а страницы в тестах написаны по-русски: русский — язык по умолчанию.
// Тесты определения языка передают список языков явно и не зависят от этой подмены.
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'languages', { value: ['ru-RU', 'ru'], configurable: true })
  Object.defineProperty(navigator, 'language', { value: 'ru-RU', configurable: true })
}

afterEach(cleanup)
