import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Eyebrow, Page } from '../ui/primitives'
import styles from './EthicsPage.module.css'
import { useI18n } from '../i18n/context'

import { msg } from '../i18n/translate'
/*
 * Этика и данные: вслух проговаривает то, что уже делает сервер (server/api.ts).
 * Каждое утверждение здесь должно совпадать с проверками в коде: согласие — validateConsent и consented_at,
 * доступ руководителя — GET /teams/:id и карточка, коллеги — GET /membership/team, отзыв — DELETE /membership.
 */

const consentSteps = [
  { title: msg('Флажок пустой'), copy: msg('При регистрации и вступлении в команду согласие не отмечено заранее. Сотрудник ставит его сам.') },
  { title: msg('Сервер проверяет'), copy: msg('Без явного согласия вступить в команду нельзя: запрос отклоняется на сервере, а не только в форме. Время и версия согласия сохраняются.') },
  { title: msg('Доступ открывается'), copy: msg('Только после согласия руководитель команды видит результаты. Тем, кто вступил раньше, доступ закрыт, пока они не подтвердят согласие.') },
  { title: msg('Можно отозвать'), copy: msg('Выход из команды в личном кабинете сразу закрывает доступ руководителя и коллег к вашим результатам.') },
] as const

const viewers = [
  { who: msg('Вы'), tone: 'self', sees: msg('Все свои прохождения, ответы, разбор каждого балла, маршрут на 4 недели и прогресс.'), hidden: null },
  { who: msg('Руководитель вашей команды'), tone: 'lead', sees: msg('После согласия: имя и почту, завершённые прохождения и их динамику, ответы и разбор последнего прохождения, маршрут с отметками и аватар.'),
    hidden: msg('Черновики и незавершённые прохождения.') },
  { who: msg('Коллеги по команде'), tone: 'team', sees: msg('Если тоже дали согласие: ваше имя, итоговый профиль и аватар в общей картине бригады.'), hidden: msg('Почту и маршрут.') },
  { who: 'OpenAI', tone: 'ai', sees: msg('Должность, тексты вопросов и ваши ответы — чтобы составить ситуации и оценить их по рубрике.'), hidden: msg('Имя, почту и команду. Ответы не пишутся в журналы сервера.') },
] as const

const nots = [
  { title: msg('Не аттестация'), copy: msg('Это самооценка по рабочим ситуациям. Результат не подтверждает и не отменяет квалификацию и не заменяет регламенты.') },
  { title: msg('Не рейтинг'), copy: msg('Профиль показывает сильные стороны и зону роста, а не место в таблице. Плохих архетипов нет: у каждого свои сильные стороны и риски.') },
  { title: msg('Не основание для увольнения'), copy: msg('Результат не используется для решений о найме, премии, понижении или увольнении. Его задача — выбрать, чему учиться в ближайший месяц.') },
] as const

const leaderRules = [
  msg('Обсуждайте результат на встрече один на один, а не на планёрке.'),
  msg('Отметка об опасном действии — повод для инструктажа и разговора, а не для наказания.'),
  msg('Сравнивайте сотрудника с ним самим месяц назад, а не с коллегами.'),
  msg('Комментируйте недели маршрута: поддержка видна сотруднику, а не только вам.'),
] as const

const order = (index: number) => ({ '--i': index }) as CSSProperties

export function EthicsPage() {
  const { t } = useI18n()
  return <Page>
    <div className={styles.ethics}>
      <section className={styles.hero} aria-labelledby="ethics-title">
        <div>
          <Eyebrow className={styles.eyebrow}>{t('Этика и данные')}</Eyebrow>
          <h1 id="ethics-title">{t('Инструмент развития,')}{' '}<span>{t('а не увольнения')}</span></h1>
          <p className={styles.lead}>{t('BI Academy помогает сотруднику понять, как он действует на площадке, и выбрать, чему учиться дальше. Ниже — коротко, кто и при каком условии видит результаты.')}</p>
          <ul className={styles.promises} aria-label={t('Три правила')}>
            <li>{t('Только с согласия')}</li><li>{t('Только своя команда')}</li><li>{t('Можно отозвать')}</li>
          </ul>
        </div>
        {/* Щит с галочкой: знак защиты данных, только украшение. */}
        <svg className={styles.shield} viewBox="0 0 120 140" aria-hidden="true" focusable="false">
          <path className={styles.shieldBody} d="M60 8 104 24v38c0 32-19 56-44 70C35 118 16 94 16 62V24Z" />
          <path className={styles.shieldCheck} d="m40 70 14 14 28-30" />
        </svg>
      </section>

      <section aria-labelledby="consent-title">
        <h2 id="consent-title" className={styles.title}>{t('Согласие: явное и отзываемое')}</h2>
        <ol className={styles.steps}>{consentSteps.map((step, index) => <li key={step.title} style={order(index)}>
          <h3>{t(step.title)}</h3><p>{t(step.copy)}</p>
        </li>)}</ol>
      </section>

      <section aria-labelledby="viewers-title">
        <h2 id="viewers-title" className={styles.title}>{t('Кто видит результаты')}</h2>
        <ul className={styles.viewers}>{viewers.map((viewer) => <li key={viewer.who} data-tone={viewer.tone}>
          <h3>{t(viewer.who)}</h3>
          <p><b>{t('Видит.')}</b> {t(viewer.sees)}</p>
          {viewer.hidden && <p className={styles.hidden}><b>{t('Не видит.')}</b> {t(viewer.hidden)}</p>}
        </li>)}</ul>
        <p className={styles.note}>{t('Руководители других команд, коллеги без согласия и посетители сайта ваших результатов не видят. Проверка выполняется на сервере при каждом запросе, а не скрытием кнопок в интерфейсе.')}</p>
      </section>

      <section className={styles.notBlock} aria-labelledby="not-title">
        <h2 id="not-title" className={styles.title}>{t('Чем результат не является')}</h2>
        <ul className={styles.nots}>{nots.map((item) => <li key={item.title}><h3>{t(item.title)}</h3><p>{t(item.copy)}</p></li>)}</ul>
        <div className={styles.leader}>
          <h3>{t('Руководителю: как пользоваться результатами')}</h3>
          <ul>{leaderRules.map((rule) => <li key={rule}>{t(rule)}</li>)}</ul>
          <p>{t('Сервис открывает доступ только по согласию, но решения принимают люди. Эти правила — часть договорённости: без неё сотрудники начнут отвечать «как надо», и тест перестанет показывать правду.')}</p>
        </div>
      </section>

      <section className={styles.control} aria-labelledby="control-title">
        <h2 id="control-title">{t('Ваши данные — под вашим управлением')}</h2>
        <dl>
          <div><dt>{t('Отозвать доступ')}</dt><dd>{t('Выйдите из команды в')}{' '}<Link to="/account">{t('личном кабинете')}</Link>{t('. Руководитель теряет доступ сразу.')}</dd></div>
          <div><dt>{t('Удалить результаты')}</dt><dd>{t('Кнопка «Удалить мои данные» на')}{' '}<Link to="/intro">{t('странице теста')}</Link>{' '}{t('стирает прохождения, отметки маршрута и комментарии к нему. Аккаунт сохраняется.')}</dd></div>
        </dl>
      </section>
    </div>
  </Page>
}
