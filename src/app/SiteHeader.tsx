import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useI18n } from '../i18n/context'
import { LanguageSwitch } from '../i18n/LanguageSwitch'
import { useAssessment } from './assessment-context'
import { morePages, primaryPages } from './site-nav'
import type { NavPage } from './site-nav'
import styles from './SiteHeader.module.css'
import { useAuth } from '../auth/context'
import { api } from '../auth/api'
import { MeetingsBell } from '../meetings/MeetingsBell'

import { msg } from '../i18n/translate'
type OpenMenu = 'more' | 'burger' | null

/** Во время теста шапка упрощается: только логотип, выход и настройки, чтобы ничто не отвлекало от ответов. */
const FOCUS_PATH = '/assessment'

function Logo() {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="8" fill="#082e60" />
    <path d="M8 26V12h9v14M17 15l5 3v8M6 26h20" fill="none" stroke="#9bceff" strokeWidth="1.6" />
    <path d="M11 15h3M11 19h3M11 23h3" stroke="#ffd166" strokeWidth="1.6" />
    <path d="M23 26V6M18 8h10M23 6l-5 2" fill="none" stroke="#fff" strokeWidth="1.4" /></svg>
}

function Icon({ path, className }: { readonly path: string; readonly className?: string | undefined }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
}

const ICONS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  back: 'M15 6l-6 6 6 6',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
} as const

/** Пункт меню. Страницы, которым нужен результат, до прохождения теста показываются с замком и не нажимаются. */
function NavItem({ page, hasResult, avatarMissing = false, profileOpen = false }: {
  readonly page: NavPage; readonly hasResult: boolean; readonly avatarMissing?: boolean
  /** С аккаунтом профиль открыт и до теста: там виден аватар и что откроется после прохождения. */
  readonly profileOpen?: boolean
}) {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const [tip, setTip] = useState(false)
  useEffect(() => {
    if (!tip) return
    const timer = window.setTimeout(() => setTip(false), 3500)
    return () => window.clearTimeout(timer)
  }, [tip])
  if (page.needsResult && !hasResult && !(profileOpen && page.path === PROFILE_PATH)) {
    const hint = t('Откроется после прохождения теста')
    return <span role="link" aria-disabled="true" className={`${styles.item} ${styles.locked}`} title={hint}>
      <Icon path={ICONS.lock} className={styles.lock} />{t(page.title)}
      <span className={styles.srOnly}>{`. ${hint}`}</span>
    </span>
  }
  // Без аватара тест недоступен: ведём сразу на его создание, а если мы уже там — только подсказываем.
  if (avatarMissing && AVATAR_PATHS.includes(page.path)) return <span className={styles.tipHost}>
    <NavLink to={AVATAR_SETUP} end className={styles.item ?? ''} onClick={(event) => {
      if (pathname === AVATAR_SETUP) event.preventDefault()
      setTip(true)
    }} data-label={t(page.title)}><span className={styles.face}>{t(page.title)}</span></NavLink>
    {tip && <span role="status" className={styles.tip}>{t('Перед прохождением теста создайте аватар')}</span>}
  </span>
  return <NavLink to={page.path} end className={styles.item ?? ''} data-label={t(page.title)}><span className={styles.face}>{t(page.title)}</span></NavLink>
}

const AVATAR_PATHS = ['/intro']
const AVATAR_SETUP = '/avatar/setup'
const PROFILE_PATH = '/results'

