import type { TraitId } from '../domain/types.ts'
import type { DynamicAttempt } from './domain.ts'
import { OTHER_SKILL, expectedSkills } from './skills.ts'
import type { SkillId } from './skills.ts'
import { msg, russian } from '../i18n/translate.ts'
import type { Translate } from '../i18n/translate.ts'
/**
 * Рекомендации обучения для маршрута развития. Строятся правилами из уже сохранённой попытки, без пересчёта оценок.
 * Это рекомендуемые направления и темы в BuildEX / BI University, а не названия существующих курсов и не запись на обучение.
 */
export type LearningVenue = 'BuildEX' | 'BIU'

export const VENUES: Readonly<Record<LearningVenue, { name: string; url: string; focus: string }>> = {
  BuildEX: { name: 'BuildEX', url: 'https://bi.group/ru/special/training-center', focus: msg('практические строительные работы и технология') },
  BIU: { name: 'BI University', url: 'https://bi.group/ru/career/bi-university', focus: msg('управление, коммуникация и личная эффективность') },
}

export interface LearningItem {
  readonly venue: LearningVenue
  readonly topic: string
  /** Что конкретно изучить и отработать. */
  readonly study: readonly string[]
}

const SKILL_LEARNING: Readonly<Record<SkillId, LearningItem>> = {
  duties: { venue: 'BIU', topic: msg('Зона ответственности и порядок эскалации'), study: [
    msg('Перечитать должностную инструкцию и выписать решения, которые вы принимаете сами, а какие согласуете'),
    msg('Составить схему эскалации: кому, в какой срок и в каком виде передавать проблему')] },
  'practice-monolith': { venue: 'BuildEX', topic: msg('Технология монолитных работ'), study: [
    msg('Приёмка опалубки и армирования перед бетонированием: допуски и типовые дефекты'),
    msg('Режимы бетонирования и ухода за бетоном, в том числе в холодное время'),
    msg('Операционный контроль по технологической карте на монолитные работы')] },
  'practice-masonry': { venue: 'BuildEX', topic: msg('Технология каменной кладки'), study: [
    msg('Входной контроль кирпича, блоков и раствора'),
    msg('Перевязка, армирование и контроль геометрии кладки'),
    msg('Приёмка кладки и оформление скрытых работ')] },
  'drawings-big-engineering': { venue: 'BuildEX', topic: msg('Чтение рабочей документации и BIG Engineering'), study: [
    msg('Чтение рабочих чертежей КЖ и АР, спецификаций и узлов'),
    msg('Проверка актуальной ревизии и порядок работы с изменениями'),
    msg('Поиск и сверка документации в BIG Engineering')] },
  'work-planning': { venue: 'BIU', topic: msg('Планирование и контроль сроков работ'), study: [
    msg('Составление недельно-суточного графика с ресурсами'),
    msg('Поиск критического пути и резервов времени'),
    msg('Еженедельный контроль план-факт и корректировка плана')] },
  'contractor-management': { venue: 'BIU', topic: msg('Управление подрядчиками'), study: [
    msg('Постановка задачи подрядчику: объём, срок, критерий приёмки'),
    msg('Фиксация замечаний и контроль их устранения'),
    msg('Ведение сложного разговора и урегулирование разногласий')] },
  'safety-technology': { venue: 'BuildEX', topic: msg('Охрана труда и наряды-допуски'), study: [
    msg('Порядок оформления наряда-допуска и целевого инструктажа'),
    msg('Опасные зоны, работы на высоте и с грузоподъёмными механизмами'),
    msg('Действия при обнаружении нарушения: остановить, зафиксировать, сообщить')] },
  'quality-control': { venue: 'BuildEX', topic: msg('Строительный контроль качества'), study: [
    msg('Входной, операционный и приёмочный контроль: кто и когда проводит'),
    msg('Типовые дефекты, их фиксация и проверка устранения'),
    msg('Работа с актами освидетельствования скрытых работ')] },
  documentation: { venue: 'BuildEX', topic: msg('Исполнительная документация'), study: [
    msg('Ведение общего и специальных журналов работ'),
    msg('Состав исполнительной документации по вашему виду работ'),
    msg('Оформление актов скрытых работ и исполнительных схем')] },
  'team-coordination': { venue: 'BIU', topic: msg('Руководство бригадой и передача информации'), study: [
    msg('Короткая планёрка: задача, ответственный, срок, проверка'),
    msg('Инструктаж и обратная связь новым сотрудникам'),
    msg('Передача информации смежным бригадам без потерь')] },
}

