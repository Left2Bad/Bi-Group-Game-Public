import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { questions, scoring } from '../../content/questions'
import { TEAM } from '../../content/team'
import { buildTeamMembers, buildTeamReport } from '../../domain/team'
import { DATA_VERSIONS, TRAIT_IDS } from '../../domain/types'
import type { AssessmentResult } from '../../domain/types'
import { useI18n } from '../../i18n/context'
import { Card } from '../../ui/primitives'
import { traitColors } from '../../ui/trait-labels'
import { useTraitLabels } from '../../ui/use-labels'
import styles from './TeamGlance.module.css'

/** Показатели человека рядом со средними по примерной команде. Команда вымышленная, как на экране руководителя. */
export function TeamGlance({ result }: { readonly result: AssessmentResult }) {
  const { t } = useI18n()
  const labels = useTraitLabels()
  const compatible = result.versions.scoring === DATA_VERSIONS.scoring
  const report = useMemo(() => compatible
    ? buildTeamReport(buildTeamMembers(TEAM, { questions, scoring, versions: DATA_VERSIONS, completedAt: result.completedAt }))
    : null, [compatible, result.completedAt])
  if (!report) return null
  return <Card className={styles.card} aria-labelledby="team-glance-title">
    <div className={styles.head}>
      <div><h2 id="team-glance-title">{t('Вы и команда')}</h2>
        <p>{t('Ваши проценты рядом со средними по примерной команде участка. Команда вымышленная: так руководитель видит свой отряд.')}</p></div>
      <Link to="/team/demo">{t('Открыть экран команды')} <span aria-hidden="true">→</span></Link>
    </div>
    <ul className={styles.rows}>{TRAIT_IDS.map((id) => {
      const you = Math.round(result.traits[id].percent), team = report.average[id], diff = you - team
      return <li key={id} style={{ '--c': traitColors[id] } as CSSProperties}>
        <span className={styles.name}>{labels.traitNames[id]}</span>
        <span className={styles.bars} role="img" aria-label={t('{name}: вы {you}%, команда {team}%', { name: labels.traitNames[id], you, team })}>
          <i className={styles.you} style={{ width: `${you}%` }} /><i className={styles.team} style={{ left: `${team}%` }} />
        </span>
        <span className={styles.nums}><b>{you}%</b> <span>{diff === 0 ? t('как в команде') : t('{diff} п.п. к команде', { diff: `${diff > 0 ? '+' : '-'}${Math.abs(diff)}` })}</span></span>
      </li>
    })}</ul>
    <p className={styles.legend}><span className={styles.keyYou} aria-hidden="true" />{t('Вы')}<span className={styles.keyTeam} aria-hidden="true" />{t('Среднее по команде (пример)')}</p>
    <p className={styles.note}>{t('Опора команды — «{strong}», зона роста — «{weak}».',
      { strong: labels.traitNames[report.strongest], weak: labels.traitNames[report.weakest] })}</p>
  </Card>
}
