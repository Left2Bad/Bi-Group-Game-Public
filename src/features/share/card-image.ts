/** Размер карточки в SVG-координатах; пропорции 1200×630 подходят для превью ссылок в мессенджерах. */
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

/**
 * Рисует SVG карточки в PNG. Работает только в браузере: нужны Image и canvas.
 * Шрифты страницы в картинку не попадают (SVG рисуется изолированно), поэтому карточка
 * использует системные шрифты из запасного списка.
 */
export function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(CARD_WIDTH))
    clone.setAttribute('height', String(CARD_HEIGHT))
    const markup = new XMLSerializer().serializeToString(clone)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = CARD_WIDTH * scale
      canvas.height = CARD_HEIGHT * scale
      const context = canvas.getContext('2d')
      if (!context) { reject(new Error('canvas-unavailable')); return }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('png-failed')), 'image/png')
    }
    image.onerror = () => reject(new Error('image-failed'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  })
}
