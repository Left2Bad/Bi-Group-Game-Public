import type { AvatarChoice } from '../storage/avatar'
import { ArchetypeCharacter } from './ArchetypeCharacter'
import { AvatarFigure } from './AvatarFigure'

/** Аватар в профиле: созданный сотрудником или персонаж по коду теста. */
export function ProfileAvatar({ code, choice, size = 320, stickers = 0, label, x, y }: {
  readonly code: string
  readonly choice: AvatarChoice
  readonly size?: number | undefined
  readonly stickers?: number | undefined
  readonly label?: string | undefined
  readonly x?: number | undefined
  readonly y?: number | undefined
}) {
  return choice.kind === 'custom'
    ? <AvatarFigure params={choice.params} size={size} label={label} x={x} y={y} />
    : <ArchetypeCharacter code={code} size={size} stickers={stickers} label={label} x={x} y={y} />
}
