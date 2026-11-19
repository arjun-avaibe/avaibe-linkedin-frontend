import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  api,
  type AccountDocs,
  type AppSettings,
  type AudienceRow,
  type Checkpoint,
  type CheckpointQ,
  type DecisionStatus,
  type PageAudienceInput,
  type PostInput,
  type SnapshotInput,
} from '@/lib/api'

// Query keys are grouped so a single invalidation refreshes every dependent view.
export const keys = {
  accounts: ['accounts'] as const,
  posts: (accountId: number) => ['posts', accountId] as const,
  post: (id: number) => ['post', id] as const,
  analytics: (accountId: number) => ['analytics', accountId] as const,
}

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

/** Posts across every account (each still classified against its own account). */
export function useAllPosts(opts: { format?: string; checkpoint?: CheckpointQ } = {}, enabled = true) {
  return useQuery({
    queryKey: ['posts', 'all', opts],
    queryFn: () => api.posts(opts),
    enabled,
  })
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

// range: the Data page's time range ({ days } or { from, to }); undefined = all time
type RangeQ = { days?: number; from?: string; to?: string }
export const useRankings = (a: number | undefined, checkpoint: CheckpointQ, metric: string, range?: RangeQ) =>
  useAnalytics(a, 'rankings', { checkpoint, metric, ...range }, () => api.rankings({ account_id: a!, checkpoint, metric, ...range }))

export const useFormats = (a: number | undefined, checkpoint: CheckpointQ, range?: RangeQ) =>
  useAnalytics(a, 'formats', { checkpoint, ...range }, () => api.formats({ account_id: a!, checkpoint, ...range }))

export const useHeatmap = (a: number | undefined, checkpoint: CheckpointQ, metric: string, format?: string, range?: RangeQ) =>
  useAnalytics(a, 'heatmap', { checkpoint, metric, format, ...range }, () =>
    api.heatmap({ account_id: a!, checkpoint, metric, format, ...range }),
  )

export const useBestSlots = (a: number | undefined, checkpoint: CheckpointQ, range?: RangeQ) =>
  useAnalytics(a, 'best-slots', { checkpoint, ...range }, () => api.bestSlots({ account_id: a!, checkpoint, ...range }))

export const useGroups = (a: number | undefined, checkpoint: CheckpointQ, by: string, range?: RangeQ) =>
  useAnalytics(a, 'groups', { checkpoint, by, ...range }, () => api.groups({ account_id: a!, checkpoint, by, ...range }))

export const useConsistency = (a: number | undefined, checkpoint: CheckpointQ) =>
  useAnalytics(a, 'consistency', { checkpoint }, () => api.consistency({ account_id: a!, checkpoint }))

export const useSuggestions = (a: number | undefined) =>
  useAnalytics(a, 'suggestions', {}, () => api.suggestions({ account_id: a! }))

export const useDueSnapshots = (a: number | undefined) =>
  useAnalytics(a, 'due', {}, () => api.dueSnapshots({ account_id: a! }))

/** After any write, refresh posts and analytics for the account. */
function useInvalidateAccount() {
  const qc = useQueryClient()
  return (accountId: number, postId?: number) => {
    qc.invalidateQueries({ queryKey: keys.posts(accountId) })
    qc.invalidateQueries({ queryKey: ['posts', 'all'] })
    qc.invalidateQueries({ queryKey: keys.analytics(accountId) })
    if (postId) qc.invalidateQueries({ queryKey: keys.post(postId) })
  }
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.accounts }),
  })
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
    mutationFn: ({ checkpoint, body }: { checkpoint: Checkpoint; body: SnapshotInput }) =>
      api.saveSnapshot(postId, checkpoint, body),
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

export function usePageAudience(accountId: number | undefined) {
  return useQuery({
    queryKey: ['page-audience', accountId ?? 0],
    queryFn: () => api.pageAudience(accountId!),
    enabled: !!accountId,
  })
}

export function useSavePageAudience(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PageAudienceInput) => api.savePageAudience(accountId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-audience', accountId] }),
  })
}

