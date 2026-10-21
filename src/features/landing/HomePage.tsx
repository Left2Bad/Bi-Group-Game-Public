// Главная: светлый фон с огнями как у окна входа, счётчики, бенто-карточки качеств, таймлайн шагов и матрица архетипов.
import type { CSSProperties } from 'react'
import { ARCHETYPES, POLES } from '../../content/archetypes'
import type { TraitId } from '../../domain/types'
import { useI18n } from '../../i18n/context'
import { msg } from '../../i18n/translate'
import { useAuth } from '../../auth/context'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConstructionScene } from './ConstructionScene'
import { prefersReducedMotion, trackSpotlight, useMagnetic, usePointerParallax, useReveal } from './motion'
import Particles from './Particles'
import styles from './HomePage.module.css'

const qualities: readonly { readonly id: TraitId; readonly label: string; readonly copy: string }[] = [
  { id: 'criticalThinking', label: msg('Критическое мышление'), copy: msg('Проверяете ли вы факты, прежде чем принять решение.') },
  { id: 'confidence', label: msg('Уверенность в себе'), copy: msg('Готовы ли сказать «стоп» и отстоять позицию по делу.') },
  { id: 'discipline', label: msg('Дисциплина'), copy: msg('Держитесь ли технологии, сроков и документов.') },
  { id: 'engagement', label: msg('Вовлечённость'), copy: msg('Решаете ли задачи вместе со смежниками и бригадой.') },
]
const rows = [['high', 'high'], ['high', 'low'], ['low', 'high'], ['low', 'low']] as const
const columns = rows
const steps = [
  { title: msg('Пройдите 15 ситуаций'), copy: msg('Зимнее бетонирование, спор с технадзором, работа на высоте. В каждой ситуации нет единственно верного ответа.') },
  { title: msg('Получите профиль'), copy: msg('Четыре качества в процентах, радар, рабочий архетип и объяснение каждого балла.') },
  { title: msg('Работайте по плану'), copy: msg('Четыре недели практик и коротких уроков. На 30-й день — повторный тест и сравнение.') },
]

function order(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}

/** Тексты главной ровно как в HomePage: те же ключи перевода и та же ветка dynamic. */
function useHomeCopy() {
  const { t } = useI18n()
  const { enabled } = useAuth()
  const dynamic = enabled && import.meta.env.MODE !== 'playwright-legacy'
  const lead = dynamic
    ? t('Создайте героя по семи ответам, затем пройдите 10 готовых строительных ситуаций и 5 открытых вопросов. Получите четыре показателя качеств, отдельную оценку профессиональных навыков и план развития.')
    : t('BI Academy показывает, как вы принимаете решения на площадке. 15 реальных ситуаций — и вы получите рабочий архетип, профиль из четырёх качеств и личный план развития на 30 дней.')
  const stepItems = steps.map((step, index) => ({
    title: dynamic ? [t('Создайте аватара и пройдите тест'), t('Получите два результата'), t('Развивайтесь по плану')][index]! : t(step.title),
    copy: dynamic ? [
      t('Семь ответов создают героя. ИИ выбирает 10 ситуаций из базы, затем задаёт 5 открытых вопросов по вашим ответам.'),
      t('Четыре качества и профессиональные навыки показаны отдельно, с цитатами и областями роста.'),
      t('Практики на 30 дней и предложенные темы для изучения в BuildEX или BIU помогают выбрать следующий шаг.'),
    ][index]! : t(step.copy),
  }))
  return { t, lead, stepItems }
}

function archetypeCode(thinking: 'high' | 'low', confidence: 'high' | 'low', discipline: 'high' | 'low', engagement: 'high' | 'low') {
  return POLES.criticalThinking[thinking].letter + POLES.confidence[confidence].letter + POLES.discipline[discipline].letter + POLES.engagement[engagement].letter
}

