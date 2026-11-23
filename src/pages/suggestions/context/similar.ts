import { createContext } from 'react'
import type { SimilarResponse } from '@/lib/api'

/** Past posts like each item, fetched once per page and read by the cards */
export const SimilarCtx = createContext<SimilarResponse | undefined>(undefined)
