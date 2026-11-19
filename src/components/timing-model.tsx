import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ChevronDown, CircleAlert, CircleCheck, FlaskConical, Info } from 'lucide-react'
import { Section, SimpleSelect } from '@/components/common'
import { Skeleton } from '@/components/ui/skeleton'
import { useTz } from '@/context/timezone'
import { api, type DateAdvice, type EffectVerdict, type TimingEffect, type TimingModel } from '@/lib/api'
import { FORMAT_LABELS } from '@/lib/format'
import { cn } from '@/lib/utils'

const METRICS = [
  { value: 'impressions', label: 'Impressions' },
  { value: 'engagements', label: 'Engagements' },
  { value: 'clicks', label: 'Clicks' },
]

const VERDICT: Record<EffectVerdict, { label: string; cls: string }> = {
  better: { label: 'Clearly better', cls: 'bg-good/10 text-good-fg' },
  worse: { label: 'Clearly worse', cls: 'bg-bad/10 text-bad-fg' },
  no_clear_difference: { label: 'No clear difference', cls: 'bg-muted text-muted-foreground' },
  too_few: { label: 'Too few posts', cls: 'bg-warn/10 text-warn-fg' },
  untested: { label: 'Not tried', cls: 'bg-muted text-muted-foreground' },
}

const pct = (lift: number) => (Math.abs(lift - 1) < 0.005 ? '±0%' : `${lift > 1 ? '+' : '−'}${Math.round(Math.abs(lift - 1) * 100)}%`)

/** Posting-time model v2: the advice, the evidence behind it, and how the method checked itself. */
export function TimingModelSection({ accountId }: { accountId?: number }) {
  const [metric, setMetric] = useState('impressions')
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', accountId, 'timing-model', metric],
    queryFn: () => api.timing({ account_id: accountId!, metric }),
    enabled: !!accountId,
  })

  return (
    <Section
      title="Best time to post"
      description="Judges each post against what it was expected to get for its format, topic and the page’s size at the time, so only the effect of timing is left. Holidays, Ramadan and summer are measured separately, and the method tests itself on newer posts."
      actions={<SimpleSelect label="Judge by" value={metric} onChange={setMetric} options={METRICS} />}
    >
      {isLoading || !data ? <Skeleton className="h-72" /> : <Body data={data} />}
    </Section>
  )
}

function Body({ data }: { data: TimingModel }) {
  if (!data.ready) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info-fg" />
        <span>{data.reason}</span>
      </p>
    )
  }
  const bt = data.backtest!
  const helps = bt.verdict === 'helps'
  return (
    <div className="space-y-6">
      {/* The answer first */}
      <div className={cn('rounded-xl border px-4 py-3', helps ? 'border-good/40 bg-good/5' : 'bg-muted/40')}>
        <div className="flex items-start gap-2.5">
          {helps ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-good-fg" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
          <div>
            <div className="font-semibold">{helps ? 'Timing makes a measurable difference for this account' : 'No proven best time yet'}</div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {bt.ran ? bt.text : bt.reason}{' '}
              {!helps && 'Post at any normal working time and put the effort into what you post. Keep trying the suggested test slots so a real pattern can show up.'}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Based on {data.posts_used} posts with a known time, compared at {data.checkpoint}.
              {data.posts_without_time > 0 && ` ${data.posts_without_time} posts with only a date (from a LinkedIn export) are left out.`}
            </p>
          </div>
        </div>
      </div>

      <Spread data={data} />

      <div className="grid gap-6 lg:grid-cols-2">
        <EffectList title="Day of the week" note="vs the average day" rows={data.days!.filter((r) => r.posts > 0 || !['Saturday', 'Sunday'].includes(r.key))} />
        <EffectList title="Time of day (UAE)" note="vs the average slot" rows={data.slots!.filter((r) => r.posts > 0 || r.key !== 'Outside 8 AM-8 PM')} zone />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <EffectList title="Special days and periods" note="vs a normal day" rows={data.special!} labels />
        {data.ramadan_slots!.length > 0 && (
          <EffectList title="Time of day during Ramadan" note="vs the average slot" rows={data.ramadan_slots!} zone />
        )}
      </div>

      <Upcoming rows={data.upcoming!} proven={helps} />
      <Method prior={data.prior} />
    </div>
  )
}

