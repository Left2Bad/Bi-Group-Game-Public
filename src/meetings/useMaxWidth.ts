import { useEffect, useState } from 'react'

/** Истинно, если окно не шире `px`. Без поддержки matchMedia (тесты) считается, что окно широкое. */
export function useMaxWidth(px: number): boolean {
  const query = `(max-width: ${px}px)`
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])
  return matches
}