/** Матрица архетипов — та же таблица, что на главной; оформление передаёт вариант. */
function ArchetypeMatrix({ classes }: { readonly classes: { readonly table?: string; readonly code?: string; readonly corner?: string; readonly srOnly?: string } }) {
  const { t, code: showCode } = useI18n()
  return <table className={classes.table}>
    <caption className={classes.srOnly}>{t('Матрица архетипов по полюсам качеств')}</caption>
    <thead><tr><td className={classes.corner} />{columns.map(([discipline, engagement]) => <th scope="col" key={discipline + engagement}>
      {t(POLES.discipline[discipline].name)}<br />{t(POLES.engagement[engagement].name).toLowerCase()}</th>)}</tr></thead>
    <tbody>{rows.map(([thinking, confidence], rowIndex) => <tr key={thinking + confidence}>
      <th scope="row">{t(POLES.criticalThinking[thinking].name)}<br />{t(POLES.confidence[confidence].name).toLowerCase()}</th>
      {columns.map(([discipline, engagement], columnIndex) => {
        const code = archetypeCode(thinking, confidence, discipline, engagement)
        return <td key={code} style={order(rowIndex + columnIndex)} data-spot=""><span className={classes.code}>{showCode(code)}</span>{ARCHETYPES[code] && t(ARCHETYPES[code].name)}</td>
      })}
    </tr>)}</tbody>
  </table>
}

/** Разбивает строку на слова для каскадного появления (в духе SplitText из React Bits). Читалке отдаём целую строку. */
function SplitWords({ text, className }: { readonly text: string; readonly className?: string | undefined }) {
  return <><span className={className} aria-hidden="true">{text.split(' ').map((word, index) => <span key={index} style={order(index)}>{word} </span>)}</span>
    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{text}</span></>
}


/** Чертёж под лупой в крупной карточке «Критическое мышление»: лупа проходит по арматурной сетке и отмечает проверенные узлы. */
function InspectionArt({ className }: { readonly className?: string | undefined }) {
  return <svg className={className} viewBox="0 0 320 170" aria-hidden="true" focusable="false">
    <g strokeLinecap="round">
      {[0, 1, 2, 3, 4, 5, 6].map((column) => <line key={`v${column}`} x1={30 + column * 44} y1="14" x2={30 + column * 44} y2="156" />)}
      {[0, 1, 2, 3].map((row) => <line key={`h${row}`} x1="16" y1={30 + row * 38} x2="304" y2={30 + row * 38} />)}
    </g>
    {([[74, 68], [162, 106], [250, 68]] as const).map(([x, y], index) => <g key={index} data-check="" style={order(index)}>
      <circle cx={x} cy={y} r="11" /><path d={`M${x - 5} ${y} l3.5 3.5 l6.5 -7`} />
    </g>)}
    <g data-lens="">
      <circle cx="0" cy="0" r="26" /><line x1="18" y1="18" x2="38" y2="38" />
    </g>
  </svg>
}

/** Счётчик от нуля до значения, когда блок попадает в экран (CountUp). */
function CountUp({ to }: { readonly to: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(to)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return
    setValue(0)
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      observer.disconnect()
      const start = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / 1400)
        setValue(Math.round(to * (1 - (1 - progress) ** 3)))
        if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [to])
  return <span ref={ref}>{value}</span>
}