export function useDeletePageAudience(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ as_of, audience }: { as_of: string; audience: string }) => api.deletePageAudience(accountId, as_of, audience),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['page-audience', accountId] }),
  })
}

// ---------------------------------------------------------------- settings

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: api.settings })
}

export function useClaudeStatus() {
  return useQuery({ queryKey: ['settings', 'claude'], queryFn: api.claudeStatus })
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

// ---------------------------------------------------------------- Claude strategy ideas

export function useAccountDoc<K extends keyof AccountDocs>(accountId: number | undefined, kind: K) {
  return useQuery({ queryKey: ['doc', accountId ?? 0, kind], queryFn: () => api.accountDoc(accountId!, kind), enabled: !!accountId })
}

export function useSaveAccountDoc<K extends keyof AccountDocs>(accountId: number, kind: K) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AccountDocs[K]) => api.saveAccountDoc(accountId, kind, data),
    onSuccess: (doc) => qc.setQueryData(['doc', accountId, kind], doc),
  })
}

export function useDecisions(accountId: number | undefined) {
  return useQuery({ queryKey: ['decisions', accountId ?? 0], queryFn: () => api.decisions(accountId!), enabled: !!accountId })
}

export function useDecide(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, status }: { key: string; status: DecisionStatus | null }) => api.decide({ account_id: accountId, key, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['decisions', accountId] }),
  })
}

export function useIdeas(accountId: number | undefined) {
  return useQuery({
    queryKey: ['ai', 'ideas', accountId ?? 0],
    queryFn: () => api.ideas(accountId!),
    enabled: !!accountId,
    // While a teammate's run is in progress, check back so their ideas appear here too
    refetchInterval: (q) => (q.state.data?.running ? 10_000 : false),
  })
}

export function useGenerateIdeas(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (focus: string | null) => api.generateIdeas({ account_id: accountId, focus }),
    // Failed runs are recorded too, so refresh usage either way
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ai', 'ideas', accountId] })
      qc.invalidateQueries({ queryKey: ['settings', 'claude'] })
    },
  })
}

export function useIdeaToDraft(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, index }: { runId: number; index: number }) => api.ideaToDraft(runId, index),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['planner', accountId] }),
  })
}

// ---------------------------------------------------------------- LinkedIn + publishing

export function useLinkedInConfig() {
  return useQuery({ queryKey: ['linkedin', 'config'], queryFn: api.linkedinConfig })
}

export function useLinkedInConnections() {
  return useQuery({ queryKey: ['linkedin', 'connections'], queryFn: api.linkedinConnections })
}

export function useDisconnectLinkedIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.linkedinDisconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['linkedin', 'connections'] }),
  })
}

export function usePlanned(accountId: number | undefined) {
  return useQuery({
    queryKey: ['planner', accountId ?? 0],
    queryFn: () => api.planned(accountId!),
    enabled: !!accountId,
    // Scheduled posts change state on the server; poll while the page is open
    refetchInterval: 30_000,
  })
}

/** Any planner write: refresh the queue, and posts/analytics (a publish creates a tracked post). */
export function usePlannerMutation<TArgs>(accountId: number, fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planner', accountId] })
      qc.invalidateQueries({ queryKey: keys.posts(accountId) })
      qc.invalidateQueries({ queryKey: ['posts', 'all'] })
      qc.invalidateQueries({ queryKey: keys.analytics(accountId) })
    },
  })
}

export function usePageDaily(accountId: number | undefined) {
  return useQuery({
    queryKey: ['page-daily', accountId ?? 0],
    queryFn: () => api.pageDaily(accountId!),
    enabled: !!accountId,
  })
}

export function useImportLinkedInExport(accountId: number) {
  const invalidate = useInvalidateAccount()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ files, exportedOn }: { files: File[]; exportedOn: string | null }) =>
      api.importLinkedInExport(accountId, files, exportedOn),
    onSuccess: () => {
      invalidate(accountId)
      qc.invalidateQueries({ queryKey: ['page-daily', accountId] })
      qc.invalidateQueries({ queryKey: ['page-audience', accountId] })
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
