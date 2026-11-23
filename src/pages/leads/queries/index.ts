/** Leads & sales: React Query hooks for the Leads log and the Pipeline (the list itself, useLeads, is shared) */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { keys } from '@/hooks/queries'
import { api, type LeadInput } from '@/lib/api'

export { useLeads } from '@/hooks/queries'

export function useSaveLead(accountId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: LeadInput }) => (id ? api.updateLead(id, body) : api.createLead(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.leads(accountId ?? 0) }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteLead(accountId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteLead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.leads(accountId ?? 0) }),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useMarkReplied(accountId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.leadReplied(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.leads(accountId ?? 0) }),
    onError: (e: Error) => toast.error(e.message),
  })
}
