import type { ConsistencyLevel } from '../../domain/consistency'
import { msg } from '../../i18n/translate'
export const consistencyLabels: Readonly<Record<ConsistencyLevel, string>> = {
  consistent: msg('Ответы согласованы'), check: msg('Стоит перепроверить'), low: msg('Низкая согласованность'),
}
