import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { BellRing, ChevronRight, Eye, Info, MapPin, MousePointerClick, Trophy, UserPlus, UserRound, Users, type LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CardHeading, EmptyState, PageHeader } from '@/components/common'
import { FormatsCard, ResultsCard, RhythmCard } from '@/components/dashboard-charts'
import { engagementOf, Mini, pt, rel, totals, useSortedDaily, usePeriod, type Change } from '@/components/period'
import { inRange, TimeRangePicker, type TimeRange } from '@/components/time-range'
import { useAccount } from '@/context/account'
import { useAccountDoc, useDueSnapshots, useOverview, usePageAudience, usePageDaily, usePlanned, usePosts } from '@/hooks/queries'
import { AREAS, areaPath, itemState, useSuggestionItems } from '@/hooks/suggestion-items'
import type { Account, PageAudienceSnapshot, Shares } from '@/lib/api'
import { FORMAT_LABELS, fmtNumber, fmtPct } from '@/lib/format'
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
  // Posts at the age most of them have, so formats are compared like with like
  const { data: probe } = useOverview(id, '24h')
  const { data: posts = [] } = usePosts(id, { checkpoint: probe?.suggested_checkpoint ?? '24h' })

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
      <PageHeader eyebrow="Overview" title="Dashboard" description={account ? `${account.name}${founders.length ? ` and its ${founders.length} founder profile${founders.length === 1 ? '' : 's'}` : ''}` : undefined} actions={<TimeRangePicker value={range} onChange={setRange} />} />

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

          {/* Headline numbers: each shows what it's compared with, and opens the matching Data tab */}
          <div className={cn('grid gap-3 sm:grid-cols-2', account?.kind === 'company' ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
            <Kpi
              to={dataLink('content', 'cm=impressions')}
              icon={Eye}
              label="Impressions"
              value={fmtNumber(stats.cur.impressions)}
              change={rel(stats.cur.impressions, stats.prev?.impressions)}
              note={stats.prev ? `vs. ${fmtNumber(stats.prev.impressions)} last period` : 'No earlier period to compare'}
            />
            <Kpi
              to={dataLink('content', 'cm=engagements')}
              icon={MousePointerClick}
              label="Engagement rate"
              value={fmtPct(engagementOf(stats.cur))}
              change={pt(engagementOf(stats.cur), stats.prev ? engagementOf(stats.prev) : null)}
              note={stats.prev ? `vs. ${fmtPct(engagementOf(stats.prev))} last period` : 'No earlier period to compare'}
            />
            {account?.kind === 'company' && (
              <Kpi
                to={dataLink('visitors', 'vm=unique_visitors')}
                icon={Users}
                label="Page visitors"
                value={fmtNumber(stats.cur.unique_visitors)}
                change={rel(stats.cur.unique_visitors, stats.prev?.unique_visitors)}
                // LinkedIn counts unique visitors per day; the period adds those up
                note={stats.prev ? `vs. ${fmtNumber(stats.prev.unique_visitors)} last period` : 'No earlier period to compare'}
              />
            )}
            <Kpi
              to={dataLink('followers')}
              icon={UserPlus}
              label="New followers"
              value={fmtNumber(stats.cur.new_followers)}
              change={rel(stats.cur.new_followers, stats.prev?.new_followers)}
              note={stats.prev ? `vs. ${fmtNumber(stats.prev.new_followers)} last period` : 'No earlier period to compare'}
            />
            {account?.kind === 'company' ? (
              <Kpi
                to={dataLink('followers')}
                icon={MapPin}
                label="UAE share of followers"
                value={fmtPct(uae.share)}
                change={null}
                note={uae.asOf ? `As of ${format(parseISO(uae.asOf), 'd MMM')}` : 'Import or sync follower demographics'}
              />
            ) : (
              <Kpi
                to={dataLink('content', 'cm=clicks')}
                icon={MousePointerClick}
                label="Clicks"
                value={fmtNumber(stats.cur.clicks)}
                change={rel(stats.cur.clicks, stats.prev?.clicks)}
                note={stats.prev ? `vs. ${fmtNumber(stats.prev.clicks)} last period` : 'No earlier period to compare'}
              />
            )}
          </div>

          {/* Things the Data page doesn't show: how steady the posting is, which formats get seen, what attention turned into */}
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
            <RhythmCard posts={posts} />
            <FormatsCard posts={posts} range={range} checkpoint={probe?.suggested_checkpoint ?? '24h'} />
            <ResultsCard cur={stats.cur} prev={stats.prev} company={account?.kind === 'company'} />
          </div>
        </>
      )}

      {/* Two-thirds: posts and founders. One-third: who the audience is, and what needs doing */}
      <div className="mt-5 grid items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <BestPosts accountId={id} range={range} />
          {founders.length > 0 && win && (
            <section>
              <h2 className="mb-1 text-base font-semibold">Founders</h2>
              <p className="mb-3 text-xs text-muted-foreground">All their posts, including ones not published through this app, for the same period.</p>
              <div className="grid gap-4 md:grid-cols-2">
                {founders.map((f) => (
                  <FounderCard key={f.id} founder={f} from={win.from} to={win.to} />
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="space-y-4">
          {account?.kind === 'company' && <AudienceCard audience={audience} followersLink={dataLink('followers')} visitorsLink={dataLink('visitors')} />}
          <div id="tasks" className="scroll-mt-6">
            <Attention accountId={id} />
          </div>
        </div>
      </div>

    </div>

  )
}

// ---------------------------------------------------------------- headline tiles

function Kpi({ to, icon: Icon, label, value, change, note }: { to: string; icon: LucideIcon; label: string; value: string; change: Change | null; note: string }) {
  return (
    <Link to={to} className="group block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Card size="sm" className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 text-sm font-medium">
            {label}
            <Icon className="size-4 shrink-0 text-primary" aria-hidden />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[34px] leading-none font-medium tracking-tight tabular-nums">{value}</span>
            <ChangePill c={change} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{note}</div>
        </CardHeader>
      </Card>
    </Link>
  )
}

/** The change as a small coloured pill: ▲ green up, ▼ red down, grey when about the same */
function ChangePill({ c }: { c: Change | null }) {
  if (!c) return null
  const tone = c.dir === 'up' ? 'bg-good/15 text-good-fg' : c.dir === 'down' ? 'bg-bad/10 text-bad-fg' : 'bg-muted text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', tone)}>
      {c.dir === 'up' ? '▲' : c.dir === 'down' ? '▼' : '•'} {c.text.replace(/^[+-]/, '')}
    </span>
  )
}

