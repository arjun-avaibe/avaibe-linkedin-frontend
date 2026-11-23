import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Hourglass,
  Link2,
  ListChecks,
  Pencil,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageHeader, SimpleSelect, PostRef } from '@/components/common'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { useTz } from '@/context/timezone'
import { useLinkedInConnections, usePlanned, usePlannerMutation } from '@/hooks/queries'
import {
  api,
  ApiError,
  PLANNED_FORMATS,
  type LinkedInConnection,
  type PlannedFormat,
  type PlannedPost,
  type PlannedStatus,
  POST_GOALS,
} from '@/lib/api'
import { dueByHand, needsAction, PLANNED_FORMAT_LABELS } from '@/lib/publishing'
import { cn } from '@/lib/utils'
import { DURATION_LABELS, FeedPreview } from '@/pages/create-post'

const STATUS: Record<PlannedStatus, { label: string; cls: string }> = {
  draft: { label: 'Unpublished', cls: 'bg-muted text-foreground border-border' },
  // Stored as "approved": the app publishes it at its scheduled time
  approved: { label: 'Scheduled', cls: 'bg-info/10 text-info-fg border-info/30' },
  publishing: { label: 'Publishing…', cls: 'bg-info/10 text-info-fg border-info/30' },
  published: { label: 'Published', cls: 'bg-good/15 text-good-fg border-good/30' },
  failed: { label: 'Failed', cls: 'bg-bad/10 text-bad-fg border-bad/40' },
  missed: { label: 'Missed', cls: 'bg-serious/15 text-serious-fg border-serious/40' },
}

/** The queue is shown in sections, so scheduled and unpublished posts never mix */
const GROUPS: { value: string; label: string; test: (p: PlannedPost) => boolean }[] = [
  { value: 'unpublished', label: 'Unpublished', test: (p) => p.status === 'draft' || dueByHand(p) },
  { value: 'scheduled', label: 'Scheduled', test: (p) => (p.status === 'approved' && !dueByHand(p)) || p.status === 'publishing' },
  { value: 'problem', label: 'Failed or missed', test: (p) => p.status === 'failed' || p.status === 'missed' },
  { value: 'published', label: 'Published', test: (p) => p.status === 'published' },
]

/** Soonest first; published ones newest first */
function sortForGroup(list: PlannedPost[], group: string): PlannedPost[] {
  const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : Infinity)
  return [...list].sort((a, b) => (group === 'published' ? t(b.published_at) - t(a.published_at) : t(a.scheduled_at) - t(b.scheduled_at)))
}

/** Status filter: "Needs action" matches the red dot (unpublished drafts, hand posts to mark, failures) */
const STATUS_FILTERS: { value: string; label: string; test: (p: PlannedPost) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'action', label: 'Needs action', test: needsAction },
  { value: 'draft', label: 'Unpublished', test: (p) => p.status === 'draft' || dueByHand(p) },
  { value: 'approved', label: 'Scheduled', test: (p) => (p.status === 'approved' && !dueByHand(p)) || p.status === 'publishing' },
  { value: 'published', label: 'Published', test: (p) => p.status === 'published' },
  { value: 'problem', label: 'Failed or missed', test: (p) => p.status === 'failed' || p.status === 'missed' },
]