export function HomePage() {
  const { t, lead, stepItems } = useHomeCopy()
  const { code: showCode } = useI18n()
  const homeRef = useReveal<HTMLDivElement>()
  const heroRef = usePointerParallax<HTMLElement>()
  const startRef = useMagnetic<HTMLAnchorElement>()
  const stats = [
    { value: 15, label: t('каждая ситуация — этаж вашего профиля') },
    { value: 4, label: t('Четыре качества, которые видно по решениям') },
    { value: 16, label: t('16 рабочих архетипов') },
    { value: 30, label: t('Работайте по плану') },
  ]
  return <div className={styles.home} ref={homeRef} onPointerMove={trackSpotlight}>
    <div className={styles.backdrop} aria-hidden="true">
      {/* Частицы из React Bits с настройками пользователя; размыты, чтобы лечь в фон вместе с огнями. */}
      <Particles className={styles.particles} particleColors={['#ffffff']} particleCount={1010} particleSpread={12} speed={0.1} particleBaseSize={20}
        glow={0.4} twinkle={0.2} moveParticlesOnHover={false} hoverEffect="repel" drift="up" driftSpeed={0.1} connections clickBurst={false}
        lightMode={false} pixelRatio={undefined} style={undefined} />
      <div className={styles.orbs}><i /><i /><i /></div></div>
    <section className={styles.hero} aria-labelledby="hero-title" ref={heroRef}>
      <div className={styles.copy}>
        <p className={styles.situation}><span className={styles.live} />{t('Ситуация 1 из 15')}</p>
        <h1 id="hero-title"><SplitWords className={styles.words} text={t('Ночью −20 °C, бетон уже выехал, а прогрев не готов. Что вы сделаете?')} /></h1>
        <p className={styles.lead}>{lead}</p>
        <div className={styles.actions}>
          <Link className={styles.start} to="/intro" ref={startRef}>{t('Начать знакомство')}<span aria-hidden="true">→</span></Link>
          <Link className={styles.more} to="/demo">{t('Посмотреть пример профиля')}</Link>
        </div>
      </div>
      <div className={styles.art} aria-hidden="true">
        <div className={styles.sheet}><ConstructionScene className={styles.scene ?? ''} /></div>
        {qualities.map((item, index) => <span className={styles.float} style={order(index)} key={item.id}><b>{showCode(POLES[item.id].high.letter)}</b>{t(item.label)}</span>)}
      </div>
    </section>

    <dl className={styles.stats} data-reveal="">{stats.map((stat, index) => <div key={stat.value} style={order(index)}>
      <dt><CountUp to={stat.value} /></dt><dd>{stat.label}</dd>
    </div>)}</dl>

    <section className={styles.section} aria-labelledby="qualities-title">
      <div className={styles.head} data-reveal="">
        <h2 id="qualities-title">{t('Четыре качества, которые видно по решениям')}</h2>
        <p>{t('Каждое качество считается отдельно. У каждого два полюса, и оба — рабочие стили, а не оценка.')}</p>
      </div>
      <div className={styles.bento} data-reveal="">{qualities.map((item, index) => <article className={styles.card} style={order(index)} key={item.id} data-spot="">
        <span className={styles.num}>0{index + 1}</span>
        <h3>{t(item.label)}</h3>
        <p>{t(item.copy)}</p>
        {index === 0 && <InspectionArt className={styles.cardArt} />}
        <p className={styles.poles}><span><b>{showCode(POLES[item.id].high.letter)}</b>{t(POLES[item.id].high.name)}</span><i aria-hidden="true" /><span><b>{showCode(POLES[item.id].low.letter)}</b>{t(POLES[item.id].low.name)}</span></p>
      </article>)}</div>
    </section>

    <section className={styles.section} aria-labelledby="steps-title">
      <h2 id="steps-title" className={styles.title} data-reveal="">{t('Как это устроено')}</h2>
      <ol className={styles.timeline} data-reveal="">{stepItems.map((step, index) => <li key={step.title} style={order(index)}>
        <span className={styles.dot} aria-hidden="true">{index + 1}</span>
        <h3>{step.title}</h3><p>{step.copy}</p>
      </li>)}</ol>
    </section>

    <section className={styles.section} aria-labelledby="archetypes-title">
      <div className={styles.head} data-reveal="">
        <h2 id="archetypes-title">{t('16 рабочих архетипов')}</h2>
        <p>{t('Сочетание полюсов даёт код из четырёх букв и тип — от «Главного инженера» до «Внимательного наблюдателя». Плохих типов нет: у каждого свои сильные стороны и риски.')}</p>
      </div>
      <div className={styles.matrixWrap} data-reveal=""><ArchetypeMatrix classes={styles} /></div>
    </section>

    {/* Финальный блок: две дороги — сотруднику к тесту, руководителю к кабинету команды. */}
    <section className={styles.finale} aria-labelledby="finale-title" data-reveal="">
      <div className={styles.finaleMain}>
        <h2 id="finale-title">{t('Готовы посмотреть на свои решения со стороны?')}</h2>
        <p>{t('Пройдите тест, получите профиль из четырёх качеств и план развития на 30 дней. Результаты сохраняются в вашем аккаунте.')}</p>
        <div className={styles.finaleActions}>
          <Link className={styles.start} to="/intro">{t('Перейти к тесту')}<span aria-hidden="true">→</span></Link>
          <Link className={styles.more} to="/demo">{t('Посмотреть пример результата')}</Link>
        </div>
      </div>
      <div className={styles.finaleSide}>
        <p className={styles.finaleKicker}>{t('Руководителю участка:')}</p>
        <p>{t('Команда, карточки развития сотрудников, маршруты и беседы — в одном кабинете.')}</p>
        <div className={styles.finaleLinks}>
          <Link to="/team/demo">{t('Пример кабинета руководителя')}<span aria-hidden="true">→</span></Link>
          <Link to="/register?role=manager">{t('Создать кабинет руководителя')}<span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </section>
  </div>
}
