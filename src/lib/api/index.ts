import { sampleApi } from '@/sample-data'
import { httpApi } from './http-api'

export * from './types'
export { ApiError } from './client'
export { API_ENDPOINTS } from './endpoints'

export type Api = typeof httpApi

export const api: Api = __SAMPLE_DATA__ ? sampleApi : httpApi
