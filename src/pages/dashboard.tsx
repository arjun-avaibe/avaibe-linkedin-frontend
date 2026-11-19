import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ChevronRight, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageHeader } from '@/components/common'
import { ChangeTag, engagementOf, Mini, pt, rel, totals, useSortedDaily, usePeriod, type Change } from '@/components/period'
import { inRange, TimeRangePicker, type TimeRange } from '@/components/time-range'
import { useAccount } from '@/context/account'
import { useAccountDoc, useDueSnapshots, useOverview, usePageAudience, usePageDaily, usePlanned, usePosts } from '@/hooks/queries'
import { AREAS, areaPath, itemState, useSuggestionItems } from '@/hooks/suggestion-items'
import type { Account } from '@/lib/api'
import { fmtNumber, fmtPct } from '@/lib/format'
import { needsAction } from '@/lib/publishing'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const { account, accounts } = useAccount()
  const id = account?.id
  const [params, setParams] = useSearchParams()
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
  const { data: audience = [] } = usePageAudience(id)
  // This period vs the previous one (same days only, so days LinkedIn hasn't reported don't count against it)
  const { win, stats } = usePeriod(daily, range)
  const founders = accounts.filter((a) => a.parent_id != null && a.parent_id === id)

  const uae = useMemo(() => {
    const latest = (aud: 'followers' | 'visitors') =>
      audience.filter((a) => a.audience === aud).sort((a, b) => a.as_of.localeCompare(b.as_of)).at(-1)
    const f = latest('followers')
    return { share: f?.shares.uae_share ?? null, asOf: f?.as_of ?? null, visitors: latest('visitors')?.shares.uae_share ?? null }
  }, [audience])

  // The same period carried over to Data
  const rangeQs = `range=${range.preset}${range.preset === 'custom' ? `&from=${range.from ?? ''}&to=${range.to ?? ''}` : ''}`
  const dataLink = (tab: string, extra?: string) => `/data?tab=${tab}&${rangeQs}${extra ? `&${extra}` : ''}`

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Dashboard" description={account ? `${account.name}${founders.length ? ` and its ${founders.length} founder profile${founders.length === 1 ? '' : 's'}` : ''}` : undefined} actions={<TimeRangePicker value={range} onChange={setRange} />} />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !stats ? (
        <EmptyState>
          {daily.length ? 'Pick a start and end date to see this period.' : <>No page data yet. <Link to="/import" className="underline">Import LinkedIn’s page export</Link> to see how the page is doing.</>}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5" />
            {format(parseISO(win!.from), 'd MMM yyyy')} – {format(parseISO(win!.to), 'd MMM yyyy')}
            {stats.prev ? ', compared with the same number of days before' : ''}
            {stats.partial && <> · LinkedIn data so far runs to {format(parseISO(stats.lastData), 'd MMM yyyy')}</>}
          </p>

          {/* Headline numbers: a glance, each opening the matching Data tab for the detail */}
          <div className={cn('grid gap-3 sm:grid-cols-2', account?.kind === 'company' ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
            <Kpi to={dataLink('content', 'cm=impressions')} label="Impressions" value={fmtNumber(stats.cur.impressions)} change={rel(stats.cur.impressions, stats.prev?.impressions)} hint="All posts, counted on the day they were seen" />
            <Kpi to={dataLink('content', 'cm=engagements')} label="Engagement rate" value={fmtPct(engagementOf(stats.cur))} change={pt(engagementOf(stats.cur), stats.prev ? engagementOf(stats.prev) : null)} hint="Clicks, reactions, comments and reposts ÷ impressions" />
            {account?.kind === 'company' && (
              <Kpi
                to={dataLink('visitors', 'vm=unique_visitors')}
                label="Page visitors"
                value={fmtNumber(stats.cur.unique_visitors)}
                change={rel(stats.cur.unique_visitors, stats.prev?.unique_visitors)}
                // LinkedIn counts unique visitors per day; the period adds those up
                hint={`Unique each day, added up${uae.visitors != null ? ` · ${fmtPct(uae.visitors)} from the UAE` : ''}`}
              />
            )}
            <Kpi to={dataLink('followers')} label="New followers" value={fmtNumber(stats.cur.new_followers)} change={rel(stats.cur.new_followers, stats.prev?.new_followers)} hint={`Over ${stats.len} days`} />
            {account?.kind === 'company' ? (
              <Kpi to={dataLink('followers')} label="UAE share of followers" value={fmtPct(uae.share)} change={null}
                hint={uae.asOf ? `As of ${format(parseISO(uae.asOf), 'd MMM')}` : 'Import or sync follower demographics'} />
            ) : (
              <Kpi to={dataLink('content', 'cm=clicks')} label="Clicks" value={fmtNumber(stats.cur.clicks)} change={rel(stats.cur.clicks, stats.prev?.clicks)} hint="Link clicks" />
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Click a number for its chart and the reasons behind it in Data.</p>
        </>
      )}

      {/* What to do next comes before the detail */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Attention accountId={id} />
        <BestPosts accountId={id} range={range} />
      </div>
      {founders.length > 0 && win && (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-medium">Founders</h2>
          <p className="mb-3 text-xs text-muted-foreground">All their posts, including ones not published through this app, for the same period.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {founders.map((f) => (
              <FounderCard key={f.id} founder={f} from={win.from} to={win.to} />
            ))}
          </div>
        </section>
      )}

    </div>

  )
}

// ---------------------------------------------------------------- headline tiles

function Kpi({ to, label, value, change, hint }: { to: string; label: string; value: string; change: Change | null; hint: string }) {
  return (
    <Link to={to} className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Card size="sm" className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            {label}
            <ChevronRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
            <ChangeTag c={change} />
          </div>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
      </Card>
    </Link>
  )
}
// ---------------------------------------------------------------- founders: all their posts

function FounderCard({ founder, from, to }: { founder: Account; from: string; to: string }) {
  const { data: daily = [] } = usePageDaily(founder.id)
  const { data: doc } = useAccountDoc(founder.id, 'member_totals')
  const t = totals(daily.filter((d) => d.date >= from && d.date <= to))
  const all = doc?.data.totals ?? {}
  const eng = t.impressions ? ((t.reactions ?? 0) + (t.comments ?? 0) + (t.reposts ?? 0)) / t.impressions : null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{founder.name}</CardTitle>
        {doc?.data.followers != null && <div className="text-xs text-muted-foreground">{fmtNumber(doc.data.followers)} followers</div>}
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
          <Mini label="Impressions" v={t.impressions} />
          <Mini label="Reactions" v={t.reactions} />
          <Mini label="Comments" v={t.comments} />
          <Mini label="Reposts" v={t.reposts} />
          <Mini label="Engagement" v={eng} pct />
          <Mini label="New followers" v={t.new_followers} />
        </dl>
        {doc?.data.as_of && (
          <div className="rounded-md bg-muted/60 p-3">
            <div className="mb-2 text-xs text-muted-foreground">All time, all posts (LinkedIn gives these only as totals)</div>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
              <Mini label="People reached" v={all.MEMBERS_REACHED ?? null} />
              <Mini label="Followers from posts" v={all.FOLLOWER_GAINED_FROM_CONTENT ?? null} />
              <Mini label="Profile views from posts" v={all.PROFILE_VIEW_FROM_CONTENT ?? null} />
              <Mini label="Saves" v={all.POST_SAVE ?? null} />
              <Mini label="Sends" v={all.POST_SEND ?? null} />
              <Mini label="Link clicks" v={all.LINK_CLICKS ?? null} />
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- what needs doing / best posts

function Attention({ accountId }: { accountId?: number }) {
  const { data: planned = [] } = usePlanned(accountId)
  const { data: due = [] } = useDueSnapshots(accountId)
  const { items } = useSuggestionItems(accountId)
  const waiting = planned.filter(needsAction).length
  const top = items.filter((it) => itemState(it.decision?.status) === 'open').slice(0, 3)
  const rows: { to: string; text: string; sub?: string }[] = []
  if (waiting) rows.push({ to: '/publishing', text: `${waiting} post${waiting === 1 ? '' : 's'} waiting in Publishing` })
  if (due.length) rows.push({ to: '/posts', text: `${due.length} snapshot${due.length === 1 ? '' : 's'} due` })
  for (const it of top) rows.push({ to: areaPath(it.area), text: it.title, sub: AREAS.find((a) => a.id === it.area)?.label })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Needs your attention</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          <ul className="-mx-2">
            {rows.map((r) => (
              <li key={r.to + r.text}>
                <Link to={r.to} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.text}</span>
                    {r.sub && <span className="block text-xs text-muted-foreground">{r.sub}</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function BestPosts({ accountId, range }: { accountId?: number; range: TimeRange }) {
  const { data: probe } = useOverview(accountId, '24h')
  const { data: posts = [] } = usePosts(accountId, { checkpoint: probe?.suggested_checkpoint ?? '24h' })
  const best = posts
    .filter((p) => inRange(p.published_at, range))
    .map((p) => ({ p, imp: p.snapshots[p.snapshots.length - 1]?.impressions ?? null }))
    .filter((x) => x.imp != null)
    .sort((a, b) => (b.imp ?? 0) - (a.imp ?? 0))
    .slice(0, 3)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Best posts in this period</CardTitle>
        <Link to="/posts" className="text-xs text-muted-foreground hover:text-foreground">
          All posts
        </Link>
      </CardHeader>
      <CardContent>
        {best.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts with numbers in this period.</p>
        ) : (
          <ol className="-mx-2">
            {best.map(({ p, imp }, i) => (
              <li key={p.id}>
                <Link to={`/posts/${p.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
                  <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{p.caption?.split('\n')[0] || p.topic || `Post #${p.id}`}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtNumber(imp)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Impressions so far; newer posts have had less time to collect them.</p>
      </CardContent>
    </Card>
  )
}
