import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Hourglass,
  ImagePlus,
  Link2,
  ListChecks,
  Pencil,
  Plus,
  Send,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, PageHeader, SimpleSelect } from '@/components/common'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { isoToZonedInput, UAE, useTz, zonedInputToIso, zoneLabel } from '@/context/timezone'
import { useLinkedInConnections, usePlanned, usePlannerMutation } from '@/hooks/queries'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  api,
  ApiError,
  PLANNED_FORMATS,
  type LinkedInConnection,
  type PlannedDetails,
  type PlannedFormat,
  type PlannedPost,
  type PlannedPostInput,
  type PlannedStatus,
} from '@/lib/api'
import { needsAction, PLANNED_FORMAT_LABELS } from '@/lib/publishing'
import { cn } from '@/lib/utils'

const STATUS: Record<PlannedStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-muted text-foreground border-border' },
  approved: { label: 'Approved', cls: 'bg-info/10 text-info-fg border-info/30' },
  publishing: { label: 'Publishing…', cls: 'bg-info/10 text-info-fg border-info/30' },
  published: { label: 'Published', cls: 'bg-good/15 text-good-fg border-good/30' },
  failed: { label: 'Failed', cls: 'bg-bad/10 text-bad-fg border-bad/40' },
  missed: { label: 'Missed', cls: 'bg-serious/15 text-serious-fg border-serious/40' },
}

const MAX_CHARS = 3000

