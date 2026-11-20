import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Building2, CheckCircle2, CircleAlert, Clock, Gauge, Plus, Receipt, RotateCcw, Sparkles, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PageHeader, Section, SimpleSelect } from '@/components/common'
import { BrandKitForm } from '@/components/brand-kit'
import { TeamTab } from '@/components/team-tab'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { useTz, ZONES, type ZoneId } from '@/context/timezone'
import { useClaudeStatus, useCreateAccount, useSaveSettings, useSettings } from '@/hooks/queries'
import type { Account, PerformanceSettings, SegmentSettings } from '@/lib/api'
import { fmtNumber } from '@/lib/format'

const TABS = ['general', 'team', 'audience', 'performance', 'claude'] as const

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab') as (typeof TABS)[number]) ? params.get('tab')! : 'general'
  const { data, isLoading } = useSettings()
  const auth = useAuth()

  // Brand & knowledge is part of the Claude tab now
  if (params.get('tab') === 'brand') return <Navigate to="/settings?tab=claude" replace />

  if (!auth.can('admin')) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Workspace" title="Settings" />
        <p className="text-sm text-muted-foreground">Only admins can change settings.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Workspace" title="Settings" description="How the app defines your audience, judges performance, and connects to other services." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: String(v) }, { replace: true })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="audience">Audience definitions</TabsTrigger>
          <TabsTrigger value="performance">Performance rules</TabsTrigger>
          <TabsTrigger value="claude">Claude</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>
        <TabsContent value="team" className="mt-4">
          <TeamTab />
        </TabsContent>
        <TabsContent value="audience" className="mt-4">
          {isLoading || !data ? (
            <Skeleton className="h-96" />
          ) : (
            // Remount when saved values change (e.g. after "Restore defaults") so the form shows them
            <AudienceTab key={JSON.stringify(data.current.segments)} current={data.current.segments} />
          )}
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          {isLoading || !data ? (
            <Skeleton className="h-96" />
          ) : (
            <PerformanceTab key={JSON.stringify(data.current.performance)} current={data.current.performance} defaults={data.defaults.performance} />
          )}
        </TabsContent>
        <TabsContent value="claude" className="mt-4">
          <ClaudeTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------- general

const KIND_LABELS: Record<Account['kind'], string> = {
  company: 'Company page',
  founder: 'Founder profile',
  personal: 'Personal profile',
}

