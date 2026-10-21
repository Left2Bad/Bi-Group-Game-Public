/** Сохраняет файл через временную ссылку. Возвращает false, если браузер не позволил (например, нет Blob или URL.createObjectURL). */
export function downloadBlob(filename: string, blob: Blob): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
    // Адрес освобождается позже: некоторые браузеры начинают скачивание асинхронно.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

export function downloadTextFile(filename: string, mime: string, content: string): boolean {
  try {
    return downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }))
  } catch {
    return false
  }
}
