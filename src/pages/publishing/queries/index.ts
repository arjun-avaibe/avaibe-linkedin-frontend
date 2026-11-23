import { usePlannerMutation } from '@/hooks/queries'
import { api } from '@/lib/api'

export function usePlannedAction(accountId: number, id: number) {
  return usePlannerMutation(accountId, (action: 'approve' | 'unapprove' | 'publish') => api.plannedAction(id, action))
}

export function useSchedulePlanned(accountId: number, id: number) {
  return usePlannerMutation(accountId, (now: boolean) => api.plannedAction(id, 'approve', { now }))
}

export function useDeletePlanned(accountId: number, id: number) {
  return usePlannerMutation(accountId, () => api.deletePlanned(id))
}

export function useMarkPosted(accountId: number, id: number) {
  return usePlannerMutation(accountId, (postUrl: string) => api.markPosted(id, postUrl))
}
