import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ExternalLink, FileText, LineChart, Pencil, Trash2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AudienceEditor, parseNum, toEditorRows, type EditorRow } from '@/components/audience-editor'
import { EmptyState, PageHeader, Section, ShareSummary } from '@/components/common'
import { PostForm } from '@/components/post-form'
import { useAuth } from '@/context/auth'
import { useTz } from '@/context/timezone'
import { useDeletePost, useDeleteSnapshot, usePost, useSaveAudience, useSaveSnapshot, useSavePost } from '@/hooks/queries'
import { CHECKPOINTS, METRIC_FIELDS, type Checkpoint, type MetricField, type Post, type PostFormat } from '@/lib/api'
import { FORMAT_LABELS, fmtNumber, fmtPct, metricLabel } from '@/lib/format'

// Fields shown for every format, plus the format-specific ones
const COMMON: MetricField[] = ['impressions', 'members_reached', 'reactions', 'comments', 'reposts', 'clicks', 'followers_gained']
const EXTRA: Partial<Record<PostFormat, MetricField[]>> = {
  video: ['video_views'],
  poll: ['poll_votes'],
  newsletter: ['newsletter_views', 'newsletter_subscribers'],
}

const CHECKPOINT_HOURS: Record<Checkpoint, number> = { '1h': 1, '6h': 6, '24h': 24, '48h': 48, '7d': 168 }

export function PostDetailPage() {
  const id = Number(useParams().id)
  const { data: post, isLoading, error } = usePost(id)
  if (isLoading) return <Skeleton className="mx-auto h-96 max-w-6xl" />
  if (error || !post) return <EmptyState>Post not found. <Link to="/posts" className="underline">Back to posts</Link></EmptyState>
  return <PostDetail post={post} />
}

