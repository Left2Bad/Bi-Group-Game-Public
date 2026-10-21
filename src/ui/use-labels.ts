import { useMemo } from 'react'
import { TRAIT_IDS } from '../domain/types'
import type { TraitId, TraitLevel } from '../domain/types'
import { useI18n } from '../i18n/context'
import { levelNames, traitNames, traitShortNames } from './trait-labels'

const LEVELS = ['priority', 'developing', 'strength'] as const satisfies readonly TraitLevel[]

/** Названия качеств и уровней на языке интерфейса. */
export function useTraitLabels() {
  const { t } = useI18n()
  return useMemo(() => ({
    traitNames: Object.fromEntries(TRAIT_IDS.map((id) => [id, t(traitNames[id])])) as Record<TraitId, string>,
    traitShortNames: Object.fromEntries(TRAIT_IDS.map((id) => [id, t(traitShortNames[id])])) as Record<TraitId, string>,
    levelNames: Object.fromEntries(LEVELS.map((level) => [level, t(levelNames[level])])) as Record<TraitLevel, string>,
  }), [t])
}