/** What moves results most: best vs worst well-supported group, per factor */
function Spread({ data }: { data: TimingModel }) {
  const s = data.spread!
  const rows = [
    { label: 'Topic', v: s.topic, hint: data.topics?.[0] ? `strongest: ${data.topics[0].key}` : '' },
    { label: 'Format', v: s.format, hint: data.formats?.[0] ? `strongest: ${FORMAT_LABELS[data.formats[0].key as keyof typeof FORMAT_LABELS] ?? data.formats[0].key}` : '' },
    { label: 'Day of week', v: s.day, hint: '' },
    { label: 'Time of day', v: s.slot, hint: '' },
  ].filter((r) => r.v != null) as { label: string; v: number; hint: string }[]
  if (!rows.length) return null
  const max = Math.max(...rows.map((r) => Math.log(r.v)), Math.log(1.5))
  return (
    <div>
      <div className="mb-2 text-sm font-medium">What moves your {data.metric_label.toLowerCase()} most</div>
      <p className="mb-3 text-xs text-muted-foreground">Gap between the best and the worst group with at least 12 posts. A longer bar means that choice matters more.</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
            <span>{r.label}</span>
            <span className="h-2.5 rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (Math.log(r.v) / max) * 100)}%` }} />
            </span>
            <span className="w-44 text-xs text-muted-foreground tabular-nums">
              <b className="text-foreground">{r.v.toFixed(1)}×</b> {r.hint && `· ${r.hint}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** One row per group: change vs average with its likely range, on a shared scale around "no change" */
function EffectList({ title, note, rows, zone, labels }: { title: string; note: string; rows: TimingEffect[]; zone?: boolean; labels?: boolean }) {
  const tz = useTz()
  const LO = Math.log(0.6)
  const HI = Math.log(1.6)
  const x = (v: number) => `${((Math.min(HI, Math.max(LO, Math.log(v))) - LO) / (HI - LO)) * 100}%`
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
      <div className="divide-y rounded-lg border">
        {rows.map((r) => {
          const v = VERDICT[r.verdict]
          const shown = r.verdict !== 'untested'
          return (
            <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(90px,160px)_96px] items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate">{labels ? r.label : r.key}</div>
                <div className="text-xs text-muted-foreground">
                  {r.posts} post{r.posts === 1 ? '' : 's'}
                  {zone && tz.slotInZone(r.key) ? ` · ${tz.slotInZone(r.key)}` : ''}
                </div>
              </div>
              {/* Likely range (bar) and best estimate (dot); the line marks "no change" */}
              <div
                className="relative h-4"
                role="img"
                aria-label={shown ? `${pct(r.lift)}, likely between ${pct(r.low)} and ${pct(r.high)}` : 'not tried'}
                title={shown ? `${pct(r.lift)} (likely ${pct(r.low)} to ${pct(r.high)})` : 'Not tried yet'}
              >
                <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                <span className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: x(1) }} />
                {shown && (
                  <>
                    <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/30" style={{ left: x(r.low), right: `calc(100% - ${x(r.high)})` }} />
                    <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card" style={{ left: x(r.lift) }} />
                  </>
                )}
              </div>
              <div className="text-right">
                <div className="font-medium tabular-nums">{shown ? pct(r.lift) : '–'}</div>
                <span className={cn('inline-block rounded-full px-1.5 py-px text-[10px] whitespace-nowrap', v.cls)}>{v.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Upcoming({ rows, proven }: { rows: DateAdvice[]; proven: boolean }) {
  const LABEL: Record<string, string> = { uae_holiday: 'UAE holiday', ramadan: 'Ramadan', india_holiday: 'India holiday', summer: 'UAE summer' }
  const working = rows.filter((r) => !r.weekend).slice(0, 10)
  return (
    <div>
      <div className="mb-2 text-sm font-medium">The next two weeks</div>
      <div className="divide-y rounded-lg border">
        {working.map((r) => {
          const isProven = proven && r.clear
          const holiday = r.labels.includes('uae_holiday')
          return (
            <div key={r.date} className="grid gap-x-4 gap-y-1 px-3 py-2 text-sm sm:grid-cols-[150px_1fr_auto]">
              <div>
                <span className="font-medium">{format(parseISO(r.date), 'EEE d MMM')}</span>
                {r.labels.map((l) => (
                  <span key={l} className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                    {LABEL[l] ?? l}
                  </span>
                ))}
              </div>
              <div className="text-muted-foreground">
                {holiday ? (
                  'UAE public holiday: skip business posts, or share a short greeting.'
                ) : isProven ? (
                  <>
                    <b className="text-foreground">{r.best_slot}</b> UAE ({pct(r.best_lift)} vs an average slot)
                  </>
                ) : (
                  <>Any working time. Slightly ahead so far: {r.best_slot} (not proven)</>
                )}
              </div>
              {r.test_slot && !holiday && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground" title="Not tried enough on this weekday yet">
                  <FlaskConical className="size-3.5" /> Test {r.test_slot}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Method({ prior }: { prior: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium" aria-expanded={open}>
        How this works
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ol className="list-decimal space-y-1.5 border-t px-3 py-3 pl-8 text-sm text-muted-foreground">
          <li>Each post is compared at the same age (24 hours when there is enough data), because timing shows up early.</li>
          <li>
            For each post we work out what it was <i>expected</i> to get without timing: the page’s usual level at the time (from normal days
            within 45 days, which removes growth and season), plus its format and topic.
          </li>
          <li>Every date is labelled: weekday, UAE holiday, Ramadan, India holiday, UAE summer (from the Calendar’s list).</li>
          <li>
            Day, time and special-day effects are estimated together, so a slot isn’t credited for its weekday. Each effect is pulled towards
            “no effect” as if {prior} extra posts showed no difference, so a slot with a handful of lucky posts can’t win.
          </li>
          <li>Something is only called clearly better or worse when the evidence is strong (about 98%), because many effects are checked at once.</li>
          <li>
            The method tests itself: three times, it learns from older posts and predicts newer ones, with and without timing. A best time is only
            shown when timing improves those predictions.
          </li>
          <li>Slots that haven’t been tried enough are suggested as occasional tests, so the advice gets better over time.</li>
          <li>
            Limits: LinkedIn doesn’t say when followers are online or which countries saw each post, so “best time for UAE decision-makers”
            can only be estimated.
          </li>
        </ol>
      )}
    </div>
  )
}
