import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { FileUp, Info } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/context/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ClassificationBadge, EmptyState, PageHeader, Section, SimpleSelect } from '@/components/common'
import { Heatmap } from '@/components/heatmap'
import { TimingModelSection } from '@/components/timing-model'
import { Demographics, Highlights, MetricsChart, MonthlyTable, More, type ChartMetric } from '@/components/analytics'
import { engagementOf, useSortedDaily, usePeriod, ymd } from '@/components/period'
import { useAccount } from '@/context/account'
import { useTz } from '@/context/timezone'
import { AudiencePage } from '@/pages/audience'
import { rangeQuery, TimeRangePicker, type TimeRange } from '@/components/time-range'
import { cn } from '@/lib/utils'

type RangeQ = ReturnType<typeof rangeQuery>
import {
  useGroups,
  useHeatmap,
  useOverview,
  usePageAudience,
  usePosts,
  useRankings,
} from '@/hooks/queries'
import { api, FORMATS, type CheckpointQ, type Overview, type PageAudienceSnapshot, type PageDay, type Post, type PostFormat, type RankedRow } from '@/lib/api'
import { AUDIENCE_METRICS, FORMAT_LABELS, fmtMetric, fmtNumber, fmtPct, metricLabel } from '@/lib/format'

// A few clear choices instead of every metric the app can compute. UAE reach is offered once posts have audience data.
const METRIC_CHOICES = (hasAudience: boolean) => [
  ...(hasAudience ? ['uae_impressions'] : []),
  'impressions',
  'engagement_rate',
  'clicks',
  'comments',
]

/** LinkedIn-style tabs: by where the data comes from. Founders' profiles have no visitor data. */
const TABS = [
  { value: 'content', label: 'Content' },
  { value: 'visitors', label: 'Visitors', companyOnly: true },
  { value: 'followers', label: 'Followers' },
] as const

/** The analysis that used to be separate tabs, now one switcher inside Content */
const VIEWS = [
  { value: 'posts', label: 'Best & worst posts' },
  { value: 'topics', label: 'Topics & formats' },
  { value: 'time', label: 'Posting time' },
] as const

/** Old links (?tab=timing etc.) still land in the right place */
const LEGACY: Record<string, [string, string?]> = {
  rankings: ['content', 'posts'],
  formats: ['content', 'topics'],
  timing: ['content', 'time'],
  consistency: ['content', 'posts'],
  audience: ['followers'],
}

const sum = (vals: (number | null)[]) => {
  const v = vals.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}

const CONTENT_METRICS: ChartMetric[] = [
  { value: 'impressions', label: 'Impressions', get: (d) => d.impressions },
  { value: 'clicks', label: 'Clicks', get: (d) => d.clicks },
  { value: 'comments', label: 'Comments', get: (d) => d.comments },
  { value: 'engagements', label: 'All engagements', get: (d) => sum([d.clicks, d.reactions, d.comments, d.reposts]) },
]
const VISITOR_METRICS: ChartMetric[] = [
  { value: 'page_views', label: 'Page views', get: (d) => d.page_views },
  { value: 'unique_visitors', label: 'Unique visitors', get: (d) => d.unique_visitors },
]
const FOLLOWER_METRICS: ChartMetric[] = [{ value: 'new_followers', label: 'New followers', get: (d) => d.new_followers }]