function GeneralTab() {
  const { accounts } = useAccount()
  const tz = useTz()
  const create = useCreateAccount()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Account['kind']>('company')
  const [url, setUrl] = useState('')
  const [isTest, setIsTest] = useState('no')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate(
      { name: name.trim(), kind, linkedin_url: url.trim() || null, is_test: isTest === 'yes' },
      {
        onSuccess: () => {
          toast.success('Account added')
          setName('')
          setUrl('')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="space-y-4">
      <Section icon={Clock} title="Time zone" description="How times are shown and entered for you. Posting-time analysis always stays in UAE time.">
        <SimpleSelect
          label="Show times in"
          value={tz.zone}
          onChange={(v) => tz.setZone(v as ZoneId)}
          options={ZONES.map((z) => ({ value: z.id, label: z.long }))}
        />
      </Section>

      <Section icon={Building2} title="Tracked accounts" description="Each LinkedIn asset has its own baseline. Company page and personal profiles are never mixed.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>LinkedIn URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.name} {a.is_test && <Badge variant="outline">test</Badge>}
                </TableCell>
                <TableCell>{KIND_LABELS[a.kind]}</TableCell>
                <TableCell className="max-w-64 truncate text-xs">
                  {a.linkedin_url ? (
                    <a href={a.linkedin_url} target="_blank" rel="noreferrer" className="underline">
                      {a.linkedin_url}
                    </a>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section icon={Plus} title="Add account" description="For example AVAIBE's real company page, or Abhilash's and Anoop's profiles.">
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Name *</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. AVAIBE" />
          </div>
          <div>
            <Label className="mb-1.5 block">LinkedIn URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/company/…" />
          </div>
          <SimpleSelect
            label="Type"
            value={kind}
            onChange={(v) => setKind(v as Account['kind'])}
            options={(Object.keys(KIND_LABELS) as Account['kind'][]).map((k) => ({ value: k, label: KIND_LABELS[k] }))}
          />
          <SimpleSelect
            label="Test account"
            value={isTest}
            onChange={setIsTest}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
          <div className="md:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              Add account
            </Button>
          </div>
        </form>
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------- audience definitions

const SEGMENT_FIELDS: { key: keyof SegmentSettings; label: string; hint: string }[] = [
  { key: 'uae_country', label: 'UAE: country names', hint: 'A location matching one of these counts as the whole UAE (cities are not added on top).' },
  { key: 'uae_cities', label: 'UAE: cities and emirates', hint: 'Used when LinkedIn lists cities instead of the country. Their shares are added together.' },
  { key: 'education_industry', label: 'Education: industry keywords', hint: 'An industry containing any of these words counts as education.' },
  { key: 'decision_seniority', label: 'Decision-makers: seniority levels', hint: 'LinkedIn seniority values that count as decision-makers.' },
  { key: 'decision_titles', label: 'Decision-makers: job title keywords', hint: 'Used only when a post has no seniority breakdown.' },
  { key: 'tech_functions', label: 'Technology professionals: job functions', hint: 'LinkedIn job functions that count as technology professionals (CTOs, IT managers, engineers).' },
  { key: 'partner_functions', label: 'Potential partners: job functions', hint: 'LinkedIn job functions that count as potential partners (consultants, business development).' },
]

const toText = (list: string[]) => list.join('\n')
const toList = (text: string) => text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)

function AudienceTab({ current }: { current: SegmentSettings }) {
  const save = useSaveSettings()
  const [draft, setDraft] = useState<Record<keyof SegmentSettings, string>>(() => {
    const out = {} as Record<keyof SegmentSettings, string>
    for (const f of SEGMENT_FIELDS) out[f.key] = toText(current[f.key])
    return out
  })

  const submit = () => {
    const body = Object.fromEntries(SEGMENT_FIELDS.map((f) => [f.key, toList(draft[f.key])])) as unknown as SegmentSettings
    save.mutate(
      { section: 'segments', body },
      { onSuccess: () => toast.success('Audience definitions saved. All figures now use them.'), onError: (e) => toast.error(e.message) },
    )
  }
  const reset = () =>
    save.mutate(
      { section: 'segments', reset: true },
      { onSuccess: () => toast.success('Restored the default definitions'), onError: (e) => toast.error(e.message) },
    )

  return (
    <Section icon={Target}
      title="Who counts as your target audience"
      description="These keywords decide the UAE, education and decision-maker shares everywhere in the app. Matching ignores case, and a keyword matches anywhere inside LinkedIn’s value (e.g. “dubai” matches “Dubai, United Arab Emirates”). One per line."
      actions={
        <Button size="sm" variant="ghost" onClick={reset} disabled={save.isPending}>
          <RotateCcw /> Restore defaults
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {SEGMENT_FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="mb-1 block">{f.label}</Label>
            <p className="mb-1.5 text-xs text-muted-foreground">{f.hint}</p>
            <Textarea rows={6} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className="font-mono text-xs" />
            <p className="mt-1 text-xs text-muted-foreground">{toList(draft[f.key]).length} entries</p>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Changes apply to all existing posts immediately: every share and estimate is recalculated from the saved breakdowns.
      </p>
      <Button className="mt-4" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save definitions'}
      </Button>
    </Section>
  )
}

// ---------------------------------------------------------------- performance rules

function PerformanceTab({ current, defaults }: { current: PerformanceSettings; defaults: PerformanceSettings }) {
  const save = useSaveSettings()
  // Cut-offs and trend threshold are edited as percentages
  const [f, setF] = useState({
    min_history: String(current.min_history),
    min_slot_posts: String(current.min_slot_posts),
    cut_high: String(Math.round(current.cut_high * 100)),
    cut_above: String(Math.round(current.cut_above * 100)),
    cut_average: String(Math.round(current.cut_average * 100)),
    cut_below: String(Math.round(current.cut_below * 100)),
    trend_threshold: String(Math.round(current.trend_threshold * 100)),
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = () => {
    const pct = (v: string) => Number(v) / 100
    const body: PerformanceSettings = {
      min_history: Number(f.min_history),
      min_slot_posts: Number(f.min_slot_posts),
      cut_high: pct(f.cut_high),
      cut_above: pct(f.cut_above),
      cut_average: pct(f.cut_average),
      cut_below: pct(f.cut_below),
      trend_threshold: pct(f.trend_threshold),
    }
    if (Object.values(body).some((v) => Number.isNaN(v))) return toast.error('All fields need a number')
    save.mutate({ section: 'performance', body }, { onSuccess: () => toast.success('Performance rules saved'), onError: (e) => toast.error(e.message) })
  }
  const reset = () =>
    save.mutate(
      { section: 'performance', reset: true },
      { onSuccess: () => toast.success('Restored the default rules'), onError: (e) => toast.error(e.message) },
    )

  return (
    <Section icon={Gauge}
      title="How performance is judged"
      description="Labels compare each post with the account’s own history at the same checkpoint. Raising the minimums gives more reliable results but needs more posts first."
      actions={
        <Button size="sm" variant="ghost" onClick={reset} disabled={save.isPending}>
          <RotateCcw /> Restore defaults
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Posts needed before labelling" hint={`Default ${defaults.min_history}. Below this, posts show “Insufficient history”.`}>
            <Input type="number" min={3} max={200} value={f.min_history} onChange={set('min_history')} />
          </NumberField>
          <NumberField label="Posts needed in a time slot before suggesting it" hint={`Default ${defaults.min_slot_posts}. Protects against crowning a slot on one lucky post.`}>
            <Input type="number" min={1} max={50} value={f.min_slot_posts} onChange={set('min_slot_posts')} />
          </NumberField>
        </div>

        <div>
          <Label className="mb-1 block">Label cut-offs (percentile within the account’s history)</Label>
          <p className="mb-2 text-xs text-muted-foreground">A post at or above the cut-off gets that label. Anything below “Below average” is “Needs investigation”.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ['cut_high', 'High performer', defaults.cut_high],
                ['cut_above', 'Above average', defaults.cut_above],
                ['cut_average', 'Average', defaults.cut_average],
                ['cut_below', 'Below average', defaults.cut_below],
              ] as const
            ).map(([k, label, d]) => (
              <NumberField key={k} label={label} hint={`Default ${Math.round(d * 100)}`}>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min={1} max={99} value={f[k]} onChange={set(k)} />
                  <span className="text-xs text-muted-foreground">th</span>
                </div>
              </NumberField>
            ))}
          </div>
        </div>

        <NumberField label="Change that counts as a trend" hint={`Default ${Math.round(defaults.trend_threshold * 100)}%. Smaller changes are shown as “Stable”.`}>
          <div className="flex max-w-40 items-center gap-1.5">
            <Input type="number" min={1} max={100} value={f.trend_threshold} onChange={set('trend_threshold')} />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </NumberField>

        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save rules'}
        </Button>
      </div>
    </Section>
  )
}

function NumberField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- Claude

function ClaudeTab() {
  const { data, isLoading } = useClaudeStatus()
  const settings = useSettings()
  if (isLoading || !data) return <Skeleton className="h-48" />
  const u = data.usage
  return (
    <div className="space-y-4">
    {/* What Claude needs that LinkedIn doesn't hold: voice, what to avoid, differentiators.
        Page facts (About, website, specialties) will come from LinkedIn once the page API is connected. */}
    {settings.data ? (
      <BrandKitForm key={JSON.stringify(settings.data.current.brand)} current={settings.data.current.brand} />
    ) : (
      <Skeleton className="h-48" />
    )}
    <Section icon={Sparkles} title="Claude (AI) connection" description="Claude powers Strategy ideas on the Suggestions page. The API key is stored only on the server and is never shown here.">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="mt-1">
            {data.configured ? (
              <span className="inline-flex items-center gap-1.5 text-good-fg">
                <CheckCircle2 className="size-4" /> API key set {data.key_hint && <span className="text-muted-foreground">({data.key_hint})</span>}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-serious-fg">
                <CircleAlert className="size-4" /> Not connected
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Model</dt>
          <dd className="mt-1 font-mono text-xs">{data.model}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Daily limit</dt>
          <dd className="mt-1">{u.daily_limit_per_account} idea runs per account</dd>
        </div>
      </dl>
      {!data.configured && (
        <div className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          To connect: create an API key at console.anthropic.com (with your manager’s approval, since usage is billed), add{' '}
          <code>ANTHROPIC_API_KEY=…</code> to <code>server/.env</code>, and restart the backend. Never paste the key into chat or documents.
        </div>
      )}
    </Section>

    <Section icon={Receipt}
      title="Usage this month"
      description={`Since ${u.month_start_uae} (UAE). Cost is an estimate from token counts and list prices; the Anthropic Console shows the real bill.`}
    >
      <dl className="grid gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Idea runs</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{u.runs}</dd>
          {u.failed_runs > 0 && <dd className="text-xs text-muted-foreground">{u.failed_runs} failed (not billed)</dd>}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tokens read</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{fmtNumber(u.input_tokens)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tokens written</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{fmtNumber(u.output_tokens)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Estimated cost</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">US${u.estimated_cost_usd.toFixed(2)}</dd>
        </div>
      </dl>
    </Section>
    </div>
  )
}
