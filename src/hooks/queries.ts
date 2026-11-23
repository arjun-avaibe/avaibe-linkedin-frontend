/**
 * React Query hooks shared by several pages (Dashboard, Data, the sidebar, more than one feature).
 * Hooks used by one page only live next to it: src/pages/<page>/queries/index.ts.
 *
 * Query keys live in `keys` so every invalidation names the same thing: a write refreshes every view that shows it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  type AccountDocs,
  type AudienceRow,
  type Checkpoint,
  type CheckpointQ,
  type PageAudienceInput,
  type PostInput,
  type SnapshotInput,
} from '@/lib/api'

export const keys = {
  accounts: ['accounts'] as const,
  posts: (accountId: number) => ['posts', accountId] as const,
  allPosts: ['posts', 'all'] as const,
  post: (id: number) => ['post', id] as const,
  analytics: (accountId: number) => ['analytics', accountId] as const,
  pageAudience: (accountId: number) => ['page-audience', accountId] as const,
  pageDaily: (accountId: number) => ['page-daily', accountId] as const,
  lastImports: (accountId: number) => ['last-imports', accountId] as const,
  doc: (accountId: number, kind: string) => ['doc', accountId, kind] as const,
  decisions: (accountId: number) => ['decisions', accountId] as const,
  ideas: (accountId: number) => ['ai', 'ideas', accountId] as const,
  leads: (accountId: number) => ['leads', accountId] as const,
  planner: (accountId: number) => ['planner', accountId] as const,
  calendar: (accountId: number, from: string, to: string) => ['calendar', accountId, from, to] as const,
  calendarItems: (from: string, to: string) => ['calendar-items', from, to] as const,
  linkedinConnections: ['linkedin', 'connections'] as const,
  settings: ['settings'] as const,
  claude: ['settings', 'claude'] as const,
  team: ['team'] as const,
}

// ---------------------------------------------------------------- accounts and posts

export function useAccounts(enabled = true) {
  return useQuery({ queryKey: keys.accounts, queryFn: api.accounts, enabled })
}

export function usePosts(accountId: number | undefined, opts: { format?: string; checkpoint?: CheckpointQ } = {}) {
  return useQuery({
    queryKey: [...keys.posts(accountId ?? 0), opts],
    queryFn: () => api.posts({ account_id: accountId!, ...opts }),
    enabled: !!accountId,
  })
}

/** Posts of every account (each still classified against its own account) */
export function useAllPosts() {
  return useQuery({ queryKey: [...keys.allPosts, {}], queryFn: () => api.posts({}) })
}

export function usePost(id: number) {
  return useQuery({ queryKey: keys.post(id), queryFn: () => api.post(id) })
}

function useAnalytics<T>(accountId: number | undefined, name: string, params: object, fn: () => Promise<T>) {
  return useQuery({
    queryKey: [...keys.analytics(accountId ?? 0), name, params],
    queryFn: fn,
    enabled: !!accountId,
  })
}

export const useOverview = (a: number | undefined, checkpoint: CheckpointQ) =>
  useAnalytics(a, 'overview', { checkpoint }, () => api.overview({ account_id: a!, checkpoint }))

export const useSuggestions = (a: number | undefined) => useAnalytics(a, 'suggestions', {}, () => api.suggestions({ account_id: a! }))

export const useDueSnapshots = (a: number | undefined) => useAnalytics(a, 'due', {}, () => api.dueSnapshots({ account_id: a! }))

/** After any write, refresh posts and analytics for the account. */
export function useInvalidateAccount() {
  const qc = useQueryClient()
  return (accountId: number, postId?: number) => {
    qc.invalidateQueries({ queryKey: keys.posts(accountId) })
    qc.invalidateQueries({ queryKey: keys.allPosts })
    qc.invalidateQueries({ queryKey: keys.analytics(accountId) })
    if (postId) qc.invalidateQueries({ queryKey: keys.post(postId) })
  }
}

export function useSavePost(postId?: number) {
  const invalidate = useInvalidateAccount()
  return useMutation({
    mutationFn: (body: PostInput) => (postId ? api.updatePost(postId, body) : api.createPost(body)),
    onSuccess: (p) => invalidate(p.account_id, p.id),
  })
}

export function useDeletePost(accountId: number) {
  const invalidate = useInvalidateAccount()
  return useMutation({
    mutationFn: (id: number) => api.deletePost(id),
    onSuccess: () => invalidate(accountId),
  })
}

export function useSaveSnapshot(postId: number, accountId: number) {
  const invalidate = useInvalidateAccount()
  return useMutation({
    mutationFn: ({ checkpoint, body }: { checkpoint: Checkpoint; body: SnapshotInput }) => api.saveSnapshot(postId, checkpoint, body),
    onSuccess: () => invalidate(accountId, postId),
  })
}

