/** Sign-in: who is signed in (read once and shared through context/auth.tsx) */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export const meKey = ['auth', 'me'] as const

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: api.me, staleTime: 5 * 60_000, retry: 0 })
}
