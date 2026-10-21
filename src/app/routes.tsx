import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { AssessmentResult, DevelopmentPlan } from '../domain/types'
import { I18nProvider } from '../i18n/I18nProvider'
import { useI18n } from '../i18n/context'
import { msg } from '../i18n/translate'
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AssessmentFlow } from '../features/assessment/AssessmentFlow'
import { createAssessmentSession, isAssessmentModuleReady } from '../features/assessment/session'
import type { AssessmentModule } from '../features/assessment/session'
import { browserStorage } from '../storage/shared'
import type { StorageProvider } from '../storage/shared'
import { AssessmentContext, useAssessment } from './assessment-context'
import { assessmentModule } from './assessment-module'
import { PrintableReport } from './PrintableReport'
import { DemoPage } from './DemoPage'
import { AttemptHistory } from './AttemptHistory'
import { IntroPage } from './IntroPage'
import { EthicsPage } from './EthicsPage'
import { createDevelopmentSessions } from './development-session'
import { DevelopmentPage } from '../features/development/DevelopmentPage'
import { HomePage } from '../features/landing/HomePage'
import { PageBackdrop } from '../ui/PageBackdrop'
import { TeamPage } from '../features/team/TeamPage'
import { ResultsPage } from '../features/results/ResultsPage'
import { ShareCardPage } from '../features/share/ShareCardPage'
import { AvatarPage } from '../features/avatar/AvatarPage'
import { AvatarSetupPage } from '../features/avatar/AvatarSetupPage'
import { TypesPage } from '../features/types/TypesPage'
import { getArchetype } from '../domain/archetype'
import { QuestionCard } from '../ui/QuestionCard'
import { Button, Card, Page } from '../ui/primitives'
import { ProfileTools } from './ProfileTools'
import { SiteHeader } from './SiteHeader'
import { pages } from './site-nav'
import { useAuth } from '../auth/context'
import { AuthPage, RoleGate } from '../auth/AuthPage'
import { ManagerTeamsPage } from '../auth/ManagerTeamsPage'
import { EmployeeAccountPage } from '../auth/EmployeeAccountPage'
import { AccountAttemptSync, RestoreAccount } from '../auth/AccountAssessment'
import { AccountAvatarSync } from '../auth/AvatarSync'
import { api } from '../auth/api'
import { accountStorage, PersonalStorageContext, temporaryStorage } from '../storage/personal'
import { RestoredAttemptsContext } from '../auth/attempt-context'
import { DynamicAssessmentPage } from '../dynamic/DynamicAssessmentPage'
import { DynamicResultsPage } from '../dynamic/DynamicResultsPage'
import { DynamicDevelopmentPage } from '../dynamic/DynamicDevelopmentPage'
import { DynamicAvatarPage } from '../dynamic/DynamicAvatarPage'
import { LegacyHistoryPage } from '../dynamic/LegacyHistoryPage'
import { EmployeeDemoPage } from '../dynamic/EmployeeDemoPage'
import { ManagerDemoPage } from '../auth/ManagerDemoPage'
import { useScrollReveal } from './scroll-reveal'
import styles from './Shell.module.css'
import notFound from './NotFound.module.css'

/** Страницы, где показаны тексты из данных (ситуации, рекомендации, архетипы): для казахского они пока только на русском. */
const russianContentPaths = ['/assessment', '/results', '/development', '/demo', '/print', '/card', '/types', '/avatar', '/ethics']
/** Для английского по-русски остаётся только сам тест; на экране вопроса пометки нет, чтобы не менять его вид. */
const englishNoticePaths = ['/results', '/demo', '/print']
/** Ссылки подвала: справочные разделы и примеры, доступные без входа. */
const FOOTER_LINKS = [['/', msg('Главная')], ['/types', msg('16 типов')], ['/demo', msg('Пример профиля')], ['/team/demo', msg('Пример команды')], ['/ethics', msg('Этика и данные')]] as const
/** Browser regression suite for the archived v2 flow; production always uses the dynamic flow. */
const legacyBrowserSuite = import.meta.env.MODE === 'playwright-legacy'

