import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AssessmentSession, AssessmentSnapshot } from '../features/assessment/session'

export const AssessmentContext = createContext<AssessmentSession | null>(null)
const emptySubscribe = () => () => {}
const emptySnapshot = (): AssessmentSnapshot | null => null

export function useAssessment() {
  const session = useContext(AssessmentContext)
  const snapshot = useSyncExternalStore(session?.subscribe ?? emptySubscribe, session?.getSnapshot ?? emptySnapshot)
  return { session, snapshot }
}
