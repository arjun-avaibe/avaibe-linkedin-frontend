import { useMutation, useQueryClient } from '@tanstack/react-query'
import { keys } from '@/hooks/queries'
import { api, type AccountDocs } from '@/lib/api'

export function useSaveAccountDoc<K extends keyof AccountDocs>(accountId: number, kind: K) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AccountDocs[K]) => api.saveAccountDoc(accountId, kind, data),
    onSuccess: (doc) => qc.setQueryData(keys.doc(accountId, kind), doc),
  })
}
