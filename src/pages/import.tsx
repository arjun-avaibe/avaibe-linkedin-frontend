import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, Section } from '@/components/common'
import { useAccount } from '@/context/account'
import { useImportCsv, useImportLinkedInExport } from '@/hooks/queries'
import type { ExportFileResult, ExportImportResult, ImportResult } from '@/lib/api'
import { fmtNumber } from '@/lib/format'

const KIND_LABEL: Record<string, string> = {
  content: 'Content (posts + daily totals)',
  followers: 'Followers (daily + demographics)',
  visitors: 'Visitors (daily page views + demographics)',
  competitors: 'Competitors',
}

export function ImportPage() {
  const { account } = useAccount()
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        eyebrow="Data"
        title="Import"
        description="Bring in history: LinkedIn's own page-analytics export, or the app's CSV template."
        actions={
          <Link to="/data" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            ← Back to Data
          </Link>
        }
      />
      <LinkedInExportSection accountId={account?.id} accountName={account?.name} accountKind={account?.kind} />
      <CsvSection accountId={account?.id} accountName={account?.name} />
    </div>
  )
}

// ---------------------------------------------------------------- LinkedIn export

function LinkedInExportSection({ accountId, accountName, accountKind }: { accountId?: number; accountName?: string; accountKind?: string }) {
  const [files, setFiles] = useState<File[]>([])
  const [exportedOn, setExportedOn] = useState('')
  const [result, setResult] = useState<ExportImportResult | null>(null)
  const imp = useImportLinkedInExport(accountId ?? 0)

  return (
    <Section
      title={`LinkedIn page export → ${accountName ?? '…'}`}
      description="On LinkedIn: company page → Analytics → Content, Followers and Visitors → Export. Upload the files as they are (.xls or .xlsx). Importing again later updates the same posts instead of duplicating them."
    >
      {accountKind && accountKind !== 'company' && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          These exports come from a company page, but the selected account is a profile. Switch to the company page first unless you are sure.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label className="mb-1.5 block">Files (select all of them at once)</Label>
          <Input
            type="file"
            multiple
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </div>
        <div>
          <Label className="mb-1.5 block">Exported on (optional)</Label>
          <Input type="date" value={exportedOn} onChange={(e) => setExportedOn(e.target.value)} className="w-40" />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Leave the date empty to read it from LinkedIn&apos;s file name. It decides how old each post was when its totals were taken.
      </p>
      <Button
        className="mt-3"
        disabled={!files.length || !accountId || imp.isPending}
        onClick={() =>
          imp.mutate(
            { files, exportedOn: exportedOn || null },
            {
              onSuccess: (r) => {
                setResult(r)
                const created = r.files.reduce((n, f) => n + (f.posts_created ?? 0), 0)
                toast.success(`Imported ${r.files.length} file${r.files.length === 1 ? '' : 's'}${created ? ` · ${created} new posts` : ''}`)
              },
              onError: (e) => toast.error(e.message),
            },
          )
        }
      >
        <Upload /> {imp.isPending ? 'Importing…' : `Import ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
      </Button>

      <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
        <li>
          <b>No posting times:</b> LinkedIn only exports the date. These posts count in day-of-week analysis but stay out of the
          hour-by-hour heatmap. If you know a post&apos;s time, set it on the post.
        </li>
        <li>
          <b>Totals, not snapshots:</b> each post&apos;s numbers are stored as its 7-day figure (or 24h/48h if it was younger at export).
          Snapshots you typed in yourself are never overwritten.
        </li>
        <li>
          <b>To check:</b> formats LinkedIn didn&apos;t label come in as “Not tagged yet”, and topics/CTAs are suggested from the caption.
          Open each post to confirm; saving it marks the topic as confirmed.
        </li>
      </ul>

      {result && (
        <div className="mt-4 space-y-2">
          {result.files.map((f) => (
            <FileResult key={f.file} r={f} />
          ))}
          <p className="text-xs">
            Next: <Link to="/posts" className="underline">check formats and topics</Link> ·{' '}
            <Link to="/" className="underline">open the dashboard</Link> · <Link to="/data?tab=audience" className="underline">see the audience</Link>
          </p>
        </div>
      )}
    </Section>
  )
}

function FileResult({ r }: { r: ExportFileResult }) {
  const failed = r.errors.length > 0 && !r.kind
  const lines: string[] = []
  if (r.posts_created != null) lines.push(`${r.posts_created} posts added, ${r.posts_updated} updated, ${r.snapshots_saved} totals saved`)
  if (r.snapshots_kept_manual) lines.push(`${r.snapshots_kept_manual} hand-entered snapshots kept`)
  if (r.posts_too_new) lines.push(`${r.posts_too_new} posts under a day old at export: no totals stored yet`)
  if (r.days_saved != null) lines.push(`${r.days_saved} days of page activity`)
  if (r.demographic_rows) lines.push(`${r.demographic_rows} demographic rows (total ≈ ${fmtNumber(r.demographic_total ?? null)}) as of ${r.exported_on}`)
  return (
    <div className={`rounded-md border p-3 text-sm ${failed ? 'border-destructive/40 bg-destructive/5' : r.skipped ? 'border-warn/50 bg-warn/10' : ''}`}>
      <div className="flex items-center gap-2 font-medium">
        {failed || r.skipped ? <AlertTriangle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0 text-good-fg" />}
        <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{r.file}</span>
        {r.kind && <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">{KIND_LABEL[r.kind]}</span>}
      </div>
      {r.skipped && <p className="mt-1 text-xs">{r.skipped}</p>}
      {lines.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {r.errors.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-destructive">
          {r.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- CSV template

function CsvSection({ accountId, accountName }: { accountId?: number; accountName?: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const imp = useImportCsv(accountId ?? 0)

  return (
    <Section
      title="App CSV template"
      description="For posts LinkedIn can't export (e.g. founder profiles) or snapshots kept elsewhere. One row = one post at one checkpoint; rows with the same post URL update that post."
    >
      <a href="/api/import/template" download className="inline-flex items-center gap-1.5 text-sm underline">
        <Download className="size-4" /> linkedin_posts_template.csv
      </a>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        <li>Dates are UAE time as YYYY-MM-DD HH:MM. Leave metrics blank if LinkedIn doesn&apos;t report them.</li>
        <li>
          <b>format</b>: image, carousel, video, poll, newsletter or text
        </li>
        <li>
          <b>checkpoint</b>: 1h, 6h, 24h, 48h or 7d. Add one row per checkpoint for the same post URL.
        </li>
        <li>
          <b>hashtags</b>: space-separated; <b>keywords</b>: separated with semicolons
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input type="file" accept=".csv,text/csv" className="max-w-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button
          variant="outline"
          disabled={!file || !accountId || imp.isPending}
          onClick={() =>
            file &&
            imp.mutate(file, {
              onSuccess: (r) => {
                setResult(r)
                toast.success(`Imported: ${r.posts_created} new, ${r.posts_updated} updated`)
              },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          <Upload /> {imp.isPending ? 'Importing…' : `Import into ${accountName ?? '…'}`}
        </Button>
      </div>
      {result && (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            {result.posts_created} posts created · {result.posts_updated} updated · {result.snapshots_saved} snapshots saved
          </p>
          {result.errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="mb-1 font-medium">{result.errors.length} rows skipped</p>
              <ul className="space-y-0.5 text-xs">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}
