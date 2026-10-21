import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import { ActionLink, Button, Card, Page } from '../ui/primitives'
import { usePointerParallax } from '../features/landing/motion'
import type { CSSProperties } from 'react'
import type { UserRole } from './api'
import { useAuth } from './context'
import styles from './AuthPage.module.css'
import { validateLogin, validateRegistration } from '../domain/account-validation'
import { ApiError } from './api'
import { clearFieldError, showFieldErrors } from './form-validation'
import { ConsentField } from './ConsentField'

/** Огни на заднем плане: положение, размер и скорость считаются по номеру, чтобы страница выглядела одинаково при каждом открытии. */
const lights = Array.from({ length: 18 }, (_, index) => ({
  x: `${(index * 29 + 6) % 94}%`,
  size: `${10 + (index * 7) % 26}px`,
  duration: `${14 + (index * 5) % 13}s`,
  delay: `${-((index * 11) % 17)}s`,
  sway: `${((index % 5) - 2) * 22}px`,
}))

export function AuthPage({ mode }: { readonly mode: 'register' | 'login' }) {
  const { user, login, register } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [role, setRole] = useState<UserRole>(params.get('role') === 'manager' ? 'manager' : 'employee')
  const [busy, setBusy] = useState(false)
  const [resetProgress, setResetProgress] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const signingUp = mode === 'register'
  const sceneRef = usePointerParallax<HTMLDivElement>()
  const from: unknown = (location.state as { from?: unknown } | null)?.from
  const employeePaths = ['/intro', '/assessment', '/results', '/development', '/print', '/avatar', '/account', '/types', '/demo', '/card', '/team/demo']
  const destination = (userRole: UserRole, reset = false) => reset || signingUp ? '/avatar/setup'
    : userRole === 'manager' ? '/team'
      : typeof from === 'string' && employeePaths.includes(from.split('?')[0]!) ? from : '/intro'
  if (user) return <Navigate to={destination(user.role, resetProgress)} replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    const values = { name: data.get('name'), email: data.get('email'), password: data.get('password'), role,
      inviteCode: role === 'employee' ? data.get('inviteCode') ?? '' : '', consent: role === 'employee' && data.get('consent') === 'on' }
    const registration = validateRegistration(values)
    const credentials = validateLogin(values)
    const validation = signingUp ? registration : credentials
    if (!validation.ok) { setError(Object.values(validation.errors)[0] ?? null); showFieldErrors(form, validation.errors, t); return }
    submitting.current = true
    setBusy(true); setError(null)
    try {
      const next = signingUp && registration.ok ? await register(registration.value)
        : credentials.ok ? await login(credentials.value.email, credentials.value.password, resetProgress) : null
      if (!next) return
      navigate(destination(next.role, resetProgress), { replace: true })
    } catch (reason) {
      setError((reason as Error).message)
      if (reason instanceof ApiError) {
        flushSync(() => setBusy(false))
        showFieldErrors(form, reason.fields, t)
      }
    } finally { submitting.current = false; setBusy(false) }
  }
  const modeName = t(signingUp ? 'Регистрация' : 'Вход')
  return <div className={styles.scene} ref={sceneRef}>
    {/* Размытый фон: огни в цветах сайта плывут за листом чертежа. Только оформление. */}
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.orbs}><i /><i /><i /><i /></div>
      <div className={styles.lights}>{lights.map((light, index) => <span key={index} style={{
        '--x': light.x, '--s': light.size, '--t': light.duration, '--d': light.delay, '--sway': light.sway,
      } as CSSProperties} />)}</div>
    </div>
    <Page className={styles.page}>
      <div className={styles.intro}>
        <div className={styles.head}>
          <p className={styles.eyebrow}>{t('Личный кабинет BI Academy')}</p>
          <h1>{t(signingUp ? 'Создайте аккаунт' : 'С возвращением')}</h1>
          <p className={styles.lead}>{t(signingUp ? 'Развивайте свои навыки или помогайте расти всей команде.' : 'Войдите, чтобы продолжить работу со своим профилем и командой.')}</p>
        </div>
        <ul className={styles.roleCards}>
          <li data-active={signingUp ? role === 'employee' : undefined}>
            <span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 21h20M8.5 21v-3a7.5 7.5 0 0 1 15 0v3M14 10.5V7.5h4v3M4.5 25h23" /></svg></span>
            <span>{t('Сотрудник проходит тест и получает личный план развития.')}</span>
          </li>
          <li data-active={signingUp ? role === 'manager' : undefined}>
            <span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11.5" cy="11.5" r="3.8" /><circle cx="22" cy="12.5" r="3" /><path d="M4 26c0-4.8 3.4-7.6 7.5-7.6s7.5 2.8 7.5 7.6M20 19.4c4-.9 8 1.2 8 6.2" /></svg></span>
            <span>{t('Руководитель создаёт команды и видит результаты участников.')}</span>
          </li>
        </ul>
        <div className={styles.route}>
          <p className={styles.kicker}>{t('Как это устроено')}</p>
          <ol>{[t('Пройдите 15 ситуаций'), t('Получите профиль'), t('Работайте по плану')].map((step) => <li key={step}>{step}</li>)}</ol>
        </div>
        <Link className={styles.demoLink} to="/demo">{t('Посмотреть пример результата')}<span aria-hidden="true">→</span></Link>
      </div>
      <Card className={styles.formCard}>
        <div className={styles.ruler} aria-hidden="true" />
        <div className={styles.frame} aria-hidden="true"><i /><i /><i /><i /></div>
        <div className={styles.sheetBody}>
          <form noValidate onSubmit={(event) => { void submit(event) }} onInput={(event) => { clearFieldError(event); setError(null) }} className={styles.form}>
            {signingUp && <fieldset className={styles.roles} disabled={busy}>
              <legend>{t('Ваша роль')}</legend>
              {(['employee', 'manager'] as const).map((item) => <label key={item} data-selected={role === item}>
                <input type="radio" name="role" value={item} checked={role === item} onChange={() => setRole(item)} />
                <span><strong>{t(item === 'employee' ? 'Сотрудник' : 'Руководитель')}</strong>
                  <small>{t(item === 'employee' ? 'Тест и личное развитие' : 'Команды и результаты')}</small></span>
              </label>)}
            </fieldset>}
            {signingUp && <label>{t('Имя и фамилия')}<input name="name" autoComplete="name" required minLength={2} maxLength={80} disabled={busy} /></label>}
            <label>{t('Email')}<input name="email" type="email" autoComplete={signingUp ? 'email' : 'username'} required maxLength={254} disabled={busy} /></label>
            <label>{t('Пароль')}<input name="password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'}
              required minLength={signingUp ? 10 : 1} maxLength={128} disabled={busy} aria-describedby={signingUp ? 'password-hint' : undefined} /></label>
            {signingUp && <p id="password-hint" className={styles.hint}>{t('От 10 до 128 символов.')}</p>}
            {signingUp && role === 'employee' && <label>{t('Код команды (необязательно)')}
              <input name="inviteCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} defaultValue={params.get('invite') ?? ''} disabled={busy} />
              <small>{t('Получите код у руководителя. Можно присоединиться позже в личном кабинете.')}</small>
            </label>}
            {signingUp && role === 'employee' && <ConsentField className={styles.consent} disabled={busy} />}
            {!signingUp && <label className={styles.resetOption}>
              <input type="checkbox" name="resetProgress" checked={resetProgress} disabled={busy} onChange={(event) => setResetProgress(event.target.checked)} />
              <span><strong>{t('Начать заново при входе')}</strong>
                <small>{t('Удалятся результаты, аватар и участие в команде. У руководителя удалятся созданные команды. Аккаунт сохранится.')}</small></span>
            </label>}
            {error && <p role="alert" className={styles.error}>{t(error)}</p>}
            <Button type="submit" disabled={busy}>{t(busy ? 'Подождите…' : signingUp ? 'Зарегистрироваться' : 'Войти')}</Button>
            <p className={styles.switch}>{t(signingUp ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?')}{' '}
              <Link to={signingUp ? '/login' : '/register'} state={location.state}>{t(signingUp ? 'Войти' : 'Зарегистрироваться')}</Link></p>
          </form>
        </div>
        {/* Штамп чертежа: как основная надпись на листе. Только оформление. */}
        <div className={styles.stamp} aria-hidden="true">
          <span>BI Academy</span><span>{modeName}</span><span>{signingUp ? t(role === 'employee' ? 'Сотрудник' : 'Руководитель') : '—'}</span><span>A4 · 1:1</span>
        </div>
      </Card>
    </Page>
  </div>
}

export function RoleGate({ role, children }: { readonly role?: UserRole; readonly children: React.ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  const { t } = useI18n()
  if (!auth.enabled) return children
  if (auth.loading) return <Page><p role="status">{t('Загружаем аккаунт…')}</p></Page>
  if (auth.error) return <Page><Card><p role="alert">{t(auth.error)}</p><Button onClick={() => { void auth.refresh() }}>{t('Попробовать снова')}</Button></Card></Page>
  if (!auth.user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  if (role && auth.user.role !== role) return <Page><Card><h1>{t('Эта страница доступна для другой роли')}</h1>
    <p>{t(auth.user.role === 'manager' ? 'В кабинете руководителя доступны команды и результаты сотрудников.' : 'В кабинете сотрудника доступны тест и личный план развития.')}</p>
    <ActionLink to={auth.user.role === 'manager' ? '/team' : '/intro'}>{t('Перейти в свой кабинет')}</ActionLink></Card></Page>
  return children
}
