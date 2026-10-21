import type { ButtonHTMLAttributes, HTMLAttributes, PointerEvent, ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import '../styles/tokens.css'
import styles from './primitives.module.css'

export function Page({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`${styles.page} ${className}`} {...props}>{children}</section>
}

export function Card({ children, className = '', onPointerMove, ...props }: HTMLAttributes<HTMLElement> & { readonly ref?: Ref<HTMLElement> }) {
  const follow = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (event.pointerType !== 'touch') {
      event.currentTarget.style.setProperty('--mx', `${Math.round(event.clientX - box.left)}px`)
      event.currentTarget.style.setProperty('--my', `${Math.round(event.clientY - box.top)}px`)
    }
    onPointerMove?.(event)
  }
  return <section className={`${styles.card} ${className}`} onPointerMove={follow} {...props}>{children}</section>
}

export function Button({ children, tone = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly tone?: 'primary' | 'secondary' | 'quiet'
}) {
  return <button className={`${styles.button} ${styles[tone]} ${className}`} {...props}>{children}</button>
}

export function Eyebrow({ children, className = '' }: { readonly children: ReactNode; readonly className?: string | undefined }) {
  return <p className={`${styles.eyebrow} ${className}`}>{children}</p>
}

export function ActionLink({ tone = 'primary', className = '', ...props }: LinkProps & {
  readonly tone?: 'primary' | 'secondary' | 'quiet'
}) {
  return <Link className={`${styles.button} ${styles[tone]} ${className}`} {...props} />
}

export function StatusMessage({ children, warning = false }: { readonly children: ReactNode; readonly warning?: boolean }) {
  return <p className={`${styles.status} ${warning ? styles.warning : ''}`} role="status">{children}</p>
}

export function ProgressBar({ value, label }: { readonly value: number; readonly label: string }) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0
  return <div className={styles.progress}>
    <div className={styles.progressHeader}><span>{label}</span><strong>{safeValue}%</strong></div>
    <div className={styles.track} role="img" aria-label={`${label}: ${safeValue}%`}>
      <span style={{ width: `${safeValue}%` }} />
    </div>
  </div>
}

export function SectionHeading({ title, description }: { readonly title: string; readonly description?: string }) {
  return <div className={styles.heading}><h2>{title}</h2>{description && <p>{description}</p>}</div>
}
