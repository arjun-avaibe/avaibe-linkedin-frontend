import type { PlannedFormat, PlannedPost } from '@/lib/api'

export const PLANNED_FORMAT_LABELS: Record<PlannedFormat, string> = {
  text: 'Text',
  image: 'Image',
  carousel: 'Carousel',
  video: 'Video',
  article: 'Article',
  poll: 'Poll',
}

/**
 * Something someone has to do: a draft to approve, a failed or missed post to fix, or an approved
 * hand-posted format (carousel, video, article, poll) waiting to be posted on LinkedIn.
 * Drives the dots on the format tabs and on "Publishing" in the sidebar.
 */
export function needsAction(p: PlannedPost): boolean {
  return p.status === 'draft' || p.status === 'failed' || p.status === 'missed' || dueByHand(p)
}

/** A scheduled post the team posts by hand whose time has come (or that has no time): copy it, post it, mark it as posted */
export function dueByHand(p: PlannedPost): boolean {
  return p.status === 'approved' && p.by_hand && (!p.scheduled_at || new Date(p.scheduled_at).getTime() <= Date.now())
}