const postDate = (p: Post) => p.published_at_uae.slice(0, 10)
const postImpressions = (p: Post) => p.snapshots[p.snapshots.length - 1]?.impressions ?? null
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Analytics in LinkedIn's layout (Highlights → Metrics → detail), with our analysis inside the Content tab. */
export function DataPage() {
  const { account } = useAccount()
  const auth = useAuth()
  const id = account?.id
  const isCompany = account?.kind === 'company'
  const tabs = TABS.filter((t) => isCompany || !('companyOnly' in t))
  // Posts are compared at the age most of them have (7d for history from LinkedIn), chosen automatically
  const { data: probe } = useOverview(id, '24h')
  const checkpoint: CheckpointQ = probe?.suggested_checkpoint ?? '24h'
  const { data: overview } = useOverview(id, checkpoint)
  const [params, setParams] = useSearchParams()

  const raw = params.get('tab') ?? 'content'
  const legacy = LEGACY[raw]
  const tabRaw = legacy ? legacy[0] : raw
  const tab = tabs.some((t) => t.value === tabRaw) ? tabRaw : 'content'
  const view = params.get('view') ?? legacy?.[1] ?? 'posts'
  const setTab = (v: string) => setParams((p) => { p.set('tab', v); p.delete('view'); return p }, { replace: true })
  const setView = (v: string) => setParams((p) => { p.set('tab', 'content'); p.set('view', v); return p }, { replace: true })

  // Time range: like LinkedIn's own analytics, kept in the address so it can be shared
  const range: TimeRange = { preset: params.get('range') ?? '30', from: params.get('from') ?? undefined, to: params.get('to') ?? undefined }
  const setRange = (r: TimeRange) =>
    setParams((p) => {
      p.set('range', r.preset)
      for (const k of ['from', 'to'] as const) {
        if (r.preset === 'custom' && r[k]) p.set(k, r[k]!)
        else p.delete(k)
      }
      return p
    }, { replace: true })
  const q = rangeQuery(range)

  const { daily, isLoading } = useSortedDaily(id)
  const { win, stats } = usePeriod(daily, range)
  const { data: posts = [] } = usePosts(id, { checkpoint })
  const periodPosts = useMemo(() => (win ? posts.filter((p) => postDate(p) >= win.from && postDate(p) <= win.to) : []), [posts, win?.from, win?.to]) // eslint-disable-line react-hooks/exhaustive-deps

  const dates = win && (
    <>
      Data for {format(parseISO(win.from), 'd MMM yyyy')} – {format(parseISO(win.to), 'd MMM yyyy')}
      {stats?.partial && <> · LinkedIn data so far runs to {format(parseISO(stats.lastData), 'd MMM yyyy')}</>}
    </>
  )
  const compareLabel = stats ? `vs previous ${stats.len} days` : ''

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Data"
        description="How your posts, page visitors and followers are doing, and why."
        actions={
          <div className="flex items-center gap-2">
            <TimeRangePicker value={range} onChange={setRange} />
            {auth.can('editor') && (
              <Link to="/import" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                <FileUp /> Import
              </Link>
            )}
          </div>
        }
      />

      {/* LinkedIn-style underlined tabs */}
      <nav role="tablist" aria-label="Analytics" className="mb-5 flex gap-6 border-b">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              '-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-medium transition-colors',
              tab === t.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !win || !stats ? (
        <EmptyState>
          {daily.length ? 'Pick a start and end date to see this period.' : <>No LinkedIn data yet. <Link to="/import" className="underline">Import LinkedIn’s export</Link> to see how the account is doing.</>}
        </EmptyState>
      ) : tab === 'content' ? (
        <div className="space-y-4">
          <Highlights
            dates={dates}
            compareLabel={compareLabel}
            items={[
              { label: 'Impressions', value: stats.cur.impressions, prev: stats.prev?.impressions },
              { label: 'Clicks', value: stats.cur.clicks, prev: stats.prev?.clicks },
              {
                label: 'Engagement rate',
                value: engagementOf(stats.cur),
                prev: stats.prev ? engagementOf(stats.prev) : null,
                pct: true,
                small: (stats.cur.impressions ?? 0) < 300,
              },
              { label: 'Comments', value: stats.cur.comments, prev: stats.prev?.comments },
            ]}
            summary={<ContentSummary periodPosts={periodPosts} allPosts={posts} />}
          />
          <MetricsChart daily={daily} from={win.from} to={win.to} metrics={CONTENT_METRICS} posts={posts} param="cm" title="What happened when" />
          <Analysis
            view={view}
            setView={setView}
            accountId={id}
            checkpoint={checkpoint}
            range={q}
            overview={overview}
          />
          <More title="Month by month" hint="All the numbers, one row per month, for reports">
            <MonthlyTable days={stats.curDays} />
          </More>
        </div>
      ) : tab === 'visitors' ? (
        <VisitorsTab accountId={id} daily={daily} win={win} stats={stats} dates={dates} compareLabel={compareLabel} posts={posts} />
      ) : (
        <FollowersTab accountId={id} daily={daily} win={win} stats={stats} dates={dates} compareLabel={compareLabel} posts={posts} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Content: the one-line summary

function ContentSummary({ periodPosts, allPosts }: { periodPosts: Post[]; allPosts: Post[] }) {
  const typical = median(allPosts.map(postImpressions).filter((v): v is number => v != null))
  const ranked = periodPosts.filter((p) => postImpressions(p) != null).sort((a, b) => (postImpressions(b) ?? 0) - (postImpressions(a) ?? 0))
  if (!periodPosts.length) return <>No posts went out in this period, so these numbers come from older posts still being seen.</>
  const best = ranked[0]
  const title = best && (best.caption?.split('\n').find((l) => l.trim())?.trim() || best.topic || `Post #${best.id}`)
  const ratio = best && typical ? (postImpressions(best) ?? 0) / typical : null
  return (
    <>
      <span className="font-medium">{periodPosts.length} post{periodPosts.length === 1 ? '' : 's'}</span> went out in this period.
      {best && (
        <>
          {' '}The strongest was{' '}
          <Link to={`/posts/${best.id}`} className="underline underline-offset-2">
            “{title!.length > 60 ? `${title!.slice(0, 60)}…` : title}”
          </Link>{' '}
          ({FORMAT_LABELS[best.format]}, {format(parseISO(postDate(best)), 'd MMM')}) with {fmtNumber(postImpressions(best))} impressions
          {ratio != null && ratio >= 1.2 ? `, ${ratio.toFixed(1)}× your typical post` : ''}.
        </>
      )}
      {ranked.length < 5 && <span className="text-muted-foreground"> With fewer than 5 posts, treat any pattern as a hint, not a result.</span>}
    </>
  )
}

// ---------------------------------------------------------------- Content: what's working

function Analysis({
  view,
  setView,
  accountId,
  checkpoint,
  range,
  overview,
}: {
  view: string
  setView: (v: string) => void
  accountId?: number
  checkpoint: CheckpointQ
  range: RangeQ
  overview: Overview | undefined
}) {
  const hasAudience = (overview?.posts_with_audience ?? 0) > 0
  const active = VIEWS.some((v) => v.value === view) ? view : 'posts'
  return (
    <section className="pt-2">
      <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">What’s working</h2>
          <p className="text-xs text-muted-foreground">Which posts, topics and times do best, compared with your own history.</p>
        </div>
      </div>
      <div role="tablist" aria-label="Analysis" className="mt-3 flex flex-wrap gap-1 rounded-lg bg-secondary p-1 sm:w-fit">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            role="tab"
            type="button"
            aria-selected={active === v.value}
            onClick={() => setView(v.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              active === v.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {overview && <DataNotes overview={overview} />}
      <div className="mt-4">
        {overview?.posts_total === 0 ? (
          <EmptyState>
            No posts yet for this account. <Link to="/posts/new" className="underline">Add a post</Link> or{' '}
            <Link to="/import" className="underline">import LinkedIn’s export</Link>.
          </EmptyState>
        ) : active === 'posts' ? (
          <RankingsPanel accountId={accountId} checkpoint={checkpoint} range={range} hasAudience={hasAudience} />
        ) : active === 'topics' ? (
          <ContentPanel accountId={accountId} checkpoint={checkpoint} range={range} />
        ) : (
          <TimingPanel accountId={accountId} checkpoint={checkpoint} range={range} hasAudience={hasAudience} />
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Visitors and Followers

interface TabProps {
  accountId?: number
  daily: PageDay[]
  win: { from: string; to: string }
  stats: NonNullable<ReturnType<typeof usePeriod>['stats']>
  dates: React.ReactNode
  compareLabel: string
  posts: Post[]
}

/** The latest snapshot of one audience, and the one before it (for "change since") */
function useSnapshots(accountId: number | undefined, kind: 'followers' | 'visitors') {
  const { data = [] } = usePageAudience(accountId)
  return useMemo(() => {
    const list = data.filter((d) => d.audience === kind).sort((a, b) => a.as_of.localeCompare(b.as_of))
    return { latest: list.at(-1) as PageAudienceSnapshot | undefined, before: list.at(-2) as PageAudienceSnapshot | undefined }
  }, [data, kind])
}

function VisitorsTab({ accountId, daily, win, stats, dates, compareLabel, posts }: TabProps) {
  const { latest, before } = useSnapshots(accountId, 'visitors')
  const { data: leads = [] } = useQuery({ queryKey: ['leads', accountId], queryFn: () => api.leads(accountId!), enabled: !!accountId })
  const prevFrom = ymd(addDays(parseISO(win.from), -stats.len))
  const prevTo = ymd(addDays(parseISO(win.from), -1))
  const inWin = leads.filter((l) => l.received_on >= win.from && l.received_on <= win.to)
  const inPrev = leads.filter((l) => l.received_on >= prevFrom && l.received_on <= prevTo)
  const visitors = stats.cur.unique_visitors

  return (
    <div className="space-y-4">
      <Highlights
        dates={dates}
        compareLabel={compareLabel}
        items={[
          { label: 'Page views', value: stats.cur.page_views, prev: stats.prev?.page_views },
          { label: 'Unique visitors', value: visitors, prev: stats.prev?.unique_visitors, hint: 'Unique each day, added up' },
          {
            label: 'From the UAE',
            value: latest?.shares.uae_share ?? null,
            prev: before?.shares.uae_share ?? null,
            pct: true,
            small: (latest?.total ?? 0) < 100,
            hint: latest ? `Visitor breakdown as of ${format(parseISO(latest.as_of), 'd MMM')}` : undefined,
          },
          { label: 'Leads logged', value: inWin.length, prev: inPrev.length, hint: 'From your Leads log' },
        ]}
      />
      <MetricsChart daily={daily} from={win.from} to={win.to} metrics={VISITOR_METRICS} posts={posts} param="vm" title="When did people visit" />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Demographics snapshot={latest} noun="visitors" />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">From visit to lead</CardTitle>
            <div className="text-xs text-muted-foreground">Same period. LinkedIn stops at the visit; your Leads log carries it on.</div>
          </CardHeader>
          <CardContent>
            <Funnel
              steps={[
                { label: 'Unique visitors', value: visitors },
                { label: 'Leads logged', value: inWin.length, to: '/leads/log' },
                { label: 'Qualified', value: inWin.filter((l) => l.is_qualified).length, to: '/leads/log' },
                { label: 'Won', value: inWin.filter((l) => l.stage === 'won').length, to: '/sales/pipeline' },
              ]}
            />
            <p className="mt-4 text-xs text-muted-foreground">
              {visitors && inWin.length
                ? `${fmtNumber((inWin.length / visitors) * 1000, 1)} leads per 1,000 visitors. `
                : !leads.length
                  ? 'No leads logged yet, so visits can’t be linked to enquiries. '
                  : ''}
              Not every lead comes through the page, and button clicks aren’t in your data yet.
            </p>
          </CardContent>
        </Card>
      </div>
      <More title="Track the UAE share over time" hint="Manual snapshots, for when the export isn’t enough">
        <AudiencePage embedded fixed="visitors" />
      </More>
    </div>
  )
}

function Funnel({ steps }: { steps: { label: string; value: number | null; to?: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value ?? 0))
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{s.label}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{fmtNumber(s.value)}</span>
                {prev ? <span className="ml-2 text-xs text-muted-foreground">{fmtPct((s.value ?? 0) / prev)}</span> : null}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-[var(--chart-current)]" style={{ width: `${Math.max(s.value ? 1.5 : 0, ((s.value ?? 0) / max) * 100)}%` }} />
            </div>
          </>
        )
        return (
          <li key={s.label}>
            {s.to ? (
              <Link to={s.to} className="group -mx-2 block rounded-md px-2 py-1 hover:bg-muted">
                {body}
              </Link>
            ) : (
              <div className="py-1">{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function FollowersTab({ accountId, daily, win, stats, dates, compareLabel, posts }: TabProps) {
  const { latest, before } = useSnapshots(accountId, 'followers')
  const uaeNow = latest?.total != null && latest.shares.uae_share != null ? Math.round(latest.total * latest.shares.uae_share) : null
  const uaeBefore = before?.total != null && before.shares.uae_share != null ? Math.round(before.total * before.shares.uae_share) : null
  const asOf = latest ? `As of ${format(parseISO(latest.as_of), 'd MMM')}` : 'Import or record follower demographics'

  return (
    <div className="space-y-4">
      <Highlights
        dates={dates}
        compareLabel={compareLabel}
        items={[
          { label: 'Total followers', value: latest?.total ?? null, prev: before?.total ?? null, hint: asOf },
          { label: 'New followers', value: stats.cur.new_followers, prev: stats.prev?.new_followers },
          { label: 'UAE followers (est.)', value: uaeNow, prev: uaeBefore, hint: latest ? 'Total × UAE share' : undefined },
          {
            label: 'Decision-makers',
            value: latest?.shares.decision_maker_share ?? null,
            prev: before?.shares.decision_maker_share ?? null,
            pct: true,
            hint: 'Share of followers',
          },
        ]}
      />
      <MetricsChart daily={daily} from={win.from} to={win.to} metrics={FOLLOWER_METRICS} posts={posts} param="fm" title="When did people follow" />
      <Demographics snapshot={latest} noun="followers" />
      <More title="Track the UAE share over time" hint="Manual snapshots, for when the export isn’t enough">
        <AudiencePage embedded fixed="followers" />
      </More>
    </div>
  )
}

/** One quiet line about data limits, instead of banners */
function DataNotes({ overview }: { overview: Overview }) {
  const notes: string[] = []
  if (overview.posts_untagged > 0) notes.push(`${overview.posts_untagged} posts have no format yet.`)
  if (overview.posts_time_unknown > 0) notes.push(`${overview.posts_time_unknown} posts have no posting time (LinkedIn’s export gives dates only).`)
  if (overview.posts_with_audience === 0) notes.push('No per-post audience data yet, so rankings use total impressions, not UAE reach.')
  if (!notes.length) return null
  return (
    <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {notes.join(' ')} <Link to="/suggestions/data" className="underline">Data fixes</Link>
      </span>
    </p>
  )
}


// ---------------------------------------------------------------- rankings

function RankingsPanel({ accountId, checkpoint, range, hasAudience }: { accountId?: number; checkpoint: CheckpointQ; range?: RangeQ; hasAudience: boolean }) {
  const [metric, setMetric] = useState(hasAudience ? 'uae_impressions' : 'impressions')
  const { data } = useRankings(accountId, checkpoint, metric, range)
  const [all, setAll] = useState(false)
  const n = all ? 10 : 5
  const more = (data?.top.length ?? 0) > 5 && (
    <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-medium text-muted-foreground hover:text-foreground">
      {all ? 'Show 5' : 'Show 10'}
    </button>
  )
  const metricSelect = (
    <SimpleSelect label="Rank by" value={metric} onChange={setMetric} options={METRIC_CHOICES(hasAudience).map((m) => ({ value: m, label: metricLabel(m) }))} />
  )
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section
        title="Best posts"
        description={
          AUDIENCE_METRICS.has(metric)
            ? 'Only posts with audience data are ranked. Labels compare against other posts with audience data.'
            : 'Labels compare each post with your usual results.'
        }
        actions={metricSelect}
      >
        <RankTable rows={(data?.top ?? []).slice(0, n)} metric={metric} />
        {more}
      </Section>
      <Section title="Weakest posts" description="Worth a look: check the hook, topic, format, timing and audience.">
        {data?.note ? <EmptyState>{data.note}</EmptyState> : <><RankTable rows={(data?.bottom ?? []).slice(0, n)} metric={metric} />{more}</>}
      </Section>
    </div>
  )
}

function RankTable({ rows, metric }: { rows: RankedRow[]; metric: string }) {
  const tz = useTz()
  if (!rows.length) return <EmptyState>No posts with numbers in this time range yet.</EmptyState>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Post</TableHead>
          <TableHead className="hidden 2xl:table-cell">Format</TableHead>
          <TableHead className="w-24 text-right leading-tight whitespace-normal">{metricLabel(metric)}</TableHead>
          <TableHead>Class</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.post.id}>
            <TableCell className="max-w-40 xl:max-w-56">
              <Link to={`/posts/${r.post.id}`} className="block truncate font-medium hover:underline">
                {r.post.topic ?? `Post #${r.post.id}`}
              </Link>
              <span className="block truncate text-xs text-muted-foreground">
                <span className="2xl:hidden">{FORMAT_LABELS[r.post.format]} · </span>
                {r.post.time_known
                  ? `${tz.weekday(r.post.published_at).slice(0, 3)} ${tz.dateTime(r.post.published_at)}`
                  : `${r.post.day_uae.slice(0, 3)} ${r.post.published_at_uae.slice(0, 10)}`}
              </span>
            </TableCell>
            <TableCell className="hidden text-xs 2xl:table-cell">{FORMAT_LABELS[r.post.format]}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtMetric(metric, r.value)}</TableCell>
            <TableCell className="w-28">
              <ClassificationBadge c={r.classification} wrap />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ---------------------------------------------------------------- posting time

function TimingPanel({ accountId, checkpoint, range, hasAudience }: { accountId?: number; checkpoint: CheckpointQ; range?: RangeQ; hasAudience: boolean }) {
  const [format, setFormat] = useState('all')
  const [metric, setMetric] = useState(hasAudience ? 'uae_impressions' : 'impressions')
  const { data: hm } = useHeatmap(accountId, checkpoint, metric, format === 'all' ? undefined : format, range)

  return (
    <div className="space-y-4">
      <TimingModelSection accountId={accountId} />
      <Section
        title="Posting-time heatmap (raw)"
        description="Median per post in each UAE day and time slot, before allowing for format, topic or holidays. Useful to see where you have posted; use “Best time to post” above for advice."
        actions={
          <>
            <SimpleSelect
              label="Format"
              value={format}
              onChange={setFormat}
              options={[{ value: 'all', label: 'All formats' }, ...FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))]}
            />
            <SimpleSelect label="Metric" value={metric} onChange={setMetric} options={METRIC_CHOICES(hasAudience).map((m) => ({ value: m, label: metricLabel(m) }))} />
          </>
        }
      >
        {hm && hm.posts_without_time > 0 && (
          <p className="mb-3 flex items-start gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-xs">
            <Info className="mt-0.5 size-4 shrink-0 text-info-fg" />
            <span>
              {hm.posts_without_time} post{hm.posts_without_time === 1 ? ' has' : 's have'} only a date (LinkedIn export), so{' '}
              {hm.posts_without_time === 1 ? 'it is' : 'they are'} left out here rather than guessed. Compare days instead under{' '}
              <Link to="/data?tab=content&view=topics&by=weekday" className="underline">Topics → Day of week</Link>.
            </span>
          </p>
        )}
        {hm ? <Heatmap data={hm} /> : <Skeleton className="h-80" />}
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------- topics / CTA / hashtags

const GROUP_OPTIONS = [
  { value: 'topic', label: 'Topic' },
  { value: 'format', label: 'Format' },
  { value: 'weekday', label: 'Day of week (UAE)' },
  { value: 'cta', label: 'Call to action' },
  { value: 'hashtag', label: 'Hashtag' },
]

function ContentPanel({ accountId, checkpoint, range }: { accountId?: number; checkpoint: CheckpointQ; range?: RangeQ }) {
  const [params, setParams] = useSearchParams()
  const by = params.get('by') ?? 'topic'
  const setBy = (v: string) => setParams((p) => { p.set('by', v); return p }, { replace: true })
  const { data = [] } = useGroups(accountId, checkpoint, by, range)
  // UAE and education columns appear once posts have audience data; until then they would be all dashes
  const hasAud = data.some((g) => g.posts_with_audience > 0)
  return (
    <Section
      title="Topics & formats"
      description="Median results per post in each group. Groups of 1–2 posts are hints, not evidence."
      actions={<SimpleSelect label="Group by" value={by} onChange={setBy} options={GROUP_OPTIONS} />}
    >
      {data.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{GROUP_OPTIONS.find((g) => g.value === by)?.label}</TableHead>
              <TableHead className="text-right">Posts</TableHead>
              <TableHead className="text-right">Median impr.</TableHead>
              {hasAud && <TableHead className="text-right">Est. UAE impr.</TableHead>}
              {hasAud && <TableHead className="text-right">UAE share</TableHead>}
              {hasAud && <TableHead className="text-right">Edu. share</TableHead>}
              <TableHead className="text-right">Median eng. rate</TableHead>
              <TableHead className="text-right">Median comments</TableHead>
              <TableHead className="text-right">Median clicks</TableHead>
              <TableHead className="text-right">Followers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((g) => (
              <TableRow key={g.key}>
                <TableCell className="max-w-72 truncate font-medium">
                  {by === 'format' ? (FORMAT_LABELS[g.key as PostFormat] ?? g.key) : g.key}
                  {g.posts < 3 && <span className="ml-2 text-xs font-normal text-muted-foreground">(small sample)</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{g.posts}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNumber(g.median_impressions)}</TableCell>
                {hasAud && <TableCell
                  className="text-right tabular-nums"
                  title={g.posts_with_audience ? `Audience data on ${g.posts_with_audience} of ${g.posts} posts` : 'No audience data'}
                >
                  {fmtNumber(g.median_uae_impressions)}
                </TableCell>}
                {hasAud && <TableCell className="text-right tabular-nums">{fmtPct(g.median_uae_share)}</TableCell>}
                {hasAud && <TableCell className="text-right tabular-nums">{fmtPct(g.median_education_share)}</TableCell>}
                <TableCell className="text-right tabular-nums">{fmtPct(g.median_engagement_rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNumber(g.median_comments, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNumber(g.median_clicks, 1)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNumber(g.followers_gained)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState>No posts have a snapshot at this checkpoint yet.</EmptyState>
      )}
    </Section>
  )
}
