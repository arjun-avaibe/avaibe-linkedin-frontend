/**
 * The building blocks of the Data page, laid out like LinkedIn's own analytics (Highlights → Metrics → detail),
 * plus what LinkedIn doesn't do: small-number honesty, post markers and holidays on the chart, and a
 * "what happened that day" explainer for spikes and dips.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, XAxis, YAxis } from 'recharts'
import { addDays, differenceInCalendarDays, endOfMonth, format, parseISO } from 'date-fns'
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, Globe, LineChart, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { api, type CalendarItem, type PageAudienceSnapshot, type PageDay, type Post } from '@/lib/api'
import { FORMAT_LABELS, fmtNumber, fmtPct } from '@/lib/format'
import { engagementOf, totals, ymd, type Totals } from '@/components/period'
import { cn } from '@/lib/utils'
import { CardHeading, IconTile } from '@/components/common'

// ---------------------------------------------------------------- Highlights

export interface Highlight {
  label: string
  value: number | null
  prev?: number | null
  /** A rate (0..1): the change is shown in percentage points */
  pct?: boolean
  /** Too little behind the number for a change to mean anything (counts decide this themselves) */
  small?: boolean
  hint?: string
}

/** Below this, a count's % change is mostly noise (2 → 4 comments is "+100%") */
const SMALL_COUNT = 20

function changeLine(h: Highlight, compareLabel: string): { text: string; dir: 'up' | 'down' | 'flat' | 'none' } {
  if (h.value == null) return { text: 'Not in your data yet', dir: 'none' }
  if (h.prev == null) return { text: 'No earlier period to compare', dir: 'none' }
  const small = h.small ?? (!h.pct && Math.max(h.value, h.prev) < SMALL_COUNT)
  if (small) return { text: 'Too few to compare', dir: 'none' }
  if (h.pct) {
    const d = (h.value - h.prev) * 100
    return { text: `${d >= 0 ? '+' : ''}${d.toFixed(1)} pt ${compareLabel}`, dir: Math.abs(d) < 0.1 ? 'flat' : d > 0 ? 'up' : 'down' }
  }
  if (!h.prev) return { text: `up from 0 ${compareLabel}`, dir: 'up' }
  const r = h.value / h.prev - 1
  return { text: `${r >= 0 ? '+' : ''}${(r * 100).toFixed(0)}% ${compareLabel}`, dir: Math.abs(r) < 0.02 ? 'flat' : r > 0 ? 'up' : 'down' }
}