export function SiteHeader() {
  const { pathname, key: locationKey } = useLocation()
  const { t } = useI18n()
  const { snapshot } = useAssessment()
  const auth = useAuth()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const mainNavigation = !auth.enabled ? primaryPages : auth.user?.role === 'manager'
    ? [...primaryPages, { path: '/team', title: msg('Мои команды') }]
    : auth.user ? primaryPages : [primaryPages[0]!]
  const extraNavigation = !auth.enabled ? morePages : [...morePages.filter((page) => page.path !== '/team'),
    ...(auth.user?.role === 'employee' ? [{ path: '/account', title: msg('Моя команда') }] : [])]
  const dynamic = auth.enabled && import.meta.env.MODE !== 'playwright-legacy'
  // Тест доступен обеим ролям; результат руководителя виден только ему самому.
  const employeeId = auth.user?.id ?? null
  const [serverResult, setServerResult] = useState<{ userId: string; completed: boolean } | null>(null)
  useEffect(() => {
    if (!dynamic || !employeeId) return
    let live = true
    let request = 0
    const refresh = () => {
      const current = ++request
      void api<{ total: number }>('/dynamic/attempts?status=completed&limit=1&offset=0')
        .then(({ total }) => { if (live && current === request) setServerResult({ userId: employeeId, completed: total > 0 }) })
        .catch(() => { /* Retry on navigation or focus; a network error does not erase a known result. */ })
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('bi-academy:attempts-changed', refresh)
    return () => {
      live = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('bi-academy:attempts-changed', refresh)
    }
  }, [dynamic, employeeId, locationKey])
  const [avatar, setAvatar] = useState<{ userId: string; missing: boolean } | null>(null)
  useEffect(() => {
    if (!dynamic || !employeeId) return
    let live = true
    void api<{ avatar: unknown }>('/avatar').then(({ avatar: value }) => { if (live) setAvatar({ userId: employeeId, missing: !value }) })
      .catch(() => { /* Unknown state: let the route gate decide. */ })
    return () => { live = false }
  }, [dynamic, employeeId, locationKey])
  const avatarMissing = avatar?.userId === employeeId && avatar.missing
  const hasResult = dynamic
    ? serverResult?.userId === employeeId && serverResult?.completed === true
    : Boolean(snapshot?.result)
  const focusMode = pathname === FOCUS_PATH

  const [menu, setMenu] = useState<OpenMenu>(null)
  const [menuPath, setMenuPath] = useState(pathname)
  // Любой переход закрывает меню. Сброс при смене адреса делается прямо во время отрисовки, без эффекта.
  if (menuPath !== pathname) { setMenuPath(pathname); setMenu(null) }

  const headerRef = useRef<HTMLElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const burgerButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menu) return
    const inside = (target: EventTarget | null) => {
      const scope = menu === 'more' ? moreRef.current : headerRef.current
      return target instanceof Node && Boolean(scope?.contains(target))
    }
    const onPointerDown = (event: PointerEvent) => { if (!inside(event.target)) setMenu(null) }
    const onFocusIn = (event: FocusEvent) => { if (!inside(event.target)) setMenu(null) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [menu])

  const toggle = (kind: Exclude<OpenMenu, null>) => setMenu(menu === kind ? null : kind)
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !menu) return
    setMenu(null)
    ;(menu === 'more' ? moreButtonRef : burgerButtonRef).current?.focus()
  }

  const moreCurrent = extraNavigation.some((page) => page.path === pathname)

  // Точка под текущим пунктом: переезжает с пружиной при смене страницы. Пункт из «Ещё» отмечается на кнопке «Ещё».
  useLayoutEffect(() => {
    const nav = navRef.current
    const dot = dotRef.current
    if (!nav || !dot) return
    const place = () => {
      const links = [...nav.querySelectorAll<HTMLElement>('a[aria-current="page"], button[data-current="true"]')]
      const current = links.find((element) => !element.closest('[id="site-nav-more"]') && element.offsetParent !== null)
      if (!current) { dot.style.opacity = '0'; return }
      const box = nav.getBoundingClientRect()
      const rect = current.getBoundingClientRect()
      const shown = dot.style.opacity === '1'
      // Первую установку (и после обновления страницы) делаем без пружины, иначе точка едет от левого края.
      if (!shown) dot.style.transition = 'none'
      // Пока пункт въезжает, он сдвинут анимацией: вычитаем этот сдвиг, чтобы точка сразу встала по центру.
      const slot = [...nav.children].find((child) => child.contains(current))
      const shift = slot ? new DOMMatrixReadOnly(getComputedStyle(slot).transform === 'none' ? undefined : getComputedStyle(slot).transform).m41 : 0
      dot.style.transform = `translateX(${rect.left - shift - box.left + rect.width / 2}px)`
      dot.style.opacity = '1'
      if (!shown) { void dot.offsetWidth; dot.style.transition = '' }
    }
    place()
    // При загрузке пункты ещё въезжают слева: после их анимации и загрузки шрифтов точку ставим заново.
    nav.addEventListener('animationend', place)
    void document.fonts?.ready.then(place)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(nav)
    return () => { nav.removeEventListener('animationend', place); observer?.disconnect() }
  }, [pathname, moreCurrent, hasResult, mainNavigation.length])

  return <header ref={headerRef} className={styles.header} data-app-chrome data-focus={focusMode} onKeyDown={onKeyDown}>
    <Link to="/" className={styles.brand} aria-label={t('BI Academy — на главную')}>
      <Logo /><span className={styles.brandText}><span className={styles.brandName}>BI Academy</span>
        {auth.enabled && auth.user && <span className={styles.brandRole}>{t(auth.user.role === 'manager' ? 'для руководителей' : 'для сотрудников')}</span>}</span>
    </Link>
    {focusMode
      ? <Link to="/" className={styles.exit} title={t('Ответы сохраняются, к тесту можно вернуться')}>
        <Icon path={ICONS.back} className={styles.exitIcon} />{t('Выйти из теста')}</Link>
      : <>
        <button ref={burgerButtonRef} type="button" className={styles.burger} aria-expanded={menu === 'burger'} aria-controls="site-nav"
          aria-label={menu === 'burger' ? t('Закрыть меню') : t('Открыть меню')} onClick={() => toggle('burger')} data-no-print>
          <Icon path={menu === 'burger' ? ICONS.close : ICONS.menu} />
        </button>
        <nav ref={navRef} id="site-nav" className={styles.nav} data-open={menu === 'burger'} aria-label={t('Основная навигация')}>
          {mainNavigation.map((page) => <NavItem key={page.path} page={page} hasResult={hasResult} avatarMissing={avatarMissing} profileOpen={dynamic && Boolean(auth.user)} />)}
          <div ref={moreRef} className={styles.more}>
            <button ref={moreButtonRef} type="button" className={`${styles.item} ${styles.moreButton}`} aria-expanded={menu === 'more'}
              aria-controls="site-nav-more" data-current={moreCurrent} data-label={t('Ещё')} onClick={() => toggle('more')}>
              <span className={styles.face}>{t('Ещё')}<Icon path={ICONS.chevron} className={styles.chevron} /></span>
            </button>
            <span className={styles.moreCaption} aria-hidden="true">{t('Ещё')}</span>
            <div id="site-nav-more" className={styles.morePanel} data-open={menu === 'more'}>
              {extraNavigation.map((page) => <NavItem key={page.path} page={page} hasResult={hasResult} />)}
            </div>
          </div>
          <span ref={dotRef} className={styles.dot} aria-hidden="true" />
        </nav>
      </>}
    <div className={styles.tools}>
      {auth.enabled && !auth.loading && (auth.user ? <div className={styles.account}>
        <Link to={PROFILE_PATH} title={`${auth.user.name} · ${t('Мой профиль')}`} className={styles.accountName}>{auth.user.email}</Link>
        <button type="button" disabled={loggingOut} className={styles.signOut} onClick={() => {
          setLoggingOut(true); setLogoutError(null)
          void auth.logout().catch((reason: Error) => setLogoutError(reason.message)).finally(() => setLoggingOut(false))
        }}>{t('Выйти')}</button>
      </div> : <Link to="/login" className={styles.signIn}>{t('Войти')}</Link>)}
      {auth.enabled && auth.user && <MeetingsBell />}
      <LanguageSwitch />
    </div>
    {logoutError && <p role="alert" className={styles.logoutError}>{t(logoutError)}</p>}
  </header>
}
