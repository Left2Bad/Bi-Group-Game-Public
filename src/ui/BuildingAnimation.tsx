import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { prefersReducedMotion } from '../features/landing/motion'
import { useI18n } from '../i18n/context'
import styles from './BuildingAnimation.module.css'

/** Шаг этажа по высоте в пикселях (высота 22 + зазор 3) и высота головы крана: должны совпадать со стилями. */
const SLOT = 25
const CRANE_HEAD = 30
/** Один цикл: груз опускается, на 450-й миллисекунде этаж встаёт на место, к 700-й кран готов к следующему. */
const STEP_MS = 700
const LAND_MS = 450
const SUCCESS_HOLD_MS = 4500
const RESET_FADE_MS = 600

type Phase = 'building' | 'success' | 'reset'

/**
 * Анимированная стройка: кран по одному возводит этажи, а когда все готовы, на здании появляется печать «Успех».
 * Потом здание сносится и стройка начинается заново, пока человек на странице. Чисто визуальный слой (aria-hidden).
 * При «уменьшить движение» показывается готовое здание с печатью, без таймеров.
 */
export function BuildingAnimation({ total }: { readonly total: number }) {
  const { t } = useI18n()
  const [reduced] = useState(prefersReducedMotion)
  const [phase, setPhase] = useState<Phase>(reduced ? 'success' : 'building')
  /** step — какой этаж сейчас поднимает кран; built — сколько этажей уже стоит. */
  const [step, setStep] = useState(0)
  const [built, setBuilt] = useState(reduced ? total : 0)

  useEffect(() => {
    if (reduced) return
    const timers: ReturnType<typeof setTimeout>[] = []
    if (phase === 'building') {
      timers.push(setTimeout(() => setBuilt(step + 1), LAND_MS))
      timers.push(setTimeout(() => { if (step + 1 < total) setStep(step + 1); else setPhase('success') }, STEP_MS))
    } else if (phase === 'success') {
      timers.push(setTimeout(() => setPhase('reset'), SUCCESS_HOLD_MS))
    } else {
      timers.push(setTimeout(() => { setBuilt(0); setStep(0); setPhase('building') }, RESET_FADE_MS))
    }
    return () => timers.forEach(clearTimeout)
  }, [phase, step, total, reduced])

  // Длина троса: от стрелы до верха этажа, который сейчас возводится.
  const slotTop = CRANE_HEAD + (total - 1 - step) * SLOT
  const reach = slotTop - 8 - 12
  const style = { '--total': total } as CSSProperties
  return <div className={styles.building} data-phase={phase} style={style} aria-hidden="true">
    <div className={styles.stage}>
      <div className={styles.rig}>
        <span className={styles.mast} />
        <span className={styles.jib} />
        <span className={styles.trolley} />
        {phase === 'building' && <span key={step} className={styles.hoist} style={{ '--reach': `${reach}px` } as CSSProperties}><span className={styles.load} /></span>}
        {phase !== 'building' && <span className={styles.flag} />}
      </div>
      <ol className={styles.floors}>{Array.from({ length: total }, (_, index) => {
        const state = index < built ? 'done' : index === step && phase === 'building' ? 'current' : 'empty'
        return <li key={index} data-state={state} style={{ '--i': index } as CSSProperties}><span>{index + 1}</span></li>
      })}</ol>
      {phase !== 'building' && <p className={styles.stamp}>
        <svg viewBox="0 0 20 20" width="18" height="18" focusable="false"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t('Успех')}
      </p>}
    </div>
    <div className={styles.ground} />
    <p className={styles.caption}><strong>{built}</strong> {t('из {total} этажей', { total })}</p>
  </div>
}