export function PublishingPage() {
  const { account } = useAccount()
  const auth = useAuth()
  const { data: connections = [] } = useLinkedInConnections()
  const { data: planned, isLoading } = usePlanned(account?.id)
  const [editing, setEditing] = useState<PlannedPost | 'new' | null>(null)
  const connection = connections.find((c) => c.account_id === account?.id)
  const isCompany = account?.kind === 'company'
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: PlannedFormat | 'all' = (PLANNED_FORMATS as readonly string[]).includes(tabParam ?? '') ? (tabParam as PlannedFormat) : 'all'
  const shown = (planned ?? []).filter((p) => tab === 'all' || p.format === tab)
  // From the Calendar: ?new_at=<ISO time> opens a new draft for that day and time
  const [newAt, setNewAt] = useState<string | undefined>()
  const canEdit = auth.can('editor')
  useEffect(() => {
    const at = params.get('new_at')
    if (!at) return
    if (canEdit && !Number.isNaN(Date.parse(at))) {
      setNewAt(at)
      setEditing('new')
    }
    setParams((p) => { p.delete('new_at'); return p }, { replace: true })
  }, [params, setParams, canEdit])

  if (!account) return null

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader eyebrow="Publishing"
        title="Publishing"
        description="Draft → approve → publish. Text and image posts can be published by the app; carousel, video, article and poll posts are approved here, posted on LinkedIn by hand, then marked as posted."
        actions={
          auth.can('editor') ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus /> New {tab === 'all' ? 'post' : `${PLANNED_FORMAT_LABELS[tab].toLowerCase()} post`}
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setParams((p) => { if (v === 'all') p.delete('tab'); else p.set('tab', String(v)); return p }, { replace: true })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">
            All <span className="text-muted-foreground tabular-nums">({planned?.length ?? 0})</span>
          </TabsTrigger>
          {PLANNED_FORMATS.map((f) => {
            const waiting = (planned ?? []).filter((p) => p.format === f && needsAction(p)).length
            return (
              <TabsTrigger key={f} value={f} className="relative" title={waiting ? `${waiting} waiting for someone` : undefined}>
                {PLANNED_FORMAT_LABELS[f]}
                {waiting > 0 && <span aria-label={`${waiting} need action`} className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-bad ring-2 ring-background" />}
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {isCompany ? (
        <div className="rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
          <b>{account.name}</b> is a company page. You can draft, edit and approve posts here, but the app can’t post as the page until
          LinkedIn’s Community Management API is approved. Until then, copy an approved caption and post it on LinkedIn by hand.
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
          The app can’t publish {PLANNED_FORMAT_LABELS[tab].toLowerCase()} posts yet. Draft and approve them here, post them on LinkedIn
          by hand, then click <b>Mark as posted</b> and paste the link, so the post is tracked with the right format.
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !shown.length ? (
        <EmptyState>
          {tab === 'all' ? 'No posts in the queue.' : `No ${PLANNED_FORMAT_LABELS[tab].toLowerCase()} posts in the queue.`} Click “New post” to draft
          one.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <PlannedCard key={p.id} p={p} accountId={account.id} connection={connection} showFormat={tab === 'all'} onEdit={() => setEditing(p)} />
          ))}
        </div>
      )}

      {editing && (
        <PlannedDialog
          accountId={account.id}
          initial={editing === 'new' ? undefined : editing}
          defaultFormat={tab === 'all' ? 'text' : tab}
          defaultScheduled={editing === 'new' ? newAt : undefined}
          onClose={() => { setEditing(null); setNewAt(undefined) }}
        />
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
  connection,
  showFormat,
  onEdit,
}: {
  p: PlannedPost
  accountId: number
  connection?: LinkedInConnection
  showFormat: boolean
  onEdit: () => void
}) {
  const tz = useTz()
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [markPosted, setMarkPosted] = useState(false)
  const action = usePlannerMutation(accountId, (a: 'approve' | 'unapprove' | 'publish') => api.plannedAction(p.id, a))
  const remove = usePlannerMutation(accountId, () => api.deletePlanned(p.id))
  const editable = p.status === 'draft' || p.status === 'failed' || p.status === 'missed'
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
    <div className="rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {showFormat && <Badge variant="outline">{PLANNED_FORMAT_LABELS[p.format]}</Badge>}
          <Badge variant="outline" className={badge.cls}>
            {p.manual && p.status === 'approved' ? 'Approved: post by hand' : badge.label}
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
          {p.topic && <Badge variant="secondary">{p.topic}</Badge>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {editable && auth.can('editor') && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
          )}
          {editable && auth.can('approver') && (
            <Button size="sm" onClick={() => run('approve')} disabled={action.isPending}>
              <CheckCircle2 /> Approve
            </Button>
          )}
          {p.status === 'approved' && auth.can('approver') && (
            <>
              <Button size="sm" variant="outline" onClick={() => run('unapprove')} disabled={action.isPending}>
                <Undo2 /> Un-approve
              </Button>
              {p.manual ? (
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

const DURATION_LABELS: Record<NonNullable<PlannedDetails['duration']>, string> = { '1d': '1 day', '3d': '3 days', '1w': '1 week', '2w': '2 weeks' }

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

function PlannedDialog({
  accountId,
  initial,
  defaultFormat,
  defaultScheduled,
  onClose,
}: {
  accountId: number
  initial?: PlannedPost
  defaultFormat: PlannedFormat
  defaultScheduled?: string // ISO time, e.g. from the Calendar
  onClose: () => void
}) {
  const tz = useTz()
  // Lock the zone while the dialog is open so a zone switch can't reinterpret the typed time
  const [zone] = useState(tz.zone)
  const [format, setFormat] = useState<PlannedFormat>(initial?.format ?? defaultFormat)
  const [details, setDetails] = useState<PlannedDetails>(initial?.details ?? {})
  const setDetail = <K extends keyof PlannedDetails>(k: K, v: PlannedDetails[K]) => setDetails((d) => ({ ...d, [k]: v }))
  const [media, setMedia] = useState<File | null>(null)
  const manual = format !== 'text' && format !== 'image'
  const [caption, setCaption] = useState(initial?.caption ?? '')
  const startAt = initial?.scheduled_at ?? defaultScheduled
  const [scheduled, setScheduled] = useState(startAt ? isoToZonedInput(startAt, zone) : '')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'CONNECTIONS'>(initial?.visibility ?? 'PUBLIC')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [industry, setIndustry] = useState(initial?.industry ?? '')
  const [cta, setCta] = useState(initial?.cta ?? '')
  const [imageAlt, setImageAlt] = useState(initial?.image_alt ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const refresh = usePlannerMutation(accountId, async () => undefined)

  const save = async () => {
    if (!caption.trim()) return toast.error('Write the post text first')
    if (caption.length > MAX_CHARS) return toast.error(`LinkedIn allows ${MAX_CHARS} characters`)
    const options = (details.options ?? []).map((o) => o.trim()).filter(Boolean)
    if (format === 'poll' && (!details.question?.trim() || options.length < 2)) return toast.error('A poll needs a question and at least 2 options')
    const body: PlannedPostInput = {
      account_id: accountId,
      format,
      details: format === 'poll' ? { ...details, options } : details,
      caption,
      image_alt: imageAlt.trim() || null,
      visibility,
      scheduled_at: scheduled ? zonedInputToIso(scheduled, zone) : null,
      topic: topic.trim() || null,
      industry: industry.trim() || null,
      cta: cta.trim() || null,
      keywords: [],
    }
    setSaving(true)
    try {
      const saved = initial ? await api.updatePlanned(initial.id, body) : await api.createPlanned(body)
      // The server removes files that don't belong to a changed format
      if (format === 'image' && removeImage && initial?.has_image) await api.removePlannedImage(saved.id)
      if (format === 'image' && file) await api.uploadPlannedImage(saved.id, file)
      if ((format === 'carousel' || format === 'video') && media) await api.uploadPlannedMedia(saved.id, media)
      toast.success(initial ? 'Saved. Approve it again before it can be published.' : 'Draft saved')
      refresh.mutate(undefined)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
      refresh.mutate(undefined)
    } finally {
      setSaving(false)
    }
  }

  const over = caption.length > MAX_CHARS
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit post' : 'New post'}</DialogTitle>
          <DialogDescription>
            Saved as a draft. It needs approval{manual ? ', then someone posts it on LinkedIn by hand and marks it as posted.' : ' before it can be published.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Format</Label>
            <div className="flex flex-wrap gap-1.5">
              {PLANNED_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors',
                    format === f ? 'bg-brand-gradient text-white ring-transparent' : 'text-muted-foreground ring-primary/20 hover:text-foreground',
                  )}
                >
                  {PLANNED_FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
            {manual && <p className="mt-1 text-xs text-muted-foreground">The app can’t publish this format yet: it will be posted on LinkedIn by hand.</p>}
          </div>

          <div>
            <Label className="mb-1.5 block">{format === 'article' ? 'Intro post text *' : 'Post text *'}</Label>
            <Textarea rows={8} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={'Hook line first: it is all most people see.\n\n…\n\n#UAE #EdTech'} />
            <div className={cn('mt-1 flex justify-between text-xs', over ? 'text-bad-fg' : 'text-muted-foreground')}>
              <span>Hashtags written as #tag become clickable.</span>
              <span className="tabular-nums">
                {caption.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>
            {caption.trim() && (
              <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="font-medium">Before “…see more”, roughly: </span>
                <span className="text-muted-foreground">{hookPreview(caption)}</span>
              </div>
            )}
          </div>

          {format === 'carousel' && (
            <div className="space-y-2">
              <Label className="block">Carousel</Label>
              <Input
                value={details.document_title ?? ''}
                onChange={(e) => setDetail('document_title', e.target.value)}
                maxLength={100}
                placeholder="Document title shown on LinkedIn, e.g. 5 signs your school has outgrown its LMS"
              />
              <MediaPicker
                accept="application/pdf"
                label="the PDF (up to 100 MB)"
                file={media}
                onFile={setMedia}
                current={initial?.has_media ? initial : undefined}
              />
              <p className="text-xs text-muted-foreground">LinkedIn carousels are PDF documents: one slide per page. Make the first slide the hook.</p>
            </div>
          )}

          {format === 'video' && (
            <div className="space-y-2">
              <Label className="block">Video</Label>
              <MediaPicker accept="video/mp4,video/quicktime" label="the video (MP4 or MOV, up to 200 MB)" file={media} onFile={setMedia} current={initial?.has_media ? initial : undefined} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!details.subtitles} onChange={(e) => setDetail('subtitles', e.target.checked)} />
                Subtitles added (many people watch with the sound off)
              </label>
            </div>
          )}

          {format === 'article' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="mb-1.5 block">Article / newsletter title</Label>
                <Input value={details.title ?? ''} onChange={(e) => setDetail('title', e.target.value)} maxLength={150} placeholder="e.g. Gulf business-tech brief: November" />
              </div>
              <div>
                <Label className="mb-1.5 block">Link (if already published)</Label>
                <Input value={details.link ?? ''} onChange={(e) => setDetail('link', e.target.value)} placeholder="https://…" />
              </div>
            </div>
          )}

          {format === 'poll' && (
            <div className="space-y-2">
              <Label className="block">Poll question *</Label>
              <Input value={details.question ?? ''} onChange={(e) => setDetail('question', e.target.value)} maxLength={140} placeholder="e.g. What slows down your ERP project most?" />
              <div className="grid gap-2 sm:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <Input
                    key={i}
                    value={details.options?.[i] ?? ''}
                    maxLength={30}
                    placeholder={`Option ${i + 1}${i < 2 ? ' *' : ' (optional)'}`}
                    onChange={(e) => {
                      const next = [...(details.options ?? [])]
                      while (next.length <= i) next.push('')
                      next[i] = e.target.value
                      setDetail('options', next)
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Runs for</span>
                <SimpleSelect
                  value={details.duration ?? '1w'}
                  onChange={(v) => setDetail('duration', v as PlannedDetails['duration'])}
                  options={Object.entries(DURATION_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <p className="text-xs text-muted-foreground">LinkedIn polls: question up to 140 characters, 2 to 4 options of up to 30 characters.</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">
                {manual ? 'Planned date' : 'Publish at'} ({zoneLabel(zone)} time)
              </Label>
              <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                {scheduled && zone !== UAE
                  ? `= ${isoToZonedInput(zonedInputToIso(scheduled, zone), UAE).replace('T', ' ')} UAE`
                  : manual
                    ? 'For planning only: the app won’t post this format.'
                    : 'Leave empty to publish manually.'}
              </p>
            </div>
            <div className={cn(manual && 'hidden')}>
              <Label className="mb-1.5 block">Who can see it</Label>
              <SimpleSelect
                value={visibility}
                onChange={(v) => setVisibility(v as 'PUBLIC' | 'CONNECTIONS')}
                options={[
                  { value: 'PUBLIC', label: 'Anyone (public)' },
                  { value: 'CONNECTIONS', label: 'Connections only' },
                ]}
                className="h-8 w-full"
              />
            </div>
          </div>

          <div className={cn(format !== 'image' && 'hidden')}>
            <Label className="mb-1.5 block">Image</Label>
            {initial?.has_image && !removeImage && !file && (
              <div className="mb-2 flex items-center gap-3">
                <img src={api.plannedImageUrl(initial.id, initial.approved_at ?? 'x')} alt="" className="size-16 rounded object-cover" />
                <Button size="xs" variant="outline" onClick={() => setRemoveImage(true)}>
                  Remove image
                </Button>
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <ImagePlus className="size-4" />
              {file ? file.name : initial?.has_image && !removeImage ? 'Replace image (JPG, PNG or GIF, max 10 MB)' : 'Add an image (JPG, PNG or GIF, max 10 MB)'}
              <input type="file" accept="image/jpeg,image/png,image/gif" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {(file || (initial?.has_image && !removeImage)) && (
              <Input className="mt-2" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} placeholder="Alt text: describe the image for screen readers" />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="mb-1.5 block">Topic</Label>
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. LMS" />
            </div>
            <div>
              <Label className="mb-1.5 block">Industry</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Education" />
            </div>
            <div>
              <Label className="mb-1.5 block">CTA</Label>
              <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. Comment LMS" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Topic, industry and CTA are copied into tracking when the post is published.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || over}>
            {saving ? 'Saving…' : 'Save draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Roughly what LinkedIn shows before "…see more": the first 3 lines, cut at about 210 characters. Approximate: it varies by device. */
function hookPreview(caption: string): string {
  const lines = caption.trim().split('\n').slice(0, 3).join(' ').replace(/\s+/g, ' ')
  return lines.length > 210 ? `${lines.slice(0, 210).trimEnd()}…` : lines
}

function MediaPicker({
  accept,
  label,
  file,
  onFile,
  current,
}: {
  accept: string
  label: string
  file: File | null
  onFile: (f: File | null) => void
  current?: PlannedPost
}) {
  return (
    <div>
      {current && !file && (
        <a href={api.plannedMediaUrl(current.id)} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1 text-xs underline">
          Current file: {current.media_name ?? 'open'} <ExternalLink className="size-3" />
        </a>
      )}
      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
        <Upload className="size-4" />
        {file ? file.name : current ? `Replace ${label}` : `Attach ${label} for the approver to review`}
        <input type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  )
}
