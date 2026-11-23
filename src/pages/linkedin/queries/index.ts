import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys } from '@/hooks/queries'
import { api } from '@/lib/api'

export function useLinkedInConfig() {
  return useQuery({ queryKey: ['linkedin', 'config'], queryFn: api.linkedinConfig })
}

export function useConnectLinkedIn() {
  return useMutation({ mutationFn: (accountId: number) => api.linkedinAuthUrl(accountId) })
}

export function useDisconnectLinkedIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.linkedinDisconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.linkedinConnections }),
  })
}