export function PublishingPage() {
  const { account } = useAccount()
  const { data: connections = [] } = useLinkedInConnections()
  const { data: planned, isLoading } = usePlanned(account?.id)
  const connection = connections.find((c) => c.account_id === account?.id)
  const isCompany = account?.kind === 'company'
  const [params, setParams] = useSearchParams()
  // Filters instead of tabs: format and status, kept in the address (?format=, ?status=; old ?tab= links still work)
  const formatParam = params.get('format') ?? params.get('tab')
  const tab: PlannedFormat | 'all' = (PLANNED_FORMATS as readonly string[]).includes(formatParam ?? '') ? (formatParam as PlannedFormat) : 'all'
  const statusParam = params.get('status') ?? 'all'
  const status = STATUS_FILTERS.some((f) => f.value === statusParam) ? statusParam : 'all'
  const setFilter = (key: 'format' | 'status', v: string) =>
    setParams((p) => { p.delete('tab'); if (v === 'all') p.delete(key); else p.set(key, v); return p }, { replace: true })
  const all = planned ?? []
  const shown = all.filter((p) => (tab === 'all' || p.format === tab) && STATUS_FILTERS.find((f) => f.value === status)!.test(p))
  const waitingIn = (f: PlannedFormat | 'all') => all.filter((p) => (f === 'all' || p.format === f) && needsAction(p)).length
  const navigate = useNavigate()
  // Old links (?new_at=<ISO time> from the Calendar) now open the Create post page
  useEffect(() => {
    const at = params.get('new_at')
    if (at) navigate(`/create?new_at=${encodeURIComponent(at)}`, { replace: true })
  }, [params, navigate])

  if (!account) return null

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader eyebrow="Content"
        title="Publishing"
        description="Preview a post, then publish it now or at its scheduled time. Text and image posts are published by the app; carousel, video, article and poll posts are posted on LinkedIn by hand, then marked as posted."
      />

      {/* One quiet row of filters (was a tab per format) */}
      <div className="flex flex-wrap items-center gap-3">
        <SimpleSelect
          label="Format"
          value={tab}
          onChange={(v) => setFilter('format', v)}
          options={[
            { value: 'all', label: 'All', count: all.length },
            // A red dot (no text) marks formats with posts waiting for someone, as the old tabs did
            ...PLANNED_FORMATS.map((f) => ({
              value: f,
              label: PLANNED_FORMAT_LABELS[f],
              count: all.filter((p) => p.format === f).length,
              countInList: false, // the open list stays clean: only "All" shows a number
              dot: waitingIn(f) > 0,
              dotLabel: `${waitingIn(f)} waiting for someone`,
            })),
          ]}
        />
        <SimpleSelect
          label="Status"
          value={status}
          onChange={(v) => setFilter('status', v)}
          options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
        />
        {waitingIn(tab) > 0 && status !== 'action' && (
          <button
            type="button"
            onClick={() => setFilter('status', 'action')}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="size-2 rounded-full bg-bad" aria-hidden />
            {waitingIn(tab)} need{waitingIn(tab) === 1 ? 's' : ''} action
          </button>
        )}
        {(tab !== 'all' || status !== 'all') && (
          <button
            type="button"
            onClick={() => setParams((p) => { p.delete('tab'); p.delete('format'); p.delete('status'); return p }, { replace: true })}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {shown.length} of {all.length} post{all.length === 1 ? '' : 's'}
        </span>
      </div>

      {isCompany ? (
        <div className="rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
          <b>{account.name}</b> is a company page. You can draft, edit and preview posts here, but the app can’t post as the page until
          LinkedIn’s Community Management API is approved. Until then, Publish copies the text for you to post on LinkedIn by hand.
        </div>
      ) : (
        <ConnectionBanner connection={connection} />
      )}

      {tab === 'all' || tab === 'text' || tab === 'image' ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Scheduled text and image posts are published by the backend, so it must be running at the scheduled time. A post found more
          than 15 minutes late is marked <b>Missed</b> rather than posted at the wrong time.
        </p>
      ) : (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          The app can’t publish {PLANNED_FORMAT_LABELS[tab].toLowerCase()} posts yet. Draft and preview them here, post them on LinkedIn
          by hand, then click <b>Mark as posted</b> and paste the link, so the post is tracked with the right format.
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !shown.length ? (
        <EmptyState>
          {all.length && (tab !== 'all' || status !== 'all')
            ? 'No posts match these filters.'
            : 'No posts in the queue. Drafts made in Create post appear here.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const items = sortForGroup(shown.filter(g.test), g.value)
            if (!items.length) return null
            return (
              <section key={g.value} aria-label={g.label}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {g.label}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{items.length}</span>
                </h2>
                <div className="space-y-3">
                  {items.map((p) => (
                    <PlannedCard key={p.id} p={p} accountId={account.id} accountName={account.name} connection={connection} showFormat={tab === 'all'} onEdit={() => navigate(`/create/${p.id}`)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

    </div>
  )
}

function ConnectionBanner({ connection }: { connection?: LinkedInConnection }) {
  if (!connection) {
    return (
      <div className="rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
        No LinkedIn profile is connected to this account, so nothing can be published yet. You can still draft posts.{' '}
        <Link to="/linkedin" className="underline">Connect LinkedIn</Link>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm">
      {connection.picture_url && <img src={connection.picture_url} alt="" className="size-6 rounded-full" />}
      Posts publish to <b>{connection.name}</b>'s personal LinkedIn profile.
      {connection.expired ? (
        <span className="text-bad-fg">
          Connection expired. <Link to="/linkedin" className="underline">Reconnect</Link>
        </span>
      ) : (
        <span className="text-muted-foreground">Connection valid for {connection.days_left} more days.</span>
      )}
    </div>
  )
}

/** Whole minutes until `iso` (at least 1), re-rendering every 15 s; null once it has passed. */
function useMinutesLeft(iso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [iso])
  if (!iso) return null
  const ms = new Date(iso).getTime() - now
  return ms > 0 ? Math.max(1, Math.ceil(ms / 60_000)) : null
}

const plural = (n: number) => `${n} minute${n === 1 ? '' : 's'}`

function PlannedCard({
  p,
  accountId,
  accountName,
  connection,
  showFormat,
  onEdit,
}: {
  p: PlannedPost
  accountId: number
  accountName: string
  connection?: LinkedInConnection
  showFormat: boolean
  onEdit: () => void
}) {
  const tz = useTz()
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [reviewing, setReviewing] = useState(false) // the Approve preview window
  const [markPosted, setMarkPosted] = useState(false)
  const action = usePlannerMutation(accountId, (a: 'approve' | 'unapprove' | 'publish') => api.plannedAction(p.id, a))
  const remove = usePlannerMutation(accountId, () => api.deletePlanned(p.id))
  // Preview → Publish: put it on the schedule (at its time) or clear it for publishing now
  const schedule = usePlannerMutation(accountId, (now: boolean) => api.plannedAction(p.id, 'approve', { now }))
  // Not published yet: can be previewed and published
  const unpublished = p.status === 'draft' || p.status === 'failed' || p.status === 'missed'
  // Scheduled posts can be edited too; saving takes them off the schedule until they're published again
  const editable = unpublished || p.status === 'approved'
  const auth = useAuth()
  const waitMins = useMinutesLeft(p.retry_at)
  const waiting = waitMins !== null
  const autoRetry = waiting && p.status === 'approved'

  const run = (a: 'approve' | 'unapprove' | 'publish') =>
    action.mutate(a, {
      onSuccess: (res) => {
        const r = res as PlannedPost
        if (a === 'publish') {
          if (r.status === 'published') toast.success('Published to LinkedIn')
          else if (r.retry_at) {
            const mins = Math.max(1, Math.ceil((new Date(r.retry_at).getTime() - Date.now()) / 60_000))
            toast.info(
              r.status === 'approved'
                ? `LinkedIn is busy right now, so nothing was posted. The app will try again automatically in about ${plural(mins)}.`
                : `LinkedIn didn't respond in time. Please wait about ${plural(mins)}, then check the profile before trying again.`,
              { duration: 8000 },
            )
          } else toast.error(r.error ?? 'Publishing failed')
        }
        setConfirmPublish(false)
      },
      onError: (e) => {
        // A wait request from the server is guidance, not a failure
        if (e instanceof ApiError && e.status === 409 && e.message.startsWith('LinkedIn is busy')) toast.info(e.message)
        else toast.error(e.message)
        setConfirmPublish(false)
      },
    })

  const badge = autoRetry
    ? { label: 'Waiting for LinkedIn', cls: 'bg-warn/15 text-warn-fg border-warn/40' }
    : waiting && p.status === 'failed'
      ? { label: 'Try again later', cls: 'bg-warn/15 text-warn-fg border-warn/40' }
      : STATUS[p.status]

  return (
    <div className="rounded-[1.8rem] bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
          <PostRef id={p.ref} />
          {showFormat && <Badge variant="outline">{PLANNED_FORMAT_LABELS[p.format]}</Badge>}
          <Badge variant="outline" className={badge.cls}>
            {p.status === 'approved' && p.by_hand ? (dueByHand(p) ? 'Due: post it by hand' : 'Scheduled: post by hand') : badge.label}
          </Badge>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CalendarClock className="size-4" />
            {p.status === 'published' && p.published_at
              ? `Published ${tz.weekday(p.published_at)} ${tz.dual(p.published_at)}`
              : p.scheduled_at
                ? `${p.manual ? 'Planned for ' : ''}${tz.weekday(p.scheduled_at)} ${tz.dual(p.scheduled_at)} · UAE slot ${p.scheduled_slot_uae}`
                : p.manual
                  ? 'No date planned'
                  : 'Not scheduled: publish manually'}
          </span>
          {p.visibility === 'CONNECTIONS' && <Badge variant="secondary">Connections only</Badge>}
          {p.goal && <Badge variant="secondary">{POST_GOALS.find((g) => g.value === p.goal)?.label}</Badge>}
          {p.topic && <Badge variant="secondary">{p.topic}</Badge>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 sm:max-w-[55%] sm:justify-end">
          {editable && auth.can('editor') && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
          )}
          {unpublished && auth.can('approver') && (
            <Button size="sm" onClick={() => setReviewing(true)} disabled={action.isPending}>
              <CheckCircle2 /> Approve
            </Button>
          )}
          {p.status === 'approved' && auth.can('approver') && (
            <>
              {!dueByHand(p) && (
                <Button size="sm" variant="outline" onClick={() => run('unapprove')} disabled={action.isPending}>
                  <Undo2 /> Unschedule
                </Button>
              )}
              {p.by_hand ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => copyText(p.caption)}>
                    <Copy /> Copy text
                  </Button>
                  <Button size="sm" onClick={() => setMarkPosted(true)}>
                    <Link2 /> Mark as posted
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setConfirmPublish(true)} disabled={!connection || connection.expired || action.isPending || waiting}>
                  <Send /> {waiting ? `Wait ${waitMins} min` : 'Publish now'}
                </Button>
              )}
            </>
          )}
          {p.status === 'published' && (
            <>
              {p.post_id && (
                <Link to={`/posts/${p.post_id}`} className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted">
                  View tracking
                </Link>
              )}
              {p.linkedin_urn && (
                <a
                  href={`https://www.linkedin.com/feed/update/${p.linkedin_urn}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs hover:bg-muted"
                >
                  On LinkedIn <ExternalLink className="size-3" />
                </a>
              )}
            </>
          )}
          {p.status !== 'publishing' && p.status !== 'published' && auth.can('editor') && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete"
              disabled={remove.isPending}
              onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success('Deleted'), onError: (e) => toast.error(e.message) })}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-4">
        {p.has_image && (
          <img src={api.plannedImageUrl(p.id, p.approved_at ?? p.id.toString())} alt={p.image_alt ?? ''} className="size-24 shrink-0 rounded-md object-cover ring-1 ring-foreground/10" />
        )}
        <p className="line-clamp-5 text-sm whitespace-pre-wrap">{p.caption}</p>
      </div>
      <FormatSummary p={p} />

      {markPosted && <MarkPostedDialog p={p} accountId={accountId} onClose={() => setMarkPosted(false)} />}

      {waiting ? (
        <div className="mt-3 flex gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
          <Hourglass className="mt-0.5 size-4 shrink-0 text-warn-fg" />
          <div>
            <p>{p.error}</p>
            <p className="mt-1 font-medium">
              {autoRetry ? 'Next automatic try' : 'You can try again'} in about {plural(waitMins ?? 1)} ({tz.dual(p.retry_at)})
              {autoRetry && p.attempts > 1 && <span className="font-normal text-muted-foreground"> · try {p.attempts + 1}</span>}
            </p>
          </div>
        </div>
      ) : (
        p.error &&
        !(p.status === 'approved') && (
          <p className={cn('mt-3 rounded-md px-3 py-2 text-xs', p.status === 'missed' ? 'bg-serious/10' : 'bg-bad/10 text-bad-fg')}>{p.error}</p>
        )
      )}
      {!waiting && p.status === 'approved' && p.attempts > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
          <Hourglass className="size-4 shrink-0 text-warn-fg" /> LinkedIn was busy earlier. Trying again now…
        </p>
      )}

      <ApproveDialog
        open={reviewing}
        onClose={() => setReviewing(false)}
        p={p}
        accountName={accountName}
        connection={connection}
        busy={action.isPending || schedule.isPending}
        waitMins={waitMins}
        onEdit={() => {
          setReviewing(false)
          onEdit()
        }}
        onPublish={(how) =>
          schedule.mutate(how !== 'scheduled', {
            onSuccess: () => {
              setReviewing(false)
              if (how === 'now') run('publish')
              else if (how === 'scheduled')
                toast.success(
                  p.by_hand
                    ? `Scheduled for ${tz.weekday(p.scheduled_at!)} ${tz.dual(p.scheduled_at!)}. At that time you’ll be reminded to post it on LinkedIn by hand.`
                    : `Scheduled: the app will publish it ${tz.weekday(p.scheduled_at!)} ${tz.dual(p.scheduled_at!)}.`,
                  { duration: 8000 },
                )
              else {
                copyText(p.caption)
                toast.success('Copied. Paste it on LinkedIn, then click Mark as posted here.', { duration: 8000 })
              }
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />

      <Dialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish to LinkedIn now?</DialogTitle>
            <DialogDescription>
              This posts {p.visibility === 'PUBLIC' ? 'publicly' : 'to connections'} on <b>{connection?.name}</b>'s LinkedIn profile right
              away. To remove it afterwards you'd delete it on LinkedIn itself.
            </DialogDescription>
          </DialogHeader>
          <p className="line-clamp-6 rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{p.caption}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPublish(false)}>
              Cancel
            </Button>
            <Button onClick={() => run('publish')} disabled={action.isPending}>
              <Send /> {action.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Post text copied. Paste it on LinkedIn.')
  } catch {
    toast.error('Couldn’t copy. Open Edit and select the text instead.')
  }
}


/** The format-specific parts of a queued post, shown under its text */
function FormatSummary({ p }: { p: PlannedPost }) {
  const d = p.details
  if (p.format === 'poll' && d.question) {
    return (
      <div className="mt-3 rounded-md border px-3 py-2 text-sm">
        <div className="flex items-center gap-1.5 font-medium">
          <ListChecks className="size-4 text-muted-foreground" /> {d.question}
        </div>
        <ul className="mt-1 ml-6 list-disc text-muted-foreground">
          {(d.options ?? []).map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
        {d.duration && <p className="mt-1 text-xs text-muted-foreground">Runs for {DURATION_LABELS[d.duration]}</p>}
      </div>
    )
  }
  if (p.format === 'article' && (d.title || d.link)) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <FileText className="size-4 text-muted-foreground" />
        {d.title && <span className="font-medium">{d.title}</span>}
        {d.link && (
          <a href={d.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline">
            {d.link} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    )
  }
  if ((p.format === 'carousel' || p.format === 'video') && (p.has_media || d.document_title || d.subtitles !== undefined)) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm">
        <FileText className="size-4 text-muted-foreground" />
        {d.document_title && <span className="font-medium">{d.document_title}</span>}
        {p.has_media ? (
          <a href={api.plannedMediaUrl(p.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
            {p.media_name ?? 'Open file'} <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-xs text-warn-fg">No file attached yet</span>
        )}
        {p.format === 'video' && (
          <span className="text-xs text-muted-foreground">{d.subtitles ? 'Subtitles added' : 'No subtitles yet (many people watch on mute)'}</span>
        )}
      </div>
    )
  }
  return null
}

function MarkPostedDialog({ p, accountId, onClose }: { p: PlannedPost; accountId: number; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const mark = usePlannerMutation(accountId, (u: string) => api.markPosted(p.id, u))
  const submit = () =>
    mark.mutate(url.trim(), {
      onSuccess: () => {
        toast.success('Marked as posted. It now appears in Posts for tracking.')
        onClose()
      },
      onError: (e) => toast.error(e.message),
    })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as posted</DialogTitle>
          <DialogDescription>
            After posting this {PLANNED_FORMAT_LABELS[p.format].toLowerCase()} on LinkedIn, open the post there, copy its address and paste
            it here. The app starts tracking it as a {PLANNED_FORMAT_LABELS[p.format].toLowerCase()} post, with its topic and CTA.
          </DialogDescription>
        </DialogHeader>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/feed/update/urn:li:activity:…" autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mark.isPending || url.trim().length < 10}>
            {mark.isPending ? 'Saving…' : 'Mark as posted'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Approve: the post as it will appear on LinkedIn, with Edit and Publish.
    A future scheduled time offers Publish now or Publish at that time (the app posts it then).
    Formats or accounts the app can't post to: Publish copies the text to post by hand. */
function ApproveDialog({
  open,
  onClose,
  p,
  accountName,
  connection,
  busy,
  waitMins,
  onEdit,
  onPublish,
}: {
  open: boolean
  onClose: () => void
  p: PlannedPost
  accountName: string
  connection?: LinkedInConnection
  busy: boolean
  waitMins: number | null
  onEdit: () => void
  onPublish: (how: 'now' | 'scheduled' | 'copy') => void
}) {
  const tz = useTz()
  const byApp = !p.by_hand && !!connection && !connection.expired
  const later = !!p.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now()
  // Short, for the button: "Sat 28 Nov, 04:33" (UAE time)
  const when = later
    ? new Date(p.scheduled_at!).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''
  const where = byApp ? `${p.visibility === 'PUBLIC' ? 'publicly' : 'to connections'} on ${connection!.name}’s LinkedIn` : ''
  const byHandWhy = p.manual ? 'This format is posted on LinkedIn by hand' : 'The app can’t post to this account yet (company pages need LinkedIn’s approval first)'
  const note = p.by_hand
    ? later
      ? `${byHandWhy}. Schedule it and you’ll be reminded at that time to copy the text and post it; Publish now copies the text straight away.`
      : `${byHandWhy}: Publish copies the text for you to paste on LinkedIn, then you mark it as posted.`
    : !connection
      ? 'This account isn’t connected to LinkedIn.'
      : connection.expired
        ? 'The LinkedIn connection has expired. Reconnect it under your picture → LinkedIn connections to publish from here.'
        : waitMins !== null
          ? `LinkedIn asked the app to wait. Publishing is possible again in about ${waitMins} min.`
          : later
            ? `It goes out ${where}. The time is UAE time${tz.zone !== 'Asia/Dubai' ? ` (${tz.dual(p.scheduled_at!)})` : ''}; until then you can still edit or unschedule it.`
            : `Publish posts it ${where} right away. To remove it afterwards you’d delete it on LinkedIn itself.`
  const blocked = !p.by_hand && !!connection && (connection.expired || waitMins !== null)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>
            Check it as it will appear on LinkedIn.
          </DialogDescription>
        </DialogHeader>
        <FeedPreview
          accountName={accountName}
          caption={p.caption}
          format={p.format}
          details={p.details ?? {}}
          imageSrc={p.has_image ? api.plannedImageUrl(p.id, p.approved_at ?? p.id.toString()) : null}
        />
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{note}</p>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={onEdit} disabled={busy}>
            <Pencil /> Edit
          </Button>
          {later ? (
            <>
              <Button variant="outline" onClick={() => onPublish(byApp ? 'now' : 'copy')} disabled={busy || blocked}>
                <Send /> Publish now
              </Button>
              <Button onClick={() => onPublish('scheduled')} disabled={busy}>
                <CalendarClock /> {busy ? 'Saving…' : `Schedule ${when}`}
              </Button>
            </>
          ) : (
            <Button onClick={() => onPublish(byApp ? 'now' : 'copy')} disabled={busy || blocked}>
              <Send /> {busy ? 'Publishing…' : 'Publish'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
