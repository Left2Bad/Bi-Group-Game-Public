import { createContext } from 'react'
import type { AssessmentResult } from '../domain/types'
export const RestoredAttemptsContext = createContext<readonly AssessmentResult[]>([])
