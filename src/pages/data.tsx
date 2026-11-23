import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { FileUp, Filter } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/context/auth'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CardHeading, EmptyState, PageHeader } from '@/components/common'
import { Demographics, Highlights, MetricsChart, More, type ChartMetric } from '@/components/analytics'
import { engagementOf, useSortedDaily, usePeriod, ymd } from '@/components/period'
import { useAccount } from '@/context/account'
import { useTz } from '@/context/timezone'
import { AudiencePage } from '@/pages/audience'
import { PostsPage } from '@/pages/posts'
import { TimeRangePicker, type TimeRange } from '@/components/time-range'
import { cn } from '@/lib/utils'
import { useOverview, usePageAudience, usePosts } from '@/hooks/queries'
import { api, type CheckpointQ, type PageAudienceSnapshot, type PageDay, type Post } from '@/lib/api'
import { FORMAT_LABELS, fmtNumber, fmtPct } from '@/lib/format'

/** LinkedIn-style tabs: by where the data comes from. Founders' profiles have no visitor data. */
const TABS = [
  { value: 'analytics', label: 'Analytics' },
  { value: 'posts', label: 'Posts' },
  { value: 'visitors', label: 'Visitors', companyOnly: true },
  { value: 'followers', label: 'Followers' },
] as const

/** Old links (?tab=timing etc.) still land in the right place */
const LEGACY: Record<string, string> = {
  rankings: 'posts',
  content: 'analytics', // the tab was called Content
  formats: 'analytics',
  timing: 'analytics',
  consistency: 'analytics',
  audience: 'followers',
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
  const [params, setParams] = useSearchParams()

  const raw = params.get('tab') ?? 'analytics'
  const tabRaw = LEGACY[raw] ?? raw
  const tab = tabs.some((t) => t.value === tabRaw) ? tabRaw : 'analytics'
  const setTab = (v: string) => setParams((p) => { p.set('tab', v); p.delete('view'); return p }, { replace: true })

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
    <div className="mx-auto max-w-page">
      <PageHeader
        eyebrow="Overview"
        title="Data"
        description="How your posts, page visitors and followers are doing."
        actions={
          <div className="flex items-center gap-2">
            <TimeRangePicker value={range} onChange={setRange} />
            {/* Import brings in posts, so it sits with the Posts tab only */}
            {tab === 'posts' && auth.can('editor') && (
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
        {id && <LastUpdated accountId={id} kind={tab === 'visitors' ? 'visitors' : tab === 'followers' ? 'followers' : 'content'} />}
      </nav>

      {tab === 'posts' ? (
        // Every post with its numbers (was its own page); uses the time range above
        <PostsPage embedded range={range} />
      ) : isLoading ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !win || !stats ? (
        <EmptyState>
          {daily.length ? 'Pick a start and end date to see this period.' : <>No LinkedIn data yet. <Link to="/import" className="underline">Import LinkedIn’s export</Link> to see how the account is doing.</>}
        </EmptyState>
      ) : tab === 'analytics' ? (
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
        </div>
      ) : tab === 'visitors' ? (
        <VisitorsTab accountId={id} daily={daily} win={win} stats={stats} dates={dates} compareLabel={compareLabel} posts={posts} />
      ) : (
        <FollowersTab accountId={id} daily={daily} win={win} stats={stats} dates={dates} compareLabel={compareLabel} posts={posts} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- When this tab's data last came in

const IMPORT_LABEL = { content: 'content', visitors: 'visitors', followers: 'followers' } as const

function LastUpdated({ accountId, kind }: { accountId: number; kind: keyof typeof IMPORT_LABEL }) {
  const tz = useTz()
  const { data } = useQuery({ queryKey: ['last-imports', accountId], queryFn: () => api.lastImports(accountId), staleTime: 60_000 })
  const last = data?.[kind]
  return (
    <span className="ml-auto self-center pb-2.5 text-xs text-muted-foreground" title={last ? `File: ${last.file}` : undefined}>
      {last
        ? `${last.at ? `Updated ${tz.dateTime(last.at)} · ` : ''}LinkedIn ${IMPORT_LABEL[kind]} export of ${format(parseISO(last.exported_on), 'd MMM yyyy')}`
        : `No ${IMPORT_LABEL[kind]} export imported yet`}
    </span>
  )
}

// ---------------------------------------------------------------- Content: the one-line summary

function ContentSummary({ periodPosts, allPosts }: { periodPosts: Post[]; allPosts: Post[] }) {
  const typical = median(allPosts.map(postImpressions).filter((v): v is number => v != null))
  const ranked = periodPosts.filter((p) => postImpressions(p) != null).sort((a, b) => (postImpressions(b) ?? 0) - (postImpressions(a) ?? 0))
  if (!periodPosts.length) return <>No posts went out in this period, so these numbers come from older posts still being seen.</>
  const best = ranked[0]
  const title = best && (best.caption?.split('\n').find((l) => l.trim())?.trim() || best.topic || best.ref || `Post ${best.id}`)
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
            <CardHeading icon={Filter} title="From visit to lead" sub="Same period. LinkedIn stops at the visit; your Leads log carries it on." />
          </CardHeader>
          <CardContent>
            <Funnel
              steps={[
                { label: 'Unique visitors', value: visitors },
                { label: 'Leads logged', value: inWin.length, to: '/leads/log' },
                { label: 'Qualified', value: inWin.filter((l) => l.is_qualified).length, to: '/leads/log' },
                { label: 'Won', value: inWin.filter((l) => l.stage === 'won').length, to: '/leads/pipeline' },
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