function Shell() {
  const { pathname } = useLocation()
  const { enabled: accountsEnabled } = useAuth()
  const { lang, t } = useI18n()
  const contentNotice = lang === 'kk' && russianContentPaths.includes(pathname)
    ? t('Интерфейс переведён на казахский язык. Ситуации теста, обоснования баллов, рекомендации и названия архетипов пока на русском: их перевод должен проверить носитель языка.')
    : lang === 'en' && englishNoticePaths.includes(pathname)
      ? t('Интерфейс переведён на английский язык. Ситуации теста, варианты ответов, обоснования баллов и ответы в примерах показаны на русском.')
      : null
  const mainRef = useRef<HTMLElement>(null)
  // У главной своё появление блоков, поэтому общее там выключено.
  useScrollReveal(mainRef, pathname, pathname !== '/')
  useEffect(() => {
    const known = pages.find((page) => page.path === pathname)?.title
      ?? ({ '/print': msg('Печать профиля'), '/card': msg('Карточка профиля'), '/avatar': msg('Аватар'), '/avatar/setup': msg('Создание героя'), '/assessment': msg('Прохождение теста'), '/results/legacy': msg('Результаты прежней методики'), '/login': msg('Вход'),
        '/register': msg('Регистрация'), '/account': msg('Личный кабинет'), '/team/demo': msg('Пример команды') }[pathname] ?? msg('Страница не найдена'))
    document.title = `${t(known)} · BI Academy`
  }, [pathname, t])
  useEffect(() => {
    // Фокус для экранных читалок без прокрутки: шапка и навигация остаются видны.
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo?.({ top: 0 })
  }, [pathname])

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main-content" data-no-print>{t('К содержанию')}</a>
      {!['/', '/login', '/register'].includes(pathname) && <PageBackdrop />}
      <SiteHeader />
      <AccountAttemptSync />
      <AccountAvatarSync />
      {contentNotice && <p className={styles.contentNotice} role="note" data-no-print>{contentNotice}</p>}
      <main id="main-content" ref={mainRef} tabIndex={-1}><Outlet /></main>
      <footer data-app-chrome className={styles.footer}>
        <p>{accountsEnabled && !legacyBrowserSuite
          ? t('BI Academy: 10 ситуаций с вариантами, 5 открытых вопросов и четыре качества. Вопросы, сохранённые ответы и результаты хранятся в аккаунте.')
          : t('BI Academy: 15 рабочих ситуаций, четыре качества и 16 архетипов. Черновик хранится в браузере, завершённые результаты — в аккаунте.')}</p>
        <nav aria-label={t('Разделы сайта')}>{FOOTER_LINKS.map(([path, title]) => <Link key={path} to={path}>{t(title)}</Link>)}</nav>
      </footer>
    </div>
  )
}

function AssessmentPlaceholder() {
  const { t } = useI18n()
  return <>
    <h1>{t('Тест готовится')}</h1>
    <p>{t('Здесь появятся 15 строительных ситуаций. Вопросы и правила расчёта проходят подготовку.')}</p>
    <Link to="/intro">{t('Вернуться к описанию')}</Link>
  </>
}

function AssessmentPage() {
  const { session } = useAssessment()
  const { enabled } = useAuth()
  const navigate = useNavigate()
  if (enabled && !legacyBrowserSuite) return <DynamicAssessmentPage />
  return <Page>{session ? <AssessmentFlow session={session} onComplete={() => navigate('/results', { state: { justCompleted: true } })}
    renderQuestion={(props) => <QuestionCard {...props} />} /> : <AssessmentPlaceholder />}</Page>
}

function ResultsEntry() {
  const { t } = useI18n()
  const { enabled } = useAuth()
  const { snapshot } = useAssessment()
  if (enabled && !legacyBrowserSuite) return <DynamicResultsPage />
  return snapshot?.result ? <ProfilePage /> : <Page><Card><h1>{t('Сначала пройдите тест')}</h1><Link to="/intro">{t('Перейти к началу')}</Link></Card></Page>
}

