import { useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TRAIT_IDS } from '../domain/types'
import { useReveal } from '../features/landing/motion'
import { useI18n } from '../i18n/context'
import { msg } from '../i18n/translate'
import { clearAppData } from '../storage/shared'
import type { StorageProvider } from '../storage/shared'
import { BuildingAnimation } from '../ui/BuildingAnimation'
import { ActionLink, Button, Eyebrow, Page, StatusMessage } from '../ui/primitives'
import { useTraitLabels } from '../ui/use-labels'
import { AttemptHistory } from './AttemptHistory'
import { useAssessment } from './assessment-context'
import styles from './IntroPage.module.css'
import { useAuth } from '../auth/context'
import { deleteAccountAttempts } from '../auth/api'
import { clearDynamicDrafts } from '../dynamic/storage'

/** Сколько ситуаций в тесте, пока вопросы не подключены (технический каркас). */
const FALLBACK_TOTAL = 15

const rules = [
  { title: msg('Честно, а не «как надо»'), copy: msg('Выбирайте то, что сделали бы сами, а не то, что принято или чего ждёт начальник. Иначе профиль покажет не вас. Если ответы похожи на выбор «как надо», в профиле появится подсказка перечитать их.') },
  { title: msg('Единственно верного ответа нет'), copy: msg('У решений разная цена: у каждого свои сильные стороны и риски. Выберите то, что ближе к вашему.') },
  { title: msg('Ответ можно исправить'), copy: msg('Кнопка «Назад» возвращает к предыдущей ситуации, а перед расчётом профиля открывается экран со всеми ответами.') },
] as const

const facts = [
  // Ориентир посчитан по объёму текста ситуаций (около 1700 слов), а не измерен на людях: после пилота цифру нужно уточнить.
  { value: msg('10–15 минут'), copy: msg('Ориентир по объёму текста. Торопиться не нужно: у теста нет таймера.') },
  { value: msg('Сохраняется сразу'), copy: msg('Каждый ответ записывается в браузере. Можно закрыть вкладку и продолжить позже на этом же устройстве.') },
  { value: msg('Клавиатура и телефон'), copy: msg('Всё доступно с клавиатуры: стрелки выбирают вариант, Пробел отмечает, Tab ведёт к «Далее», Enter подтверждает. Страница работает и на телефоне.') },
] as const

const outcomes = [
  { title: msg('Профиль из четырёх качеств'), copy: msg('Проценты по каждому качеству, радар и объяснение каждого балла.') },
  { title: msg('Рабочий архетип'), copy: msg('Один из 16 типов: код из четырёх букв, сильные стороны и риски. Плохих типов нет.') },
  { title: msg('План на 30 дней'), copy: msg('Четыре недели практик и коротких уроков. На 30-й день — повторный тест и сравнение.') },
] as const

/** Порядковый номер для каскада: CSS берёт задержку из `--i`. */
function order(index: number): CSSProperties {
  return { '--i': index } as CSSProperties
}

/** Знак условия прохождения: без таймера, сохранение, клавиатура и телефон. Чисто декоративный. */
function FactIcon({ index }: { readonly index: number }) {
  return <svg className={styles.factIcon} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
    {index === 0 ? <><circle cx="16" cy="17" r="10" stroke="currentColor" strokeWidth="2.2" /><path d="M16 11v6l4 3M13 4h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M6 27 26 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>
      : index === 1 ? <><path d="M9 24h14a6 6 0 0 0 .6-12 8 8 0 0 0-15.2 2A5 5 0 0 0 9 24Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /><path d="m12.5 17.5 2.8 2.8 5.2-5.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></>
      : <><rect x="3" y="9" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2.2" /><path d="M7 14h2M11 14h2M15 14h2M8 18h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><rect x="23" y="7" width="7" height="18" rx="2" stroke="currentColor" strokeWidth="2.2" /></>}
  </svg>
}

