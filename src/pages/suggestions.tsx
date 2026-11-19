import { createContext, useContext, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  FilePlus2,
  FileText,
  Lightbulb,
  Megaphone,
  SearchCheck,
  Sparkles,
  Undo2,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageHeader, Section } from '@/components/common'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { useTz } from '@/context/timezone'
import { useClaudeStatus, useDecide, useGenerateIdeas, useIdeaToDraft } from '@/hooks/queries'
import { AREAS, areaPath, itemState, OWN_SECTION, useSimilarPosts, useSuggestionItems, type AreaId, type Item } from '@/hooks/suggestion-items'
import type { DecisionStatus, Idea, IdeasState, SimilarResponse, SimilarResult, Suggestion } from '@/lib/api'
import { fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const TOP = 3 // highlighted at the top of each area
const VISIBLE = 5 // shown before "Show more"

const PRIORITY: Record<Suggestion['priority'], { label: string; cls: string }> = {
  high: { label: 'High priority', cls: 'border-bad/40 bg-bad/10 text-bad-fg' },
  medium: { label: 'Medium priority', cls: 'border-info/40 bg-info/10 text-info-fg' },
  low: { label: 'Low priority', cls: 'border-border bg-muted text-muted-foreground' },
}

const IDEA_TYPE: Record<Idea['type'], string> = {
  post: 'Post',
  campaign: 'Campaign / series',
  outreach: 'Outreach',
  brand: 'Brand',
  seo_aeo: 'SEO / AEO',
  leads: 'Leads',
  sales: 'Sales',
}

const STATUS_LABEL: Record<DecisionStatus, string> = {
  doing: 'In progress',
  later: 'Later',
  dismissed: 'Dismissed',
  done: 'Done',
}

const PLANNED = [
  { icon: FileText, title: 'Post drafts from a topic', text: 'Topic → three angles, a draft caption, format, CTA and hashtags.' },
  { icon: SearchCheck, title: 'Why a post under-performed', text: 'Diagnosis of hook, topic, format, timing and audience against the account’s own baseline.' },
  { icon: Users, title: 'SEO & AEO checks', text: 'Monthly AI-answer visibility checks (including Arabic questions) and website content gaps.' },
  { icon: Megaphone, title: 'Lead and sales suggestions from your own log', text: 'Rule-based suggestions from the Leads log and Pipeline, e.g. leads gone quiet, topics that bring enquiries.' },
]

export function SuggestionsPage() {
  const { area } = useParams()
  if (area === 'planned') return <PlannedFeatures />
  // Brand, Leads and Sales suggestions live in their own sidebar sections
  if (area && OWN_SECTION[area as AreaId]) return <Navigate to={areaPath(area as AreaId)} replace />
  const def = AREAS.find((a) => a.id === area)
  if (!def) return <Navigate to="/suggestions/content" replace />
  return <AreaPage key={def.id} areaId={def.id} />
}

/** One area's suggestions. eyebrow/title let other sections (e.g. Brand) show the same page under their own name. */
export function AreaPage({ areaId, eyebrow = 'Suggestions', title }: { areaId: AreaId; eyebrow?: string; title?: string }) {
  const def = AREAS.find((a) => a.id === areaId)!
  const { account } = useAccount()
  const { items, suggestions, ideas, isLoading } = useSuggestionItems(account?.id)
  const [showAll, setShowAll] = useState(false)
  const [showClosed, setShowClosed] = useState(false)

  const mine = items.filter((it) => it.area === areaId)
  const { data: similar } = useSimilarPosts(account?.id, mine)
  const doing = mine.filter((it) => itemState(it.decision?.status) === 'doing')
  const open = mine.filter((it) => itemState(it.decision?.status) === 'open')
  const closed = mine.filter((it) => ['later', 'closed'].includes(itemState(it.decision?.status)))
  const top = open.slice(0, TOP)
  const rest = open.slice(TOP)
  const restShown = showAll ? rest : rest.slice(0, VISIBLE - TOP)
  const usesData = areaId === 'content' || areaId === 'data'
  const gaps = areaId === 'data' ? (ideas?.latest?.result?.data_gaps ?? []) : []

  return (
    <SimilarCtx.Provider value={similar}>
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader eyebrow={eyebrow} title={title ?? def.label} description={def.intro} />

      {usesData && suggestions && suggestions.baseline != null && (
        <p className="text-xs text-muted-foreground">
          Based on your own posts, compared at <b>{suggestions.checkpoint ?? '24h'}</b> · typical post: <b>{fmtNumber(suggestions.baseline)}</b>{' '}
          {suggestions.metric_label}
        </p>
      )}

      {account && areaId !== 'data' && <GenerateBar accountId={account.id} state={ideas} />}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : (
        <>
          {doing.length > 0 && (
            <ItemList title="In progress" items={doing} accountId={account!.id} />
          )}

          {open.length === 0 && doing.length === 0 ? (
            <EmptyState icon={CheckCircle2}>{closed.length ? 'Everything here has been decided. ' : ''}{def.empty}</EmptyState>
          ) : (
            open.length > 0 && (
              <>
                <ItemList title={`Top ${Math.min(TOP, top.length)}`} items={top} accountId={account!.id} highlight />
                {rest.length > 0 && (
                  <ItemList title="Other suggestions" items={restShown} accountId={account!.id}>
                    {rest.length > restShown.length && (
                      <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
                        <ChevronDown /> Show {rest.length - restShown.length} more
                      </Button>
                    )}
                  </ItemList>
                )}
              </>
            )
          )}

          {gaps.length > 0 && (
            <div className="rounded-lg border border-border/70 p-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <Lightbulb className="size-4" /> Claude also noted these gaps
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {closed.length > 0 && (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setShowClosed((v) => !v)} className="text-muted-foreground">
                {showClosed ? <ChevronDown /> : <ChevronRight />} Done, dismissed &amp; later ({closed.length})
              </Button>
              {showClosed && <ItemList items={closed} accountId={account!.id} muted />}
            </div>
          )}
        </>
      )}
    </div>
    </SimilarCtx.Provider>
  )
}

/** Past posts like each item, fetched once per page and read by the cards */
const SimilarCtx = createContext<SimilarResponse | undefined>(undefined)

const VERDICT: Record<NonNullable<SimilarResult['verdict']>, { text: string; cls: string }> = {
  above: { text: 'above your typical post', cls: 'text-good-fg' },
  similar: { text: 'about your typical post', cls: 'text-muted-foreground' },
  below: { text: 'below your typical post', cls: 'text-bad-fg' },
}

/** One line on the collapsed card: has this been done before, and how did it go? */
function SimilarLine({ s, baseline }: { s: SimilarResult; baseline: number | null }) {
  if (s.count === 0) {
    return (
      <span className="mt-1 block text-xs text-muted-foreground">
        New ground: no past posts on {s.topic ? `“${s.topic}”` : 'this topic'} yet.
      </span>
    )
  }
  const v = s.verdict ? VERDICT[s.verdict] : null
  return (
    <span className="mt-1 block text-xs text-muted-foreground">
      Done before: {s.count} past post{s.count === 1 ? '' : 's'} on “{s.topic}”
      {s.median_impressions != null && (
        <>
          {' '}
          · median {fmtNumber(s.median_impressions)} impressions
          {v && baseline != null && (
            <span className={cn('font-medium', v.cls)}>
              {' '}
              ({v.text}, {fmtNumber(baseline)})
            </span>
          )}
        </>
      )}
    </span>
  )
}

/** In the opened card: the closest past posts, linked */
function SimilarList({ s }: { s: SimilarResult }) {
  if (!s.posts.length) return null
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Closest past posts on “{s.topic}”
      </div>
      <ul className="space-y-1">
        {s.posts.map((p) => (
          <li key={p.id}>
            <Link to={`/posts/${p.id}`} className="flex items-center gap-3 rounded px-1 py-0.5 text-sm hover:bg-muted">
              <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">{p.published}</span>
              <span className="min-w-0 flex-1 truncate">{p.hook}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{p.impressions != null ? fmtNumber(p.impressions) : '—'}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-muted-foreground">Topics of imported posts were suggested from their captions; check them in Posts if one looks wrong.</p>
    </div>
  )
}

function ItemList({
  title,
  items,
  accountId,
  highlight,
  muted,
  children,
}: {
  title?: string
  items: Item[]
  accountId: number
  highlight?: boolean
  muted?: boolean
  children?: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      {title && <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h2>}
      {items.map((it) => (
        <ItemCard key={it.key} item={it} accountId={accountId} highlight={highlight} muted={muted} />
      ))}
      {children}
    </section>
  )
}

// ---------------------------------------------------------------- one collapsed card

function ItemCard({ item, accountId, highlight, muted }: { item: Item; accountId: number; highlight?: boolean; muted?: boolean }) {
  const [open, setOpen] = useState(false)
  const auth = useAuth()
  const tz = useTz()
  const decide = useDecide(accountId)
  const status = item.decision?.status
  const conf = item.rule ? item.rule.confidence.level : item.idea!.idea.confidence
  const progress = item.rule?.progress
  const similarAll = useContext(SimilarCtx)
  const similar = similarAll?.results[item.key]

  const set = (s: DecisionStatus | null, msg: string) =>
    decide.mutate({ key: item.key, status: s }, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(e.message) })

  return (
    <Card className={cn('relative overflow-hidden p-0', muted && 'opacity-75')}>
      {highlight && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand-gradient" />}
      <div className="flex flex-wrap items-start gap-3 p-3.5 pl-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0">
            <span className="block leading-snug font-medium">{item.title}</span>
            <span className={cn('mt-0.5 block text-sm text-muted-foreground', !open && 'line-clamp-1')}>{item.summary}</span>
            {similar && <SimilarLine s={similar} baseline={similarAll?.baseline ?? null} />}
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {item.rule ? (
                <>
                  <Badge variant="outline" className={PRIORITY[item.rule.priority].cls}>
                    {PRIORITY[item.rule.priority].label}
                  </Badge>
                  {/* Page-setup items are good practice, not something measured in this account's numbers */}
                  <Badge variant="secondary">{item.rule.category === 'page' ? 'Page setup' : item.rule.category === 'lead' ? 'From your Leads log' : 'From your data'}</Badge>
                </>
              ) : (
                <>
                  <Badge variant="outline">{IDEA_TYPE[item.idea!.idea.type]}</Badge>
                  <Badge variant="outline" className="border-primary/30 text-brand-fg">
                    <Sparkles className="size-3" /> Claude
                  </Badge>
                  <Badge variant="outline" className="capitalize">Effort: {item.idea!.idea.effort}</Badge>
                </>
              )}
              <Badge variant="outline" className="capitalize">{conf} confidence</Badge>
              {status && status !== 'doing' && (
                <Badge variant="secondary">
                  {STATUS_LABEL[status]}
                  {status === 'later' && item.decision?.until && <> · back {tz.dateTime(item.decision.until).split(',')[0]}</>}
                </Badge>
              )}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {item.rule?.action && (
            <Link to={item.rule.action.to} className={buttonVariants({ size: 'sm', variant: item.area === 'data' ? 'default' : 'outline' })}>
              {item.rule.action.label}
            </Link>
          )}
          {auth.can('editor') &&
            (!status ? (
              <>
                <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => set('doing', 'Moved to In progress')}>
                  Do it
                </Button>
                <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => set('later', 'Hidden for a week')}>
                  Later
                </Button>
                <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => set('dismissed', 'Dismissed')}>
                  Dismiss
                </Button>
              </>
            ) : status === 'doing' ? (
              <>
                <Button size="sm" disabled={decide.isPending} onClick={() => set('done', 'Marked done')}>
                  <CheckCircle2 /> Mark done
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Undo" title="Undo" disabled={decide.isPending} onClick={() => set(null, 'Moved back')}>
                  <Undo2 />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => set(null, 'Restored')}>
                <Undo2 /> Restore
              </Button>
            ))}
        </div>

        {progress && progress.total > 0 && (
          <div className="basis-full pl-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-1.5 max-w-60 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }} />
              </div>
              <span className="tabular-nums">
                {fmtNumber(progress.done)} of {fmtNumber(progress.total)} {progress.label}
              </span>
            </div>
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-border/60 px-4 pt-3 pb-4 pl-10">
          {item.rule ? <RuleDetails s={item.rule} /> : <IdeaDetails {...item.idea!} accountId={accountId} />}
          {similar && (
            <div className="mt-3">
              <SimilarList s={similar} />
            </div>
          )}
          {item.decision?.decided_by && (
            <p className="mt-3 text-xs text-muted-foreground">
              {STATUS_LABEL[item.decision.status]} · by {item.decision.decided_by}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- details (shown when a card is opened)

function RuleDetails({ s }: { s: Suggestion }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Fact icon={Clock3} label="When" value={s.when} />
        <Fact icon={Users} label="Who it targets" value={s.who} />
      </div>
      <Why items={s.why} />
      <BoostRisk boost={s.boost} risk={s.risk} />
      <Footer confidence={s.confidence.reason} measure={s.measure} />
    </div>
  )
}

function IdeaDetails({ idea, runId, index, accountId }: { idea: Idea; runId: number; index: number; accountId: number }) {
  const auth = useAuth()
  const toDraft = useIdeaToDraft(accountId)
  const [draftId, setDraftId] = useState<number | null>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(idea.draft_caption ?? '')
      toast.success('Caption copied')
    } catch {
      toast.error('Couldn’t copy. Select the text instead.')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">{idea.what}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Fact icon={Clock3} label="When" value={idea.when} />
        <Fact icon={Users} label="Who it targets" value={idea.who} />
      </div>
      <div className="flex gap-2 rounded-lg bg-background/40 px-3 py-2 text-sm ring-1 ring-border">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-fg" />
        <div>
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">What’s new about it · </span>
          {idea.novelty}
        </div>
      </div>
      <Why items={idea.why} />
      <BoostRisk boost={idea.boost} risk={idea.risk} />
      {idea.draft_caption && (
        <div className="rounded-lg border border-border/70 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Draft caption (edit before use)</span>
            <div className="flex gap-1">
              <Button size="xs" variant="ghost" onClick={copy}>
                <Copy /> Copy
              </Button>
              {auth.can('editor') &&
                (draftId ? (
                  <Link to="/publishing" className={buttonVariants({ size: 'xs', variant: 'outline' })}>
                    Open in Publishing
                  </Link>
                ) : (
                  <Button
                    size="xs"
                    disabled={toDraft.isPending}
                    onClick={() =>
                      toDraft.mutate(
                        { runId, index },
                        {
                          onSuccess: (d) => {
                            setDraftId(d.planned_id)
                            toast.success('Draft added to Publishing. It still needs editing and approval.')
                          },
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                  >
                    <FilePlus2 /> Create draft
                  </Button>
                ))}
            </div>
          </div>
          <p className="text-sm whitespace-pre-line">{idea.draft_caption}</p>
        </div>
      )}
      <Footer confidence={idea.confidence_reason} measure={idea.measure} />
    </div>
  )
}

function Why({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg bg-brand-soft p-3 ring-1 ring-primary/15">
      <div className="mb-1.5 text-xs font-semibold tracking-wide text-brand-fg uppercase">Why: the evidence</div>
      <ul className="space-y-1.5 text-sm">
        {items.map((w, i) => {
          const assumption = /^assumption:/i.test(w.trim())
          return (
            <li key={i} className="flex gap-2">
              {assumption ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-serious-fg" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-fg" />}
              <span className={cn(assumption && 'text-muted-foreground italic')}>{w}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BoostRisk({ boost, risk }: { boost: string; risk: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-lg border border-good/30 bg-good/5 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-good-fg uppercase">
          <ArrowUpRight className="size-4" /> How it can boost outreach
        </div>
        <p className="text-sm">{boost}</p>
      </div>
      <div className="rounded-lg border border-serious/35 bg-serious/5 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-serious-fg uppercase">
          <ArrowDownRight className="size-4" /> How it could lower outreach
        </div>
        <p className="text-sm">{risk}</p>
      </div>
    </div>
  )
}

function Footer({ confidence, measure }: { confidence: string; measure: { metric: string; period: string; target: string } }) {
  return (
    <div className="grid gap-1 border-t border-border/60 pt-2 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-6">
      <div>
        <span className="font-medium text-foreground">Confidence: </span>
        {confidence}
      </div>
      <div>
        <span className="font-medium text-foreground">How to measure: </span>
        {measure.metric} · {measure.period} · target: {measure.target}
      </div>
    </div>
  )
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-background/40 px-3 py-2 ring-1 ring-border">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Claude: one compact bar per area page

function GenerateBar({ accountId, state }: { accountId: number; state: IdeasState | undefined }) {
  const auth = useAuth()
  const tz = useTz()
  const generate = useGenerateIdeas(accountId)
  const [focus, setFocus] = useState('')
  if (!state) return null
  const latest = state.latest

  const meta = latest && (
    <span>
      Claude ideas from {tz.dual(latest.created_at)}
      {latest.created_by && <> · by {latest.created_by}</>}
    </span>
  )

  if (!state.configured) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-primary/30 bg-brand-soft/40 px-3 py-2 text-xs text-muted-foreground">
        <Bot className="size-4 text-brand-fg" />
        <span>
          Claude isn’t connected yet, so new ideas can’t be generated (
          <Link to="/settings?tab=claude" className="underline">
            Settings → Claude
          </Link>
          ).
        </span>
        {meta}
      </div>
    )
  }

  const limitReached = state.runs_today >= state.daily_limit
  const busy = generate.isPending || state.running
  const submit = (e: FormEvent) => {
    e.preventDefault()
    generate.mutate(focus.trim() || null, {
      onSuccess: (run) => toast.success(`${run.result?.ideas.length ?? 0} new ideas from Claude, sorted into each area`),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="space-y-1.5 rounded-lg px-3 py-2.5 ring-1 ring-primary/20">
      {auth.can('editor') && (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            maxLength={300}
            placeholder="Optional focus, e.g. UAE school principals before next term"
            disabled={busy}
            className="h-8 flex-1"
          />
          <Button type="submit" size="sm" disabled={busy || limitReached} className="shrink-0">
            <Wand2 /> {busy ? 'Thinking… (30–90 s)' : 'Generate ideas'}
          </Button>
        </form>
      )}
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {meta}
        <span>
          One run fills every area · {state.runs_today} of {state.daily_limit} runs used today
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- planned features (temporary page)

function PlannedFeatures() {
  const { data: claude } = useClaudeStatus()
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        eyebrow="Suggestions"
        title="Planned features"
        description="Claude features planned next, each with the same why / boost / risk explanation. This page is a reminder and can be removed later."
      />
      <Section title="Coming next" description={claude?.configured ? `Model: ${claude.model}` : 'These need the Claude API key.'}>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PLANNED.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-fg ring-1 ring-primary/20">
                <p.icon className="size-4" />
              </span>
              <div>
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-sm text-muted-foreground">{p.text}</div>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
