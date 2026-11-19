import { useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Star } from 'lucide-react'
import { useTz } from '@/context/timezone'
import type { HeatCell, Heatmap as HeatmapData } from '@/lib/api'
import { fmtMetric, metricLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

// Sequential single-hue ramp (light -> dark), defined in index.css
const RAMP = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)', 'var(--seq-6)', 'var(--seq-7)']

function step(value: number, min: number, max: number): number {
  if (max <= min) return RAMP.length - 1
  const t = (value - min) / (max - min)
  return Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))))
}

const SHORT_DAY: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
}

interface Hover {
  cell: HeatCell
  x: number // cell centre, relative to the heatmap box
  top: number // cell top edge
  bottom: number // cell bottom edge
}

export function Heatmap({ data }: { data: HeatmapData }) {
  const tz = useTz()
  const box = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const values = data.cells.map((c) => c.median).filter((v): v is number => v !== null)
  const min = values.length ? Math.min(...values) : 0
  const max = values.length ? Math.max(...values) : 0
  const lookup = new Map(data.cells.map((c) => [`${c.day}|${c.slot}`, c]))

  const show = (cell: HeatCell) => (e: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>) => {
    const b = box.current?.getBoundingClientRect()
    const r = e.currentTarget.getBoundingClientRect()
    if (!b) return
    setHover({ cell, x: r.left - b.left + r.width / 2, top: r.top - b.top, bottom: r.bottom - b.top })
  }
  const hide = () => setHover(null)

  return (
    <div className="space-y-3">
      <div ref={box} className="relative">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0.5 text-xs" onMouseLeave={hide}>
            <thead>
              <tr>
                <th className="w-12" />
                {data.slots.map((s) => {
                  const other = tz.slotInZone(s)
                  return (
                    <th key={s} scope="col" className="px-1 pb-1 text-center align-bottom font-normal text-muted-foreground">
                      {s}
                      {other && <span className="block text-[10px] opacity-75">{other}</span>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {data.days.map((day) => (
                <tr key={day}>
                  <th scope="row" className="pr-2 text-left font-normal text-muted-foreground">
                    {SHORT_DAY[day] ?? day}
                  </th>
                  {data.slots.map((slot) => {
                    const c = lookup.get(`${day}|${slot}`)!
                    // The raw heatmap no longer crowns a slot: the time model (Best time to post) gives the advice
                    const isBest = false
                    const active = hover?.cell === c
                    const events = { onMouseEnter: show(c), onFocus: show(c), onBlur: hide, tabIndex: 0 }
                    if (c.median === null) {
                      return (
                        <td
                          key={slot}
                          {...events}
                          aria-label={`${day}, ${slot}: no posts`}
                          className={cn('h-10 rounded-sm bg-muted/50 text-center text-muted-foreground/60 outline-none', active && 'ring-2 ring-ring')}
                        >
                          ·
                        </td>
                      )
                    }
                    const s = step(c.median, min, max)
                    // Low-confidence cells (< min posts) are faded with a dashed edge so anecdotes recede
                    // and only well-supported slots draw the eye.
                    return (
                      <td
                        key={slot}
                        {...events}
                        aria-label={`${day}, ${slot} UAE: median ${fmtMetric(data.metric, c.median)} over ${c.posts} posts`}
                        className={cn(
                          'relative h-10 cursor-default rounded-sm text-center tabular-nums outline-none transition-[filter]',
                          c.low_confidence && 'text-foreground outline-1 -outline-offset-1 outline-dashed outline-(--seq-faint-outline)',
                          isBest && 'ring-2 ring-foreground ring-offset-1 ring-offset-background',
                          active && !isBest && 'ring-2 ring-ring',
                          active && 'brightness-95',
                        )}
                        style={{
                          backgroundColor: c.low_confidence ? `color-mix(in srgb, ${RAMP[s]} 30%, transparent)` : RAMP[s],
                          // Ink per ramp step: dark text on light steps, light text on dark steps (flips with the theme)
                          color: c.low_confidence ? undefined : `var(--seq-ink-${s + 1})`,
                        }}
                      >
                        <span className={cn('font-medium', c.low_confidence && 'font-normal')}>{fmtMetric(data.metric, c.median)}</span>
                        <span className="block text-[10px] opacity-80">n={c.posts}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hover && <HoverCard hover={hover} data={data} width={box.current?.clientWidth ?? 0} />}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          Lower
          <span className="flex h-2.5 w-28 overflow-hidden rounded-sm">
            {RAMP.map((c) => (
              <span key={c} className="flex-1" style={{ backgroundColor: c }} />
            ))}
          </span>
          Higher median {metricLabel(data.metric).toLowerCase()}
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block size-3 rounded-sm outline-1 -outline-offset-1 outline-dashed outline-(--seq-faint-outline)"
            style={{ backgroundColor: `color-mix(in srgb, ${RAMP[3]} 30%, transparent)` }}
          />
          Fewer than {data.min_posts_per_slot} posts: low confidence
        </span>
      </div>
    </div>
  )
}

const CARD_W = 248

/** The hover card: what this slot is, how it compares with the typical post, and how much to trust it */
function HoverCard({ hover, data, width }: { hover: Hover; data: HeatmapData; width: number }) {
  const tz = useTz()
  const c = hover.cell
  const other = tz.slotInZone(c.slot)
  const isBest = false // see the note in Heatmap
  const typical = data.overall_median ?? null
  const ratio = c.median != null && typical ? c.median / typical : null
  // Above the cell, or below it when there's no room above; kept inside the heatmap horizontally
  const below = hover.top < 170
  const left = Math.min(Math.max(hover.x - CARD_W / 2, 0), Math.max(0, width - CARD_W))

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 rounded-xl bg-popover p-3 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      style={{ width: CARD_W, left, top: below ? hover.bottom + 8 : undefined, bottom: below ? undefined : `calc(100% - ${hover.top}px + 8px)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            {c.day} · {c.slot}
          </div>
          <div className="text-muted-foreground">UAE time{other ? ` · ${other}` : ''}</div>
        </div>
        {isBest && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
            <Star className="size-3" /> Suggested
          </span>
        )}
      </div>

      {c.median == null ? (
        <p className="mt-2 text-muted-foreground">No posts in this slot yet. Posting here once would start to show how it does.</p>
      ) : (
        <>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{fmtMetric(data.metric, c.median)}</span>
            <span className="text-muted-foreground">median {metricLabel(data.metric).toLowerCase()}</span>
          </div>
          {ratio != null && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-medium tabular-nums',
                  ratio >= 1.15 ? 'bg-good/10 text-good-fg' : ratio <= 0.85 ? 'bg-bad/10 text-bad-fg' : 'bg-muted text-muted-foreground',
                )}
              >
                {ratio >= 1.15 ? '▲' : ratio <= 0.85 ? '▼' : '≈'} {ratio.toFixed(1)}×
              </span>
              <span className="text-muted-foreground">your typical post ({fmtMetric(data.metric, typical)})</span>
            </div>
          )}
          <div className="mt-2.5 flex items-start gap-1.5 border-t pt-2.5">
            {c.low_confidence ? (
              <>
                <CircleAlert className="mt-px size-3.5 shrink-0 text-warn-fg" />
                <span>
                  <b>
                    Only {c.posts} post{c.posts === 1 ? '' : 's'}
                  </b>{' '}
                  · too few to rely on (needs {data.min_posts_per_slot})
                </span>
              </>
            ) : (
              <>
                <CircleCheck className="mt-px size-3.5 shrink-0 text-good-fg" />
                <span>
                  <b>{c.posts} posts</b> · enough to compare
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
