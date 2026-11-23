/**
 * Publishing: React Query hooks for one post in the queue. Every action refreshes the queue, the Calendar and
 * Data (publishing creates a tracked post). The queue itself (usePlanned) is shared: src/hooks/queries.ts.
 */
import { usePlannerMutation } from '@/hooks/queries'
import { api } from '@/lib/api'

/** Approve, unapprove or publish */
export function usePlannedAction(accountId: number, id: number) {
  return usePlannerMutation(accountId, (action: 'approve' | 'unapprove' | 'publish') => api.plannedAction(id, action))
}

/** From the preview: publish now (true) or at the post's scheduled time (false) */
export function useSchedulePlanned(accountId: number, id: number) {
  return usePlannerMutation(accountId, (now: boolean) => api.plannedAction(id, 'approve', { now }))
}

export function useDeletePlanned(accountId: number, id: number) {
  return usePlannerMutation(accountId, () => api.deletePlanned(id))
}

/** A hand-posted format went up on LinkedIn: record its link */
export function useMarkPosted(accountId: number, id: number) {
  return usePlannerMutation(accountId, (postUrl: string) => api.markPosted(id, postUrl))
}