export function Highlights({ items, dates, compareLabel, summary }: { items: Highlight[]; dates: ReactNode; compareLabel: string; summary?: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardHeading icon={Sparkles} title="Highlights" sub={dates} />
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
          {items.map((h) => {
            const c = changeLine(h, compareLabel)
            const Icon = c.dir === 'up' ? ArrowUpRight : c.dir === 'down' ? ArrowDownRight : c.dir === 'flat' ? ArrowRight : null
            return (
              <div key={h.label}>
                <dd className="text-[30px] leading-none font-medium tracking-tight tabular-nums">{h.value == null ? '—' : h.pct ? fmtPct(h.value) : fmtNumber(h.value)}</dd>
                <dt className="mt-0.5 text-sm text-muted-foreground">{h.label}</dt>
                <div
                  className={cn(
                    'mt-1 inline-flex items-center gap-0.5 text-xs tabular-nums',
                    c.dir === 'up' ? 'text-good-fg' : c.dir === 'down' ? 'text-bad-fg' : 'text-muted-foreground',
                  )}
                >
                  {Icon && <Icon className="size-3.5" />}
                  {c.text}
                </div>
                {h.hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{h.hint}</div>}
              </div>
            )
          })}
        </dl>
        {summary && <p className="mt-5 border-t pt-4 text-sm">{summary}</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- Metrics chart with post markers, holidays and an explainer

export interface ChartMetric {
  value: string
  label: string
  get: (d: PageDay) => number | null
}

const MARKER_KINDS = new Set(['uae_holiday', 'period', 'event'])
const MARKER_COLOR: Record<string, string> = { uae_holiday: 'var(--cal-uae)', period: 'var(--cal-period)', event: 'var(--cal-event)' }

const chartConfig = { value: { label: 'Value', color: 'var(--chart-current)' } } satisfies ChartConfig

const postDate = (p: Post) => p.published_at_uae.slice(0, 10)
const postTitle = (p: Post) => p.caption?.split('\n').find((l) => l.trim())?.trim() || p.topic || p.ref || `Post ${p.id}`
const postImpressions = (p: Post) => p.snapshots[p.snapshots.length - 1]?.impressions ?? null

function useCalendarItems(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar-items', from, to],
    queryFn: () => api.calendarItems({ from, to }),
    staleTime: 60 * 60_000,
    enabled: differenceInCalendarDays(parseISO(to), parseISO(from)) <= 400,
  })
}

interface Point {
  key: string // first day of the bucket, YYYY-MM-DD
  end: string // last day of the bucket
  label: string
  value: number | null
  covered: number
  days: number
  posts: Post[]
  /** The comparison period's value for the same day number (or week) */
  cmp: number | null
  cmpKey: string | null
}

/** The period compared with, drawn as a dashed line: its day 1 lines up with this period's day 1 */
export type CompareLine = { from: string; to: string; label: string } | null

export function MetricsChart({
  daily,
  from,
  to,
  metrics,
  posts = [],
  param = 'metric',
  title = 'Metrics',
  compare = null,
}: {
  daily: PageDay[]
  from: string
  to: string
  metrics: ChartMetric[]
  posts?: Post[]
  /** Address parameter holding the chosen metric, so each tab remembers its own */
  param?: string
  title?: string
  compare?: CompareLine
}) {
  const [params, setParams] = useSearchParams()
  const metric = metrics.find((m) => m.value === params.get(param)) ?? metrics[0]
  const setMetric = (v: string) => setParams((p) => { p.set(param, v); return p }, { replace: true })
  const [picked, setPicked] = useState<string | null>(null)
  const { data: cal } = useCalendarItems(from, to)

  const span = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  const unit: 'day' | 'week' = span <= 120 ? 'day' : 'week'

  const view = useMemo(() => {
    const byDate = new Map(daily.map((d) => [d.date, d]))
    const points: Point[] = []
    for (let i = 0; i < span; i++) {
      const day = addDays(parseISO(from), i)
      if (unit === 'day' || i % 7 === 0) {
        const end = unit === 'day' ? day : addDays(day, Math.min(6, span - 1 - i))
        const cday = compare ? ymd(addDays(parseISO(compare.from), i)) : null
        points.push({ key: ymd(day), end: ymd(end), label: format(day, 'd MMM'), value: null, covered: 0, days: 0, posts: [], cmp: null, cmpKey: cday && compare && cday <= compare.to ? cday : null })
      }
      const pt = points[points.length - 1]
      pt.days += 1
      const row = byDate.get(ymd(day))
      const v = row ? metric.get(row) : null
      if (v != null) {
        pt.value = (pt.value ?? 0) + v
        pt.covered += 1
      }
      if (compare) {
        const cd = ymd(addDays(parseISO(compare.from), i))
        const crow = cd <= compare.to ? byDate.get(cd) : undefined
        const cv = crow ? metric.get(crow) : null
        if (cv != null) pt.cmp = (pt.cmp ?? 0) + cv
      }
    }
    for (const p of posts) {
      const d = postDate(p)
      const pt = points.find((x) => d >= x.key && d <= x.end)
      if (pt) pt.posts.push(p)
    }
    // Only complete buckets count as "typical"; an unfinished last week would drag it down
    const complete = points.filter((p) => p.covered > 0 && p.covered === p.days).map((p) => p.value ?? 0).sort((a, b) => a - b)
    const typical = complete.length ? complete[Math.floor((complete.length - 1) / 2)] : null
    const peak = points.reduce<Point | null>((m, p) => (p.value != null && (!m || p.value > (m.value ?? 0)) ? p : m), null)
    return { points, typical, peak }
  }, [daily, from, span, unit, metric, posts, compare?.from, compare?.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const markers = (cal?.items ?? []).filter((it) => MARKER_KINDS.has(it.kind))
  const bucketOf = (iso: string) => view.points.find((p) => iso >= p.key && iso <= p.end)?.key
  // Name a band only when there's room: it doesn't start too close to the last named one (the explainer lists them all)
  const labelled = new Set<CalendarItem>()
  {
    const gap = Math.max(4, Math.round(view.points.length / 6))
    let lastIdx = -Infinity
    for (const m of [...markers].sort((a, b) => a.start.localeCompare(b.start))) {
      const k = bucketOf(m.start < from ? from : m.start)
      const idx = view.points.findIndex((p) => p.key === k)
      if (idx >= 0 && idx - lastIdx >= gap) {
        labelled.add(m)
        lastIdx = idx
      }
    }
  }
  // The explainer opens only when asked (a click on the chart, or the highest-point link), so the chart stays calm
  const selected = view.points.find((p) => p.key === picked) ?? null
  const hasData = view.points.some((p) => p.value != null)

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardHeading icon={LineChart} title={title} />
          <div role="tablist" aria-label="Chart metric" className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
            {metrics.map((m) => (
              <button
                key={m.value}
                role="tab"
                aria-selected={m.value === metric.value}
                type="button"
                onClick={() => {
                  setMetric(m.value)
                  setPicked(null)
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  m.value === metric.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-[var(--chart-current)]" aria-hidden /> {metric.label} per {unit}
          </span>
          {posts.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full border-2 border-[var(--chart-current)] bg-card" aria-hidden /> a post went out
            </span>
          )}
          {compare && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-muted-foreground" aria-hidden /> {compare.label}
            </span>
          )}
          {markers.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[var(--cal-period)] opacity-40" aria-hidden /> holidays, Ramadan, events
            </span>
          )}

        </div>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No {metric.label.toLowerCase()} in this period yet.</p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
              <ComposedChart
                data={view.points}
                margin={{ left: 0, right: 16, top: 16, bottom: 0 }}
                onClick={(s) => {
                  const k = (s as { activeLabel?: string } | null)?.activeLabel
                  if (k) setPicked(String(k))
                }}
                className="cursor-pointer"
              >
                <defs>
                  <linearGradient id="metrics-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                {markers.map((m) => {
                  const x1 = bucketOf(m.start < from ? from : m.start)
                  const x2 = bucketOf(m.end > to ? to : m.end)
                  return x1 && x2 ? (
                    <ReferenceArea
                      key={m.title + m.start}
                      x1={x1}
                      x2={x2}
                      fill={MARKER_COLOR[m.kind]}
                      fillOpacity={0.12}
                      strokeOpacity={0}
                      ifOverflow="hidden"
                      label={
                        labelled.has(m)
                          ? { value: m.title.length > 22 ? `${m.title.slice(0, 21)}…` : m.title, position: 'insideTopLeft', fontSize: 10, fill: 'var(--muted-foreground)' }
                          : undefined
                      }
                    />
                  ) : null
                })}
                {selected && <ReferenceArea x1={selected.key} x2={selected.key} fill="var(--foreground)" fillOpacity={0.06} strokeOpacity={0} />}
                <XAxis dataKey="key" tickLine={false} axisLine={false} tickMargin={10} fontSize={11} minTickGap={24} tickFormatter={(k: string) => format(parseISO(k), 'd MMM')} />
                <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} allowDecimals={false} tickFormatter={(v: number) => (v >= 10_000 ? `${Math.round(v / 1000)}K` : fmtNumber(v))} />
                <ChartTooltip cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1, strokeOpacity: 0.35 }} content={<PointTooltip unit={unit} metric={metric.label} />} />
                {compare && (
                  <Line dataKey="cmp" type="monotone" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} connectNulls isAnimationActive={false} />
                )}
                <Area
                  dataKey="value"
                  type="monotone"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  fill="url(#metrics-fill)"
                  isAnimationActive={false}
                  connectNulls
                  activeDot={{ r: 4, fill: 'var(--color-value)', stroke: 'var(--card)', strokeWidth: 2 }}
                  // A ring on the line wherever a post went out, so spikes can be matched to posts at a glance
                  dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) =>
                    props.payload?.posts.length && props.cx != null && props.cy != null ? (
                      <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill="var(--card)" stroke="var(--color-value)" strokeWidth={2} />
                    ) : (
                      <g key={props.index} />
                    )
                  }
                />
              </ComposedChart>
            </ChartContainer>
            {selected ? (
              <Explainer point={selected} unit={unit} metric={metric.label} typical={view.typical} isPeak={selected === view.peak} posts={posts} markers={markers} onClose={() => setPicked(null)} />
            ) : (
              view.peak && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Highest: {format(parseISO(view.peak.key), unit === 'week' ? "'week of' d MMM" : 'EEE d MMM')}, {fmtNumber(view.peak.value)}.{' '}
                  <button type="button" onClick={() => setPicked(view.peak!.key)} className="font-medium text-foreground underline underline-offset-2">
                    See why
                  </button>{' '}
                  · or click any {unit} on the chart.
                </p>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PointTooltip({ active, payload, unit, metric }: { active?: boolean; payload?: { payload?: Point }[]; unit: string; metric: string }) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  return (
    <div className="min-w-44 rounded-lg bg-popover px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
      <div className="mb-1 font-medium">{unit === 'week' ? `7 days from ${p.label}` : format(parseISO(p.key), 'EEE d MMM yyyy')}</div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{metric}</span>
        <span className="font-semibold tabular-nums">{p.value == null ? 'No data yet' : fmtNumber(p.value)}</span>
      </div>
      {p.cmpKey && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{unit === 'week' ? `Week from ${format(parseISO(p.cmpKey), 'd MMM')}` : format(parseISO(p.cmpKey), 'EEE d MMM yyyy')}</span>
          <span className="tabular-nums">{p.cmp == null ? 'No data' : fmtNumber(p.cmp)}</span>
        </div>
      )}
      {p.posts.length > 0 && (
        <div className="mt-1 text-muted-foreground">
          {p.posts.length} post{p.posts.length === 1 ? '' : 's'} went out
        </div>
      )}
    </div>
  )
}

