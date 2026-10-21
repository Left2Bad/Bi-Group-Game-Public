import type { MemberCard, RouteComment, TeamEmployee, TeamInfo } from '../auth/api'
import {
  BEHAVIOR_TEXTS, CRITERION_QUOTES, CRITERION_TEXTS, DEMO_BANK_VERSION, DEMO_CHOICES, DEMO_EMPLOYEE_ID, DEMO_INVITE_CODE, DEMO_MANAGER,
  DEMO_MEETINGS, DEMO_OPEN_TEXTS, DEMO_PERSONAS, DEMO_PROGRESS, ROADMAP_TEXTS, SKILL_TEXTS, SUPPORT_TEXTS, TRAIT_QUOTES, TRAIT_TEXTS,
} from '../content/dynamic-demo'
import type { DemoAttemptSpec, DemoPersona, Quote } from '../content/dynamic-demo'
import { TRAIT_IDS } from '../domain/types'
import type { TraitId } from '../domain/types'
import type { Meeting } from '../meetings/meetings'
import type { AvatarChoice } from '../storage/avatar'
import {
  CRITERIA, DYNAMIC_METHOD, OPEN_TRAITS, PROGRESS_PROMPT_VERSION, PROMPT_VERSION, RUBRIC_VERSION, choicePreference, combinedTraitPercent, professionalPercent,
} from './domain'
import type { BehaviorEvaluation, CriterionEvaluation, CriterionId, DevelopmentWeek, DynamicAttempt, OpenQuestion, ProgressAnalysis, SkillEvaluation, TraitEvaluation } from './domain'
import { mapAttemptTexts } from './content-i18n'
import { SKILL_RUBRIC_VERSION, skillDefinition } from './skills'

import { msg } from '../i18n/translate'
/**
 * Пример по действующей методике без сервера и без модели: попытки собираются из вымышленных ответов
 * src/content/dynamic-demo.ts, а проценты считаются теми же функциями, что и в server/dynamic-ai.ts.
 * Ничего не сохраняется: страницы примера держат отметки, комментарии и беседы только в памяти.
 */

/** Модель и уровень размышлений по умолчанию из .env.example: так выглядела бы настоящая оценка. */
const DEMO_MODEL = 'gpt-6-luna'
const DEMO_EFFORT = 'high'
/** Итог от 67% описывается текстами сильного уровня. */
const HIGH = 67

/** Перевод строки примера: без языка возвращает русский исходник. Слова сотрудника тоже переводятся, потому что пример вымышленный. */
export type DemoTranslate = (text: string) => string
const same: DemoTranslate = (text) => text

export const DEMO_OPEN_QUESTIONS: readonly OpenQuestion[] = DEMO_OPEN_TEXTS.map((text, index) => ({
  id: `O${index + 1}`, text, trait: OPEN_TRAITS[index]!, promptVersion: PROMPT_VERSION }))

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000).toISOString()

function quoteOf(spec: DemoAttemptSpec, [answer, sentence]: Quote, tr: DemoTranslate): string {
  if (!spec.answers) return '—'
  const text = spec.answers[answer]?.[sentence]
  if (!text) throw new Error(`В примере нет предложения ${sentence + 1} в ответе ${answer + 1}.`)
  return tr(text)
}

function roadmap(traits: Readonly<Record<TraitId, TraitEvaluation>>): DevelopmentWeek[] {
  // Сначала слабые качества, как просит модель; каждое качество — один раз, поэтому четыре практики разные.
  const order = [...TRAIT_IDS].sort((a, b) => traits[a].finalPercent - traits[b].finalPercent || TRAIT_IDS.indexOf(a) - TRAIT_IDS.indexOf(b))
  const support = SUPPORT_TEXTS[order.at(-1)!]
  return order.map((trait, index) => {
    const mode = traits[trait].finalPercent < 75 ? 'growth' as const : 'consolidation' as const
    return { week: index + 1, trait, mode, ...ROADMAP_TEXTS[trait][mode], support }
  })
}

