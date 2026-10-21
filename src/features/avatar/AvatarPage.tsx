import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ANIMALS, AVATAR_EXAMPLES, AVATAR_OPTIONS, AVATAR_QUESTIONS } from '../../content/avatar'
import type { AvatarQuestionKey } from '../../content/avatar'
import { getArchetype } from '../../domain/archetype'
import { animalOf, avatarName, avatarPortrait, DEFAULT_AVATAR, parseDescription, SKIN_TONES } from '../../domain/avatar'
import type { AvatarKey, AvatarParams } from '../../domain/avatar'
import type { AssessmentResult } from '../../domain/types'
import { TRAIT_IDS } from '../../domain/types'
import { useI18n } from '../../i18n/context'
import { msg } from '../../i18n/translate'
import { ArchetypeCharacter } from '../../ui/ArchetypeCharacter'
import { AvatarFigure } from '../../ui/AvatarFigure'
import { Button, Eyebrow, Page } from '../../ui/primitives'
import { useAvatarChoice } from '../../ui/use-avatar'
import { useTraitLabels } from '../../ui/use-labels'
import styles from './AvatarPage.module.css'

type Mode = 'start' | 'quiz' | 'text' | 'result'

const KEY_LABELS: Readonly<Record<AvatarKey, string>> = {
  universe: msg('Вселенная'), animal: msg('Животное'), gender: msg('Пол'), palette: msg('Стиль'),
  role: msg('Роль'), action: msg('В сложной ситуации'), motivation: msg('Мотивация'), power: msg('Суперсила'),
}
const GROUPS = { look: msg('Как выглядит аватар'), character: msg('Каким его делает характер') } as const

/** Применяет разобранное описание, не трогая параметры, которые сотрудник поменял вручную. */
function applyParsed(base: AvatarParams, text: string, manual: ReadonlySet<AvatarKey>): AvatarParams {
  const { values } = parseDescription(text)
  const next: Record<string, unknown> = { ...base }
  for (const key of [...Object.keys(AVATAR_OPTIONS), 'animal'] as AvatarKey[]) {
    if (manual.has(key)) continue
    next[key] = values[key] ?? (key === 'animal' ? null : base[key])
  }
  if (next.universe !== 'Животные') next.animal = null
  return next as unknown as AvatarParams
}