// ---------------------------------------------------------------- who the audience is (AVAIBE's target groups)

const GROUPS: { key: keyof Shares; label: string; hint: string; color: string }[] = [
  { key: 'uae_share', label: 'In the UAE', hint: 'Located in the UAE', color: 'var(--chart-1)' },
  { key: 'decision_maker_share', label: 'Decision-makers', hint: 'Owners, CXOs, VPs, directors', color: 'var(--chart-2)' },
  { key: 'education_share', label: 'Education sector', hint: 'Schools, e-learning, education', color: 'var(--chart-3)' },
  { key: 'tech_share', label: 'Technology professionals', hint: 'Engineering and IT roles', color: 'var(--chart-4)' },
  { key: 'partner_share', label: 'Potential partners', hint: 'Business development and consulting', color: 'var(--chart-5)' },
]

function AudienceCard({ audience, followersLink, visitorsLink }: { audience: PageAudienceSnapshot[]; followersLink: string; visitorsLink: string }) {
  const [kind, setKind] = useState<'followers' | 'visitors'>('followers')
  const latest = audience.filter((a) => a.audience === kind).sort((a, b) => a.as_of.localeCompare(b.as_of)).at(-1)
  return (
    <Card>
      <CardHeader>
        <CardHeading
          icon={Users}
          title="Who your audience is"
          sub={latest ? `${latest.total != null ? `${fmtNumber(latest.total)} ${kind} · ` : ''}as of ${format(parseISO(latest.as_of), 'd MMM')}` : undefined}
        />
        <div role="tablist" aria-label="Audience" className="mt-3 flex w-fit rounded-lg bg-secondary p-1">
          {(['followers', 'visitors'] as const).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn('rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors', kind === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {k}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!latest ? (
          <p className="text-sm text-muted-foreground">
            No {kind} breakdown yet. <Link to="/import" className="underline">Import LinkedIn’s export</Link>.
          </p>
        ) : (
          <>
            <ul className="space-y-3.5">
              {GROUPS.map((g) => {
                const share = latest.shares[g.key] ?? null
                const count = share != null && latest.total != null ? Math.round(share * latest.total) : null
                return (
                  <li key={g.key} title={g.hint}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">{g.label}</span>
                      <span className="tabular-nums">
                        {count != null && <span className="font-semibold">{fmtNumber(count)}</span>}
                        <span className="ml-2 inline-block w-11 text-right text-xs text-muted-foreground">{share == null ? '—' : fmtPct(share)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full" style={{ width: `${Math.max(share ? 2 : 0, (share ?? 0) * 100)}%`, background: g.color }} />
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Groups overlap, so they don’t add up to 100%. LinkedIn lists only its biggest values, so these are minimums.{' '}
              <Link to={kind === 'followers' ? followersLink : visitorsLink} className="underline">
                Full breakdown
              </Link>
            </p>
          </>
        )}
      </CardContent>
    </Card>
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
        <CardHeading icon={UserRound} title={founder.name} sub={doc?.data.followers != null ? `${fmtNumber(doc.data.followers)} followers` : undefined} />
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
        <CardHeading icon={BellRing} title="Needs your attention" />
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
    .map((p) => ({ p, s: p.snapshots[p.snapshots.length - 1] }))
    .filter((x) => x.s?.impressions != null)
    .sort((a, b) => (b.s!.impressions ?? 0) - (a.s!.impressions ?? 0))
    .slice(0, 5)

  return (
    <Card>
      <CardHeader>
        <CardHeading
          icon={Trophy}
          title="Best posts in this period"
          sub="Impressions so far; newer posts have had less time to collect them."
          action={
            <Link to="/data?tab=posts" className="pt-1 text-xs text-muted-foreground hover:text-foreground">
              All posts
            </Link>
          }
        />
      </CardHeader>
      <CardContent>
        {best.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts with numbers in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="w-[46%] py-2 pr-3 font-medium">Post</th>
                  <th className="w-[20%] px-2 py-2 font-medium">Type</th>
                  <th className="w-[11%] px-2 py-2 font-medium">Posted</th>
                  <th className="w-[13%] px-2 py-2 text-right font-medium">Impressions</th>
                  <th className="w-[10%] py-2 pl-2 text-right font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {best.map(({ p, s: snap }) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-3 pr-3">
                      <Link to={`/posts/${p.id}`} className="block truncate font-medium hover:underline">
                        {p.caption?.split('\n')[0] || p.topic || p.ref || `Post ${p.id}`}
                      </Link>
                    </td>
                    <td className="truncate px-2 py-3 text-xs text-muted-foreground">{FORMAT_LABELS[p.format]}</td>
                    <td className="px-2 py-3 text-xs whitespace-nowrap text-muted-foreground">{format(parseISO(p.published_at_uae.slice(0, 10)), 'd MMM')}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{fmtNumber(snap!.impressions)}</td>
                    <td className="py-3 pl-2 text-right tabular-nums">{fmtNumber(snap!.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
