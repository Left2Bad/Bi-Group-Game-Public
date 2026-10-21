/**
 * Каталог профессиональных навыков с устойчивыми идентификаторами.
 * Навык сравнивается между попытками только по одинаковым skillId и SKILL_RUBRIC_VERSION, а не по свободному названию.
 * Изменение состава или смысла навыков требует новой версии рубрики: старые оценки не пересчитываются.
 */
import { msg } from '../i18n/translate.ts'

export const SKILL_RUBRIC_VERSION = 'professional-skills-v1'

export const SKILL_IDS = [
  'duties', 'practice-monolith', 'practice-masonry', 'drawings-big-engineering', 'work-planning', 'contractor-management',
  'safety-technology', 'quality-control', 'documentation', 'team-coordination',
] as const
export type SkillId = typeof SKILL_IDS[number]
/** Навык, проявленный в ответах, но отсутствующий в каталоге: показывается, но не сравнивается между попытками. */
export const OTHER_SKILL = 'other'

export interface SkillDefinition {
  readonly id: SkillId
  readonly name: string
  /** Чему соответствует навык; передаётся модели вместе с id. */
  readonly scope: string
  /** Основы должностей, для которых навык ожидается. Пустой список — навык не ожидается ни от одной роли автоматически. */
  readonly roles: readonly string[] | 'all'
  /** Что тест не проверяет: текстовые ответы не заменяют практическую проверку. */
  readonly notChecked?: string
}

const SITE_LEAD = ['мастер', 'прораб', 'начальник участка', 'foreman']

export const SKILL_CATALOG: readonly SkillDefinition[] = [
  { id: 'duties', name: msg('Знание обязанностей'), scope: 'понимание своих должностных обязанностей, зоны ответственности и порядка эскалации', roles: 'all' },
  { id: 'practice-monolith', name: msg('Практика: монолит'), scope: 'организация и контроль монолитных работ: опалубка, армирование, бетонирование, уход за бетоном',
    roles: [...SITE_LEAD, 'бригадир', 'монолит', 'бетон', 'арматур', 'опалуб'],
    notChecked: msg('Выполнение монолитных работ на объекте тест не наблюдает: оценка отражает только описанный в ответах подход.') },
  { id: 'practice-masonry', name: msg('Практика: кладка'), scope: 'организация и контроль каменной кладки: материалы, перевязка, геометрия, приёмка',
    roles: [...SITE_LEAD, 'бригадир', 'каменщик', 'кладк'],
    notChecked: msg('Выполнение кладки на объекте тест не наблюдает: оценка отражает только описанный в ответах подход.') },
  { id: 'drawings-big-engineering', name: msg('Чертежи и BIG Engineering'), scope: 'работа с рабочей документацией, ревизиями чертежей и системой BIG Engineering',
    roles: [...SITE_LEAD, 'инженер', 'пто', 'проектиров', 'технадзор', 'технический надзор'],
    notChecked: msg('Проверка чтения чертежей и работы в BIG Engineering в тесте не проводилась: оценка отражает только упоминание документации в ответах.') },
  { id: 'work-planning', name: msg('Планирование работ'), scope: 'последовательность и сроки работ, ресурсы, контроль выполнения плана',
    roles: [...SITE_LEAD, 'бригадир', 'инженер', 'начальник', 'руководител', 'менеджер'] },
  { id: 'contractor-management', name: msg('Работа с подрядчиками'), scope: 'постановка задач подрядчикам и субподрядчикам, контроль, приёмка, урегулирование разногласий',
    roles: [...SITE_LEAD, 'начальник', 'руководител', 'менеджер', 'технадзор', 'технический надзор'] },
  { id: 'safety-technology', name: msg('Охрана труда и технология'), scope: 'соблюдение требований охраны труда, допусков и технологии работ', roles: [] },
  { id: 'quality-control', name: msg('Контроль качества'), scope: 'входной и операционный контроль, приёмка, работа с дефектами', roles: [] },
  { id: 'documentation', name: msg('Исполнительная документация'), scope: 'ведение журналов, актов, исполнительной и отчётной документации', roles: [] },
  { id: 'team-coordination', name: msg('Координация бригады'), scope: 'распределение задач в бригаде, инструктаж, передача информации смежникам', roles: [] },
]

export const skillDefinition = (id: string): SkillDefinition | undefined => SKILL_CATALOG.find((item) => item.id === id)

/**
 * Навыки, которые ожидаются от указанной должности. Примеры со слайда не становятся обязательными для всех:
 * например, монолит и кладка ожидаются от мастера или прораба, но не от инженера ПТО.
 */
export function expectedSkills(jobRole: string): readonly SkillDefinition[] {
  const role = jobRole.toLocaleLowerCase('ru')
  return SKILL_CATALOG.filter((item) => item.roles === 'all' || item.roles.some((stem) => role.includes(stem)))
}
