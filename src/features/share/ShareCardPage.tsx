import { useLocation } from 'react-router-dom'
import { ARCHETYPES } from '../../content/archetypes'
import { questions } from '../../content/questions'
import { decodeShareHash } from '../../domain/share'
import { useI18n } from '../../i18n/context'
import { ActionLink, Card, Eyebrow, Page } from '../../ui/primitives'
import { ShareCardView } from './ShareCardView'
import styles from './ShareCardPage.module.css'

/** Открытая по ссылке карточка. Данные берутся из фрагмента адреса и проверяются до показа. */
export function ShareCardPage() {
  const { t } = useI18n()
  const { hash } = useLocation()
  const card = decodeShareHash(hash, questions)
  if (!card) return <Page><Card>
    <h1>{t('Карточка не открывается')}</h1>
    <p>{t('Ссылка повреждена или создана в другой версии BI Academy. Попросите отправителя прислать карточку ещё раз.')}</p>
    <ActionLink to="/">{t('На главную')}</ActionLink>
  </Card></Page>
  const archetype = ARCHETYPES[card.code]
  return <Page className={styles.page}>
    <Eyebrow>{t('Карточка профиля')}</Eyebrow>
    <h1>{card.name ? t('Профиль BI Academy: {name}', { name: card.name }) : t('Профиль BI Academy')}</h1>
    <div className={styles.card}><ShareCardView card={card} /></div>
    {archetype && <p className={styles.tagline}><strong>{t(archetype.name)}.</strong> {t(archetype.tagline)}</p>}
    <p className={styles.note}>{t('Карточку собрал сам человек по результатам теста самооценки. Она не проверена и не заменяет оценку квалификации. Ответов и других данных здесь нет.')}</p>
    <ActionLink to="/intro">{t('Пройти тест самому')}</ActionLink>
  </Page>
}