function DevelopmentEntry({ controllers }: { readonly controllers: ReturnType<typeof createDevelopmentSessions> }) {
  const { t } = useI18n()
  const { enabled } = useAuth()
  const { snapshot } = useAssessment()
  if (enabled && !legacyBrowserSuite) return <DynamicDevelopmentPage />
  return snapshot?.result ? <DevelopmentRoute controllers={controllers} /> : <Page><Card><h1>{t('Сначала пройдите тест')}</h1><Link to="/intro">{t('Перейти к началу')}</Link></Card></Page>
}

function TypesRoute() {
  const { snapshot } = useAssessment()
  return <TypesPage result={snapshot?.result ?? null} />
}

function AvatarRoute() {
  const { snapshot } = useAssessment()
  const { enabled } = useAuth()
  const { t } = useI18n()
  if (enabled && !legacyBrowserSuite) return <DynamicAvatarPage />
  return snapshot?.result ? <AvatarPage result={snapshot.result} /> : <Page><Card><h1>{t('Сначала пройдите тест')}</h1>
    <Link to="/intro">{t('Перейти к началу')}</Link></Card></Page>
}

function AvatarOnboardingGate({ children }: { readonly children: React.ReactNode }) {
  const { t } = useI18n()
  const { enabled } = useAuth()
  const [state, setState] = useState<'loading' | 'ready' | 'required'>('loading')
  useEffect(() => {
    if (!enabled || legacyBrowserSuite) return
    let live = true
    api<{ avatar: unknown }>('/avatar').then(({ avatar }) => { if (live) setState(avatar ? 'ready' : 'required') })
      .catch(() => { if (live) setState('required') })
    return () => { live = false }
  }, [enabled])
  if (!enabled || legacyBrowserSuite || state === 'ready') return children
  if (state === 'required') return <Navigate to="/avatar/setup" replace />
  return <Page><p role="status">{t('Проверяем профиль…')}</p></Page>
}

function TeamRoute() {
  const { snapshot } = useAssessment()
  return <TeamPage ownResult={snapshot?.result ?? null} />
}

/** Примеры показывают действующие экраны; архивный набор браузерных тестов проверяет прежние. */
function DemoEntry() {
  const { enabled } = useAuth()
  return enabled && !legacyBrowserSuite ? <EmployeeDemoPage /> : <DemoPage />
}

function TeamDemoEntry() {
  const { enabled } = useAuth()
  return enabled && !legacyBrowserSuite ? <ManagerDemoPage /> : <TeamRoute />
}

function CompletedAttemptGate() {
  const { snapshot } = useAssessment()
  const { t } = useI18n()
  const result = snapshot?.result
  if (!result) return <Page><Card>
    <h1>{t('Сначала пройдите тест')}</h1>
    <p>{t('Профиль и маршрут появятся после ответов на все 15 вопросов.')}</p>
    <Link to="/intro">{t('Перейти к началу')}</Link>
  </Card></Page>
  return <>{snapshot?.historyNotice && <p role="status">{t(snapshot.historyNotice)}</p>}<Outlet context={result} /></>
}

function AttemptControls() {
  const { session, snapshot } = useAssessment()
  const { t } = useI18n()
  const navigate = useNavigate()
  if (!session || !snapshot?.result) return null
  const needsConfirmation = snapshot.recovery !== null
    || (snapshot.phase !== 'completed' && Object.keys(snapshot.draft.answers).length > 0)
  const confirmReset = () => !needsConfirmation
    || window.confirm(t('Заменить сохранённый черновик? Завершённые попытки сохранятся.'))
  return <Card className={styles.attemptControls}>
    <h2>{t('Продолжить работу с результатом')}</h2>
    <p><Link to="/development">{t('Перейти к действиям для развития')}</Link></p>
    <p><Link to="/print">{t('Печать / сохранить PDF')}</Link></p>
    <p>{t('Попыток в этом браузере: {count} (храним до 10).', { count: snapshot.attempts.length })}</p>
    <Button type="button" onClick={() => { if (confirmReset()) { session.startOver(); navigate('/assessment') } }}>{t('Пройти ещё раз')}</Button>
    <Button type="button" tone="secondary" onClick={() => {
      if (confirmReset() && session.editCompletedAttempt(snapshot.result?.attemptId ?? '')) navigate('/assessment')
    }}>{t('Исправить ответы')}</Button>
  </Card>
}