const TRAIT_LEARNING: Readonly<Record<TraitId, LearningItem>> = {
  criticalThinking: { venue: 'BIU', topic: msg('Анализ проблем и принятие решений'), study: [
    msg('Метод «5 почему» и диаграмма причин для разбора отклонений'),
    msg('Проверка фактов перед решением: какие данные нужны и где их взять'),
    msg('Оценка рисков и альтернатив в формате «вариант — риск — мера»')] },
  confidence: { venue: 'BIU', topic: msg('Уверенная коммуникация и ответственность за решения'), study: [
    msg('Аргументация позиции: факт, вывод, предложение'),
    msg('Принятие решения в рамках своих полномочий без лишних согласований'),
    msg('Отработка сложных разговоров с руководителем и подрядчиком')] },
  discipline: { venue: 'BuildEX', topic: msg('Регламенты, технология и охрана труда'), study: [
    msg('Технологические карты и последовательность операций по вашему виду работ'),
    msg('Требования охраны труда и порядок допуска к работам'),
    msg('Личный тайм-менеджмент: фиксация договорённостей и сроков')] },
  engagement: { venue: 'BIU', topic: msg('Командная работа и наставничество'), study: [
    msg('Наставничество: как передавать опыт новичку'),
    msg('Совместное решение проблем со смежными бригадами'),
    msg('Обратная связь, которая помогает, а не демотивирует')] },
}

export const traitLearning = (trait: TraitId): LearningItem => TRAIT_LEARNING[trait]

export interface SkillLearning extends LearningItem {
  readonly skillName: string
  /** null — навык ожидается от должности, но в ответах нет свидетельства. */
  readonly level: number | null
  readonly reason: string
}

const LEVEL_NAMES = [msg('решение ошибочно'), msg('только намерение'), msg('применимое действие с пробелами'), msg('обоснованное действие'), msg('полный подход')]

/**
 * Что ещё изучить: оценённые навыки ниже уровня 4 (слабые первыми), затем навыки должности без свидетельства.
 * Тема из оценки модели имеет приоритет; площадка и конкретные пункты — из каталога.
 */
export function skillLearning(attempt: DynamicAttempt, limit = 4, t: Translate = russian): readonly SkillLearning[] {
  const skills = attempt.evaluation?.skills ?? []
  const assessed = [...skills].filter((skill) => skill.level < 4).sort((a, b) => a.level - b.level).map((skill): SkillLearning => {
    const base = skill.skillId && skill.skillId !== OTHER_SKILL ? SKILL_LEARNING[skill.skillId] : undefined
    return { venue: skill.learningVenue ?? base?.venue ?? 'BIU', topic: skill.learningTopic || base?.topic || skill.name,
      study: base?.study ?? [skill.nextStep], skillName: skill.name, level: skill.level,
      reason: t('Уровень {level} из 4 — {name}. {nextStep}', { level: skill.level, name: t(LEVEL_NAMES[skill.level]!), nextStep: t(skill.nextStep) }) }
  })
  const missing = expectedSkills(attempt.jobRole).filter((item) => !skills.some((skill) => skill.skillId === item.id))
    .map((item): SkillLearning => ({ ...SKILL_LEARNING[item.id], skillName: item.name, level: null,
      reason: t('Навык ожидается для вашей должности, но в ответах не проявился: начните с основ.') }))
  return [...assessed, ...missing].slice(0, limit)
}