/** "What happened": the posts that went out just before, and any holiday or event, for the chosen day or week */
function Explainer({
  point,
  unit,
  metric,
  typical,
  isPeak,
  posts,
  markers,
  onClose,
}: {
  point: Point
  unit: 'day' | 'week'
  metric: string
  typical: number | null
  isPeak: boolean
  posts: Post[]
  markers: CalendarItem[]
  onClose: () => void
}) {
  // Posts collect most impressions in their first 2–3 days, so look a little before the day too
  const lookFrom = ymd(addDays(parseISO(point.key), -3))
  const nearby = posts
    .filter((p) => postDate(p) >= lookFrom && postDate(p) <= point.end)
    .sort((a, b) => (postImpressions(b) ?? 0) - (postImpressions(a) ?? 0))
    .slice(0, 3)
  const events = markers.filter((m) => m.start <= point.end && m.end >= point.key)
  const ratio = point.value != null && typical ? point.value / typical : null
  const when = unit === 'week' ? `Week from ${format(parseISO(point.key), 'd MMM')}` : format(parseISO(point.key), 'EEE d MMM')

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">
          {isPeak ? 'Highest point: ' : ''}
          {when} · {fmtNumber(point.value)} {metric.toLowerCase()}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {ratio != null && (
            <span>
              {ratio >= 1.15 ? `${ratio.toFixed(1)}× a typical ${unit}` : ratio <= 0.85 ? `${Math.round(ratio * 100)}% of a typical ${unit}` : `about a typical ${unit}`}
              {' '}({fmtNumber(typical)})
            </span>
          )}
          <button type="button" onClick={onClose} className="rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground">
            Close
          </button>
        </div>
      </div>
      {point.covered < point.days && <p className="mt-1 text-xs text-muted-foreground">{point.covered} of {point.days} days reported so far.</p>}

      {nearby.length > 0 ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">Posts that went out {unit === 'day' ? 'that day or up to 3 days before' : 'that week or just before'}:</p>
          <ul className="mt-1.5 space-y-1">
            {nearby.map((p) => (
              <li key={p.id}>
                <Link to={`/posts/${p.id}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">{format(parseISO(postDate(p)), 'd MMM')}</span>
                  <span className="min-w-0 flex-1 truncate">{postTitle(p)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{FORMAT_LABELS[p.format]}</span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums">{postImpressions(p) == null ? '—' : `${fmtNumber(postImpressions(p))} impr.`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No posts went out just before. Possible reasons: an older post being reshared, a founder sharing the page, or people finding the page in search.
        </p>
      )}
      {events.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          Around then: {events.map((e) => e.title).join(' · ')}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Demographics (latest snapshot)

const DIM_LABELS: Record<string, string> = {
  country: 'Country',
  location: 'Location',
  job_function: 'Job function',
  seniority: 'Seniority',
  industry: 'Industry',
  company_size: 'Company size',
}
const UAE = /united arab emirates|\buae\b|dubai|abu dhabi|sharjah|ajman|ras al|fujairah|umm al/i

export function Demographics({ snapshot, noun }: { snapshot: PageAudienceSnapshot | undefined; noun: string }) {
  const [dim, setDim] = useState('country')
  const groups = useMemo(() => {
    const out = new Map<string, { value: string; n: number; isCount: boolean }[]>()
    if (!snapshot) return out
    for (const r of snapshot.rows) {
      const n = r.count ?? r.pct
      if (n == null) continue
      const list = out.get(r.dimension) ?? []
      list.push({ value: r.value, n, isCount: r.count != null })
      out.set(r.dimension, list)
    }
    // Countries, rolled up from LinkedIn's regions ("Greater Delhi Area, India" → India)
    const loc = out.get('location')
    if (loc?.length) {
      const by = new Map<string, number>()
      for (const r of loc) {
        // A region without a country ("Los Angeles Metropolitan Area") can't be placed reliably
        const c = r.value.includes(',') ? r.value.split(',').at(-1)!.trim() : UAE.test(r.value) ? 'United Arab Emirates' : 'Other (region only)'
        by.set(c, (by.get(c) ?? 0) + r.n)
      }
      out.set('country', [...by].map(([value, n]) => ({ value, n, isCount: loc[0].isCount })))
    }
    for (const list of out.values()) list.sort((a, b) => b.n - a.n)
    return out
  }, [snapshot])

  if (!snapshot) {
    return (
      <Card>
        <CardHeader>
          <span className="flex items-center gap-3"><IconTile icon={Globe} /><CardTitle className="text-base font-semibold">{noun[0].toUpperCase() + noun.slice(1)} demographics</CardTitle></span>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No {noun} breakdown yet. <Link to="/import" className="underline">Import LinkedIn’s export</Link> or record one below.
          </p>
        </CardContent>
      </Card>
    )
  }

  const dims = Object.keys(DIM_LABELS).filter((d) => groups.get(d)?.length)
  const active = dims.includes(dim) ? dim : dims[0]
  const rows = groups.get(active) ?? []
  const total = snapshot.total
  const geo = active === 'country' || active === 'location'
  // The top 6, plus UAE rows further down: the target market is always shown
  const top = [...rows.slice(0, 6), ...(geo ? rows.slice(6).filter((r) => UAE.test(r.value)).slice(0, 3) : [])]
  const max = top[0]?.n ?? 1
  const uaeRow = geo ? rows.filter((r) => UAE.test(r.value)) : []
  const uaeRank = active === 'country' ? rows.findIndex((r) => UAE.test(r.value)) : -1

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="flex items-center gap-3"><IconTile icon={Globe} /><CardTitle className="text-base font-semibold">{noun[0].toUpperCase() + noun.slice(1)} demographics</CardTitle></span>
            <div className="text-xs text-muted-foreground">
              As of {format(parseISO(snapshot.as_of), 'd MMM yyyy')}
              {total != null && ` · ${fmtNumber(total)} ${noun}`}
            </div>
          </div>
          <div role="tablist" aria-label="Breakdown" className="flex flex-wrap gap-1 rounded-lg bg-secondary p-1">
            {dims.map((d) => (
              <button
                key={d}
                role="tab"
                type="button"
                aria-selected={d === active}
                onClick={() => setDim(d)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  d === active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {DIM_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {top.map((r) => {
            const isUae = geo && UAE.test(r.value)
            const share = r.isCount && total ? r.n / total : r.isCount ? null : r.n / 100
            return (
              <li key={r.value} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn('truncate', isUae && 'font-semibold')}>
                    {r.value}
                    {isUae && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Target market</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {r.isCount ? fmtNumber(r.n) : `${r.n}%`}
                    {share != null && r.isCount && <span className="ml-2 inline-block w-12 text-right">{fmtPct(share)}</span>}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className={cn('h-1.5 rounded-full', isUae ? 'bg-primary' : 'bg-[var(--chart-current)] opacity-60')} style={{ width: `${(r.n / max) * 100}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
        {active === 'country' && (
          <p className="mt-4 text-xs text-muted-foreground">
            {uaeRow.length
              ? `The UAE is #${uaeRank + 1} of ${rows.length} countries${uaeRank >= 6 ? ' (added to the list above)' : ''}. `
              : 'No UAE locations in LinkedIn’s list. '}
            Countries are added up from LinkedIn’s regions, and LinkedIn lists only the biggest ones, so small countries are undercounted.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- month by month (when the range spans 2+ months)

export function MonthlyTable({ days }: { days: PageDay[] }) {
  const months = useMemo(() => {
    const groups = new Map<string, PageDay[]>()
    for (const d of days) {
      const k = d.date.slice(0, 7)
      groups.set(k, [...(groups.get(k) ?? []), d])
    }
    return [...groups.entries()].sort().map(([k, ds]) => ({ key: k, t: totals(ds), partial: ds.length < differenceInCalendarDays(endOfMonth(parseISO(`${k}-01`)), parseISO(`${k}-01`)) + 1 }))
  }, [days])
  if (months.length < 2) return null
  const cols: [string, (t: Totals) => string][] = [
    ['Impressions', (t) => fmtNumber(t.impressions)],
    ['Unique', (t) => fmtNumber(t.unique_impressions)],
    ['Clicks', (t) => fmtNumber(t.clicks)],
    ['Reactions', (t) => fmtNumber(t.reactions)],
    ['Comments', (t) => fmtNumber(t.comments)],
    ['Reposts', (t) => fmtNumber(t.reposts)],
    ['Engagement', (t) => fmtPct(engagementOf(t))],
    ['Page views', (t) => fmtNumber(t.page_views)],
    ['Visitors', (t) => fmtNumber(t.unique_visitors)],
    ['New followers', (t) => fmtNumber(t.new_followers)],
  ]
  return (
    <Card>
      <CardHeader>
        <CardHeading icon={CalendarDays} title="Month by month" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Month</th>
                {cols.map(([h]) => (
                  <th key={h} className="px-2 py-2 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {format(parseISO(`${m.key}-01`), 'MMM yyyy')}
                    {m.partial && <span className="ml-1 text-xs text-muted-foreground">(part)</span>}
                  </td>
                  {cols.map(([h, f]) => (
                    <td key={h} className="px-2 py-2 text-right tabular-nums">{f(m.t)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}


// ---------------------------------------------------------------- Extra detail, closed until asked for

/** A quiet "show more" row: detail that's useful sometimes, kept out of the way the rest of the time */
export function More({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
        <span className="text-sm font-medium">{title}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </button>
      {open && <div className="space-y-4 border-t p-4">{children}</div>}
    </div>
  )
}