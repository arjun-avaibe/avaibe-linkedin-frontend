import type { PlannedDetails, PlannedFormat, ChatTurn, PostGoal } from '@/lib/api'

export type Draft = {
  format: PlannedFormat
  caption: string
  topic: string
  industry: string
  cta: string
  goal: PostGoal | null
  /** The chosen posting time (ISO), for Analyse → Posting time */
  scheduledAt?: string | null
  details?: PlannedDetails
}

/** The post's image or PDF (or video, which the AI can't read), new or saved earlier */
export type Visual = {
  key: string
  name: string
  kind: 'image' | 'pdf' | 'video'
  load: () => Promise<File>
} | null

export type ChatEntry = { role: 'user'; content: string } | { role: 'assistant'; turn: ChatTurn }