/** Завершённая попытка сотрудника. Порядок шагов повторяет evaluate() на сервере. */
export function demoAttempt(persona: DemoPersona, index: number, tr: DemoTranslate = same): DynamicAttempt {
  const spec = persona.attempts[index]!
  if (spec.choices.length !== DEMO_CHOICES.length) throw new Error(`У ${persona.name} должно быть ${DEMO_CHOICES.length} ответов в ситуациях.`)
  const choiceAnswers = Object.fromEntries(DEMO_CHOICES.map((question, position) => {
    const option = question.options.find((item) => item.id === spec.choices[position])
    if (!option) throw new Error(`Нет варианта ${spec.choices[position]} в ${question.id}.`)
    return [question.id, option.id]
  }))
  const openAnswers = spec.answers ? Object.fromEntries(DEMO_OPEN_QUESTIONS.map((question, position) => [question.id, spec.answers![position]!.map(tr).join(' ')])) : {}
  const base: DynamicAttempt = {
    id: `demo-${persona.id}-${index + 1}`, method: DYNAMIC_METHOD, promptVersion: PROMPT_VERSION, model: DEMO_MODEL, bankVersion: DEMO_BANK_VERSION,
    reasoningEffort: DEMO_EFFORT, jobRole: persona.jobRole, createdAt: addDays(spec.completedAt, -1 / 48), completedAt: spec.completedAt, status: 'completed',
    choices: DEMO_CHOICES, choiceAnswers, openQuestions: spec.answers ? DEMO_OPEN_QUESTIONS : [], openAnswers, evaluation: null,
  }
  const preference = choicePreference(base)
  const criteria = Object.fromEntries(CRITERIA.map((id, position) => {
    const level = spec.criteria[position]!
    return [id, { level, evidence: quoteOf(spec, CRITERION_QUOTES[id], tr), explanation: CRITERION_TEXTS[id][level]! }]
  })) as Record<CriterionId, CriterionEvaluation>
  const behavior = Object.fromEntries(TRAIT_IDS.map((id, position) => {
    const level = spec.behavior[position]!
    return [id, { level, evidence: quoteOf(spec, TRAIT_QUOTES[id], tr), explanation: BEHAVIOR_TEXTS[level]! }]
  })) as Record<TraitId, BehaviorEvaluation>
  const traits = Object.fromEntries(TRAIT_IDS.map((id) => {
    const behaviorPercent = 25 * behavior[id].level
    const finalPercent = combinedTraitPercent(preference[id], behaviorPercent)
    const tier = finalPercent >= HIGH ? 0 : 1
    const texts = TRAIT_TEXTS[id]
    const score: TraitEvaluation = {
      preferencePercent: preference[id], professionalPercent: professionalPercent(criteria, id, false), behaviorPercent, finalPercent,
      evidence: behavior[id].evidence, strength: texts.strength[tier], nextStep: texts.nextStep[tier], successCriterion: texts.successCriterion,
      ...(spec.answers ? { questionId: DEMO_OPEN_QUESTIONS[TRAIT_QUOTES[id][0]]!.id } : {}),
    }
    return [id, score]
  })) as Record<TraitId, TraitEvaluation>
  const skills = spec.skills.map((item): SkillEvaluation => {
    const definition = skillDefinition(item.id)
    const texts = SKILL_TEXTS[item.id]
    if (!definition || !texts) throw new Error(`Для навыка ${item.id} нет текстов примера.`)
    return { skillId: item.id, name: definition.name, level: item.level, percent: 25 * item.level, evidence: quoteOf(spec, item.quote, tr),
      explanation: texts.explanation[item.level >= 3 ? 0 : 1], nextStep: texts.nextStep, learningVenue: texts.learningVenue, learningTopic: texts.learningTopic }
  })
  const attempt: DynamicAttempt = { ...base, evaluation: {
    rubricVersion: RUBRIC_VERSION, promptVersion: PROMPT_VERSION, model: DEMO_MODEL, reasoningEffort: DEMO_EFFORT, traits, criteria, unsafe: false,
    behavior, skills, skillRubricVersion: SKILL_RUBRIC_VERSION, safetyExplanation: msg('Опасных решений в ответах не выявлено.'), roadmap: roadmap(traits),
  } }
  // Прежние попытки коллег в примере без ответов — как и в истории, которую сервер отдаёт руководителю.
  const shown = spec.answers ? attempt : stripAnswers(attempt)
  return tr === same ? shown : mapAttemptTexts(shown, tr)
}

/** Так сервер передаёт руководителю прежние попытки: оценки остаются, вопросы и ответы — нет. */
const stripAnswers = (attempt: DynamicAttempt): DynamicAttempt => ({ ...attempt, choices: [], choiceAnswers: {}, openQuestions: [], openAnswers: {} })

const attemptsOf = (persona: DemoPersona, tr: DemoTranslate) => persona.attempts.map((_, index) => demoAttempt(persona, index, tr))

function commentsOf(persona: DemoPersona, latest: DynamicAttempt, mine: boolean, tr: DemoTranslate): RouteComment[] {
  return (persona.comments ?? []).map((comment, index) => ({ id: `demo-comment-${persona.id}-${index + 1}`, week: comment.week, text: tr(comment.text),
    managerName: DEMO_MANAGER, createdAt: addDays(latest.completedAt!, comment.day), ...(mine ? { mine: true } : {}) }))
}

export interface DemoTeam {
  readonly team: TeamInfo
  readonly managerName: string
  readonly members: readonly TeamEmployee[]
  /** Карточки развития сотрудников с результатами, как их отдаёт /teams/:id/members/:userId/card. */
  readonly cards: Readonly<Record<string, MemberCard>>
}

