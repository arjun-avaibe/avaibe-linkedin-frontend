import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarClock, ChevronLeft, ChevronRight, CircleAlert, Clock, Plus, X } from 'lucide-react'
import { PageHeader } from '@/components/common'
import { todayUae, ymd } from '@/components/period'
import { Button, buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { api, type CalendarData, type CalendarItem, type CalendarKind, type CalendarPlanned, type CalendarPost } from '@/lib/api'
import { FORMAT_LABELS, fmtNumber } from '@/lib/format'
import { PLANNED_FORMAT_LABELS } from '@/lib/publishing'
import { cn } from '@/lib/utils'
import { dayAdvice, proven, SLOT_START, UAE_WEEKEND } from '@/lib/timing-advice'

/* ------------------------------------------------------------------ layers */

type Layer = 'ours' | 'linked' | 'planned' | CalendarKind | 'hints'

const KIND_META: Record<CalendarKind, { label: string; color: string }> = {
  uae_holiday: { label: 'UAE holidays', color: 'var(--cal-uae)' },
  india_holiday: { label: 'India holidays', color: 'var(--cal-india)' },
  period: { label: 'Special periods', color: 'var(--cal-period)' },
  event: { label: 'Industry events', color: 'var(--cal-event)' },
  awareness: { label: 'Awareness days', color: 'var(--cal-aware)' },
  business: { label: 'Business dates', color: 'var(--cal-biz)' },
}
const KINDS = Object.keys(KIND_META) as CalendarKind[]
const ALL_LAYERS: Layer[] = ['ours', 'linked', 'planned', ...KINDS, 'hints']
const STORE = 'calendar.hidden'

function loadHidden(): Set<Layer> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE) ?? '[]') as Layer[])
  } catch {
    return new Set()
  }
}
function saveHidden(s: Set<Layer>) {
  try {
    localStorage.setItem(STORE, JSON.stringify([...s]))
  } catch {
    /* private window: just don't remember */
  }
}

/* ------------------------------------------------------------------ helpers */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const covers = (i: CalendarItem, day: string) => i.start <= day && day <= i.end
const postFormat = (f: string) => (FORMAT_LABELS as Record<string, string>)[f] ?? f
const plannedFormat = (f: string) => (PLANNED_FORMAT_LABELS as Record<string, string>)[f] ?? f

/* ------------------------------------------------------------------ page */

