/** Suggestions: React Query hooks for decisions (Do it / Later / Dismiss) and Claude's ideas */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { keys } from '@/hooks/queries'
import { api, type DecisionStatus } from '@/lib/api'

export function useDecide(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, status }: { key: string; status: DecisionStatus | null }) => api.decide({ account_id: accountId, key, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.decisions(accountId) }),
  })
}

export function useGenerateIdeas(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (focus: string | null) => api.generateIdeas({ account_id: accountId, focus }),
    // Failed runs are recorded too, so refresh usage either way
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.ideas(accountId) })
      qc.invalidateQueries({ queryKey: keys.claude })
    },
  })
}

export function useIdeaToDraft(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, index }: { runId: number; index: number }) => api.ideaToDraft(runId, index),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.planner(accountId) }),
  })
}