export function AvatarPage({ result, backTo = '/results', required = false }: { readonly result: AssessmentResult; readonly backTo?: string; readonly required?: boolean }) {
  const { t, code: showCode } = useI18n()
  const labels = useTraitLabels()
  const profile = getArchetype(result)
  const [choice, saveChoice] = useAvatarChoice()
  const [mode, setMode] = useState<Mode>('start')
  const [question, setQuestion] = useState(0)
  // На телефоне «Далее» внизу листа: следующий вопрос показываем с начала, под закреплённым предпросмотром.
  const panelRef = useRef<HTMLElement>(null)
  const shownQuestion = useRef(question)
  useEffect(() => {
    if (shownQuestion.current === question) return
    shownQuestion.current = question
    const panel = panelRef.current
    const preview = panel?.closest('div')?.parentElement?.querySelector('aside')
    if (!panel || panel.getBoundingClientRect().top >= (preview && getComputedStyle(preview).position === 'sticky' ? preview.offsetHeight : 0)) return
    panel.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }, [question])
  const [params, setParams] = useState<AvatarParams>(choice.kind === 'custom' ? choice.params : DEFAULT_AVATAR)
  const [text, setText] = useState(choice.kind === 'custom' && choice.description ? choice.description : AVATAR_EXAMPLES[0]!.text)
  const [manual, setManual] = useState<ReadonlySet<AvatarKey>>(new Set())
  const [kind, setKind] = useState<'test' | 'custom'>(choice.kind)
  const [notice, setNotice] = useState<string | null>(null)

  const update = (patch: Partial<AvatarParams>) => { setParams((current) => ({ ...current, ...patch })); setNotice(null) }
  const startCustom = (next: Mode) => {
    setKind('custom'); setNotice(null)
    if (next === 'text') setParams((current) => applyParsed(current, text, manual))
    if (next === 'quiz') setQuestion(0)
    setMode(next)
  }
  const keepTest = () => { setKind('test'); setNotice(saveChoice({ kind: 'test' }) ? t('Аватар сохранён в профиле.') : t('Не удалось сохранить аватар в этом браузере.')); setMode('result') }
  const saveCustom = () => setNotice(saveChoice({ kind: 'custom', params, description: text }) ? t('Аватар сохранён в профиле.') : t('Не удалось сохранить аватар в этом браузере.'))

  const name = avatarName(params, t)
  const current = AVATAR_QUESTIONS[question]!
  const parsed = parseDescription(text)
  const parsedKeys = ([...Object.keys(AVATAR_OPTIONS), 'animal'] as AvatarKey[])
    .filter((key) => key !== 'animal' || params.universe === 'Животные')
  const cycle = (key: AvatarKey) => {
    const options: readonly (string | null)[] = key === 'animal' ? [null, ...ANIMALS] : AVATAR_OPTIONS[key]
    const next = options[(options.indexOf(params[key]) + 1) % options.length] ?? null
    update(key === 'universe' && next !== 'Животные' ? { universe: next as AvatarParams['universe'], animal: null } : { [key]: next } as unknown as Partial<AvatarParams>)
    setManual((set) => new Set(set).add(key))
  }

  const testFigure = <ArchetypeCharacter code={profile.code} size={380} label={t('Персонаж по тесту: {name}', { name: t(profile.archetype.name) })} />
  const customFigure = (size: number) => <AvatarFigure params={params} size={size} label={t('Аватар: {name}', { name })} />

  return <Page className={styles.page}>
    <header className={styles.header}>
      <Eyebrow>{t('Аватар')}</Eyebrow>
      <h1>{t('Ваш аватар в профиле')}</h1>
      <p>{required ? t('Ваш герой создан по семи ответам и хранится в профиле. Здесь его можно изменить.')
        : t('По результатам теста вам выдан один из 16 персонажей: он отражает ваши качества. Можно оставить его или создать своего героя.')}</p>
    </header>

    {mode === 'start' && <div className={styles.choices}>
      {!required && <section className={styles.testChoice} aria-labelledby="test-choice-title">
        <div className={styles.stage}>{testFigure}</div>
        <div className={styles.choiceBody}>
          <p className={styles.badge}>{choice.kind === 'test' ? t('Сейчас в профиле') : t('Выдан по тесту')}</p>
          <p className={styles.code}>{showCode(profile.code)}</p>
          <h2 id="test-choice-title">{t(profile.archetype.name)}</h2>
          <p>{t(profile.archetype.tagline)}</p>
          <Button type="button" className={styles.accentButton} onClick={keepTest}>{t('Оставить этого персонажа')}</Button>
        </div>
      </section>}
      <section className={styles.customChoice} aria-labelledby="custom-choice-title">
        <div className={styles.customStage}>{choice.kind === 'custom' ? customFigure(260) : <span className={styles.silhouette} aria-hidden="true">?</span>}</div>
        <div className={styles.choiceBody}>
          {choice.kind === 'custom' && <p className={styles.badgeLight}>{t('Сейчас в профиле')}</p>}
          <h2 id="custom-choice-title">{t('Создать своего героя')}</h2>
          <p>{t('7 вопросов или описание своими словами. Код теста останется в профиле, меняется только картинка.')}</p>
          {choice.kind === 'custom' && <dl className={styles.heroFacts}>{(['universe', 'animal', 'gender', 'palette', 'role', 'action', 'motivation', 'power'] as const)
            .filter((key) => key !== 'animal' || choice.params.universe === 'Животные').map((key, index) => <div key={key} style={{ '--i': index } as CSSProperties}>
              <dt>{t(KEY_LABELS[key])}</dt><dd>{t(key === 'animal' ? animalOf(choice.params) : choice.params[key])}</dd></div>)}</dl>}
          <div className={styles.row}>
            <Button type="button" onClick={() => startCustom('quiz')}>{t('По вопросам')}</Button>
            <Button type="button" tone="secondary" onClick={() => startCustom('text')}>{t('Описать словами')}</Button>
          </div>
        </div>
      </section>
    </div>}

    {(mode === 'quiz' || mode === 'text') && <div className={styles.builder}>
      <div className={styles.builderMain}>
        <div className={styles.tabs} role="group" aria-label={t('Способ создания')}>
          <button type="button" aria-pressed={mode === 'quiz'} onClick={() => startCustom('quiz')}>{t('По вопросам')}</button>
          <button type="button" aria-pressed={mode === 'text'} onClick={() => startCustom('text')}>{t('Описать словами')}</button>
        </div>

        {mode === 'quiz' && <section ref={panelRef} className={styles.panel} aria-labelledby="question-title">
          <div className={styles.panelHead}>
            <Eyebrow>{t(GROUPS[current.group])}</Eyebrow>
            <ol className={styles.dots}>{AVATAR_QUESTIONS.map((item, index) => <li key={item.key}>
              <button type="button" aria-label={t('Вопрос {n} из {total}', { n: index + 1, total: AVATAR_QUESTIONS.length })}
                aria-current={index === question ? 'step' : undefined} data-done={index < question || undefined} onClick={() => setQuestion(index)} />
            </li>)}</ol>
          </div>
          <p className={styles.counter}>{t('Вопрос {n} из {total}', { n: question + 1, total: AVATAR_QUESTIONS.length })}</p>
          <h2 id="question-title">{t(current.title)}</h2>
          <div className={styles.options} role="radiogroup" aria-labelledby="question-title">
            {(AVATAR_OPTIONS[current.key] as readonly string[]).map((option, index) => {
              const selected = params[current.key as AvatarQuestionKey] === option
              return <button key={option} type="button" role="radio" aria-checked={selected} className={styles.option}
                onClick={() => update(current.key === 'universe' ? { universe: option as AvatarParams['universe'], animal: option === 'Животные' ? params.animal : null } : { [current.key]: option } as unknown as Partial<AvatarParams>)}>
                <span><strong>{t(option)}</strong><small>{t(current.hints[index] ?? '')}</small></span>
                <span aria-hidden="true">{selected ? '✓' : ''}</span>
              </button>
            })}
          </div>
          {current.key === 'gender' && params.universe !== 'Животные' && <div className={styles.skins} role="radiogroup" aria-label={t('Тон кожи')}>
            <span>{t('Тон кожи')}</span>
            {SKIN_TONES.map((tone, index) => <button key={tone} type="button" role="radio" aria-checked={params.skin === tone}
              aria-label={t('Тон кожи {n}', { n: index + 1 })} style={{ background: tone }} onClick={() => update({ skin: tone })} />)}
          </div>}
          <div className={styles.nav}>
            <Button type="button" tone="secondary" onClick={() => question === 0 ? setMode('start') : setQuestion(question - 1)}>{t('Назад')}</Button>
            <Button type="button" onClick={() => question === AVATAR_QUESTIONS.length - 1 ? setMode('result') : setQuestion(question + 1)}>
              {question === AVATAR_QUESTIONS.length - 1 ? t('Собрать героя') : t('Далее')}</Button>
          </div>
        </section>}

        {mode === 'text' && <section className={styles.panel} aria-labelledby="describe-title">
          <h2 id="describe-title">{t('Опишите героя своими словами')}</h2>
          <p className={styles.muted}>{t('Внешность, характер, что вас мотивирует. Система найдёт параметры, остальное можно поправить вручную.')}</p>
          <label className={styles.srOnly} htmlFor="avatar-description">{t('Описание героя')}</label>
          <textarea id="avatar-description" className={styles.textarea} rows={4} maxLength={600} value={text}
            onChange={(event) => { const value = event.target.value; setText(value); setParams((base) => applyParsed(base, value, manual)); setNotice(null) }} />
          <div className={styles.examples}><span>{t('Примеры:')}</span>
            {AVATAR_EXAMPLES.map((example) => <button key={example.label} type="button"
              onClick={() => { setText(example.text); setManual(new Set()); setParams((base) => applyParsed(base, example.text, new Set())) }}>{t(example.label)}</button>)}
          </div>
          <h3 className={styles.parsedTitle}>{t('Что поняла система')}</h3>
          <p className={styles.muted}>{t('Нажмите на параметр, чтобы сменить значение.')}</p>
          <ul className={styles.parsed}>{parsedKeys.map((key) => {
            const word = parsed.matches[key]
            const source = manual.has(key) ? 'manual' : word ? 'text' : 'default'
            return <li key={key}><button type="button" data-source={source} onClick={() => cycle(key)}>
              <small>{t(KEY_LABELS[key])}</small>
              <strong>{t(key === 'animal' ? animalOf(params) : params[key])}</strong>
              <small>{source === 'manual' ? t('изменено вручную') : word ? t('из слова «{word}»', { word }) : key === 'animal' ? t('по роли') : t('по умолчанию')}</small>
            </button></li>
          })}</ul>
          <div className={styles.nav}><span /><Button type="button" onClick={() => setMode('result')}>{t('Собрать героя')}</Button></div>
        </section>}
      </div>

      <aside className={styles.preview} aria-label={t('Живой предпросмотр')}>
        <p>{t('Живой предпросмотр')}</p>
        {/* Ключ по параметрам: после каждого выбора фигура коротко «подпрыгивает» (на телефоне), чтобы изменение было заметно. */}
        <AvatarFigure key={JSON.stringify(params)} params={params} size={420} label={t('Аватар: {name}', { name })} />
        <strong>{name}</strong>
        <span>{t(params.universe)} · {t(params.role)} · {t(params.power)}</span>
      </aside>
    </div>}

    {mode === 'result' && <div className={styles.result}>
      <section className={styles.card} aria-labelledby="avatar-card-title">
        <p className={styles.cardHead}><span>{t('Личная карточка')}</span><span className={styles.cardCode}>{showCode(profile.code)}</span></p>
        <div className={styles.cardStage}>{kind === 'test' ? testFigure : customFigure(380)}</div>
        <div className={styles.cardBody}>
          <Eyebrow>{kind === 'test' ? t('Персонаж по тесту') : t('Свой аватар')}</Eyebrow>
          <h2 id="avatar-card-title">{kind === 'test' ? t(profile.archetype.name) : name}</h2>
        </div>
      </section>
      <div className={styles.resultBody}>
        <h2>{t('Портрет характера')}</h2>
        <ul className={styles.tags}>{kind === 'test'
          ? TRAIT_IDS.map((id) => <li key={id}><b>{showCode(profile.poles[id].letter)}</b> {t(profile.poles[id].name)}</li>)
          : (['universe', 'palette', 'motivation', 'power'] as const).map((key) => <li key={key}><small>{t(KEY_LABELS[key])}:</small> {t(params[key])}</li>)}</ul>
        <ul className={styles.portrait}>{(kind === 'test'
          ? TRAIT_IDS.map((id) => ({ name: labels.traitNames[id], value: result.traits[id].percent }))
          : avatarPortrait(params)).map((line) => <li key={line.name}>
          <span>{t(line.name)}</span><span className={styles.bar} aria-hidden="true"><i style={{ width: `${line.value}%` }} /></span><b>{line.value}</b>
        </li>)}</ul>
        <p className={styles.note}>{t('Портрет — дополнительный ориентир для руководителя: он помогает лучше узнать сотрудника, но не заменяет оценку.')}</p>
        {notice && <p className={styles.notice} role="status">{t(notice)}</p>}
        <div className={styles.row}>
          {kind === 'custom' && <Button type="button" onClick={saveCustom}>{t('Сохранить в профиль')}</Button>}
          {kind === 'custom' && <Button type="button" tone="secondary" onClick={() => startCustom('quiz')}>{t('Изменить ответы')}</Button>}
          {kind === 'custom' && !required && <Button type="button" tone="secondary" onClick={keepTest}>{t('Вернуть персонажа по тесту')}</Button>}
          {kind === 'test' && <Button type="button" tone="secondary" onClick={() => startCustom('quiz')}>{t('Создать своего героя')}</Button>}
          <Link className={styles.back} to={backTo}>{t('Вернуться к профилю')}</Link>
        </div>
      </div>
    </div>}
  </Page>
}
