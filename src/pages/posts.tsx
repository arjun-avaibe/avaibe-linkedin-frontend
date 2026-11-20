import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Plus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageHeader, SimpleSelect } from '@/components/common'
import { inRange, TimeRangePicker, type TimeRange } from '@/components/time-range'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { useTz } from '@/context/timezone'
import { useAllPosts, useOverview, usePosts, useDueSnapshots } from '@/hooks/queries'
import { FORMATS, type Post, type Snapshot } from '@/lib/api'
import { FORMAT_LABELS, fmtNumber, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const PAGE_SIZES = ['10', '25', '50']
const MIN_FOR_TYPICAL = 5 // posts needed at the same age before "vs typical" is shown

type SortKey = 'date' | 'impressions' | 'views' | 'clicks' | 'ctr' | 'reactions' | 'comments' | 'reposts' | 'vs'

interface Row {
  post: Post
  latest?: Snapshot
  impressions: number | null
  views: number | null
  clicks: number | null
  ctr: number | null
  reactions: number | null
  comments: number | null
  reposts: number | null
  vs: number | null // impressions ÷ the account's typical post at the same age
}

const median = (v: number[]) => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** First line of the caption, like LinkedIn's "Post title" */
function postTitle(p: Post): string {
  const first = (p.caption ?? '').split('\n').find((l) => l.trim())?.trim()
  return first || p.topic || `Post #${p.id}`
}

function buildRows(posts: Post[]): Row[] {
  // Typical impressions per account and age (checkpoint), from all of that account's posts
  const byKey = new Map<string, number[]>()
  for (const p of posts) {
    for (const s of p.snapshots) {
      if (s.impressions == null) continue
      const k = `${p.account_id}:${s.checkpoint}`
      byKey.set(k, [...(byKey.get(k) ?? []), s.impressions])
    }
  }
  return posts.map((p) => {
    const latest = p.snapshots[p.snapshots.length - 1]
    const imp = latest?.impressions ?? null
    const peers = latest ? byKey.get(`${p.account_id}:${latest.checkpoint}`) ?? [] : []
    const typical = peers.length >= MIN_FOR_TYPICAL ? median(peers) : null
    return {
      post: p,
      latest,
      impressions: imp,
      views: latest?.video_views ?? latest?.newsletter_views ?? null,
      clicks: latest?.clicks ?? null,
      ctr: latest?.click_rate ?? null,
      reactions: latest?.reactions ?? null,
      comments: latest?.comments ?? null,
      reposts: latest?.reposts ?? null,
      vs: imp != null && typical ? imp / typical : null,
    }
  })
}

/** embedded: shown as the Posts tab of the Data page, which supplies the time range and the page title */
export function PostsPage({ embedded = false, range: outerRange }: { embedded?: boolean; range?: TimeRange } = {}) {
  const { account, accounts } = useAccount()
  const auth = useAuth()
  const tz = useTz()
  const [params, setParams] = useSearchParams()
  const [scope, setScope] = useState<'account' | 'all'>('account')
  const [format, setFormat] = useState('all')
  const [review, setReview] = useState(params.get('review') === 'needs')
  // Posts whose 24h/48h/7d numbers are ready to record (the number shown on Data in the sidebar)
  const [dueOnly, setDueOnly] = useState(params.get('due') === '1')
  const { data: dueList = [] } = useDueSnapshots(scope === 'account' ? account?.id : undefined)
  const dueIds = useMemo(() => new Set(dueList.map((d) => d.post_id)), [dueList])
  const [ownRange, setRange] = useState<TimeRange>({ preset: '90' })
  const range = outerRange ?? ownRange
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true })
  const [pageSize, setPageSize] = useState('10')
  const [page, setPage] = useState(0)

  const { data: probe } = useOverview(scope === 'account' ? account?.id : undefined, '24h')
  const cp = scope === 'account' ? (probe?.suggested_checkpoint ?? '24h') : '24h'
  const opts = { format: format === 'all' ? undefined : format, checkpoint: cp }
  const one = usePosts(scope === 'account' ? account?.id : undefined, opts)
  const all = useAllPosts(opts, scope === 'all')
  const { data: posts, isLoading } = scope === 'all' ? all : one
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  const rows = useMemo(() => buildRows(posts ?? []), [posts])
  const needsChecking = rows.filter((r) => r.post.format === 'untagged' || r.post.topic_suggested).length

  const shown = useMemo(() => {
    const list = rows.filter(
      (r) =>
        (dueOnly ? dueIds.has(r.post.id) : inRange(r.post.published_at, range)) &&
        (!review || r.post.format === 'untagged' || r.post.topic_suggested),
    )
    const val = (r: Row) => (sort.key === 'date' ? new Date(r.post.published_at).getTime() : r[sort.key])
    return list.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      if (x == null && y == null) return 0
      if (x == null) return 1 // empty values last, whichever direction
      if (y == null) return -1
      return sort.desc ? y - x : x - y
    })
  }, [rows, range, review, sort, dueOnly, dueIds])

  const size = Number(pageSize)
  const pages = Math.max(1, Math.ceil(shown.length / size))
  const current = Math.min(page, pages - 1)
  const pageRows = shown.slice(current * size, current * size + size)
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setPage(0)
  }
  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }))
    setPage(0)
  }
  const showAccount = scope === 'all'

  return (
    <div className={embedded ? '' : 'mx-auto max-w-7xl'}>
      {!embedded && <PageHeader
        title="Posts"
        description="Every post with its numbers so far. “vs typical” compares each post with this account’s usual post at the same age."
        actions={
          auth.can('editor') && (
            <Link to="/posts/new" className={buttonVariants({ size: 'sm' })}>
              <Plus /> Add post
            </Link>
          )
        }
      />}

      {/* Filters: a few, in one row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!embedded && <TimeRangePicker value={range} onChange={resetPage(setRange)} />}
        <SimpleSelect
          label="Type"
          value={format}
          onChange={resetPage(setFormat)}
          options={[{ value: 'all', label: 'All types' }, ...FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))]}
        />
        {auth.canSwitch && accounts.length > 1 && (
          <SimpleSelect
            label="Show"
            value={scope}
            onChange={resetPage((v: string) => setScope(v as 'account' | 'all'))}
            options={[
              { value: 'account', label: account ? account.name : 'This account' },
              { value: 'all', label: 'All accounts' },
            ]}
          />
        )}
        {needsChecking > 0 && (
          <button
            type="button"
            onClick={() => {
              setReview((v) => !v)
              setPage(0)
              if (params.get('review')) setParams((p) => { p.delete('review'); return p }, { replace: true })
            }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors',
              review ? 'bg-primary text-primary-foreground ring-transparent' : 'text-muted-foreground ring-border hover:text-foreground',
            )}
          >
            Needs checking ({needsChecking})
          </button>
        )}
        {scope === 'account' && (dueIds.size > 0 || dueOnly) && (
          <button
            type="button"
            title="Posts whose 24h, 48h or 7-day numbers are ready to record. Open a post to add them."
            onClick={() => {
              setDueOnly((v) => !v)
              setPage(0)
              if (params.get('due')) setParams((p) => { p.delete('due'); return p }, { replace: true })
            }}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors',
              dueOnly ? 'bg-primary text-primary-foreground ring-transparent' : 'text-muted-foreground ring-border hover:text-foreground',
            )}
          >
            Snapshots due ({dueIds.size})
          </button>
        )}
        {embedded && auth.can('editor') && (
          <Link to="/posts/new" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'ml-auto')}>
            <Plus /> Add post
          </Link>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : !shown.length ? (
        <EmptyState>
          {rows.length ? 'No posts match these filters.' : <>No posts yet. <Link to="/posts/new" className="underline">Add one</Link> or <Link to="/import" className="underline">import LinkedIn’s export</Link>.</>}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="sticky left-0 z-10 w-[340px] bg-card px-4 py-3 font-medium shadow-[1px_0_0_var(--border)]">
                    <SortButton label="Post" k="date" sort={sort} onSort={toggleSort} />
                  </th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Audience</th>
                  <NumTh label="Impressions" k="impressions" sort={sort} onSort={toggleSort} />
                  <NumTh
                    label="Views"
                    k="views"
                    sort={sort}
                    onSort={toggleSort}
                    hint="Video plays and article opens. LinkedIn doesn’t count views for image, text or poll posts."
                  />
                  <NumTh label="Clicks" k="clicks" sort={sort} onSort={toggleSort} />
                  <NumTh label="CTR" k="ctr" sort={sort} onSort={toggleSort} hint="Clicks ÷ impressions" />
                  <NumTh label="Reactions" k="reactions" sort={sort} onSort={toggleSort} />
                  <NumTh label="Comments" k="comments" sort={sort} onSort={toggleSort} />
                  <NumTh label="Reposts" k="reposts" sort={sort} onSort={toggleSort} />
                  <NumTh label="vs typical" k="vs" sort={sort} onSort={toggleSort} hint="Impressions compared with this account’s usual post at the same age" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const p = r.post
                  return (
                    <tr key={p.id} className="group border-b last:border-0 hover:bg-muted/40">
                      <td className="sticky left-0 z-10 w-[340px] max-w-[340px] bg-card px-4 py-3 align-top shadow-[1px_0_0_var(--border)] group-hover:bg-muted">
                        <Link to={`/posts/${p.id}`} className="line-clamp-2 font-medium text-primary hover:underline">
                          {postTitle(p)}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          {showAccount && <span className="font-medium text-foreground">{accountById.get(p.account_id)?.name}</span>}
                          {showAccount && <span>·</span>}
                          <span>{p.author ?? 'Unknown author'}</span>
                          <span>·</span>
                          <span title={p.time_known ? undefined : 'LinkedIn’s export gives the date only'}>
                            {p.time_known ? tz.dateTime(p.published_at) : `${p.published_at_uae.slice(0, 10)} (time unknown)`}
                          </span>
                          {p.post_url && (
                            <a href={p.post_url} target="_blank" rel="noreferrer" className="hover:text-foreground" aria-label="Open on LinkedIn" title="Open on LinkedIn">
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className={cn('px-3 py-3 align-top text-xs', p.format === 'untagged' && 'text-warn-fg')}>{FORMAT_LABELS[p.format]}</td>
                      <td className="px-3 py-3 align-top text-xs">{p.targeted == null ? <span className="text-muted-foreground">—</span> : p.targeted ? 'Targeted' : 'All followers'}</td>
                      <Num v={r.impressions} />
                      <td className="px-3 py-3 text-right align-top tabular-nums">
                        {r.views != null ? (
                          fmtNumber(r.views)
                        ) : (
                          <span className="text-muted-foreground" title={viewsBlankReason(p.format)}>
                            —
                          </span>
                        )}
                      </td>
                      <Num v={r.clicks} />
                      <td className="px-3 py-3 text-right align-top tabular-nums">{r.ctr == null ? <Dash /> : fmtPct(r.ctr)}</td>
                      <Num v={r.reactions} />
                      <Num v={r.comments} />
                      <Num v={r.reposts} />
                      <td className="px-3 py-3 text-right align-top">
                        <VsTypical v={r.vs} checkpoint={r.latest?.checkpoint} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination, like LinkedIn's "Show 10" */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {current * size + 1}–{Math.min(shown.length, current * size + size)} of {shown.length} posts
            </span>
            <div className="flex items-center gap-3">
              <SimpleSelect label="Show" value={pageSize} onChange={resetPage(setPageSize)} options={PAGE_SIZES.map((s) => ({ value: s, label: s }))} />
              <div className="flex items-center gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  <ChevronLeft />
                </Button>
                <span className="tabular-nums">
                  Page {current + 1} of {pages}
                </span>
                <Button size="icon-sm" variant="ghost" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortButton({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; desc: boolean }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k
  const Icon = sort.desc ? ArrowDown : ArrowUp
  return (
    <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}>
      {label}
      {active && <Icon className="size-3" />}
    </button>
  )
}

function NumTh({ label, k, sort, onSort, hint }: { label: string; k: SortKey; sort: { key: SortKey; desc: boolean }; onSort: (k: SortKey) => void; hint?: string }) {
  return (
    <th className="px-3 py-3 text-right font-medium whitespace-nowrap" title={hint}>
      <SortButton label={label} k={k} sort={sort} onSort={onSort} />
    </th>
  )
}

const Dash = () => <span className="text-muted-foreground">—</span>

/** Why a post has no view count (shown on hover), so a blank isn't mistaken for missing data */
function viewsBlankReason(format: string): string {
  if (format === 'video') return 'Video views not recorded yet (LinkedIn’s API keeps them for about 6 months)'
  if (format === 'newsletter') return 'Article views come only from LinkedIn’s Excel export, not the API'
  if (format === 'untagged') return 'Set the post type to see whether views apply'
  return 'LinkedIn doesn’t count views for this post type (only for videos and articles)'
}

function Num({ v }: { v: number | null }) {
  return <td className="px-3 py-3 text-right align-top tabular-nums">{v == null ? <Dash /> : fmtNumber(v)}</td>
}

function VsTypical({ v, checkpoint }: { v: number | null; checkpoint?: string }) {
  if (v == null) return <span className="text-xs text-muted-foreground" title="Too few posts of the same age to compare yet">—</span>
  const up = v >= 1.15
  const down = v <= 0.85
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
        up ? 'bg-good/10 text-good-fg' : down ? 'bg-bad/10 text-bad-fg' : 'bg-muted text-muted-foreground',
      )}
      title={`Compared with this account’s usual post at ${checkpoint}`}
    >
      {up ? '▲' : down ? '▼' : '≈'} {v.toFixed(1)}×
    </span>
  )
}
