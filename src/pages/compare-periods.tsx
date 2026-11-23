/**
 * Compare periods: two date ranges of one account, side by side (Data → Compare periods).
 * Leads with "What made the difference" (posting volume vs per-post reach, format and topic mix checked against the
 * account's history, holidays and events), then every number for A and B, both periods on one chart, what was
 * posted in each, and the holidays and events each had.
 */
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageHeader, PostRef } from '@/components/common'
import { MetricsChart, type ChartMetric } from '@/components/analytics'
import { InsightsPanel } from '@/components/insights-panel'
import { engagementOf, todayUae, totals, useSortedDaily, ymd } from '@/components/period'
import { TimeRangePicker, type TimeRange } from '@/components/time-range'
import { useAccount } from '@/context/account'
import { useOverview, usePageAudience, usePosts } from '@/hooks/queries'
import { api, type Checkpoint, type PageDay, type Post } from '@/lib/api'
import { analysePeriods, firstLine, impAt, itemsByDate, periodLabel, periodSide, type PeriodSide } from '@/lib/compare-insights'
import { fmtNumber, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const sum = (vals: (number | null)[]) => (vals.some((v) => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null)
const METRICS: ChartMetric[] = [
  { value: 'impressions', label: 'Impressions', get: (d) => d.impressions },
  { value: 'clicks', label: 'Clicks', get: (d) => d.clicks },
  { value: 'engagements', label: 'All engagements', get: (d) => sum([d.clicks, d.reactions, d.comments, d.reposts]) },
  { value: 'unique_visitors', label: 'Page visitors', get: (d) => d.unique_visitors },
  { value: 'new_followers', label: 'New followers', get: (d) => d.new_followers },
]

/** A range from the address (a_from/a_to …), or the default */
function readRange(params: URLSearchParams, key: 'a' | 'b', fallback: { from: string; to: string }) {
  const from = params.get(`${key}_from`)
  const to = params.get(`${key}_to`)
  return from && to && from <= to ? { from, to } : fallback
}
const asRange = (w: { from: string; to: string }): TimeRange => ({ preset: 'custom', from: w.from, to: w.to })
/** A picker value back to dates (presets count back from today, UAE time) */
function toDates(r: TimeRange, daily: PageDay[]): { from: string; to: string } | null {
  const today = todayUae()
  if (r.preset === 'custom') return r.from && r.to ? { from: r.from, to: r.to } : null
  if (r.preset === 'all') return daily.length ? { from: daily[0].date, to: daily[daily.length - 1].date } : null
  return { from: ymd(addDays(parseISO(today), -(Number(r.preset) - 1))), to: today }
}

export function ComparePeriodsPage() {
  const { account } = useAccount()
  const id = account?.id
  const [params, setParams] = useSearchParams()
  const today = todayUae()
  const a = readRange(params, 'a', { from: ymd(addDays(parseISO(today), -29)), to: today })
  const lenA = differenceInCalendarDays(parseISO(a.to), parseISO(a.from)) + 1
  const b = readRange(params, 'b', { from: ymd(addDays(parseISO(a.from), -lenA)), to: ymd(addDays(parseISO(a.from), -1)) })
  const setSide = (key: 'a' | 'b', w: { from: string; to: string } | null) =>
    w &&
    setParams((p) => {
      p.set(`${key}_from`, w.from)
      p.set(`${key}_to`, w.to)
      return p
    }, { replace: true })

  const { daily, isLoading } = useSortedDaily(id)
  const { data: probe } = useOverview(id, '24h')
  const cp = (probe?.suggested_checkpoint ?? '7d') as Checkpoint
  const { data: posts = [] } = usePosts(id, { checkpoint: cp })
  const { data: audience = [] } = usePageAudience(id)
  const calFrom = a.from < b.from ? a.from : b.from
  const calTo = a.to > b.to ? a.to : b.to
  const histFrom = posts.length ? posts.reduce((m, p) => (p.published_at_uae.slice(0, 10) < m ? p.published_at_uae.slice(0, 10) : m), calFrom) : calFrom
  const { data: cal } = useQuery({
    queryKey: ['calendar-items', histFrom, calTo],
    queryFn: () => api.calendarItems({ from: histFrom, to: calTo }),
    staleTime: 60 * 60_000,
    enabled: differenceInCalendarDays(parseISO(calTo), parseISO(histFrom)) <= 800,
  })

  const view = useMemo(() => {
    if (!daily.length) return null
    const days = (w: { from: string; to: string }) => daily.filter((d) => d.date >= w.from && d.date <= w.to)
    const ta = totals(days(a))
    const tb = totals(days(b))
    const items = cal?.items ?? []
    const sa = periodSide(a.from, a.to, posts, cp, items)
    const sb = periodSide(b.from, b.to, posts, cp, items)
    const insights = analysePeriods(sa, sb, ta, tb, posts, cp, itemsByDate(items, histFrom, calTo))
    return { ta, tb, sa, sb, insights }
  }, [daily, posts, cal, cp, a.from, a.to, b.from, b.to]) // eslint-disable-line react-hooks/exhaustive-deps

  // UAE share of followers at the end of each period (latest snapshot on or before it)
  const uaeAt = (end: string) =>
    audience
      .filter((x) => x.audience === 'followers' && x.as_of <= end)
      .sort((x, y) => x.as_of.localeCompare(y.as_of))
      .at(-1)?.shares.uae_share ?? null

  const lenB = differenceInCalendarDays(parseISO(b.to), parseISO(b.from)) + 1
  const sameLength = lenA === lenB

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Data" back="/data" title="Compare periods" description="Two periods side by side: what changed, and what's behind it." />

      {/* The two periods */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[1.8rem] bg-card px-5 py-4">
        <PeriodTag letter="A" />
        <TimeRangePicker bare value={asRange(a)} onChange={(r) => setSide('a', toDates(r, daily))} />
        <span className="text-sm text-muted-foreground">compared with</span>
        <PeriodTag letter="B" />
        <TimeRangePicker bare value={asRange(b)} onChange={(r) => setSide('b', toDates(r, daily))} />
      </div>

      {isLoading ? (
        <Skeleton className="h-96 rounded-[1.8rem]" />
      ) : !view ? (
        <EmptyState>
          No LinkedIn data yet.{' '}
          <Link to="/import" className="underline">
            Import LinkedIn’s export
          </Link>{' '}
          to compare periods.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <InsightsPanel wording="cause" headline={view.insights.headline} subline={view.insights.subline} findings={view.insights.findings} next={view.insights.next} />

          {/* Every number, A and B */}
          <section>
            <h2 className="mb-1 text-base font-semibold">The numbers</h2>
            <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" />
              {sameLength
                ? `Both periods are ${lenA} days.`
                : `A is ${lenA} days and B is ${lenB}, so the change is worked out per day to keep it fair.`}{' '}
              Typical post figures are at {cp === '7d' ? '7 days' : cp} old.
            </p>
            <NumbersTable a={a} b={b} ta={view.ta} tb={view.tb} sa={view.sa} sb={view.sb} uaeA={uaeAt(a.to)} uaeB={uaeAt(b.to)} lenA={lenA} lenB={lenB} />
          </section>

          {/* Both periods on one chart */}
          <MetricsChart daily={daily} from={a.from} to={a.to} metrics={METRICS} posts={view.sa.posts} param="pm" title="Both periods, day by day" compare={{ from: b.from, to: b.to, label: `B: ${periodLabel(b.from, b.to)}` }} />

          {/* What was posted */}
          <section>
            <h2 className="mb-3 text-base font-semibold">What you posted</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <PostedSide letter="A" side={view.sa} cp={cp} />
              <PostedSide letter="B" side={view.sb} cp={cp} />
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function PeriodTag({ letter }: { letter: 'A' | 'B' }) {
  return (
    <span className={cn('flex size-7 items-center justify-center rounded-full text-xs font-bold', letter === 'A' ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/80 text-background')}>
      {letter}
    </span>
  )
}

type T = ReturnType<typeof totals>

function NumbersTable({ a, b, ta, tb, sa, sb, uaeA, uaeB, lenA, lenB }: { a: { from: string; to: string }; b: { from: string; to: string }; ta: T; tb: T; sa: PeriodSide; sb: PeriodSide; uaeA: number | null; uaeB: number | null; lenA: number; lenB: number }) {
  // Totals are compared per day when the periods differ in length
  const allRows: { label: string; va: number | null; vb: number | null; fmt: (v: number) => string; total: boolean }[] = [
    { label: 'Impressions', va: ta.impressions, vb: tb.impressions, fmt: fmtNumber, total: true },
    { label: 'Clicks', va: ta.clicks, vb: tb.clicks, fmt: fmtNumber, total: true },
    { label: 'Engagement rate', va: engagementOf(ta), vb: engagementOf(tb), fmt: (v) => fmtPct(v), total: false },
    { label: 'Reactions', va: ta.reactions, vb: tb.reactions, fmt: fmtNumber, total: true },
    { label: 'Comments', va: ta.comments, vb: tb.comments, fmt: fmtNumber, total: true },
    { label: 'Reposts', va: ta.reposts, vb: tb.reposts, fmt: fmtNumber, total: true },
    { label: 'Page views', va: ta.page_views, vb: tb.page_views, fmt: fmtNumber, total: true },
    { label: 'Page visitors', va: ta.unique_visitors, vb: tb.unique_visitors, fmt: fmtNumber, total: true },
    { label: 'New followers', va: ta.new_followers, vb: tb.new_followers, fmt: fmtNumber, total: true },
    { label: 'Posts published', va: sa.posts.length, vb: sb.posts.length, fmt: fmtNumber, total: true },
    { label: 'Typical impressions per post', va: sa.perPost, vb: sb.perPost, fmt: (v) => fmtNumber(Math.round(v)), total: false },
    { label: 'UAE share of followers (at the end)', va: uaeA, vb: uaeB, fmt: (v) => fmtPct(v), total: false },
  ]
  // A row with nothing on either side (e.g. no audience data for those dates) is left out
  const rows = allRows.filter((r) => r.va != null || r.vb != null)
  return (
    <div className="overflow-x-auto rounded-[1.8rem] bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-5 py-3 font-medium"> </th>
            <th className="px-4 py-3 text-right font-medium">
              <span className="text-foreground">A</span> · {periodLabel(a.from, a.to)}
            </th>
            <th className="px-4 py-3 text-right font-medium">
              <span className="text-foreground">B</span> · {periodLabel(b.from, b.to)}
            </th>
            <th className="px-5 py-3 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pa = r.va != null && r.total ? r.va / lenA : r.va
            const pb = r.vb != null && r.total ? r.vb / lenB : r.vb
            const change = pa != null && pb ? (pa - pb) / pb : null
            const up = change != null && change > 0.02
            const down = change != null && change < -0.02
            return (
              <tr key={r.label} className="border-b last:border-0">
                <td className="px-5 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.va == null ? '—' : r.fmt(r.va)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{r.vb == null ? '—' : r.fmt(r.vb)}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {change == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={cn('inline-flex items-center gap-0.5 font-medium', up && 'text-good-fg', down && 'text-bad-fg', !up && !down && 'text-muted-foreground')}>
                      {up ? <ArrowUpRight className="size-3.5" /> : down ? <ArrowDownRight className="size-3.5" /> : null}
                      {change >= 0 ? '+' : ''}
                      {Math.round(change * 100)}%
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PostedSide({ letter, side, cp }: { letter: 'A' | 'B'; side: PeriodSide; cp: Checkpoint }) {
  const perWeek = (side.posts.length / side.days) * 7
  const formats = [...side.formats.entries()].sort((x, y) => y[1] - x[1])
  const topics = [...side.topics.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4)
  const top = [...side.posts].filter((p) => impAt(p, cp) != null).sort((x, y) => impAt(y, cp)! - impAt(x, cp)!).slice(0, 3)
  const max = Math.max(1, ...formats.map((f) => f[1]))
  return (
    <div className="rounded-[1.8rem] bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <PeriodTag letter={letter} />
        <span className="text-sm font-semibold">{periodLabel(side.from, side.to)}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {side.posts.length} posts · {perWeek.toFixed(1)} a week
        </span>
      </div>

      <div className="text-xs font-medium text-muted-foreground">Formats</div>
      <ul className="mt-2 space-y-1.5">
        {formats.length ? (
          formats.map(([name, n]) => (
            <li key={name} className="grid grid-cols-[90px_1fr_24px] items-center gap-2 text-xs">
              <span>{name}</span>
              <span className="h-2 rounded-[4px] bg-muted">
                <span className={cn('block h-full rounded-[4px]', letter === 'A' ? 'bg-primary' : 'bg-muted-foreground/70')} style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums">{n}</span>
            </li>
          ))
        ) : (
          <li className="text-xs text-muted-foreground">No posts</li>
        )}
      </ul>

      {topics.length > 0 && (
        <>
          <div className="mt-4 text-xs font-medium text-muted-foreground">Top topics</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {topics.map(([t, n]) => (
              <span key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                {t} · {n}
              </span>
            ))}
          </div>
        </>
      )}

      {top.length > 0 && (
        <>
          <div className="mt-4 text-xs font-medium text-muted-foreground">Best posts</div>
          <ul className="mt-1.5 space-y-1.5">
            {top.map((p: Post) => (
              <li key={p.id} className="flex items-center gap-2 text-[13px]">
                <PostRef id={p.ref} />
                <Link to={`/posts/${p.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                  {firstLine(p) || p.topic}
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">{fmtNumber(impAt(p, cp))}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {side.events.length > 0 && (
        <>
          <div className="mt-4 text-xs font-medium text-muted-foreground">Holidays and events</div>
          <p className="mt-1 text-xs">{side.events.map((e) => e.title).filter((t, i, arr) => arr.indexOf(t) === i).slice(0, 6).join(' · ')}</p>
        </>
      )}
    </div>
  )
}
