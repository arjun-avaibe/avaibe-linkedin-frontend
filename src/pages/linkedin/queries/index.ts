/** LinkedIn: React Query hooks for the app's LinkedIn set-up and each profile's connection */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys } from '@/hooks/queries'
import { api } from '@/lib/api'

export function useLinkedInConfig() {
  return useQuery({ queryKey: ['linkedin', 'config'], queryFn: api.linkedinConfig })
}

/** Starts LinkedIn sign-in for a profile: resolves to the LinkedIn address to open */
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
