import { useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, PageHeader, SimpleSelect } from '@/components/common'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { useAccountDoc, useSaveAccountDoc } from '@/hooks/queries'
import type { Competitor, CompetitorSegment } from '@/lib/api'
import { fmtNumber } from '@/lib/format'
import { AreaPage } from '@/pages/suggestions'

// ---------------------------------------------------------------- Brand suggestions

export function BrandSuggestionsPage() {
  return <AreaPage areaId="brand" eyebrow="Brand" title="Brand suggestions" />
}

// ---------------------------------------------------------------- Competitors

const SEGMENTS: Record<CompetitorSegment, string> = {
  software: 'Custom software',
  erp: 'ERP / CRM',
  edtech: 'Education technology',
  it_services: 'IT services',
  agency: 'Digital agency',
  other: 'Other',
}

export function CompetitorsPage() {
  const { account } = useAccount()
  const auth = useAuth()
  const { data: doc, isLoading } = useAccountDoc(account?.id, 'competitors')
  const save = useSaveAccountDoc(account?.id ?? 0, 'competitors')
  const [editing, setEditing] = useState<Competitor | 'new' | null>(null)
  const list = doc?.data.competitors ?? []
  const canEdit = auth.can('editor')

  const store = (next: Competitor[], msg: string) =>
    save.mutate({ competitors: next }, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(e.message) })

  return (
    <div className="mx-auto max-w-page">
      <PageHeader
        eyebrow="Brand"
        title="Competitors"
        description="UAE software, ERP, edtech and IT companies you compete with: what they publicly do, and where AVAIBE can be different. Use public information only."
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus /> Add competitor
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : list.length === 0 ? (
        <EmptyState>
          No competitors yet. Add the companies UAE buyers compare AVAIBE with. Their names are also given to Claude, so ideas can position against
          them.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((c) => (
            <CompetitorCard
              key={c.id}
              c={c}
              canEdit={canEdit}
              onEdit={() => setEditing(c)}
              onDelete={() => store(list.filter((x) => x.id !== c.id), `${c.name} removed`)}
            />
          ))}
        </div>
      )}

      {editing && (
        <CompetitorDialog
          initial={editing === 'new' ? undefined : editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            const next = editing === 'new' ? [...list, c] : list.map((x) => (x.id === c.id ? c : x))
            store(next, editing === 'new' ? `${c.name} added` : 'Saved')
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function CompetitorCard({ c, canEdit, onEdit, onDelete }: { c: Competitor; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{c.name}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{SEGMENTS[c.segment]}</Badge>
            {c.website && (
              <a href={c.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                Website <ExternalLink className="size-3" />
              </a>
            )}
            {c.linkedin_url && (
              <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                LinkedIn <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={onEdit}>
              <Pencil />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={onDelete}>
              <Trash2 />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Observed (public)</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>Followers: {c.followers != null ? fmtNumber(c.followers) : '—'}</span>
            <span>Posts / week: {c.posts_per_week ?? '—'}</span>
            {c.checked_on && <span className="text-muted-foreground">checked {c.checked_on}</span>}
          </div>
          {c.topics && <p className="mt-1 text-xs">Topics: {c.topics}</p>}
          {c.positioning && <p className="mt-1 text-xs italic">“{c.positioning}”</p>}
        </div>
        {(c.strengths || c.opportunity) && (
          <div className="rounded-md bg-muted/60 p-2.5">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Our view (interpretation)</div>
            {c.strengths && <p className="text-xs">Does well: {c.strengths}</p>}
            {c.opportunity && <p className="mt-1 text-xs">Where AVAIBE can be different: {c.opportunity}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CompetitorDialog({
  initial,
  saving,
  onClose,
  onSave,
}: {
  initial?: Competitor
  saving: boolean
  onClose: () => void
  onSave: (c: Competitor) => void
}) {
  const [c, setC] = useState<Competitor>(
    initial ?? { id: Math.random().toString(36).slice(2, 12), name: '', segment: 'software' },
  )
  const set = <K extends keyof Competitor>(k: K, v: Competitor[K]) => setC((x) => ({ ...x, [k]: v }))
  const text = (k: keyof Competitor) => (e: { target: { value: string } }) => set(k, (e.target.value || null) as never)
  const num = (k: 'followers' | 'posts_per_week') => (e: { target: { value: string } }) =>
    set(k, e.target.value === '' ? null : Number(e.target.value))

  const submit = () => {
    if (!c.name.trim()) return toast.error('Give the competitor a name')
    for (const k of ['website', 'linkedin_url'] as const) {
      const v = c[k]
      if (v && !/^https?:\/\/\S+$/.test(v)) return toast.error(`${k === 'website' ? 'Website' : 'LinkedIn'} must be a full link starting with https://`)
    }
    onSave({ ...c, name: c.name.trim() })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit ${initial.name}` : 'Add competitor'}</DialogTitle>
          <DialogDescription>Keep what you observed publicly apart from your own interpretation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 block">Name *</Label>
              <Input value={c.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">Type</Label>
              <SimpleSelect
                value={c.segment}
                onChange={(v) => set('segment', v as CompetitorSegment)}
                options={Object.entries(SEGMENTS).map(([value, label]) => ({ value, label }))}
                className="h-8 w-full"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Website</Label>
              <Input value={c.website ?? ''} onChange={text('website')} placeholder="https://…" />
            </div>
            <div>
              <Label className="mb-1.5 block">LinkedIn page</Label>
              <Input value={c.linkedin_url ?? ''} onChange={text('linkedin_url')} placeholder="https://www.linkedin.com/company/…" />
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Observed (public)</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1.5 block text-xs">Followers</Label>
                <Input type="number" min={0} value={c.followers ?? ''} onChange={num('followers')} />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Posts per week (approx.)</Label>
                <Input type="number" min={0} step="0.5" value={c.posts_per_week ?? ''} onChange={num('posts_per_week')} />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Checked on</Label>
                <Input type="date" value={c.checked_on ?? ''} onChange={text('checked_on')} />
              </div>
              <div className="sm:col-span-3">
                <Label className="mb-1.5 block text-xs">Main topics they post about</Label>
                <Input value={c.topics ?? ''} maxLength={400} onChange={text('topics')} placeholder="e.g. ERP case studies, VAT, hiring" />
              </div>
              <div className="sm:col-span-3">
                <Label className="mb-1.5 block text-xs">How they describe themselves (their tagline or About)</Label>
                <Textarea rows={2} value={c.positioning ?? ''} maxLength={600} onChange={text('positioning')} />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">Our view (interpretation)</div>
            <div className="grid gap-3">
              <div>
                <Label className="mb-1.5 block text-xs">What they do well</Label>
                <Textarea rows={2} value={c.strengths ?? ''} maxLength={600} onChange={text('strengths')} />
              </div>
              <div>
                <Label className="mb-1.5 block text-xs">Where AVAIBE can be different</Label>
                <Textarea rows={2} value={c.opportunity ?? ''} maxLength={600} onChange={text('opportunity')} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {initial ? 'Save' : 'Add competitor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