function ProfilePage() {
  const { session, snapshot } = useAssessment()
  const { t } = useI18n()
  let plan: DevelopmentPlan | null = null
  try { if (snapshot?.result) plan = session?.module.buildRecommendations?.(snapshot.result) ?? null } catch { /* Профиль остаётся доступным. */ }
  const shareSlot = snapshot?.result && session ? <>
    <ProfileTools result={snapshot.result} questions={session.module.questions} />
    <AttemptControls />
  </> : null
  return <>{snapshot?.historyNotice && <p role="status">{t(snapshot.historyNotice)}</p>}
    <ResultsPage result={snapshot?.result ?? null} questions={session?.module.questions ?? []} plan={plan}
      shareSlot={shareSlot} historySlot={<AttemptHistory key={snapshot?.result?.attemptId ?? 'draft'} />} /></>
}

function ConnectedDevelopment({ result, module, controllers }: {
  readonly result: AssessmentResult; readonly module: AssessmentModule; readonly controllers: ReturnType<typeof createDevelopmentSessions>
}) {
  const [controller] = useState(() => controllers.get(result, module.buildRecommendations))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return <DevelopmentPage {...state} onCompletedChange={controller.setCompleted} archetypeCode={getArchetype(result).code} />
}

function DevelopmentRoute({ controllers }: { readonly controllers: ReturnType<typeof createDevelopmentSessions> }) {
  const { session, snapshot } = useAssessment()
  return session && snapshot?.result ? <ConnectedDevelopment key={snapshot.result.attemptId}
    result={snapshot.result} module={session.module} controllers={controllers} /> : null
}

function PrintPage() {
  const { session, snapshot } = useAssessment()
  const { t } = useI18n()
  const result = snapshot?.result
  if (!session || !result) return null
  let plan = null
  try { plan = session.module.buildRecommendations?.(result) ?? null } catch { /* Сохраняем доступность четырёх показателей. */ }
  return <Page>
    <div data-no-print>
      <Button type="button" onClick={() => window.print()}>{t('Печать / сохранить PDF')}</Button>
      <p><Link to="/results">{t('Вернуться к профилю')}</Link></p>
    </div>
    <PrintableReport result={result} plan={plan} />
  </Page>
}

function NotFound() {
  const { t } = useI18n()
  return <Page><section className={notFound.sheet} aria-labelledby="not-found-title">
    <div>
      <p className={notFound.code} aria-hidden="true">404</p>
      <h1 id="not-found-title">{t('Страница не найдена')}</h1>
      <p>{t('Этот этаж ещё не построен: адрес устарел или в нём опечатка. Вернитесь на главную или продолжите с теста.')}</p>
      <div className={notFound.actions}>
        <Link className={notFound.home} to="/">{t('На главную')}</Link>
        <Link className={notFound.link} to="/intro">{t('Перейти к тесту')}</Link>
      </div>
    </div>
    {/* Кран держит знак «404»: знак покачивается, лента внизу бежит. Только украшение. */}
    <svg className={notFound.crane} viewBox="0 0 260 260" aria-hidden="true" focusable="false">
      <path className={notFound.steel} d="M60 250V30M60 30h170M60 30l40-22M100 8v22M60 30 20 50h40M60 70l-14-14M60 110l-14-14M60 150l-14-14M60 190l-14-14M60 230l-14-14M30 250h60" />
      <line className={notFound.cable} x1="180" y1="30" x2="180" y2="112" />
      <g className={notFound.sign}><path className={notFound.steel} d="M180 112l-30 18M180 112l30 18" /><rect x="140" y="130" width="80" height="44" rx="6" /><text x="180" y="161" textAnchor="middle">404</text></g>
    </svg>
    <span className={notFound.tape} aria-hidden="true" />
  </section></Page>
}