export function CalendarPage() {
  const { account } = useAccount()
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const today = todayUae()
  const monthParam = params.get('month') // yyyy-MM
  const month = startOfMonth(monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? parseISO(`${monthParam}-01`) : parseISO(today))
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const from = ymd(gridStart)
  const to = ymd(gridEnd)
  const [hidden, setHidden] = useState<Set<Layer>>(loadHidden)
  const [selected, setSelected] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['calendar', account?.id, from, to],
    queryFn: () => api.calendar({ account_id: account!.id, from, to }),
    enabled: !!account,
  })

  const setMonth = (m: Date) => {
    setSelected(null)
    setParams((p) => { p.set('month', format(m, 'yyyy-MM')); return p }, { replace: true })
  }
  const toggle = (l: Layer) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(l)) next.delete(l)
      else next.add(l)
      saveHidden(next)
      return next
    })

  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }).map(ymd), [from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => {
    if (!data || !account) return null
    const show = (l: Layer) => !hidden.has(l)
    const posts = data.posts.filter((p) => (p.account_id === account.id ? show('ours') : show('linked')))
    const planned = show('planned') ? data.planned : []
    const items = data.items.filter((i) => show(i.kind))
    return { posts, planned, items }
  }, [data, account, hidden])

  if (!account) return null

  // Month summary for the selected account's own posts
  const inMonth = (d: string) => d.slice(0, 7) === format(month, 'yyyy-MM')
  const own = (data?.posts ?? []).filter((p) => p.account_id === account.id && inMonth(p.date))
  const perDay = new Map<string, number>()
  own.forEach((p) => perDay.set(p.date, (perDay.get(p.date) ?? 0) + 1))
  const workingPast = days.filter((d) => {
    if (!inMonth(d) || d >= today) return false
    const wd = parseISO(d).getDay()
    return !UAE_WEEKEND.has(wd) && !(data?.items ?? []).some((i) => i.kind === 'uae_holiday' && covers(i, d))
  })
  const gaps = workingPast.filter((d) => !perDay.has(d)).length
  const busy = [...perDay.values()].filter((n) => n >= 2).length
  const upcoming = (data?.planned ?? []).filter((p) => inMonth(p.date)).length

  const linked = (data?.accounts ?? []).filter((a) => a.id !== account.id)

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Content"
        title="Calendar"
        description="Your posts, planned posts, holidays and events in one view. Click a day to see what to keep in mind and to plan a post for it."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(parseISO(today))}>
              Today
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="text-lg font-semibold">{format(month, 'MMMM yyyy')}</h2>
        {data && (
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground tabular-nums">{own.length}</b> {own.length === 1 ? 'post' : 'posts'} by {account.name}
            {workingPast.length > 0 && (
              <>
                {' · '}
                <b className={cn('tabular-nums', gaps > 0 ? 'text-warn-fg' : 'text-foreground')}>{gaps}</b> working {gaps === 1 ? 'day' : 'days'} without a post
              </>
            )}
            {busy > 0 && (
              <>
                {' · '}
                <b className="tabular-nums text-foreground">{busy}</b> {busy === 1 ? 'day' : 'days'} with 2+ posts
              </>
            )}
            {' · '}
            <b className="tabular-nums text-foreground">{upcoming}</b> planned
          </p>
        )}
      </div>

      <Legend hidden={hidden} toggle={toggle} linkedNames={linked.map((a) => a.name)} />

      {data && !hidden.has('hints') && <TimingNote data={data} />}

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-x-auto">
          <div className="min-w-[700px] overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={cn('px-2 py-2', i >= 5 && 'text-muted-foreground/70')}>
                  {w}
                  {i >= 5 && <span className="sr-only"> (UAE weekend)</span>}
                </div>
              ))}
            </div>
            {isLoading || !view || !data ? (
              <Skeleton className="m-3 h-[540px]" />
            ) : (
              <div className="grid grid-cols-7">
                {days.map((d, idx) => (
                  <DayCell
                    key={d}
                    day={d}
                    idx={idx}
                    inMonth={isSameMonth(parseISO(d), month)}
                    isToday={d === today}
                    isPast={d < today}
                    selected={selected === d}
                    onSelect={() => setSelected(selected === d ? null : d)}
                    posts={view.posts.filter((p) => p.date === d)}
                    planned={view.planned.filter((p) => p.date === d)}
                    items={view.items.filter((i) => covers(i, d))}
                    accountId={account.id}
                    hint={!hidden.has('hints') && data.timing.ready && proven(data, data.timing.days[d]) ? data.timing.days[d].best_slot : undefined}
                    allItems={data.items.filter((i) => covers(i, d))}
                  />
                ))}
              </div>
            )}
          </div>
          {isError && <p className="mt-2 text-sm text-bad-fg">The calendar couldn’t load. Try again in a moment.</p>}
          {data && (
            <p className="mt-2 text-xs text-muted-foreground">
              Times are UAE time. Islamic holiday dates follow the moon sighting: future ones are marked <i>expected</i> until the UAE confirms
              them. Holiday and event dates cover {data.dates_cover[0]}–{data.dates_cover[1]}.
            </p>
          )}
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          {selected && data ? (
            <DayPanel
              day={selected}
              data={data}
              accountId={account.id}
              isPast={selected < today}
              canPlan={auth.can('editor') && selected >= today}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
              <CalendarClock className="mb-2 size-5" />
              Click a day to see its holidays and events, how that weekday usually does, and to plan a post for it.
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ legend (doubles as layer toggles) */

function Legend({ hidden, toggle, linkedNames }: { hidden: Set<Layer>; toggle: (l: Layer) => void; linkedNames: string[] }) {
  const chip = (l: Layer, label: string, swatch: React.ReactNode, title?: string) => {
    const on = !hidden.has(l)
    return (
      <button
        key={l}
        type="button"
        title={title}
        aria-pressed={on}
        onClick={() => toggle(l)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
          on ? 'bg-card text-foreground' : 'bg-transparent text-muted-foreground line-through decoration-muted-foreground/60',
        )}
      >
        <span className={cn(!on && 'opacity-40')}>{swatch}</span>
        {label}
      </button>
    )
  }
  const dot = (color: string) => <span className="block size-2 rounded-full" style={{ backgroundColor: color }} />
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Show or hide on the calendar">
      {chip('ours', 'Our posts', <span className="block size-2 rounded-sm bg-primary" />)}
      {linkedNames.length > 0 &&
        chip('linked', 'Linked profiles', <span className="block size-2 rounded-sm border border-primary" />, linkedNames.join(', '))}
      {chip('planned', 'Planned', <span className="block size-2 rounded-sm border border-dashed border-foreground/60" />)}
      {KINDS.map((k) => chip(k, KIND_META[k].label, dot(KIND_META[k].color)))}
      {chip('hints', 'Best-time hints', <Clock className="size-3" />)}
      {ALL_LAYERS.some((l) => hidden.has(l)) && (
        <span className="text-xs text-muted-foreground">Click a label to show or hide it</span>
      )}
    </div>
  )
}