/** Команда для кабинета руководителя. Название передаётся снаружи, потому что оно переводится. */
export function buildDemoTeam(teamName: string, tr: DemoTranslate = same): DemoTeam {
  const members: TeamEmployee[] = []
  const cards: Record<string, MemberCard> = {}
  for (const persona of DEMO_PERSONAS) {
    const attempts = persona.consented ? attemptsOf(persona, tr) : []
    const latest = attempts.at(-1) ?? null
    members.push({ id: persona.id, name: persona.name, email: persona.email, consented: persona.consented, result: null,
      dynamicResult: latest, dynamicBaseline: attempts.length > 1 ? stripAnswers(attempts[0]!) : null, baseline: null,
      attemptCount: attempts.length, avatar: persona.consented ? persona.avatar : null })
    if (latest) cards[persona.id] = { member: { id: persona.id, name: persona.name }, avatar: persona.avatar, legacy: null,
      dynamic: { latest, history: attempts.map((item) => item === latest ? item : stripAnswers(item)),
        marks: (persona.marks ?? []).map((mark) => ({ week: mark.week, completedAt: addDays(latest.completedAt!, mark.day) })),
        comments: commentsOf(persona, latest, true, tr) } }
  }
  return { team: { id: 'demo-team', name: teamName, inviteCode: DEMO_INVITE_CODE, memberCount: members.length }, managerName: DEMO_MANAGER, members, cards }
}

export interface DemoEmployee {
  readonly name: string
  readonly attempt: DynamicAttempt
  readonly baseline: DynamicAttempt
  readonly completedWeeks: readonly number[]
  readonly comments: readonly RouteComment[]
  readonly avatar: AvatarChoice
}

/** Разбор «до и после»: цитаты тоже переводятся, остальные поля переведёт mapAttemptTexts при показе. */
type DemoProgress = Pick<ProgressAnalysis, 'summary' | 'professionalism' | 'trajectory' | 'improvements' | 'attention' | 'nextFocus'>
function translateProgress(progress: DemoProgress, tr: DemoTranslate): DemoProgress {
  if (tr === same) return progress
  return { ...progress, summary: tr(progress.summary), trajectory: tr(progress.trajectory), nextFocus: tr(progress.nextFocus),
    professionalism: { ...progress.professionalism, explanation: tr(progress.professionalism.explanation), before: tr(progress.professionalism.before), now: tr(progress.professionalism.now) },
    improvements: progress.improvements.map((item) => ({ area: tr(item.area), before: tr(item.before), now: tr(item.now), explanation: tr(item.explanation) })),
    attention: progress.attention.map((item) => ({ area: tr(item.area), explanation: tr(item.explanation) })) }
}

/** Кабинет сотрудника: своя последняя попытка, входная оценка с ответами, отметки и комментарии руководителя. */
export function buildDemoEmployee(tr: DemoTranslate = same): DemoEmployee {
  const persona = DEMO_PERSONAS.find((item) => item.id === DEMO_EMPLOYEE_ID)!
  const attempts = attemptsOf(persona, tr)
  const latest = attempts.at(-1)!
  // Вкладка «Прогресс»: последний результат против первого, как после настоящего повторного теста.
  const attempt: DynamicAttempt = { ...latest, evaluation: { ...latest.evaluation!, progress: { ...translateProgress(DEMO_PROGRESS, tr), promptVersion: PROGRESS_PROMPT_VERSION,
    model: latest.model, createdAt: latest.completedAt!, firstId: attempts[0]!.id, middleId: null } } }
  return { name: persona.name, attempt, baseline: attempts[0]!, completedWeeks: (persona.marks ?? []).map((mark) => mark.week),
    comments: commentsOf(persona, attempt, false, tr), avatar: persona.avatar ? { kind: 'custom', params: persona.avatar } : { kind: 'test' } }
}

/** Беседы руководителя относительно текущего времени: назначенная всегда впереди, прошедшая — позади. */
export function demoMeetings(team: DemoTeam, now = Date.now(), tr: DemoTranslate = same): Meeting[] {
  return DEMO_MEETINGS.map((item, index) => {
    const at = new Date(now + item.inDays * 86_400_000)
    at.setHours(item.hour, 0, 0, 0)
    const member = team.members.find((person) => person.id === item.employeeId)!
    return { id: `demo-meeting-${index + 1}`, teamId: team.team.id, teamName: team.team.name, employeeId: member.id, employeeName: member.name,
      managerName: team.managerName, at: at.toISOString(), message: tr(item.message), status: item.status,
      createdAt: new Date(now - 3 * 86_400_000).toISOString(), respondedAt: item.status === 'accepted' ? new Date(now - 2 * 86_400_000).toISOString() : null, unseen: false }
  })
}
