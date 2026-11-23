/** Settings: React Query hooks for app settings, accounts and the team */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys } from '@/hooks/queries'
import { api, type AppSettings, type TeamMemberInput } from '@/lib/api'

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.settings })
}

export function useClaudeStatus() {
  return useQuery({ queryKey: keys.claude, queryFn: api.claudeStatus })
}

/** Saving settings changes how every analysis is computed: refresh everything. */
export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      args:
        | { section: 'segments'; body: AppSettings['current']['segments'] }
        | { section: 'performance'; body: AppSettings['current']['performance'] }
        | { section: 'brand'; body: AppSettings['current']['brand'] }
        | { section: 'segments' | 'performance' | 'brand'; reset: true },
    ) => ('reset' in args ? api.resetSettings(args.section) : api.saveSettings(args.section, args.body as never)),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.accounts }),
  })
}

// ---- team

export function useTeam() {
  return useQuery({ queryKey: keys.team, queryFn: api.team })
}

/** Team changes can change what the signed-in person may do: refresh the team and "who am I" */
function useRefreshTeam() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: keys.team })
    qc.invalidateQueries({ queryKey: ['auth', 'me'] })
  }
}

export function useAddMember() {
  const refresh = useRefreshTeam()
  return useMutation({ mutationFn: api.addMember, onSuccess: refresh })
}

export function useUpdateMember() {
  const refresh = useRefreshTeam()
  return useMutation({ mutationFn: ({ id, body }: { id: number; body: TeamMemberInput }) => api.updateMember(id, body), onSuccess: refresh })
}

export function useRemoveMember() {
  const refresh = useRefreshTeam()
  return useMutation({ mutationFn: (id: number) => api.removeMember(id), onSuccess: refresh })
}

export function useSetDefaultAccount() {
  const refresh = useRefreshTeam()
  return useMutation({ mutationFn: (accountId: number) => api.setDefaultAccount(accountId), onSuccess: refresh })
}