export function useDeleteSnapshot(postId: number, accountId: number) {
  const invalidate = useInvalidateAccount()
  return useMutation({
    mutationFn: (checkpoint: Checkpoint) => api.deleteSnapshot(postId, checkpoint),
    onSuccess: () => invalidate(accountId, postId),
  })
}

export function useSaveAudience(postId: number, accountId: number) {
  const invalidate = useInvalidateAccount()
  return useMutation({
    mutationFn: (rows: AudienceRow[]) => api.saveAudience(postId, rows),
    onSuccess: () => invalidate(accountId, postId),
  })
}

// ---------------------------------------------------------------- page numbers and audience

export function usePageAudience(accountId: number | undefined) {
  return useQuery({ queryKey: keys.pageAudience(accountId ?? 0), queryFn: () => api.pageAudience(accountId!), enabled: !!accountId })
}

export function useSavePageAudience(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PageAudienceInput) => api.savePageAudience(accountId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.pageAudience(accountId) }),
  })
}

export function useDeletePageAudience(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ as_of, audience }: { as_of: string; audience: string }) => api.deletePageAudience(accountId, as_of, audience),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.pageAudience(accountId) }),
  })
}

export function usePageDaily(accountId: number | undefined) {
  return useQuery({ queryKey: keys.pageDaily(accountId ?? 0), queryFn: () => api.pageDaily(accountId!), enabled: !!accountId })
}

export function useImportLinkedInExport(accountId: number) {
  const invalidate = useInvalidateAccount()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ files, exportedOn, confirmProfile }: { files: File[]; exportedOn: string | null; confirmProfile?: boolean }) =>
      api.importLinkedInExport(accountId, files, exportedOn, confirmProfile),
    onSuccess: () => {
      invalidate(accountId)
      qc.invalidateQueries({ queryKey: keys.pageDaily(accountId) })
      qc.invalidateQueries({ queryKey: keys.pageAudience(accountId) })
      qc.invalidateQueries({ queryKey: keys.lastImports(accountId) })
    },
  })
}

export function useImportCsv(accountId: number) {
  const invalidate = useInvalidateAccount()
  return useMutation({
    mutationFn: (file: File) => api.importCsv(accountId, file),
    onSuccess: () => invalidate(accountId),
  })
}

// ---------------------------------------------------------------- suggestions, documents, leads (read by several pages)

export function useAccountDoc<K extends keyof AccountDocs>(accountId: number | undefined, kind: K) {
  return useQuery({ queryKey: keys.doc(accountId ?? 0, kind), queryFn: () => api.accountDoc(accountId!, kind), enabled: !!accountId })
}

export function useDecisions(accountId: number | undefined) {
  return useQuery({ queryKey: keys.decisions(accountId ?? 0), queryFn: () => api.decisions(accountId!), enabled: !!accountId })
}

export function useIdeas(accountId: number | undefined) {
  return useQuery({
    queryKey: keys.ideas(accountId ?? 0),
    queryFn: () => api.ideas(accountId!),
    enabled: !!accountId,
    // While a teammate's run is in progress, check back so their ideas appear here too
    refetchInterval: (q) => (q.state.data?.running ? 10_000 : false),
  })
}

export function useLeads(accountId: number | undefined) {
  return useQuery({ queryKey: keys.leads(accountId ?? 0), queryFn: () => api.leads(accountId!), enabled: !!accountId })
}

// ---------------------------------------------------------------- calendar (Calendar page, post editor, notifications)

export function useCalendar(accountId: number | undefined, from: string, to: string, opts: { staleTime?: number } = {}) {
  return useQuery({
    queryKey: keys.calendar(accountId ?? 0, from, to),
    queryFn: () => api.calendar({ account_id: accountId!, from, to }),
    enabled: !!accountId,
    ...opts,
  })
}

/** Holidays and events only (no account needed) */
export function useCalendarItems(from: string, to: string) {
  return useQuery({ queryKey: keys.calendarItems(from, to), queryFn: () => api.calendarItems({ from, to }), staleTime: 60 * 60_000 })
}

// ---------------------------------------------------------------- publishing (sidebar, Dashboard, Publishing, Create post)

export function usePlanned(accountId: number | undefined) {
  return useQuery({
    queryKey: keys.planner(accountId ?? 0),
    queryFn: () => api.planned(accountId!),
    enabled: !!accountId,
    // Scheduled posts change state on the server; poll while the page is open
    refetchInterval: 30_000,
  })
}

/** Any planner write: refresh the queue, and posts/analytics (a publish creates a tracked post). */
export function usePlannerMutation<TArgs, TResult = unknown>(accountId: number, fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.planner(accountId) })
      qc.invalidateQueries({ queryKey: keys.posts(accountId) })
      qc.invalidateQueries({ queryKey: keys.allPosts })
      qc.invalidateQueries({ queryKey: keys.analytics(accountId) })
    },
  })
}

export function useLinkedInConnections() {
  return useQuery({ queryKey: keys.linkedinConnections, queryFn: api.linkedinConnections })
}
