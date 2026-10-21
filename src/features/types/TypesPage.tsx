import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ARCHETYPES, POLES } from '../../content/archetypes'
import { getArchetype } from '../../domain/archetype'
import type { AssessmentResult } from '../../domain/types'
import { TRAIT_IDS } from '../../domain/types'
import { useI18n } from '../../i18n/context'
import { ArchetypeCharacter } from '../../ui/ArchetypeCharacter'
import { Page } from '../../ui/primitives'
import { prefersReducedMotion, trackSpotlight } from '../landing/motion'
import styles from './TypesPage.module.css'

const CODES = Object.keys(ARCHETYPES)
const LETTERS = TRAIT_IDS.flatMap((id) => [POLES[id].high, POLES[id].low])

/** Галерея 16 персонажей: свой тип отмечен, любой можно открыть и сравнить. */
export function TypesPage({ result }: { readonly result: AssessmentResult | null }) {
  const { t, code: showCode } = useI18n()
  const own = result ? getArchetype(result).code : null
  const [filter, setFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState(own ?? CODES[0]!)
  const archetype = ARCHETYPES[selected]!
  const detailRef = useRef<HTMLElement>(null)
  /** На телефоне подробности лежат выше сетки: после выбора плавно возвращаем к ним. */
  const choose = (code: string) => {
    setSelected(code)
    const detail = detailRef.current
    if (detail && detail.getBoundingClientRect().top < 0 && typeof detail.scrollIntoView === 'function') {
      detail.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    }
  }
  return <Page className={styles.page}>
    <header className={styles.header}>
      <h1>{t('16 рабочих архетипов')}</h1>
      <p>{t('Каждое качество даёт одну из двух букв. Плохих типов нет: у каждого свои сильные стороны и риски.')}</p>
    </header>
    <div className={styles.filters} role="group" aria-label={t('Фильтр по полюсу')}>
      <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)}>{t('Все 16')}</button>
      {LETTERS.map((pole) => <button key={pole.letter} type="button" aria-pressed={filter === pole.letter} onClick={() => setFilter(pole.letter)}>
        <b>{showCode(pole.letter)}</b> {t(pole.name)}</button>)}
    </div>
    <section className={styles.detail} aria-live="polite" aria-labelledby="type-title" ref={detailRef} data-kind={selected[0]} data-code={showCode(selected)} data-spot="" onPointerMove={trackSpotlight}>
      <div className={styles.aurora} aria-hidden="true"><i /><i /></div>
      <div className={styles.stage} key={`stage-${selected}`}>
        <ArchetypeCharacter code={selected} size={300} label={t('Персонаж: {name}', { name: t(archetype.name) })} />
      </div>
      <div className={styles.detailBody} key={selected}>
        <p className={styles.detailCode}>{showCode(selected)}{selected === own && <span>{t('Ваш тип')}</span>}</p>
        <h2 id="type-title">{t(archetype.name)}</h2>
        <p className={styles.tagline}>{t(archetype.tagline)}</p>
        <p>{t(archetype.description)}</p>
        <div className={styles.split}>
          <div className={styles.good}><h3>{t('Сильные стороны типа')}</h3><ul>{archetype.strengths.map((item) => <li key={item}>{t(item)}</li>)}</ul></div>
          <div className={styles.risk}><h3>{t('На что обратить внимание')}</h3><ul>{archetype.risks.map((item) => <li key={item}>{t(item)}</li>)}</ul></div>
        </div>
        <p className={styles.best}><strong>{t('Где раскрывается:')}</strong> {t(archetype.bestAt)}</p>
      </div>
    </section>
    <ul className={styles.grid} onPointerMove={trackSpotlight}>{CODES.map((code, index) => {
      const match = !filter || code.includes(filter)
      return <li key={code} data-dim={!match || undefined} style={{ '--i': index } as CSSProperties}>
        <button type="button" aria-pressed={code === selected} data-kind={code[0]} data-spot="" onClick={() => choose(code)}>
          <ArchetypeCharacter code={code} size={160} />
          <span className={styles.cardText}><b>{showCode(code)}</b><strong>{t(ARCHETYPES[code]!.name)}</strong></span>
          {code === own && <span className={styles.mine}>{t('Вы')}</span>}
        </button>
      </li>
    })}</ul>
  </Page>
}
