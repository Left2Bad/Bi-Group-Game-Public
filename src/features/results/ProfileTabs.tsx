import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import styles from './ProfileTabs.module.css'
import { useI18n } from '../../i18n/context'

export interface ProfileTab {
  readonly id: string
  readonly label: string
  readonly hint: string
  /** Короткая подпись для телефона, если полная не помещается в узкую кнопку. Имя вкладки для скринридера остаётся полным. */
  readonly short?: string
}

/**
 * Переключатель разделов профиля. Стрелки, Home и End двигают выбор, как в обычной вкладке ARIA.
 * Когда вкладки уходят за верх экрана, слева выезжает закреплённая панель с теми же разделами.
 */
export function ProfileTabs({ tabs, active, onChange, label, children }: {
  readonly tabs: readonly ProfileTab[]
  readonly active: string
  readonly onChange: (id: string) => void
  readonly label: string
  readonly children: ReactNode
}) {
  const { t } = useI18n()
  const prefix = useId()
  const tabsRef = useRef<HTMLDivElement>(null)
  const [floating, setFloating] = useState(false)
  useEffect(() => {
    const node = tabsRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setFloating(!entry!.isIntersecting && entry!.boundingClientRect.top < 0))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const jump = (id: string) => {
    onChange(id)
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    tabsRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === active)
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (target < 0) return
    event.preventDefault()
    const next = tabs[target]!
    onChange(next.id)
    document.getElementById(`${prefix}-profile-tab-${next.id}`)?.focus()
  }
  return <>
    <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label={label} onKeyDown={move} data-no-print style={{ '--tab-count': tabs.length, '--active': Math.max(0, tabs.findIndex((tab) => tab.id === active)) } as CSSProperties}>
      <span className={styles.dot} aria-hidden="true" />
      {tabs.map((tab, index) => <button key={tab.id} id={`${prefix}-profile-tab-${tab.id}`} type="button" role="tab"
        aria-selected={tab.id === active} aria-controls={`${prefix}-profile-panel-${tab.id}`} tabIndex={tab.id === active ? 0 : -1}
        onClick={() => onChange(tab.id)} data-label={tab.label}>
        <span className={styles.step} aria-hidden="true">{index + 1}</span>
        <span className={styles.text}><strong data-has-short={tab.short ? '' : undefined}>{tab.label}</strong>{tab.short && <span className={styles.short} aria-hidden="true">{tab.short}</span>}<small>{tab.hint}</small></span>
      </button>)}
    </div>
    <nav className={styles.rail} aria-label={t('{label}: быстрый переход', { label })} data-no-print data-no-reveal data-visible={floating ? '' : undefined} inert={!floating}
      style={{ '--tab-count': tabs.length, '--active': Math.max(0, tabs.findIndex((tab) => tab.id === active)) } as CSSProperties}>
      <span className={styles.dot} aria-hidden="true" />
      {tabs.map((tab, index) => <button key={tab.id} type="button" aria-current={tab.id === active ? 'true' : undefined} onClick={() => jump(tab.id)} data-label={tab.label}>
        <span className={styles.step} aria-hidden="true">{index + 1}</span><span className={styles.railLabel}>{tab.label}</span>
      </button>)}
    </nav>
    <div id={`${prefix}-profile-panel-${active}`} role="tabpanel" aria-labelledby={`${prefix}-profile-tab-${active}`} className={styles.panel}>{children}</div>
  </>
}
