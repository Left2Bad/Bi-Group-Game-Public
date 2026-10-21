import type { Request } from 'express'

export function configuredOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path')
  return url.origin
}

/** Проверяется после обязательного X-BI-Academy; CORS для чужих сайтов не включён. */
export function allowsWriteOrigin(req: Request, publicOrigin?: string): boolean {
  const site = req.get('Sec-Fetch-Site')
  if (site && site !== 'same-origin') return false
  const origin = req.get('Origin')
  // Небраузерные клиенты используют обязательный собственный заголовок.
  if (origin === undefined) return true
  try {
    const url = new URL(origin)
    if (!['http:', 'https:'].includes(url.protocol) || origin !== url.origin) return false
    if (publicOrigin) return origin === publicOrigin
    // Sec-* задаёт браузер, JS другого сайта не может подделать same-origin.
    // Внешний Origin и внутренний Host могут различаться за reverse proxy.
    if (site === 'same-origin') return true
    return origin === new URL(`${req.protocol}://${req.get('host')}`).origin
  } catch { return false }
}