/** Подключаемый модуль стабилен на протяжении сессии; данные C подключаются в assessment-module.ts. */
function SessionRoutes({ module = assessmentModule, getStorage = browserStorage }: {
  readonly module?: AssessmentModule | null
  readonly getStorage?: StorageProvider
}) {
  const initialAttempts = useContext(RestoredAttemptsContext)
  const [session] = useState(() => isAssessmentModuleReady(module) ? createAssessmentSession({ module, getStorage, initialAttempts }) : null)
  const [developmentControllers] = useState(() => createDevelopmentSessions(getStorage))
  return <PersonalStorageContext value={getStorage}><AssessmentContext value={session}><Routes>
    <Route element={<Shell />}>
      <Route index element={<HomePage />} />
      <Route path="login" element={<AuthPage key="login" mode="login" />} />
      <Route path="register" element={<AuthPage key="register" mode="register" />} />
      <Route path="intro" element={<RoleGate><AvatarOnboardingGate><IntroPage getStorage={getStorage} clearDevelopment={developmentControllers.clear} /></AvatarOnboardingGate></RoleGate>} />
      <Route path="assessment" element={<RoleGate><AvatarOnboardingGate><AssessmentPage /></AvatarOnboardingGate></RoleGate>} />
      <Route path="assessment/new" element={<RoleGate><AvatarOnboardingGate><DynamicAssessmentPage /></AvatarOnboardingGate></RoleGate>} />
      <Route path="results" element={<RoleGate><ResultsEntry /></RoleGate>} />
      <Route path="results/new" element={<RoleGate><DynamicResultsPage /></RoleGate>} />
      <Route path="development" element={<RoleGate><DevelopmentEntry controllers={developmentControllers} /></RoleGate>} />
      <Route path="development/new" element={<RoleGate><DynamicDevelopmentPage /></RoleGate>} />
      <Route path="results/legacy" element={<RoleGate role="employee"><LegacyHistoryPage /></RoleGate>} />
      <Route path="demo" element={<DemoEntry />} />
      <Route path="team" element={<ManagerRoute />} />
      <Route path="team/demo" element={<TeamDemoEntry />} />
      <Route path="account" element={<RoleGate role="employee"><EmployeeAccountPage /></RoleGate>} />
      <Route path="types" element={<TypesRoute />} />
      <Route path="ethics" element={<EthicsPage />} />
      <Route path="avatar" element={<RoleGate><AvatarRoute /></RoleGate>} />
      <Route path="avatar/setup" element={<RoleGate><AvatarSetupPage /></RoleGate>} />
      <Route path="card" element={<ShareCardPage />} />
      <Route element={<RoleGate role="employee"><CompletedAttemptGate /></RoleGate>}>
        <Route path="development/legacy" element={<DevelopmentRoute controllers={developmentControllers} />} />
        <Route path="print" element={<PrintPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Route>
  </Routes></AssessmentContext></PersonalStorageContext>
}

function ManagerRoute() {
  const { enabled } = useAuth()
  return enabled ? <RoleGate role="manager"><ManagerTeamsPage /></RoleGate> : <TeamRoute />
}

function AccountRoutes({ module, getStorage }: { readonly module: AssessmentModule | null; readonly getStorage: StorageProvider }) {
  const { user, enabled, loading, error } = useAuth()
  const [personalStorage] = useState(() => enabled ? user ? accountStorage(user.id, getStorage) : temporaryStorage() : getStorage)
  if (loading || error) return <RoleGate><span /></RoleGate>
  return <RestoreAccount getStorage={personalStorage}><SessionRoutes module={module} getStorage={personalStorage} /></RestoreAccount>
}

export function AppRoutes({ module = assessmentModule, getStorage = browserStorage }: {
  readonly module?: AssessmentModule | null; readonly getStorage?: StorageProvider
}) {
  const { user, loading } = useAuth()
  return <I18nProvider getStorage={getStorage}><AccountRoutes key={loading ? 'loading' : user?.id ?? 'guest'} module={module} getStorage={getStorage} /></I18nProvider>
}
