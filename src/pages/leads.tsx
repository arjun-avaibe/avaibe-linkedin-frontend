import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { EmptyState, PageHeader, SimpleSelect } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { todayUae } from '@/components/period'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { isoToZonedInput, UAE, zonedInputToIso } from '@/context/timezone'
import { usePosts } from '@/hooks/queries'
import { api, type Lead, type LeadInput, type LeadSource, type LeadStage } from '@/lib/api'
import { fmtNumber, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AreaPage } from '@/pages/suggestions'

// ---------------------------------------------------------------- shared

export const SOURCE_LABEL: Record<LeadSource, string> = {
  company_post: 'Company page post',
  founder_post: 'Founder’s post',
  company_page: 'Company page (visit / message)',
  founder_profile: 'Founder’s profile / message',
  website: 'Website',
  referral: 'Referral',
  event: 'Event',
  other: 'Other',
}
export const STAGE_LABEL: Record<LeadStage, string> = { new: 'New', talking: 'In talks', proposal: 'Proposal sent', won: 'Won', lost: 'Lost' }
const STAGES = Object.keys(STAGE_LABEL) as LeadStage[]
const FROM_LINKEDIN: LeadSource[] = ['company_post', 'founder_post', 'company_page', 'founder_profile']
const aed = (v: number | null | undefined) => (v == null ? '–' : `AED ${fmtNumber(v)}`)
export const REPLY_TARGET_HOURS = 24
/** Hours from the enquiry (start of its UAE day if only the date is known) to the first reply, or to now if not replied */
export function replyHours(l: Lead, now = Date.now()): number {
  const start = new Date(`${l.received_on}T00:00:00+04:00`).getTime()
  const end = l.replied_at ? new Date(l.replied_at).getTime() : now
  return Math.max(0, (end - start) / 3_600_000)
}
const fmtHours = (h: number) => (h < 1 ? 'under 1 h' : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`)
/** Source known = a specific source (not "Other"), or they told us how they heard */
const sourceKnown = (l: Lead) => l.source !== 'other' || !!l.how_heard
const yesNo = (v: boolean | null) => (v == null ? '' : v ? 'yes' : 'no')

function useLeads(accountId?: number) {
  return useQuery({ queryKey: ['leads', accountId], queryFn: () => api.leads(accountId!), enabled: !!accountId })
}

function useSaveLead(accountId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: LeadInput }) => (id ? api.updateLead(id, body) : api.createLead(body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', accountId] }),
    onError: (e: Error) => toast.error(e.message),
  })
}

function useDeleteLead(accountId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.deleteLead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', accountId] }),
    onError: (e: Error) => toast.error(e.message),
  })
}

const toInput = (l: Lead): LeadInput => ({
  account_id: l.account_id,
  received_on: l.received_on,
  source: l.source,
  post_id: l.post_id,
  via_account_id: l.via_account_id,
  company: l.company,
  industry: l.industry,
  in_uae: l.in_uae,
  role: l.role,
  decision_maker: l.decision_maker,
  service: l.service,
  stage: l.stage,
  value_aed: l.value_aed,
  closed_on: l.closed_on,
  notes: l.notes,
  how_heard: l.how_heard,
  utm_source: l.utm_source,
  utm_medium: l.utm_medium,
  utm_campaign: l.utm_campaign,
  replied_at: l.replied_at,
  qualified: l.qualified,
})

function useMarkReplied(accountId?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.leadReplied(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', accountId] }),
    onError: (e: Error) => toast.error(e.message),
  })
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  )
}

// ---------------------------------------------------------------- suggestions pages

/** Leads & sales › Suggestions: bringing in enquiries and turning them into won business, in one list */
export function LeadSuggestionsPage() {
  return (
    <AreaPage
      areaId="leads"
      also={['sales']}
      eyebrow="Leads & sales"
      title="Suggestions"
      description="Bringing in enquiries from the right people (UAE decision-makers, not just likes) and turning them into won business."
    />
  )
}

// ---------------------------------------------------------------- Leads log

export function LeadsLogPage() {
  const { account } = useAccount()
  const auth = useAuth()
  const { data: leads = [], isLoading } = useLeads(account?.id)
  const [editing, setEditing] = useState<Lead | 'new' | null>(null)
  const del = useDeleteLead(account?.id)
  const replied = useMarkReplied(account?.id)

  if (!account) return null
  const n = leads.length
  const linkedIn = leads.filter((l) => FROM_LINKEDIN.includes(l.source)).length
  const qualified = leads.filter((l) => l.is_qualified).length
  const qualKnown = leads.filter((l) => l.is_qualified != null).length
  const known = leads.filter(sourceKnown).length
  const replyTimes = leads.filter((l) => l.replied_at).map((l) => replyHours(l)).sort((a, b) => a - b)
  const medianReply = replyTimes.length ? replyTimes[Math.floor(replyTimes.length / 2)] : null
  const waiting = leads.filter((l) => !l.replied_at && l.stage !== 'lost' && l.stage !== 'won').length

  return (
    <div className="mx-auto max-w-page">
      <PageHeader
        eyebrow="Leads & sales"
        title="Leads log"
        description="Every enquiry, where it came from and who it’s from. LinkedIn doesn’t share enquiries, so the team records them here. Company, role and source only: no personal names or contact details."
        actions={
          auth.can('editor') && (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus /> Add lead
            </Button>
          )
        }
      />

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : n === 0 ? (
        <EmptyState>
          No leads recorded yet. Add each enquiry as it comes in (from a post, a founder’s profile, the website…). After a few, this page shows which
          posts and profiles bring real enquiries, not just likes.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Leads"
              value={fmtNumber(n)}
              hint={`${leads.filter((l) => differenceInCalendarDays(parseISO(todayUae()), parseISO(l.received_on)) < 30).length} in the last 30 days · ${fmtPct(linkedIn / n)} from LinkedIn`}
            />
            <Stat
              label="Qualified"
              value={fmtNumber(qualified)}
              hint={`UAE-based decision-makers (unless changed)${qualKnown < n ? ` · ${n - qualKnown} not yet known` : ''}`}
            />
            <Stat label="Source known" value={fmtPct(known / n)} hint="Aim for over 80%: ask every lead how they heard about you" />
            <Stat
              label="First reply"
              value={medianReply == null ? '–' : fmtHours(medianReply)}
              hint={`Median, from the day of the enquiry${waiting ? ` · ${waiting} waiting for a reply` : ''}`}
            />
          </div>
          <Sources leads={leads} />
          <Card className="mt-4">
            <CardContent className="overflow-x-auto px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Received</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Came from</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>UAE</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Reply</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="pl-4 tabular-nums">{format(parseISO(l.received_on), 'd MMM yyyy')}</TableCell>
                      <TableCell>
                        <div className="font-medium">{l.company}</div>
                        {l.industry && <div className="text-xs text-muted-foreground">{l.industry}</div>}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal">
                        <div>{SOURCE_LABEL[l.source]}</div>
                        {l.post_id ? (
                          <Link to={`/posts/${l.post_id}`} className="line-clamp-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
                            {l.post_title}
                          </Link>
                        ) : (
                          l.via_account_name && <div className="text-xs text-muted-foreground">{l.via_account_name}</div>
                        )}
                        {l.how_heard && <div className="line-clamp-1 text-xs text-muted-foreground italic">“{l.how_heard}”</div>}
                      </TableCell>
                      <TableCell>
                        {l.role ?? '–'}
                        {l.is_qualified && <span className="ml-1.5 rounded-full bg-good/10 px-1.5 py-px text-[10px] text-good-fg">qualified</span>}
                      </TableCell>
                      <TableCell>{yesNo(l.in_uae) || '–'}</TableCell>
                      <TableCell>{l.service ?? '–'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {l.replied_at ? (
                          <span className={cn('text-xs', replyHours(l) > REPLY_TARGET_HOURS ? 'text-warn-fg' : 'text-muted-foreground')}>
                            after {fmtHours(replyHours(l))}
                          </span>
                        ) : l.stage === 'won' || l.stage === 'lost' ? (
                          <span className="text-xs text-muted-foreground">–</span>
                        ) : auth.can('editor') ? (
                          <Button size="xs" variant="outline" onClick={() => replied.mutate(l.id)} title="Record that the team has replied now">
                            Mark replied
                            <span className={cn('tabular-nums', replyHours(l) > REPLY_TARGET_HOURS ? 'text-bad-fg' : 'text-muted-foreground')}>
                              · {fmtHours(replyHours(l))}
                            </span>
                          </Button>
                        ) : (
                          <span className="text-xs text-bad-fg">waiting {fmtHours(replyHours(l))}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StageTag stage={l.stage} />
                      </TableCell>
                      <TableCell className="pr-4 text-right whitespace-nowrap">
                        {auth.can('editor') && (
                          <>
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${l.company}`} onClick={() => setEditing(l)}>
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${l.company}`}
                              onClick={() => confirm(`Delete the lead from ${l.company}?`) && del.mutate(l.id)}
                            >
                              <Trash2 />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {editing && <LeadDialog accountId={account.id} initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Where leads come from: by source, and by the topic of the post they came from (counts, plus how many were won) */
function Sources({ leads }: { leads: Lead[] }) {
  const group = (key: (l: Lead) => string | null) => {
    const m = new Map<string, { n: number; won: number; uae: number }>()
    for (const l of leads) {
      const k = key(l)
      if (!k) continue
      const g = m.get(k) ?? { n: 0, won: 0, uae: 0 }
      g.n += 1
      if (l.stage === 'won') g.won += 1
      if (l.in_uae) g.uae += 1
      m.set(k, g)
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }
  const bySource = group((l) => SOURCE_LABEL[l.source])
  const byTopic = group((l) => l.post_topic ?? (l.post_id ? 'Post without a topic' : null))
  const byProfile = group((l) => l.via_account_name)
  const max = Math.max(1, ...bySource.map(([, g]) => g.n))
  const List = ({ title, rows, note }: { title: string; rows: [string, { n: number; won: number; uae: number }][]; note?: string }) => (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{note}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.slice(0, 6).map(([k, g]) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_48px_auto] items-center gap-2 text-sm">
              <span className="truncate" title={k}>
                {k}
              </span>
              <span className="h-2 rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(g.n / max) * 100}%` }} />
              </span>
              <span className="w-28 text-xs text-muted-foreground tabular-nums">
                <b className="text-foreground">{g.n}</b> · {g.uae} UAE · {g.won} won
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="text-sm font-medium">Where leads come from</div>
        <p className="text-xs text-muted-foreground">Small numbers are anecdotes: wait for a pattern across several leads before changing what you post.</p>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <List title="By source" rows={bySource} />
        <List title="By post topic" rows={byTopic} note="Link leads to the post they came from to see which topics bring enquiries." />
        <List title="By profile" rows={byProfile} note="Choose the founder or page a lead came through to compare them." />
      </CardContent>
    </Card>
  )
}

