/**
 * The app's API, in four parts (same layout as the Kutubi admin panel):
 *   types.ts      what the API sends and receives
 *   endpoints.ts  every backend address
 *   client.ts     the HTTP transport (cookies, CSRF, errors)
 *   http-api.ts   one function per endpoint
 *
 * `api` is the backend (npm run dev:api, production) or the sample data (npm run dev): see src/globals.d.ts.
 * Screens call React Query hooks (pages/<page>/queries, hooks/queries.ts), which call `api`.
 */
import { sampleApi } from '@/sample-data'
import { httpApi } from './http-api'

export * from './types'
export { ApiError } from './client'
export { API_ENDPOINTS } from './endpoints'

export type Api = typeof httpApi

// __SAMPLE_DATA__ is replaced at build time (vite.config.ts), so production builds drop the sample data entirely
export const api: Api = __SAMPLE_DATA__ ? sampleApi : httpApi
