import { ARCHETYPES } from '../../content/archetypes'
import { TRAIT_IDS } from '../../domain/types'
import type { ShareCard } from '../../domain/share'
import { useI18n } from '../../i18n/context'
import { msg } from '../../i18n/translate'
import { traitNames } from '../../ui/trait-labels'
import { ProfileAvatar } from '../../ui/ProfileAvatar'
import { TEST_AVATAR } from '../../storage/avatar'
import type { AvatarChoice } from '../../storage/avatar'
import { CARD_HEIGHT, CARD_WIDTH } from './card-image'

const FONT = "Onest, 'Segoe UI', Arial, sans-serif"
const TECH = "Tektur, Onest, 'Segoe UI', Arial, sans-serif"

const shortNames = {
  criticalThinking: msg('Мышление'), confidence: msg('Уверенность'), discipline: msg('Дисциплина'), engagement: msg('Вовлечённость'),
} as const

/** Размер заголовка подбирается по длине названия, чтобы оно не вылезало за левую колонку. */
const titleSize = (name: string) => Math.min(66, Math.floor(620 / (Math.max(name.length, 1) * 0.6)))

/**
 * Карточка профиля как самостоятельный SVG: её можно показать на странице и сохранить в PNG.
 * Все данные берутся из ShareCard; ответов и дат в карточке нет.
 */
export function ShareCardView({ card, svgRef, avatar = TEST_AVATAR }: {
  readonly card: ShareCard
  /** Аватар владельца: созданный им герой или персонаж по тесту. По ссылке всегда персонаж по тесту. */
  readonly avatar?: AvatarChoice
  readonly svgRef?: (node: SVGSVGElement | null) => void
}) {
  const { t, code: showCode } = useI18n()
  const archetype = ARCHETYPES[card.code]
  const title = archetype ? t(archetype.name) : showCode(card.code)
  const summary = TRAIT_IDS.map((id) => `${t(shortNames[id])} ${card.percents[id]}%`).join(', ')
  const letters = [...showCode(card.code)]
  return <svg ref={svgRef} viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`} role="img" width="100%" style={{ display: 'block', height: 'auto', borderRadius: 20 }}
    aria-label={t('Карточка профиля: {title} ({code}). {summary}.', { title, code: showCode(card.code), summary })}>
    <rect width={CARD_WIDTH} height={CARD_HEIGHT} fill="#082e60" />
    <g stroke="#9bceff" strokeOpacity=".12">
      {[1, 2, 3, 4, 5].map((index) => <path key={`h${index}`} d={`M0 ${index * 105}H${CARD_WIDTH}`} />)}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((index) => <path key={`v${index}`} d={`M${index * 100} 0V${CARD_HEIGHT}`} />)}
    </g>
    <g aria-hidden="true">
      <rect x="56" y="52" width="44" height="44" rx="11" fill="#0b3b78" stroke="#9bceff" strokeOpacity=".5" />
      <path d="M66 86V68h11v18M77 71l7 4v11M64 86h26" fill="none" stroke="#9bceff" strokeWidth="2" />
      <path d="M69 71h4M69 76h4M69 81h4" stroke="#ffd166" strokeWidth="2" />
      <path d="M86 86V58M80 60h12M86 58l-6 2" fill="none" stroke="#fff" strokeWidth="1.8" />
    </g>
    <text x="114" y="82" fill="#fff" fontFamily={FONT} fontSize="28" fontWeight="800">BI Academy</text>
    <text x="56" y="196" fill="#9bceff" fontFamily={FONT} fontSize="24" fontWeight="600">{t('Рабочий архетип')}</text>
    <text x="56" y="272" fill="#fff" fontFamily={FONT} fontSize={titleSize(title)} fontWeight="800" letterSpacing="-1">{title}</text>
    <g aria-hidden="true">{letters.map((letter, index) => <g key={index}>
      <rect x={56 + index * 74} y="312" width="62" height="74" rx="10" fill="#0b3b78" stroke="#ffd166" strokeOpacity=".85" strokeWidth="2" />
      <text x={56 + index * 74 + 31} y="363" fill="#ffd166" fontFamily={TECH} fontSize="40" fontWeight="700" textAnchor="middle">{letter}</text>
    </g>)}</g>
    {card.name && <text x="56" y="448" fill="#fff" fontFamily={FONT} fontSize="30" fontWeight="600">{card.name}</text>}
    <g>{TRAIT_IDS.map((id, index) => {
      const y = 150 + index * 98
      const percent = card.percents[id]
      return <g key={id}>
        <text x="740" y={y} fill="#d6e9fd" fontFamily={FONT} fontSize="24" fontWeight="600">{t(traitNames[id])}</text>
        <text x="1144" y={y} fill="#ffd166" fontFamily={TECH} fontSize="30" fontWeight="700" textAnchor="end">{percent}%</text>
        <rect x="740" y={y + 16} width="404" height="14" rx="7" fill="#0b3b78" />
        <rect x="740" y={y + 16} width={Math.max(4, 404 * percent / 100)} height="14" rx="7" fill="#59adf6" />
      </g>
    })}</g>
    {archetype && <ProfileAvatar code={card.code} choice={avatar} size={300} x={500} y={282} />}
    <text x="56" y="604" fill="#9bceff" fontFamily={FONT} fontSize="20">{t('Самооценка по 15 рабочим ситуациям. Не заменяет оценку квалификации.')}</text>
  </svg>
}
