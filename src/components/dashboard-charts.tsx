/**
 * Dashboard-only charts: things the Data page doesn't show.
 * - Posting rhythm: posts per week over the last 12 weeks (consistency)
 * - Formats: the typical (median) post in each format this period, at the same age
 * - Per 1,000 impressions: what attention turned into (clicks, page visitors, new followers)
 * One series each, in the brand coral; every bar has a hover/focus tooltip with the exact figures.
 */
import type { ReactNode } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { CalendarRange, Layers, Target } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CardHeading } from '@/components/common'
import type { totals } from '@/components/period'
import { inRange, type TimeRange } from '@/components/time-range'
import type { Post } from '@/lib/api'
import { FORMAT_LABELS, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

type Totals = ReturnType<typeof totals>

const median = (v: number[]) => {
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** The date in UAE time, as a local Date at midnight (for week maths) */
const uaeDay = (iso: string) => {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date(iso))
  return new Date(`${ymd}T00:00:00`)
}

/** A tooltip shown while the mark is hovered or focused */
function Tip({ children, align = 'center' }: { children: ReactNode; align?: 'center' | 'left' }) {
  return (
    <span
      role="tooltip"
      className={cn(
        'pointer-events-none absolute bottom-full z-20 mb-1.5 hidden rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] leading-snug whitespace-nowrap text-background shadow-md group-hover:block group-focus-visible:block',
        align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0',
      )}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------- posting rhythm

const WEEKS = 12

export function RhythmCard({ posts }: { posts: Post[] }) {
  const thisWeek = startOfWeek(uaeDay(new Date().toISOString()), { weekStartsOn: 1 })
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({ start: addDays(thisWeek, (i - WEEKS + 1) * 7), count: 0 }))
  for (const p of posts) {
    const w = startOfWeek(uaeDay(p.published_at), { weekStartsOn: 1 }).getTime()
    const hit = weeks.find((x) => x.start.getTime() === w)
    if (hit) hit.count += 1
  }
  const full = weeks.slice(0, -1) // the current week isn't over yet
  const active = full.filter((w) => w.count > 0).length
  const typical = median(full.map((w) => w.count))
  const max = Math.max(1, ...weeks.map((w) => w.count))

  return (
    <Card>
      <CardHeader>
        <CardHeading icon={CalendarRange} title="Posting rhythm" sub="Posts per week, last 12 weeks (UAE time)" />
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          Posted in <b className="font-semibold tabular-nums">{active}</b> of {full.length} full weeks
          {typical != null && (
            <>
              {' '}
              · usually <b className="font-semibold tabular-nums">{typical}</b> a week
            </>
          )}
        </p>
        <div className="mt-4 flex h-28 items-end gap-[2px]" role="img" aria-label={`Posts per week: ${weeks.map((w) => `${format(w.start, 'd MMM')} ${w.count}`).join(', ')}`}>
          {weeks.map((w, i) => {
            const current = i === WEEKS - 1
            return (
              <div key={w.start.toISOString()} tabIndex={0} className="group relative flex h-full flex-1 items-end outline-none">
                {w.count > 0 ? (
                  <div className={cn('w-full rounded-t-[4px] bg-primary', current && 'opacity-50')} style={{ height: `${(w.count / max) * 100}%` }} />
                ) : (
                  <div className="h-[2px] w-full bg-border" />
                )}
                <Tip align={i < 2 ? 'left' : 'center'}>
                  Week of {format(w.start, 'd MMM')}
                  {current ? ' (so far)' : ''}: <b>{w.count}</b> {w.count === 1 ? 'post' : 'posts'}
                </Tip>
              </div>
            )
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>{format(weeks[0].start, 'd MMM')}</span>
          <span>This week</span>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- formats

export function FormatsCard({ posts, range, checkpoint }: { posts: Post[]; range: TimeRange; checkpoint: string }) {
  const by = new Map<string, number[]>()
  for (const p of posts) {
    if (!inRange(p.published_at, range) || p.format === 'untagged') continue
    // Same age for every post (the age most posts have), so newer posts aren't counted short
    const imp = p.snapshots.find((s) => s.checkpoint === checkpoint)?.impressions
    if (imp == null) continue
    by.set(p.format, [...(by.get(p.format) ?? []), imp])
  }
  // Like with like: a format needs at least 2 posts to show a typical figure
  const rows = [...by.entries()]
    .filter(([, v]) => v.length >= 2)
    .map(([f, v]) => ({ format: f, posts: v.length, median: median(v)! }))
    .sort((a, b) => b.median - a.median)
  const max = Math.max(1, ...rows.map((r) => r.median))
  const few = [...by.entries()].filter(([, v]) => v.length < 2).length

  return (
    <Card>
      <CardHeader>
        <CardHeading icon={Layers} title="Which formats get seen" sub={`Typical (median) impressions per post in this period, at ${checkpoint === '7d' ? '7 days' : checkpoint} old`} />
      </CardHeader>
      <CardContent>
        {rows.length < 2 ? (
          <p className="text-sm text-muted-foreground">Needs at least two formats with 2+ posts each (with figures at that age) in this period. Try a longer time range.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.format} tabIndex={0} className="group relative outline-none">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{FORMAT_LABELS[r.format as keyof typeof FORMAT_LABELS] ?? r.format}</span>
                  <span className="tabular-nums">
                    {fmtNumber(Math.round(r.median))} <span className="text-muted-foreground">· {r.posts} posts</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-[4px] bg-muted">
                  <div className="h-full rounded-[4px] bg-primary" style={{ width: `${Math.max(2, (r.median / max) * 100)}%` }} />
                </div>
                <Tip align="left">
                  {FORMAT_LABELS[r.format as keyof typeof FORMAT_LABELS] ?? r.format}: median {fmtNumber(Math.round(r.median))} impressions across {r.posts} posts
                </Tip>
              </li>
            ))}
          </ul>
        )}
        {rows.length >= 2 && few > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {few} {few === 1 ? 'format has' : 'formats have'} only one post in this period and {few === 1 ? 'is' : 'are'} left out.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- per 1,000 impressions

export function ResultsCard({ cur, prev, company }: { cur: Totals; prev: Totals | null; company: boolean }) {
  const per = (t: Totals | null, v: number | null | undefined) => (t && t.impressions && v != null ? (v / t.impressions) * 1000 : null)
  const rows = [
    { label: 'Clicks', now: per(cur, cur.clicks), before: per(prev, prev?.clicks) },
    ...(company ? [{ label: 'Page visitors', now: per(cur, cur.unique_visitors), before: per(prev, prev?.unique_visitors) }] : []),
    { label: 'New followers', now: per(cur, cur.new_followers), before: per(prev, prev?.new_followers) },
  ].filter((r) => r.now != null)
  const max = Math.max(1, ...rows.map((r) => Math.max(r.now ?? 0, r.before ?? 0)))
  const fmt = (v: number) => (v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1))

  return (
    <Card>
      <CardHeader>
        <CardHeading icon={Target} title="Per 1,000 impressions" sub="What attention turned into this period" />
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">No impressions recorded in this period.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.label} tabIndex={0} className="group relative outline-none">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{r.label}</span>
                  <span className="tabular-nums">
                    {fmt(r.now!)}
                    {r.before != null && <span className="text-muted-foreground"> · was {fmt(r.before)}</span>}
                  </span>
                </div>
                <div className="relative mt-1 h-2 rounded-[4px] bg-muted">
                  <div className="h-full rounded-[4px] bg-primary" style={{ width: `${Math.max(2, (r.now! / max) * 100)}%` }} />
                  {/* last period, as a tick on the same scale */}
                  {r.before != null && (
                    <div className="absolute -top-0.5 h-3 w-[2px] rounded bg-foreground/60" style={{ left: `calc(${Math.min(100, (r.before / max) * 100)}% - 1px)` }} />
                  )}
                </div>
                <Tip align="left">
                  {r.label}: {fmt(r.now!)} per 1,000 impressions
                  {r.before != null ? ` (last period ${fmt(r.before)})` : ''}
                </Tip>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Bar = this period, tick = last period. Visitors and followers can also come from outside your posts.
        </p>
      </CardContent>
    </Card>
  )
}
