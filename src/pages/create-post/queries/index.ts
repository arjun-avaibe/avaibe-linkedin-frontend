import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlannerMutation } from '@/hooks/queries'
import { api, type Api, type PlannedPost, type PlannedPostInput } from '@/lib/api'

const assistKey = (accountId: number) => ['post-assist', accountId] as const
const chatKey = (accountId: number) => ['post-chat', accountId] as const

type WithAttachment<B> = { body: B; getAttachment: () => Promise<File | null> }

export function usePostAssistStatus(accountId: number) {
  return useQuery({ queryKey: assistKey(accountId), queryFn: () => api.postAssistStatus(accountId), staleTime: 30_000 })
}

export function usePostChatStatus(accountId: number) {
  return useQuery({ queryKey: chatKey(accountId), queryFn: () => api.postChatStatus(accountId), staleTime: 30_000 })
}

export function useAnalysePost(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, getAttachment }: WithAttachment<Parameters<Api['postAssist']>[0]>) => api.postAssist(body, await getAttachment()),
    onSettled: () => qc.invalidateQueries({ queryKey: assistKey(accountId) }),
  })
}

export function usePostChat(accountId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ body, getAttachment }: WithAttachment<Parameters<Api['postChat']>[0]>) => api.postChat(body, await getAttachment()),
    onSettled: () => qc.invalidateQueries({ queryKey: chatKey(accountId) }),
  })
}

export interface SavePostArgs {
  id?: number
  body: PlannedPostInput
  image?: File | null
  removeImage?: boolean
  media?: File | null
  approve?: boolean
}

export function useSavePlannedPost(accountId: number) {
  return usePlannerMutation<SavePostArgs, PlannedPost>(accountId, async ({ id, body, image, removeImage, media, approve }) => {
    let saved = id ? await api.updatePlanned(id, body) : await api.createPlanned(body)
    if (body.format === 'image' && removeImage) saved = await api.removePlannedImage(saved.id)
    if (body.format === 'image' && image) saved = await api.uploadPlannedImage(saved.id, image)
    if ((body.format === 'carousel' || body.format === 'video') && media) saved = await api.uploadPlannedMedia(saved.id, media)
    if (approve) saved = await api.plannedAction(saved.id, 'approve')
    return saved
  })
}