/** One line above the grid: whether the best-time hints can be trusted yet */
function TimingNote({ data }: { data: CalendarData }) {
  const t = data.timing
  const text = !t.ready
    ? `Best-time hints: ${t.reason}`
    : t.backtest.verdict === 'helps'
      ? `Best-time hints are shown on days where your data shows a clear best slot. ${t.backtest.text}`
      : `No proven best time yet, so no hints are shown on the days. ${t.backtest.text ?? t.backtest.reason ?? ''}`
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
      <Clock className="mt-px size-3.5 shrink-0" /> <span>{text}</span>
    </p>
  )
}

/* ------------------------------------------------------------------ day cell */

function DayCell({
  day,
  idx,
  inMonth,
  isToday,
  isPast,
  selected,
  onSelect,
  posts,
  planned,
  items,
  accountId,
  hint,
  allItems,
}: {
  day: string
  idx: number
  inMonth: boolean
  isToday: boolean
  isPast: boolean
  selected: boolean
  onSelect: () => void
  posts: CalendarPost[]
  planned: CalendarPlanned[]
  items: CalendarItem[]
  accountId: number
  hint?: string // the proven best slot for this date, if any
  allItems: CalendarItem[]
}) {
  const d = parseISO(day)
  const weekend = UAE_WEEKEND.has(d.getDay())
  const uaeHoliday = allItems.some((i) => i.kind === 'uae_holiday')
  // Periods show as a thin coloured band; single-day items as chips
  const periods = items.filter((i) => i.start !== i.end && i.kind !== 'uae_holiday')
  const chips = items.filter((i) => !periods.includes(i))
  const own = posts.filter((p) => p.account_id === accountId)
  const entries: React.ReactNode[] = [
    ...chips.map((i) => (
      <div key={`i-${i.title}-${i.start}`} className="flex items-center gap-1 truncate text-[11px] leading-4" title={i.title}>
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: KIND_META[i.kind].color }} />
        <span className="truncate">
          {i.title}
          {i.status === 'expected' && <span className="text-muted-foreground"> (exp.)</span>}
        </span>
      </div>
    )),
    ...posts.map((p) => {
      const mine = p.account_id === accountId
      return (
        <div
          key={`p-${p.id}`}
          title={`${p.account_name}: ${p.title}`}
          className={cn(
            'flex items-center gap-1 truncate rounded px-1 text-[11px] leading-4',
            mine ? 'bg-primary/10 text-foreground' : 'border border-primary/40 text-muted-foreground',
          )}
        >
          <span className="shrink-0 tabular-nums">{p.time ?? '·'}</span>
          <span className="truncate">{mine ? postFormat(p.format) : p.account_name.split(' ')[0]}</span>
        </div>
      )
    }),
    ...planned.map((p) => (
      <div
        key={`pl-${p.id}`}
        title={`Planned (${p.status}): ${p.title}`}
        className="flex items-center gap-1 truncate rounded border border-dashed border-foreground/40 px-1 text-[11px] leading-4"
      >
        <span className="shrink-0 tabular-nums">{p.time}</span>
        <span className="truncate">{plannedFormat(p.format)}</span>
      </div>
    )),
  ]
  const MAX = 3
  const showHint = hint && !isPast && !weekend && !uaeHoliday && inMonth
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${format(d, 'EEEE d MMMM')}: ${own.length} posts, ${planned.length} planned${allItems.length ? `, ${allItems.map((i) => i.title).join(', ')}` : ''}`}
      className={cn(
        'relative flex min-h-[104px] flex-col gap-0.5 border-b border-r p-1.5 pt-2 text-left align-top outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        (idx + 1) % 7 === 0 && 'border-r-0',
        !inMonth && 'bg-muted/30 text-muted-foreground',
        inMonth && (weekend || uaeHoliday) && 'bg-muted/40',
        selected && 'bg-accent/60 ring-2 ring-primary ring-inset',
      )}
    >
      {periods.length > 0 && (
        <div className="absolute inset-x-1 top-1 flex h-[3px] gap-px overflow-hidden rounded-full">
          {periods.map((p) => (
            <span key={p.title + p.start} className="flex-1 opacity-70" style={{ backgroundColor: KIND_META[p.kind].color }} title={p.title} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
            isToday && 'bg-primary font-semibold text-primary-foreground',
            !isToday && inMonth && 'font-medium',
          )}
        >
          {d.getDate()}
        </span>
        {own.length >= 2 && <span className="rounded-full bg-warn/15 px-1.5 text-[10px] text-warn-fg">{own.length} posts</span>}
      </div>
      {periods.length > 0 && inMonth && (periods.some((p) => p.start === day) || d.getDay() === 1) && (
        <div className="truncate text-[10px] leading-3 font-medium" style={{ color: KIND_META[periods[0].kind].color }}>
          {periods.map((p) => p.title).join(' · ')}
        </div>
      )}
      {entries.slice(0, MAX)}
      {entries.length > MAX && <div className="text-[11px] text-muted-foreground">+{entries.length - MAX} more</div>}
      {showHint && (
        <div className="mt-auto flex items-center gap-1 text-[10px] text-muted-foreground" title="Best time for this date, from your past posts">
          <Clock className="size-3" /> {hint}
        </div>
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ day panel */

function DayPanel({
  day,
  data,
  accountId,
  isPast,
  canPlan,
  onClose,
}: {
  day: string
  data: CalendarData
  accountId: number
  isPast: boolean
  canPlan: boolean
  onClose: () => void
}) {
  const items = data.items.filter((i) => covers(i, day))
  const posts = data.posts.filter((p) => p.date === day)
  const planned = data.planned.filter((p) => p.date === day)
  const advice = dayAdvice(day, items, data, isPast)
  const adv = data.timing.ready ? data.timing.days[day] : undefined
  const isProven = !!adv && proven(data, adv)
  // A proven best slot if there is one; otherwise the slot that's slightly ahead so far
  const start = (adv && SLOT_START[adv.best_slot]) || '10:00'
  const newAt = new Date(`${day}T${start}:00+04:00`).toISOString()

  return (
    <div className="rounded-2xl border bg-card p-5 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{format(parseISO(day), 'EEEE')}</div>
          <div className="text-base font-semibold">{format(parseISO(day), 'd MMMM yyyy')}</div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((i) => (
            <li key={i.title + i.start} className="flex gap-2">
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: KIND_META[i.kind].color }} />
              <div>
                <div className="font-medium">
                  {i.title}
                  {i.status === 'expected' && (
                    <span className="ml-1.5 rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-normal text-warn-fg">expected</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {KIND_META[i.kind].label.replace(/s$/, '')}
                  {i.start !== i.end && ` · ${format(parseISO(i.start), 'd MMM')} – ${format(parseISO(i.end), 'd MMM')}`}
                  {i.note && ` · ${i.note}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {advice.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="text-xs font-medium text-muted-foreground">{isPast ? 'About this day' : 'If you post this day'}</div>
          {advice.map((a, n) => (
            <p key={n} className="flex gap-2 text-[13px] leading-snug">
              {a.tone === 'good' ? (
                <Clock className="mt-0.5 size-3.5 shrink-0 text-primary" />
              ) : (
                <CircleAlert className={cn('mt-0.5 size-3.5 shrink-0', a.tone === 'quiet' ? 'text-warn-fg' : 'text-muted-foreground')} />
              )}
              <span>{a.text}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2 border-t pt-3">
        <div className="text-xs font-medium text-muted-foreground">Posts</div>
        {posts.length === 0 && planned.length === 0 && <p className="text-muted-foreground">Nothing posted or planned.</p>}
        {posts.map((p) => {
          return (
            <Link key={p.id} to={`/posts/${p.id}`} className="block rounded-lg border px-2.5 py-2 hover:bg-accent/40">
              <div className="text-xs text-muted-foreground">
                {p.account_id === accountId ? 'Our post' : p.account_name} · {postFormat(p.format)}
                {p.time && ` · ${p.time}`}
              </div>
              <div className="mt-0.5 line-clamp-2 text-[13px]">{p.title}</div>
              {p.impressions != null && (
                <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {fmtNumber(p.impressions)} impressions{p.checkpoint ? ` at ${p.checkpoint}` : ''}
                </div>
              )}
            </Link>
          )
        })}
        {planned.map((p) => (
          <Link key={`pl-${p.id}`} to="/publishing" className="block rounded-lg border border-dashed px-2.5 py-2 hover:bg-accent/40">
            <div className="text-xs text-muted-foreground">
              Planned · {plannedFormat(p.format)} · {p.time} · {p.status}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[13px]">{p.title}</div>
          </Link>
        ))}
      </div>

      {canPlan && (
        <Link to={`/create?new_at=${encodeURIComponent(newAt)}`} className={cn(buttonVariants({ size: 'sm' }), 'mt-4 w-full')}>
          <Plus /> Plan a post for this day
        </Link>
      )}
      {canPlan && (
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
          Starts a draft at {start} UAE{adv ? (isProven ? ', the best time for this date' : ', slightly ahead so far (not proven)') : ''}. You can
          change it.
        </p>
      )}
      {!isPast && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Time advice comes from this account’s past posts, after allowing for format, topic and page growth, and counts holidays and Ramadan.{' '}
          The same advice appears when you create or edit a post in Publishing.
        </p>
      )}
    </div>
  )
}
