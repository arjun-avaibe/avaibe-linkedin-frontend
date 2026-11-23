/** Create post: React Query hooks for saving a post, and for the AI (Analyse and Chat) */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlannerMutation } from '@/hooks/queries'
import { api, type Api, type PlannedPost, type PlannedPostInput } from '@/lib/api'

const assistKey = (accountId: number) => ['post-assist', accountId] as const
const chatKey = (accountId: number) => ['post-chat', accountId] as const

/** The attachment is read only when the request is sent (images are shrunk first, saved files fetched back) */
type WithAttachment<B> = { body: B; getAttachment: () => Promise<File | null> }

export function usePostAssistStatus(accountId: number) {
  return useQuery({ queryKey: assistKey(accountId), queryFn: () => api.postAssistStatus(accountId), staleTime: 30_000 })
}

export function usePostChatStatus(accountId: number) {
  return useQuery({ queryKey: chatKey(accountId), queryFn: () => api.postChatStatus(accountId), staleTime: 30_000 })
}

/** Analyse: Claude's review of the parts of the draft the team picked */
export function useAnalysePost(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, getAttachment }: WithAttachment<Parameters<Api['postAssist']>[0]>) => api.postAssist(body, await getAttachment()),
    // Runs count against the daily limit whether or not they worked
    onSettled: () => qc.invalidateQueries({ queryKey: assistKey(accountId) }),
  })
}

/** Chat with AI: one message (the whole conversation so far is sent each time) */
export function usePostChat(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, getAttachment }: WithAttachment<Parameters<Api['postChat']>[0]>) => api.postChat(body, await getAttachment()),
    onSettled: () => qc.invalidateQueries({ queryKey: chatKey(accountId) }),
  })
}

export interface SavePostArgs {
  /** Editing an existing post; omit for a new one */
  id?: number
  body: PlannedPostInput
  image?: File | null
  removeImage?: boolean
  media?: File | null
  /** Approve it straight away (approvers scheduling their own post) */
  approve?: boolean
}

/** Save a post with its files, and approve it if asked. Refreshes Publishing, Calendar and Data either way. */
export function useSavePlannedPost(accountId: number) {
  return usePlannerMutation<SavePostArgs, PlannedPost>(accountId, async ({ id, body, image, removeImage, media, approve }) => {
    let saved = id ? await api.updatePlanned(id, body) : await api.createPlanned(body)
    // The server removes files that don't belong to a changed format
    if (body.format === 'image' && removeImage) saved = await api.removePlannedImage(saved.id)
    if (body.format === 'image' && image) saved = await api.uploadPlannedImage(saved.id, image)
    if ((body.format === 'carousel' || body.format === 'video') && media) saved = await api.uploadPlannedMedia(saved.id, media)
    if (approve) saved = await api.plannedAction(saved.id, 'approve')
    return saved
  })
}