function PostDetail({ post }: { post: Post }) {
  const tz = useTz()
  const canEdit = useAuth().can('editor')
  const [params] = useSearchParams()
  const initialCp = params.get('checkpoint') as Checkpoint | null
  const [editingCp, setEditingCp] = useState<Checkpoint | null>(initialCp && CHECKPOINTS.includes(initialCp) ? initialCp : null)
  const [editPost, setEditPost] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const del = useDeletePost(post.account_id)
  const save = useSavePost(post.id)
  const navigate = useNavigate()
  const fields = [...COMMON, ...(EXTRA[post.format] ?? [])]
  const byCp = new Map(post.snapshots.map((s) => [s.checkpoint, s]))
  const published = new Date(post.published_at).getTime()

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Data"
        title={post.topic ?? `Post #${post.id}`}
        description={
          <>
            {FORMAT_LABELS[post.format]} ·{' '}
            {post.time_known ? (
              <>
                {tz.weekday(post.published_at)} {tz.dual(post.published_at)} · UAE slot {post.slot_uae}
              </>
            ) : (
              <>
                {post.day_uae} {post.published_at_uae.slice(0, 10)} · time unknown (LinkedIn export)
              </>
            )}
            {post.topic_suggested && <> · topic suggested from the caption: edit and save to confirm</>}
          </>
        }
        actions={
          <>
            {post.post_url && (
              <a href={post.post_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                Open on LinkedIn <ExternalLink className="size-3.5" />
              </a>
            )}
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditPost(true)}>
                  <Pencil /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Section icon={LineChart}
          className="lg:col-span-2"
          title="Performance snapshots"
          description="Record numbers from LinkedIn post analytics at each checkpoint. Leave a field blank if LinkedIn doesn't show it; blank is not zero."
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  {CHECKPOINTS.map((cp) => (
                    <TableHead key={cp} className="text-right">
                      {cp}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((f) => (
                  <TableRow key={f}>
                    <TableCell className="text-muted-foreground">{metricLabel(f)}</TableCell>
                    {CHECKPOINTS.map((cp) => (
                      <TableCell key={cp} className="text-right tabular-nums">
                        {fmtNumber(byCp.get(cp)?.[f])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Engagement rate</TableCell>
                  {CHECKPOINTS.map((cp) => (
                    <TableCell key={cp} className="text-right font-medium tabular-nums">
                      {fmtPct(byCp.get(cp)?.engagement_rate)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Click rate</TableCell>
                  {CHECKPOINTS.map((cp) => (
                    <TableCell key={cp} className="text-right font-medium tabular-nums">
                      {fmtPct(byCp.get(cp)?.click_rate)}
                    </TableCell>
                  ))}
                </TableRow>
                {canEdit && (
                <TableRow>
                  <TableCell />
                  {CHECKPOINTS.map((cp, i) => {
                    // Capture window: from this checkpoint until the next one (7d: +48h)
                    const openAt = published + CHECKPOINT_HOURS[cp] * 3600 * 1000
                    const next = CHECKPOINTS[i + 1]
                    const closeAt = published + (next ? CHECKPOINT_HOURS[next] : CHECKPOINT_HOURS[cp] + 48) * 3600 * 1000
                    const now = Date.now()
                    const has = byCp.has(cp)
                    const isDue = !has && openAt <= now && now < closeAt
                    const missed = !has && now >= closeAt
                    return (
                      <TableCell key={cp} className="text-right">
                        <Button
                          size="xs"
                          variant={isDue ? 'default' : missed ? 'ghost' : 'outline'}
                          title={missed ? 'Window closed: only enter this if you have a record taken at the time' : undefined}
                          onClick={() => setEditingCp(cp)}
                        >
                          {has ? 'Edit' : isDue ? 'Enter (due)' : missed ? 'Missed' : 'Enter'}
                        </Button>
                      </TableCell>
                    )
                  })}
                </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Section>

        <Section icon={FileText} title="Post details">
          <dl className="space-y-3 text-sm">
            <Detail label="CTA">{post.cta}</Detail>
            <Detail label="Industry">{post.industry}</Detail>
            <Detail label="Author">{post.author}</Detail>
            <Detail label="Hashtags">
              {post.hashtags.length ? (
                <span className="flex flex-wrap gap-1">
                  {post.hashtags.map((h) => (
                    <Badge key={h} variant="secondary">
                      {h}
                    </Badge>
                  ))}
                </span>
              ) : null}
            </Detail>
            <Detail label="Keywords">{post.keywords.join(', ') || null}</Detail>
            <Detail label="Caption">{post.caption && <span className="whitespace-pre-wrap">{post.caption}</span>}</Detail>
            <Detail label="Notes">{post.notes}</Detail>
          </dl>
        </Section>
      </div>

      <AudienceSection post={post} />

      {editingCp && (
        <SnapshotDialog post={post} checkpoint={editingCp} fields={fields} onClose={() => setEditingCp(null)} />
      )}

      <Dialog open={editPost} onOpenChange={setEditPost}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit post</DialogTitle>
          </DialogHeader>
          <PostForm
            accountId={post.account_id}
            initial={post}
            submitLabel="Save changes"
            submitting={save.isPending}
            onSubmit={(body) =>
              save.mutate(body, {
                onSuccess: () => {
                  toast.success('Post updated')
                  setEditPost(false)
                },
                onError: (e) => toast.error(e.message),
              })
            }
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>The post and all of its snapshots will be removed. This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={del.isPending}
              onClick={() =>
                del.mutate(post.id, {
                  onSuccess: () => {
                    toast.success('Post deleted')
                    navigate('/posts')
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AudienceSection({ post }: { post: Post }) {
  const tz = useTz()
  const canEdit = useAuth().can('editor')
  const [rows, setRows] = useState<EditorRow[]>(() => toEditorRows(post.audience))
  const save = useSaveAudience(post.id, post.account_id)
  // Prefer the 7d snapshot for estimates (closest to the post's final audience), else the latest one
  const snap = post.snapshots.find((s) => s.checkpoint === '7d') ?? post.snapshots[post.snapshots.length - 1]

  const submit = () => {
    const bad = rows.find((r) => !r.value.trim() || parseNum(r.pct) === null || Number.isNaN(parseNum(r.pct)))
    if (bad) {
      toast.error('Every row needs a value and a percentage')
      return
    }
    save.mutate(
      rows.map((r) => ({ dimension: r.dimension, value: r.value.trim(), pct: parseNum(r.pct)! })),
      { onSuccess: () => toast.success('Audience saved'), onError: (e) => toast.error(e.message) },
    )
  }

  return (
    <Section icon={Users}
      className="mt-4"
      title="Who saw this post"
      description={
        <>
          Copy the audience breakdown from LinkedIn's post analytics (location, industry, seniority…), ideally at 7 days. LinkedIn
          lists only top values, so shares are minimums (≥).
          {post.audience_captured_at && <> Last saved {tz.dateTime(post.audience_captured_at)} {tz.label}.</>}
        </>
      }
    >
      <div className="space-y-4">
        <ShareSummary shares={post.shares} impressions={snap?.impressions} />
        {snap?.impressions != null && (
          <p className="text-xs text-muted-foreground">Estimates use {snap.checkpoint} impressions × share.</p>
        )}
        {canEdit && (
          <>
            <AudienceEditor rows={rows} onChange={setRows} />
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save audience'}
            </Button>
          </>
        )}
      </div>
    </Section>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

function SnapshotDialog({ post, checkpoint, fields, onClose }: {
  post: Post
  checkpoint: Checkpoint
  fields: MetricField[]
  onClose: () => void
}) {
  const existing = post.snapshots.find((s) => s.checkpoint === checkpoint)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(METRIC_FIELDS.map((f) => [f, existing?.[f] != null ? String(existing[f]) : ''])),
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const save = useSaveSnapshot(post.id, post.account_id)
  const remove = useDeleteSnapshot(post.id, post.account_id)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body: Record<string, number | string | null> = { notes: notes.trim() || null }
    for (const f of METRIC_FIELDS) {
      const v = values[f].replace(/,/g, '').trim()
      body[f] = v === '' ? null : Number(v)
    }
    save.mutate(
      { checkpoint, body },
      {
        onSuccess: () => {
          toast.success(`${checkpoint} snapshot saved`)
          onClose()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{checkpoint} snapshot</DialogTitle>
          <DialogDescription>
            Numbers as LinkedIn shows them {checkpoint} after publishing. The capture time is recorded automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f}>
                <Label className="mb-1 block text-xs">{metricLabel(f)}</Label>
                <Input
                  inputMode="numeric"
                  pattern="[0-9,]*"
                  value={values[f]}
                  onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div>
            <Label className="mb-1 block text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. captured 2h late" />
          </div>
          <DialogFooter>
            {existing && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                disabled={remove.isPending}
                onClick={() => remove.mutate(checkpoint, { onSuccess: onClose, onError: (e) => toast.error(e.message) })}
              >
                Remove snapshot
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
