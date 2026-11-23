/**
 * Compare posts: 2–4 posts side by side (picked with the tick boxes in Data → Posts).
 * Numbers are compared at the same age (the latest checkpoint every post has), never a 2-day-old post against a
 * month-old one. It leads with "What made the difference" (each difference checked against the account's own
 * history) and "What to try next"; the numbers follow as evidence. "Ask AI why" adds Claude's reading on click.
 */
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { Bot, ExternalLink, Info, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { InsightsPanel } from '@/components/insights-panel'
import { useAuth } from '@/context/auth'
import { analysePosts, itemsByDate, uaeDay } from '@/lib/compare-insights'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageHeader, PostRef } from '@/components/common'
import { useTz } from '@/context/timezone'
import { usePosts } from '@/hooks/queries'
import { api, CHECKPOINTS, POST_GOALS, type Checkpoint, type CompareExplanation, type Post, type Snapshot } from '@/lib/api'
import { FORMAT_LABELS, fmtNumber, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const AGE: Record<Checkpoint, string> = { '1h': '1 hour', '6h': '6 hours', '24h': '24 hours', '48h': '48 hours', '7d': '7 days' }
const MIN_FOR_TYPICAL = 5

const median = (v: number[]) => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The latest age every post has figures for, so like is compared with like */
function commonCheckpoint(posts: Post[]): Checkpoint | null {
  for (const cp of [...CHECKPOINTS].reverse()) if (posts.every((p) => p.snapshots.some((s) => s.checkpoint === cp && s.impressions != null))) return cp
  return null
}

type NumRow = { label: string; get: (s: Snapshot | undefined, p: Post) => number | null; fmt: (v: number) => string; hint?: string }

export function ComparePostsPage() {
  const tz = useTz()
  const [params, setParams] = useSearchParams()
  const ids = (params.get('ids') ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 4)
  const results = useQueries({ queries: ids.map((id) => ({ queryKey: ['post', id], queryFn: () => api.post(id) })) })
  const loading = results.some((r) => r.isLoading)
  const posts = results.map((r) => r.data).filter((p): p is Post => !!p)
  const cp = commonCheckpoint(posts)
  // Each post's figures at the shared age, or its latest when there's none
  const snap = (p: Post) => (cp ? p.snapshots.find((s) => s.checkpoint === cp) : p.snapshots[p.snapshots.length - 1])

  // "vs typical": against the account's usual post at the same age
  const { data: all = [] } = usePosts(posts[0]?.account_id)
  const typical =
    cp && all.length
      ? median(all.flatMap((p) => p.snapshots.filter((s) => s.checkpoint === cp && s.impressions != null).map((s) => s.impressions!)))
      : null
  const enoughForTypical = cp ? all.filter((p) => p.snapshots.some((s) => s.checkpoint === cp && s.impressions != null)).length >= MIN_FOR_TYPICAL : false

  // Findings use the shared age with the most history behind it, so "your posts usually…" has posts to count
  const shared = CHECKPOINTS.filter((c) => posts.length > 1 && posts.every((p) => p.snapshots.some((s) => s.checkpoint === c && s.impressions != null)))
  const histCount = (c: Checkpoint) => all.filter((p) => p.snapshots.some((s) => s.checkpoint === c && s.impressions != null)).length
  const insightCp = shared.length ? shared.reduce((b, c) => (histCount(c) > histCount(b) ? c : b)) : null
  // Holidays and events across the account's history (for the "holiday or event that day" factor)
  const today = uaeDay(new Date().toISOString())
  const histFrom = all.length ? all.reduce((m, p) => (uaeDay(p.published_at) < m ? uaeDay(p.published_at) : m), today) : today
  const from400 = uaeDay(new Date(Date.now() - 400 * 86_400_000).toISOString())
  const calFrom = histFrom < from400 ? from400 : histFrom
  const { data: cal } = useQuery({ queryKey: ['calendar-items', calFrom, today], queryFn: () => api.calendarItems({ from: calFrom, to: today }), staleTime: 60 * 60_000, enabled: all.length > 0 })
  const insights = insightCp && cal && posts.length >= 2 ? analysePosts(posts, all, insightCp, itemsByDate(cal.items, calFrom, today), AGE[insightCp]) : null

  // Ask AI why (Claude, on click)
  const auth = useAuth()
  const accountId = posts[0]?.account_id
  const status = useQuery({ queryKey: ['post-assist', accountId], queryFn: () => api.postAssistStatus(accountId!), enabled: !!accountId, staleTime: 30_000 })
  const why = useMutation({
    mutationFn: () => api.comparePosts({ account_id: accountId!, post_ids: posts.map((p) => p.id), checkpoint: insightCp! }),
    onSuccess: () => status.refetch(),
    onError: (e) => toast.error((e as Error).message),
  })

  const remove = (id: number) =>
    setParams((p) => {
      p.set('ids', ids.filter((x) => x !== id).join(','))
      return p
    })

  const NUMBERS: NumRow[] = [
    { label: 'Impressions', get: (s) => s?.impressions ?? null, fmt: fmtNumber },
    { label: 'Members reached', get: (s) => s?.members_reached ?? null, fmt: fmtNumber },
    { label: 'Clicks', get: (s) => s?.clicks ?? null, fmt: fmtNumber },
    { label: 'Click rate', get: (s) => s?.click_rate ?? null, fmt: (v) => fmtPct(v) },
    { label: 'Reactions', get: (s) => s?.reactions ?? null, fmt: fmtNumber },
    { label: 'Comments', get: (s) => s?.comments ?? null, fmt: fmtNumber },
    { label: 'Reposts', get: (s) => s?.reposts ?? null, fmt: fmtNumber },
    { label: 'Engagement rate', get: (s) => s?.engagement_rate ?? null, fmt: (v) => fmtPct(v) },
    { label: 'Views', get: (s) => s?.video_views ?? s?.newsletter_views ?? null, fmt: fmtNumber, hint: 'Video plays and article opens only' },
    { label: 'New followers', get: (s) => s?.followers_gained ?? null, fmt: fmtNumber },
    ...(typical && enoughForTypical
      ? [{ label: 'vs typical post', get: (s: Snapshot | undefined) => (s?.impressions != null ? s.impressions / typical : null), fmt: (v: number) => `${v.toFixed(1)}×`, hint: 'Impressions ÷ this account’s usual post at the same age' }]
      : []),
  ]

  const firstLine = (p: Post) => (p.caption ?? '').split('\n').find((l) => l.trim())?.trim() ?? ''
  const TEXT_ROWS: { label: string; get: (p: Post) => string }[] = [
    { label: 'Posted', get: (p) => (p.time_known ? `${tz.weekday(p.published_at)} ${tz.dateTime(p.published_at)}` : `${p.day_uae} ${p.published_at_uae.slice(0, 10)} (time unknown)`) },
    { label: 'Time slot (UAE)', get: (p) => p.slot_uae ?? '—' },
    { label: 'Format', get: (p) => FORMAT_LABELS[p.format] ?? p.format },
    { label: 'Goal', get: (p) => POST_GOALS.find((g) => g.value === p.goal)?.label ?? '—' },
    { label: 'Topic', get: (p) => p.topic ?? '—' },
    { label: 'Audience', get: (p) => (p.targeted == null ? '—' : p.targeted ? 'Targeted' : 'All') },
    { label: 'Hook (first line)', get: (p) => firstLine(p) || '—' },
    { label: 'Length', get: (p) => (p.caption ? `${p.caption.length.toLocaleString()} characters` : '—') },
    { label: 'Hashtags', get: (p) => (p.hashtags.length ? p.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ') : 'None') },
    { label: 'Call to action', get: (p) => p.cta ?? '—' },
  ]

  const cols = `minmax(150px,190px) repeat(${Math.max(posts.length, 1)}, minmax(200px,1fr))`

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Data" back="/data?tab=posts" title="Compare posts" description="Side by side, at the same age. The best figure in each row is highlighted." />

      {ids.length < 2 ? (
        <EmptyState>
          Pick 2 to 4 posts to compare: tick them in{' '}
          <Link to="/data?tab=posts" className="underline">
            Data → Posts
          </Link>
          , then click Compare.
        </EmptyState>
      ) : loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <>
          {insights ? (
            <div className="mb-8">
              <InsightsPanel
                headline={insights.headline}
                subline={insights.subline}
                findings={insights.findings}
                same={insights.same}
                next={insights.next}
                caution={insights.caution}
                ai={<AiWhy result={why.data?.result} busy={why.isPending} configured={!!status.data?.configured} canRun={auth.can('editor') && !!insightCp} onRun={() => why.mutate()} />}
              />
            </div>
          ) : (
            <Skeleton className="mb-8 h-48 rounded-[1.8rem]" />
          )}

          <h2 className="mb-1 text-base font-semibold">The numbers</h2>
          <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" />
            {cp
              ? `Numbers are each post's figures at ${AGE[cp]} old, so they're comparable.`
              : 'These posts have no age in common, so each shows its latest figures: older posts have had longer to collect them.'}
          </p>
          <div className="overflow-x-auto rounded-[1.8rem] bg-card">
            <div className="min-w-fit" style={{ display: 'grid', gridTemplateColumns: cols }}>
              {/* Post headers */}
              <div className="sticky left-0 z-10 bg-card" />
              {posts.map((p) => (
                <div key={p.id} className="border-l px-4 pt-5 pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <PostRef id={p.ref} />
                    {posts.length > 2 && (
                      <button type="button" onClick={() => remove(p.id)} aria-label="Remove from comparison" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <Link to={`/posts/${p.id}`} className="mt-2 line-clamp-2 text-sm font-semibold hover:text-primary">
                    {firstLine(p) || p.topic || p.ref}
                  </Link>
                  {p.post_url && (
                    <a href={p.post_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      On LinkedIn <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              ))}

              <Heading cols={posts.length}>{cp ? `Numbers at ${AGE[cp]}` : 'Numbers (latest)'}</Heading>
              {NUMBERS.map((row) => {
                const vals = posts.map((p) => row.get(snap(p), p))
                if (vals.every((v) => v == null)) return null
                const known = vals.filter((v): v is number => v != null)
                const best = known.length >= 2 && new Set(known).size > 1 ? Math.max(...known) : null
                return (
                  <Row key={row.label} label={row.label} hint={row.hint}>
                    {vals.map((v, i) => (
                      <Cell key={posts[i].id} className={cn('tabular-nums', v != null && v === best && 'font-semibold text-primary')}>
                        {v == null ? <span className="text-muted-foreground">—</span> : row.fmt(v)}
                        {v != null && v === best && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium">best</span>}
                      </Cell>
                    ))}
                  </Row>
                )
              })}

              <Heading cols={posts.length}>About the post</Heading>
              {TEXT_ROWS.map((row) => (
                <Row key={row.label} label={row.label}>
                  {posts.map((p) => (
                    <Cell key={p.id} className="text-[13px] leading-snug">
                      {row.get(p)}
                    </Cell>
                  ))}
                </Row>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The best figure in each row is marked. These are the facts the findings above are based on.
          </p>
        </>
      )}
    </div>
  )
}

function Heading({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div className="border-t bg-muted/40 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase" style={{ gridColumn: `1 / span ${cols + 1}` }}>
      {children}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="sticky left-0 z-10 border-t bg-card px-4 py-2.5 text-[13px] font-medium" title={hint}>
        {label}
        {hint && <div className="text-[11px] font-normal text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </>
  )
}

function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('border-t border-l px-4 py-2.5 text-sm', className)}>{children}</div>
}

/** Claude's reading of the difference, on click (counts as one analysis) */
function AiWhy({ result, busy, configured, canRun, onRun }: { result?: CompareExplanation; busy: boolean; configured: boolean; canRun: boolean; onRun: () => void }) {
  const CONF = { high: 'Strong', medium: 'Fair', low: 'Weak' } as const
  return (
    <section className="rounded-[1.8rem] bg-card p-6">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Bot className="size-4 text-primary" /> Ask AI why
      </h3>
      {!result ? (
        <>
          <p className="text-xs text-muted-foreground">Claude reads the posts in full (hooks, wording, timing) and explains the difference. Uses one analysis.</p>
          <Button size="sm" className="mt-3" onClick={onRun} disabled={!configured || !canRun || busy}>
            <Sparkles /> {busy ? 'Reading the posts…' : 'Ask AI why'}
          </Button>
          {!configured && <p className="mt-2 text-[11px] text-muted-foreground">Switches on once Claude is connected (your manager adds the API key).</p>}
        </>
      ) : (
        <div className="space-y-3 text-sm">
          <p>{result.summary}</p>
          <ul className="space-y-1.5">
            {result.reasons.map((r) => (
              <li key={r.reason} className="flex gap-2">
                <span className="mt-0.5 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">{CONF[r.confidence]}</span>
                <span className="text-[13px]">{r.reason}</span>
              </li>
            ))}
          </ul>
          {result.try_next.length > 0 && (
            <div>
              <div className="text-xs font-semibold">Try next</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
                {result.try_next.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {result.caveats.length > 0 && <p className="text-[11px] text-muted-foreground">{result.caveats.join(' ')}</p>}
        </div>
      )}
    </section>
  )
}