export function IntroPage({ getStorage, clearDevelopment }: { readonly getStorage: StorageProvider; readonly clearDevelopment: () => void }) {
  const { session, snapshot } = useAssessment()
  const auth = useAuth()
  const dynamic = auth.enabled && import.meta.env.MODE !== 'playwright-legacy'
  const { t } = useI18n()
  const labels = useTraitLabels()
  const navigate = useNavigate()
  // Временно: превью трёх вариантов дизайна (?v=a|b|c), после выбора останется один.
  const variant = useSearchParams()[0].get('v') ?? 'a'
  const spot = (event: PointerEvent<HTMLElement>) => { const box = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`); event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`) }
  const rootRef = useReveal<HTMLDivElement>()
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const answersCount = snapshot ? Object.keys(snapshot.draft.answers).length : 0
  const hasAnswers = !dynamic && !!snapshot && snapshot.phase !== 'completed' && answersCount > 0
  const completed = !dynamic && snapshot?.phase === 'completed' && snapshot.result !== null

  // Здание: по этажу на каждую ситуацию. Кран строит их по очереди, а в конце ставит печать «Успех».
  const questions = session?.module.questions ?? []
  const total = questions.length > 0 ? questions.length : FALLBACK_TOTAL

  return <Page>
    <div className={styles.intro} data-variant={variant} ref={rootRef}>
      <section className={styles.top} aria-labelledby="intro-title" onPointerMove={variant === 'a' ? spot : undefined}>
        <span className={styles.glow} aria-hidden="true" />
        <div className={styles.copy}>
          <Eyebrow>{dynamic ? t('10 ситуаций с вариантами · 5 открытых вопросов') : t('15 рабочих ситуаций · ориентир 10–15 минут')}</Eyebrow>
          <h1 id="intro-title">{t('Перед началом')}</h1>
          <p className={styles.lead}>{dynamic ? t('Вам предстоит 15 новых ситуаций со стройплощадки. В первых десяти выберите близкий подход из четырёх вариантов, на последние пять ответьте своими словами.') : t('Вам предстоит 15 коротких ситуаций со стройплощадки. В каждой выберите реакцию, которая ближе к тому, как вы действуете на самом деле.')}</p>
          {!session && <p>{t('Сейчас доступен технический каркас. Прохождение появится после подключения вопросов.')}</p>}
          {snapshot?.storageUnavailable && <StatusMessage warning>{t('Сохранение недоступно. Прогресс останется только в памяти до перезагрузки.')}</StatusMessage>}
          {hasAnswers && <p className={styles.draft}>{t('В черновике ответов: {count} из 15.', { count: answersCount })}</p>}
          <div className={styles.actions}>
            {dynamic ? <><ActionLink to="/assessment">{t('Начать или продолжить тест')}</ActionLink><ActionLink to="/results" tone="secondary">{t('История и результаты')}</ActionLink><ActionLink to="/account" tone="secondary">{t('Ввести код команды')}</ActionLink></> : <>
            {completed ? <ActionLink to="/results">{t('Открыть профиль')}</ActionLink>
              : <ActionLink to="/assessment">{session ? hasAnswers ? t('Продолжить тест') : t('Начать тест') : t('Перейти к тесту')}</ActionLink>}
            {session && completed && <Button type="button" tone="secondary" onClick={() => { session.startOver(); navigate('/assessment') }}>{t('Пройти ещё раз')}</Button>}
            {session && (hasAnswers || snapshot?.recovery) && <Button type="button" tone="secondary" onClick={() => {
              if (window.confirm(t('Сбросить активный черновик и начать заново? Завершённые попытки сохранятся.'))) {
                session.startOver(); navigate('/assessment')
              }
            }}>{t('Начать заново')}</Button>}
            </>}
          </div>
        </div>
        <div className={styles.art}><BuildingAnimation total={total} /></div>
      </section>
      {variant === 'b' && <div className={styles.tape} aria-hidden="true"><div>{[0, 1, 2, 3].map((copy) => <span key={copy}>{TRAIT_IDS.map((trait) => <b key={trait}>{labels.traitNames[trait]}</b>)}</span>)}</div></div>}

      <section className={styles.block} aria-labelledby="rules-title">
        <h2 id="rules-title" className={`${styles.title} ${styles.fade}`} data-reveal="">{t('Как отвечать')}</h2>
        <ul className={styles.rules} data-reveal="">{rules.map((rule, index) => <li key={rule.title} style={order(index)} onPointerMove={spot}>
          <h3>{dynamic && index === 2 ? t('Ответьте своими словами') : t(rule.title)}</h3><p>{dynamic
            ? [t('Выбирайте то, что сделали бы сами. Важен ваш подход, а не ожидаемый ответ.'), t('Оцените последствия каждого из четырёх готовых вариантов, включая безопасность, и выберите свой.'), t('В открытых вопросах опишите решение, причины и конкретные действия. Сохранённые ответы останутся в аккаунте.')][index]
            : t(rule.copy)}</p>
        </li>)}</ul>
        <p className={`${styles.note} ${styles.fade}`} data-reveal="">{t('Это самооценка по рабочим ситуациям, а не психологический диагноз. Результат не подтверждает квалификацию и не заменяет регламенты.')}</p>
      </section>

      <section className={styles.block} aria-labelledby="facts-title">
        <h2 id="facts-title" className={`${styles.title} ${styles.fade}`} data-reveal="">{t('Время и условия')}</h2>
        <dl className={styles.facts} data-reveal="">{facts.map((fact, index) => <div key={fact.value} style={order(index)}>
          <dt><FactIcon index={index} />{dynamic && index === 0 ? t('Без таймера') : t(fact.value)}</dt><dd>{dynamic
            ? [t('Торопиться не нужно. Открытым ответам уделите столько времени, сколько потребуется.'), t('Сохранённые ответы находятся в аккаунте; набираемый открытый ответ сохраняется в этом браузере.'), t('Вопросы доступны с клавиатуры и телефона. Можно вернуться к предыдущему вопросу с вариантами.')][index]
            : t(fact.copy)}</dd>
        </div>)}</dl>
      </section>

      <section className={styles.block} aria-labelledby="outcome-title">
        <h2 id="outcome-title" className={`${styles.title} ${styles.fade}`} data-reveal="">{t('Что вы получите')}</h2>
        <ol className={styles.outcomes} data-reveal="">{outcomes.map((outcome, index) => <li key={outcome.title} style={order(index)}>
          <h3>{t(outcome.title)}</h3>
          <p>{dynamic && index === 1 ? t('Ваш герой создан по отдельной анкете. Четыре качества и профессиональные навыки оцениваются по рабочему тесту.') : dynamic && index === 2 ? t('Четыре недели практик со сроками и критериями успеха. Затем — повторный тест и сравнение.') : t(outcome.copy)}</p>
          {index === 0 && <ul className={styles.traits} aria-label={t('Четыре качества')}>{TRAIT_IDS.map((trait) => <li key={trait}>{labels.traitNames[trait]}</li>)}</ul>}
        </li>)}</ol>
        <p className={`${styles.example} ${styles.fade}`} data-reveal="">
          <ActionLink to="/demo" tone="secondary">{t('Посмотреть пример профиля')}</ActionLink>
          <span>{t('Пример построен на вымышленных ответах.')}</span>
        </p>
      </section>

      <section className={`${styles.privacy} ${styles.fade}`} aria-labelledby="privacy-title" data-reveal="">
        <svg className={styles.lock} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
          <rect x="9" y="21" width="30" height="21" rx="4" stroke="currentColor" strokeWidth="2.5" />
          <path d="M15 21v-6a9 9 0 0 1 18 0v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M24 29v6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <div>
          <h2 id="privacy-title">{t('Кто видит ваши ответы')}</h2>
          {dynamic ? <><p>{t('Вопросы и сохранённые ответы хранятся в вашем аккаунте. Рабочая роль, ответы и ограниченная история отправляются OpenAI для генерации ситуаций и оценки.')}</p><p>{t('Руководитель видит результаты только после вашего согласия на доступ к данным команды.')}</p></> : auth.enabled ? <><p>{t('Черновик остаётся в этом браузере и привязан к вашему аккаунту. Завершённые результаты сохраняются на сервере и доступны после входа с другого устройства.')}</p>
            <p>{t('Если вы вступили в команду, её руководитель может видеть ваши результаты и ответы. Без команды доступ есть только у вас. Выйти из команды можно в личном кабинете.')}</p></>
            : <><p><strong>{t('Только вы.')}</strong> {t('Ответы, черновик и результат хранятся в этом браузере и не отправляются на сервер: ни работодатель, ни разработчики их не получают. Показать профиль другому человеку можно только самому: распечатать его, сохранить в PDF или отправить карточку профиля. В карточке только четыре процента, архетип и имя, которое вы введёте сами.')}</p>
              <p>{t('Данные не переходят на другие устройства и в другие браузеры. Если этим браузером пользуется кто-то ещё, он сможет открыть ваш профиль: сохраните его в PDF и удалите данные ниже.')}</p></>}
        </div>
      </section>

      <section className={`${styles.data} ${styles.fade}`} aria-labelledby="data-title" data-reveal="">
        <h2 id="data-title">{t('Ваши данные')}</h2>
        <p>{t(auth.enabled ? 'Удаление очистит ваши результаты на сервере, ответы и отметки на этом устройстве. Аккаунт и участие в команде сохранятся.'
          : 'Здесь можно стереть всё, что приложение сохранило в этом браузере: ответы, историю прохождений (хранится до 10 последних) и отметки действий. Выбранный язык интерфейса не стирается.')}</p>
        <p><Button type="button" tone="secondary" disabled={deleting} onClick={async () => {
          if (!window.confirm(t(auth.enabled ? 'Удалить все результаты из аккаунта и данные теста на этом устройстве?' : 'Удалить ответы, историю и отметки действий BI Academy из этого браузера?'))) return
          if (auth.enabled) {
            setDeleting(true)
            try { await deleteAccountAttempts(); if (auth.user) clearDynamicDrafts(auth.user.id) }
            catch (reason) { setDeleteNotice((reason as Error).message); setDeleting(false); return }
            setDeleting(false)
          }
          clearDevelopment()
          if (session) {
            session.deleteMyData()
            setDeleteNotice(session.getSnapshot().storageUnavailable
              ? t('Не удалось полностью очистить хранилище. Данные текущей сессии сброшены.') : t(auth.enabled ? 'Результаты удалены из аккаунта и с этого устройства.' : 'Данные BI Academy удалены из этого браузера.'))
          } else {
            setDeleteNotice(clearAppData(getStorage).ok ? t('Данные BI Academy удалены из этого браузера.') : t('Не удалось очистить хранилище браузера.'))
          }
        }}>{t('Удалить мои данные')}</Button></p>
        {deleteNotice && <p role="status">{deleteNotice}</p>}
      </section>
    </div>
    {!dynamic && <AttemptHistory key={snapshot?.result?.attemptId ?? 'draft'} />}
  </Page>
}