function StageTag({ stage }: { stage: LeadStage }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs whitespace-nowrap',
        stage === 'won' ? 'bg-good/10 text-good-fg' : stage === 'lost' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  )
}

// ---------------------------------------------------------------- Pipeline

export function PipelinePage() {
  const { account } = useAccount()
  const auth = useAuth()
  const { data: leads = [], isLoading } = useLeads(account?.id)
  const save = useSaveLead(account?.id)
  const [editing, setEditing] = useState<Lead | null>(null)

  const stats = useMemo(() => {
    const open = leads.filter((l) => !['won', 'lost'].includes(l.stage))
    const won = leads.filter((l) => l.stage === 'won')
    const lost = leads.filter((l) => l.stage === 'lost')
    const sum = (ls: Lead[]) => ls.reduce((s, l) => s + (l.value_aed ?? 0), 0)
    const days = won.filter((l) => l.closed_on).map((l) => differenceInCalendarDays(parseISO(l.closed_on!), parseISO(l.received_on)))
    days.sort((a, b) => a - b)
    return {
      open,
      openValue: sum(open),
      won,
      wonValue: sum(won),
      winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
      closed: won.length + lost.length,
      medianDays: days.length ? days[Math.floor(days.length / 2)] : null,
    }
  }, [leads])

  if (!account) return null
  const move = (l: Lead, stage: LeadStage) => save.mutate({ id: l.id, body: { ...toInput(l), stage, closed_on: null } })

  return (
    <div className="mx-auto max-w-page">
      <PageHeader
        eyebrow="Leads & sales"
        title="Pipeline"
        description="Each lead from the Leads log, by stage. Move a lead when it progresses; won and lost leads show which sources turn into business."
        actions={
          <Link to="/leads/log" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Add leads in the Leads log →
          </Link>
        }
      />
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : leads.length === 0 ? (
        <EmptyState>
          The pipeline fills from the <Link to="/leads/log" className="underline">Leads log</Link>. Record enquiries there first.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Open pipeline" value={aed(stats.openValue)} hint={`${stats.open.length} open lead${stats.open.length === 1 ? '' : 's'} (where a value is entered)`} />
            <Stat label="Won" value={aed(stats.wonValue)} hint={`${stats.won.length} deal${stats.won.length === 1 ? '' : 's'}`} />
            <Stat label="Win rate" value={stats.winRate == null ? '–' : fmtPct(stats.winRate)} hint={`of ${stats.closed} closed lead${stats.closed === 1 ? '' : 's'}`} />
            <Stat label="Time to win" value={stats.medianDays == null ? '–' : `${stats.medianDays} days`} hint="Median, from enquiry to won" />
          </div>
          <div className="mt-4 grid gap-3 overflow-x-auto pb-2 md:grid-cols-5">
            {STAGES.map((s) => {
              const col = leads.filter((l) => l.stage === s)
              return (
                <div key={s} className="min-w-52 rounded-xl border bg-muted/30 p-2">
                  <div className="mb-2 flex items-center justify-between px-1 text-sm font-medium">
                    {STAGE_LABEL[s]}
                    <span className="text-xs text-muted-foreground tabular-nums">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map((l) => (
                      <div key={l.id} className="rounded-lg border bg-card p-2.5 text-sm shadow-xs">
                        <div className="flex items-start justify-between gap-1">
                          <button type="button" className="text-left font-medium hover:underline" onClick={() => auth.can('editor') && setEditing(l)}>
                            {l.company}
                          </button>
                          {l.in_uae && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">UAE</span>}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {[l.service, l.value_aed != null ? aed(l.value_aed) : null].filter(Boolean).join(' · ') || SOURCE_LABEL[l.source]}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {s === 'won' || s === 'lost'
                            ? l.closed_on && `Closed ${format(parseISO(l.closed_on), 'd MMM')}`
                            : `${differenceInCalendarDays(parseISO(todayUae()), parseISO(l.received_on))} days since enquiry`}
                        </div>
                        {auth.can('editor') && (
                          <div className="mt-2">
                            <SimpleSelect
                              label="Stage"
                              value={l.stage}
                              onChange={(v) => move(l, v as LeadStage)}
                              options={STAGES.map((x) => ({ value: x, label: STAGE_LABEL[x] }))}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
      {editing && <LeadDialog accountId={account.id} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------- add / edit

function LeadDialog({ accountId, initial, onClose }: { accountId: number; initial?: Lead; onClose: () => void }) {
  const { accounts, account } = useAccount()
  const { data: posts = [] } = usePosts(accountId)
  const save = useSaveLead(accountId)
  const root = account?.parent_id ?? account?.id
  const profiles = accounts.filter((a) => a.id === root || a.parent_id === root)
  const [f, setF] = useState<LeadInput>(
    initial
      ? toInput(initial)
      : {
          account_id: accountId,
          received_on: todayUae(),
          source: 'company_post',
          post_id: null,
          via_account_id: null,
          company: '',
          industry: null,
          in_uae: null,
          role: null,
          decision_maker: null,
          service: null,
          stage: 'new',
          value_aed: null,
          closed_on: null,
          notes: null,
          how_heard: null,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          replied_at: null,
          qualified: null,
        },
  )
  // Quick add shows the essentials; editing opens everything
  const [more, setMore] = useState(!!initial)
  const set = <K extends keyof LeadInput>(k: K, v: LeadInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const text = (v: string) => (v.trim() ? v : null)
  const tri = (v: boolean | null) => (v == null ? 'unknown' : v ? 'yes' : 'no')
  const fromTri = (v: string) => (v === 'unknown' ? null : v === 'yes')
  const postish = f.source === 'company_post' || f.source === 'founder_post'
  const recent = posts.slice(0, 60)

  const submit = () => {
    if (!f.company.trim()) return toast.error('Enter the company')
    save.mutate(
      { id: initial?.id, body: { ...f, company: f.company.trim(), post_id: postish ? f.post_id : null } },
      {
        onSuccess: () => {
          toast.success(initial ? 'Lead updated' : 'Lead added')
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit lead' : 'Add a lead'}</DialogTitle>
          <DialogDescription>Business details only. Don’t enter people’s names, emails or phone numbers.</DialogDescription>
        </DialogHeader>
        {/* Quick add: what's needed to learn where leads come from and whether they're qualified */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="l-company">Company</Label>
            <Input id="l-company" autoFocus value={f.company} onChange={(e) => set('company', e.target.value)} placeholder="e.g. a school or business name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-date">Received on</Label>
            <Input id="l-date" type="date" value={f.received_on} max={todayUae()} onChange={(e) => set('received_on', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Came from</Label>
            <SimpleSelect value={f.source} onChange={(v) => set('source', v as LeadSource)} options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} />
          </div>
          {postish && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Which post (optional)</Label>
              <SimpleSelect
                value={String(f.post_id ?? '')}
                onChange={(v) => set('post_id', v ? Number(v) : null)}
                options={[
                  { value: '', label: 'Not sure' },
                  ...recent.map((p) => ({
                    value: String(p.id),
                    label: `${format(parseISO(p.published_at), 'd MMM')} · ${(p.caption ?? '').split('\n').find((x) => x.trim())?.slice(0, 70) ?? 'Post'}`,
                  })),
                ]}
              />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="l-heard">How they heard about you (their words)</Label>
            <Input
              id="l-heard"
              value={f.how_heard ?? ''}
              maxLength={300}
              onChange={(e) => set('how_heard', text(e.target.value))}
              placeholder="e.g. “Saw the founder’s posts about school systems for a few weeks”"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Based in the UAE?</Label>
            <SimpleSelect value={tri(f.in_uae)} onChange={(v) => set('in_uae', fromTri(v))} options={[{ value: 'unknown', label: 'Not sure' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          </div>
          <div className="space-y-1.5">
            <Label>Decision-maker?</Label>
            <SimpleSelect value={tri(f.decision_maker)} onChange={(v) => set('decision_maker', fromTri(v))} options={[{ value: 'unknown', label: 'Not sure' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
          </div>
        </div>

        <button type="button" onClick={() => setMore(!more)} className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground" aria-expanded={more}>
          <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} /> More details
        </button>
        {more && (
          <div className="grid gap-3 sm:grid-cols-2">
            {profiles.length > 1 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Through which page or profile</Label>
                <SimpleSelect
                  value={String(f.via_account_id ?? '')}
                  onChange={(v) => set('via_account_id', v ? Number(v) : null)}
                  options={[{ value: '', label: 'Not sure' }, ...profiles.map((a) => ({ value: String(a.id), label: a.name }))]}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="l-industry">Industry</Label>
              <Input id="l-industry" value={f.industry ?? ''} onChange={(e) => set('industry', text(e.target.value))} placeholder="e.g. Education" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-role">Their role</Label>
              <Input id="l-role" value={f.role ?? ''} onChange={(e) => set('role', text(e.target.value))} placeholder="e.g. Principal, CTO" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-service">Service they want</Label>
              <Input id="l-service" value={f.service ?? ''} onChange={(e) => set('service', text(e.target.value))} placeholder="e.g. LMS, ERP, website" />
            </div>
            <div className="space-y-1.5">
              <Label>Qualified?</Label>
              <SimpleSelect
                value={f.qualified == null ? 'auto' : f.qualified ? 'yes' : 'no'}
                onChange={(v) => set('qualified', v === 'auto' ? null : v === 'yes')}
                options={[
                  { value: 'auto', label: 'Automatic: UAE-based decision-maker' },
                  { value: 'yes', label: 'Yes (set by hand)' },
                  { value: 'no', label: 'No (set by hand)' },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-replied">First reply</Label>
              <Input
                id="l-replied"
                type="datetime-local"
                value={f.replied_at ? isoToZonedInput(f.replied_at, UAE) : ''}
                onChange={(e) => set('replied_at', e.target.value ? zonedInputToIso(e.target.value, UAE) : null)}
              />
              <p className="text-[11px] text-muted-foreground">UAE time</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-value">Expected value (AED)</Label>
              <Input
                id="l-value"
                type="number"
                min={0}
                value={f.value_aed ?? ''}
                onChange={(e) => set('value_aed', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <SimpleSelect value={f.stage} onChange={(v) => set('stage', v as LeadStage)} options={STAGES.map((x) => ({ value: x, label: STAGE_LABEL[x] }))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tracked link (filled in when it came from a tagged link on the website)</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input aria-label="utm_source" value={f.utm_source ?? ''} onChange={(e) => set('utm_source', text(e.target.value))} placeholder="source, e.g. linkedin" />
                <Input aria-label="utm_medium" value={f.utm_medium ?? ''} onChange={(e) => set('utm_medium', text(e.target.value))} placeholder="medium, e.g. company_post" />
                <Input aria-label="utm_campaign" value={f.utm_campaign ?? ''} onChange={(e) => set('utm_campaign', text(e.target.value))} placeholder="campaign / post" />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="l-notes">Notes</Label>
              <Textarea id="l-notes" rows={3} value={f.notes ?? ''} onChange={(e) => set('notes', text(e.target.value))} placeholder="What they asked about, next step…" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {initial ? 'Save' : 'Add lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
