/**
 * Calendar → a day → "Content ideas": 2–3 post ideas for that day, no AI needed.
 * From (1) holidays, events and periods on or just after the day, (2) the format that has done best for this
 * account lately, (3) AVAIBE's content themes, rotating by date. Each idea opens Create post pre-filled.
 */
import { Link } from 'react-router-dom'
import { differenceInCalendarDays, getDayOfYear, parseISO } from 'date-fns'
import { ArrowRight, Lightbulb } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import type { CalendarItem, CalendarPost, PlannedFormat } from '@/lib/api'
import { PLANNED_FORMAT_LABELS } from '@/lib/publishing'
import { cn } from '@/lib/utils'

type Idea = { title: string; why: string; format: PlannedFormat; topic: string }

/** AVAIBE's content themes (the assignment's list); one is suggested per day, rotating */
const THEMES: Idea[] = [
  { topic: 'LMS', format: 'carousel', title: 'One LMS problem UAE schools know well, and the fix', why: 'Education technology theme' },
  { topic: 'ERP', format: 'text', title: 'The ERP or CRM headache UAE SMEs complain about most', why: 'ERP and CRM theme' },
  { topic: 'AI in business', format: 'image', title: 'A small, practical AI use any UAE business can start this month', why: 'AI in business theme' },
  { topic: 'Cybersecurity', format: 'carousel', title: 'Five security habits every UAE SME should have', why: 'Cybersecurity for SMEs theme' },
  { topic: 'Cloud', format: 'text', title: 'What moving to the cloud actually changes for a growing company', why: 'Cloud and DevOps theme' },
  { topic: 'Software delivery', format: 'article', title: 'Why software projects slip, and how to keep yours on time', why: 'Software development theme' },
  { topic: 'AVAIBE projects', format: 'image', title: 'Behind a recent AVAIBE project: the problem and what changed', why: 'Your own work (check the client agrees first)' },
]

/** An idea for a holiday, event or period, by kind and timing */
function eventIdea(item: CalendarItem, daysAway: number): Idea | null {
  const soon = daysAway > 0 ? ` (in ${daysAway} day${daysAway === 1 ? '' : 's'})` : ''
  const t = item.title
  switch (item.kind) {
    case 'uae_holiday':
      // Solemn days are for remembrance, not greetings
      if (/commemoration|martyr/i.test(t))
        return { topic: t, format: 'image', title: `${t}: a respectful message of remembrance`, why: `Solemn UAE day${soon}. Quiet and respectful; no promotion, no call to action.` }
      return { topic: t, format: 'image', title: `${t} greeting from the team`, why: `UAE holiday${soon}. Keep it warm and short, no sales pitch.` }
    case 'event':
      return daysAway > 0
        ? { topic: t, format: 'text', title: `Heading to ${t}? What we're looking forward to`, why: `Industry event${soon}: a teaser invites people to meet you there.` }
        : { topic: t, format: 'carousel', title: `Key takeaways from ${t}`, why: 'Industry event today: share what stood out while people are talking about it.' }
    case 'awareness':
      return { topic: t, format: 'carousel', title: `${t}: a practical tip for UAE teams`, why: `Awareness day${soon}. Tie it to something AVAIBE actually helps with.` }
    case 'period':
      return /school/i.test(t)
        ? { topic: 'LMS', format: 'carousel', title: `Using the ${t.toLowerCase()} to get school systems ready`, why: `${t}: school leaders plan ahead in breaks.` }
        : /ramadan/i.test(t)
          ? { topic: t, format: 'image', title: 'Ramadan Kareem from the team, with a note on reduced hours', why: 'Ramadan: a respectful tone; business posts do better after iftar time.' }
          : { topic: t, format: 'text', title: `What ${t.toLowerCase()} means for your business systems`, why: `${t}: relevant to how UAE companies work right now.` }
    case 'business':
      return { topic: t, format: 'text', title: `${t}: how the right software takes the stress out`, why: `Business date${soon}: a timely, practical reminder.` }
    default:
      return null // India holidays matter for the team, not the UAE audience
  }
}

/** The format that has done best for this account lately (median "vs typical", 2+ posts), if clearly ahead */
function bestFormat(posts: CalendarPost[], accountId: number): { format: PlannedFormat; lift: number } | null {
  const by = new Map<string, number[]>()
  for (const p of posts) {
    if (p.account_id !== accountId || p.vs_typical == null) continue
    by.set(p.format, [...(by.get(p.format) ?? []), p.vs_typical])
  }
  const map: Record<string, PlannedFormat> = { image: 'image', carousel: 'carousel', video: 'video', poll: 'poll', newsletter: 'article', text: 'text' }
  let best: { format: PlannedFormat; lift: number } | null = null
  for (const [f, v] of by) {
    if (v.length < 2 || !map[f]) continue
    const s = [...v].sort((a, b) => a - b)
    const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    if (med > 1.1 && (!best || med > best.lift)) best = { format: map[f], lift: med }
  }
  return best
}

export function DayIdeas({ day, items, posts, accountId, newAt }: { day: string; items: CalendarItem[]; posts: CalendarPost[]; accountId: number; newAt: string }) {
  const d = parseISO(day)
  const ideas: Idea[] = []
  // Events on the day first, then ones coming up within a week (a teaser beforehand)
  const near = items
    .map((i) => ({ i, away: differenceInCalendarDays(parseISO(i.start), d) }))
    .filter(({ i, away }) => (i.start <= day && i.end >= day) || (away > 0 && away <= 7))
    .sort((a, b) => Math.max(0, a.away) - Math.max(0, b.away))
  for (const { i, away } of near) {
    const idea = eventIdea(i, Math.max(0, away))
    if (idea && !ideas.some((x) => x.topic === idea.topic)) ideas.push(idea)
    if (ideas.length === 2) break
  }
  // One from the content themes, in the format that has been working, if any
  const theme = { ...THEMES[getDayOfYear(d) % THEMES.length] }
  const best = bestFormat(posts, accountId)
  if (best) {
    theme.format = best.format
    theme.why = `${theme.why}. ${PLANNED_FORMAT_LABELS[best.format]} posts have done ${best.lift.toFixed(1)}× your typical post lately.`
  }
  ideas.push(theme)

  return (
    <div className="mt-4 rounded-2xl border bg-card p-5 text-sm shadow-sm">
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <Lightbulb className="size-4 text-primary" /> Content ideas
      </div>
      <ul className="space-y-2.5">
        {ideas.map((idea) => {
          const qs = new URLSearchParams({ new_at: newAt, from: 'calendar', format: idea.format, topic: idea.topic })
          return (
            <li key={idea.title} className="rounded-xl p-3 ring-1 ring-border">
              <div className="text-[13px] font-medium leading-snug">{idea.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{idea.why}</div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{PLANNED_FORMAT_LABELS[idea.format]}</span>
                <Link to={`/create?${qs}`} className={cn(buttonVariants({ variant: 'outline', size: 'xs' }))}>
                  Start post <ArrowRight />
                </Link>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
