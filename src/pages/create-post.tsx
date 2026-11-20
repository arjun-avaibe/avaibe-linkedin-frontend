/**
 * Create post (and Edit post): write, check and schedule a LinkedIn post on one page.
 * Left: the post. Right: AI suggestions, which only run when someone clicks Analyse (opening the page costs nothing).
 * Scheduling still follows the approval flow: an approver's "Schedule post" saves and approves in one step;
 * anyone else's sends the draft for approval.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlignLeft,
  BarChart3,
  CalendarClock,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Hash,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Lightbulb,
  LineChart,
  MessagesSquare,
  Paperclip,
  MousePointerClick,
  PenSquare,
  PlayCircle,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  TriangleAlert,
  Type,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect } from '@/components/common'
import { PostingTimeHint } from '@/components/posting-time-hint'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { isoToZonedInput, UAE, useTz, zonedInputToIso, zoneLabel } from '@/context/timezone'
import { usePlanned, usePlannerMutation } from '@/hooks/queries'
import {
  api,
  PLANNED_FORMATS,
  type PlannedDetails,
  type PlannedFormat,
  type PlannedPost,
  type PlannedPostInput,
  type ChatTurn,
  type PostAssistResult,
} from '@/lib/api'
import { PLANNED_FORMAT_LABELS } from '@/lib/publishing'
import { cn } from '@/lib/utils'
import { fetchAsFile, prepareForAI } from '@/lib/attachment'
import { CarouselGenerator, ImageGenerator } from '@/components/image-gen'

const MAX_CHARS = 3000
const MAX_INSTRUCTIONS = 500

export const DURATION_LABELS: Record<NonNullable<PlannedDetails['duration']>, string> = { '1d': '1 day', '3d': '3 days', '1w': '1 week', '2w': '2 weeks' }

const FORMAT_ICON: Record<PlannedFormat, typeof Type> = {
  text: Type,
  image: ImageIcon,
  carousel: Layers,
  video: PlayCircle,
  article: FileText,
  poll: BarChart3,
}

/** Roughly what LinkedIn shows before "…see more": the first 3 lines, cut at about 210 characters. Approximate: it varies by device. */
export function hookPreview(caption: string): string {
  const lines = caption.trim().split('\n').slice(0, 3).join(' ').replace(/\s+/g, ' ')
  return lines.length > 210 ? `${lines.slice(0, 210).trimEnd()}…` : lines
}

/** A small rounded icon tile, used in card headings */
function IconTile({ icon: Icon, className }: { icon: typeof Type; className?: string }) {
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary', className)}>
      <Icon className="size-4.5" />
    </span>
  )
}

// ---------------------------------------------------------------- the page

export function CreatePostPage() {
  const { id } = useParams()
  const { account } = useAccount()
  const { data: planned, isLoading } = usePlanned(account?.id)
  const editing = id ? planned?.find((p) => p.id === Number(id)) : undefined

  if (!account) return null
  if (id && isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />
  if (id && !editing) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">
        This post isn’t in {account.name}’s queue. It may belong to another account or have been deleted.{' '}
        <Link to="/publishing" className="underline">
          Back to Publishing
        </Link>
      </div>
    )
  }
  // key: switching between posts (or to a new one) starts from a clean form
  return <Editor key={editing?.id ?? 'new'} accountId={account.id} accountName={account.name} initial={editing} />
}

function Editor({ accountId, accountName, initial }: { accountId: number; accountName: string; initial?: PlannedPost }) {
  const tz = useTz()
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Lock the zone while editing so a zone switch can't reinterpret the typed time
  const [zone] = useState(tz.zone)
  const formatParam = params.get('format') as PlannedFormat | null
  const [format, setFormat] = useState<PlannedFormat>(initial?.format ?? (formatParam && PLANNED_FORMATS.includes(formatParam) ? formatParam : 'text'))
  const [details, setDetails] = useState<PlannedDetails>(initial?.details ?? {})
  const setDetail = <K extends keyof PlannedDetails>(k: K, v: PlannedDetails[K]) => setDetails((d) => ({ ...d, [k]: v }))
  const [media, setMedia] = useState<File | null>(null)
  const manual = format !== 'text' && format !== 'image'
  // Generate with AI: the image prompt (Analyse can fill it) and, for carousels, generate vs upload
  const [genPrompt, setGenPrompt] = useState('')
  const [carouselSource, setCarouselSource] = useState<'generate' | 'upload'>(initial?.has_media ? 'upload' : 'generate')

  const [caption, setCaption] = useState(initial?.caption ?? '')
  // From the Calendar: ?new_at=<ISO time> pre-fills the date and time
  const newAt = params.get('new_at')
  const startAt = initial?.scheduled_at ?? (newAt && !Number.isNaN(Date.parse(newAt)) ? newAt : null)
  const [scheduled, setScheduled] = useState(startAt ? isoToZonedInput(startAt, zone) : '')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'CONNECTIONS'>(initial?.visibility ?? 'PUBLIC')
  const [topic, setTopic] = useState(initial?.topic ?? '')
  const [industry, setIndustry] = useState(initial?.industry ?? '')
  const [cta, setCta] = useState(initial?.cta ?? '')
  const [imageAlt, setImageAlt] = useState(initial?.image_alt ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState<'draft' | 'schedule' | null>(null)
  const [preview, setPreview] = useState(false)
  const refresh = usePlannerMutation(accountId, async () => undefined)
  const canApprove = auth.can('approver')
  const canEdit = auth.can('editor')
  const over = caption.length > MAX_CHARS

  const save = async (mode: 'draft' | 'schedule') => {
    if (!caption.trim()) return toast.error('Write the post text first')
    if (over) return toast.error(`LinkedIn allows ${MAX_CHARS.toLocaleString()} characters`)
    const options = (details.options ?? []).map((o) => o.trim()).filter(Boolean)
    if (format === 'poll' && (!details.question?.trim() || options.length < 2)) return toast.error('A poll needs a question and at least 2 options')
    if (mode === 'schedule' && !scheduled) return toast.error(manual ? 'Pick the planned date first' : 'Pick a date and time to schedule it')
    const body: PlannedPostInput = {
      account_id: accountId,
      format,
      details: format === 'poll' ? { ...details, options } : details,
      caption,
      image_alt: imageAlt.trim() || null,
      visibility,
      scheduled_at: scheduled ? zonedInputToIso(scheduled, zone) : null,
      topic: topic.trim() || null,
      industry: industry.trim() || null,
      cta: cta.trim() || null,
      keywords: [],
    }
    setSaving(mode)
    try {
      const saved = initial ? await api.updatePlanned(initial.id, body) : await api.createPlanned(body)
      // The server removes files that don't belong to a changed format
      if (format === 'image' && removeImage && initial?.has_image) await api.removePlannedImage(saved.id)
      if (format === 'image' && file) await api.uploadPlannedImage(saved.id, file)
      if ((format === 'carousel' || format === 'video') && media) await api.uploadPlannedMedia(saved.id, media)
      if (mode === 'schedule' && canApprove) {
        await api.plannedAction(saved.id, 'approve')
        toast.success(manual ? 'Approved and planned. Post it on LinkedIn by hand at that time.' : 'Scheduled')
      } else if (mode === 'schedule') {
        toast.success('Saved and sent for approval. It will be scheduled once an approver approves it.')
      } else {
        toast.success(initial ? 'Saved as a draft. It needs approval again before it can be published.' : 'Draft saved')
      }
      refresh.mutate(undefined)
      navigate('/publishing')
    } catch (e) {
      toast.error((e as Error).message)
      refresh.mutate(undefined)
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Breadcrumb and title */}
      <nav className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link to="/publishing" className="hover:text-foreground">
          Content
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">{initial ? 'Edit post' : 'Create post'}</span>
      </nav>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight">{initial ? 'Edit post' : 'Create post'}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Write, check and schedule a LinkedIn post for {accountName}. AI suggestions run only when you click Analyse.
      </p>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        {/* ---------------- left: the post */}
        <section className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
          <header className="flex items-center gap-3 border-b px-6 py-4">
            <IconTile icon={PenSquare} />
            <h2 className="text-lg font-semibold">{initial ? 'Edit post' : 'New post'}</h2>
            <Button variant="outline" className="ml-auto" onClick={() => setPreview(true)} disabled={!caption.trim()}>
              <Eye /> Preview
            </Button>
          </header>

          <div className="space-y-5 px-6 py-5">
            <div>
              <Label className="mb-2 block font-semibold">Format</Label>
              <div className="flex flex-wrap gap-1.5">
                {PLANNED_FORMATS.map((f) => {
                  const Icon = FORMAT_ICON[f]
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium ring-1 transition-colors',
                        format === f ? 'bg-primary text-primary-foreground ring-transparent shadow-sm' : 'bg-card text-foreground ring-border hover:bg-muted',
                      )}
                    >
                      <Icon className="size-3.5" />
                      {PLANNED_FORMAT_LABELS[f]}
                    </button>
                  )
                })}
              </div>
              {manual && <p className="mt-2 text-xs text-muted-foreground">The app can’t publish this format yet: it will be posted on LinkedIn by hand.</p>}
            </div>

            <div>
              <Label className="mb-2 block font-semibold">
                {format === 'article' ? 'Intro post text' : 'Post text'} <span className="text-bad-fg">*</span>
              </Label>
              <Textarea
                rows={9}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={'Hook line first: it is all most people see.\n\n…\n\n#UAE #EdTech'}
                className="min-h-48 rounded-xl text-[15px] leading-relaxed"
              />
              <div className={cn('mt-1.5 flex justify-between text-xs', over ? 'text-bad-fg' : 'text-muted-foreground')}>
                <span>Hashtags written as #tag become clickable.</span>
                <span className="tabular-nums">
                  {caption.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                </span>
              </div>
            </div>

            <FormatFields
              format={format}
              details={details}
              setDetail={setDetail}
              media={media}
              setMedia={setMedia}
              initial={initial}
              file={file}
              setFile={setFile}
              removeImage={removeImage}
              setRemoveImage={setRemoveImage}
              imageAlt={imageAlt}
              setImageAlt={setImageAlt}
              imageGen={
                <ImageGenerator
                  accountId={accountId}
                  prompt={genPrompt}
                  setPrompt={setGenPrompt}
                  onUse={(f) => {
                    setFile(f)
                    setRemoveImage(false)
                  }}
                />
              }
              carousel={{
                source: carouselSource,
                setSource: setCarouselSource,
                generator: (
                  <CarouselGenerator
                    accountId={accountId}
                    draft={{ caption, topic, industry, cta }}
                    title={details.document_title ?? ''}
                    onTitle={(t) => setDetail('document_title', t)}
                    onUse={(pdf) => {
                      setMedia(pdf)
                      setCarouselSource('upload') // shows the attached PDF; saving uploads it
                    }}
                  />
                ),
              }}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="mb-2 block font-semibold">
                  {manual ? 'Planned date' : 'Publish at'} ({zoneLabel(zone)})
                </Label>
                <div className="relative">
                  <CalendarClock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} className="h-10 rounded-xl pl-9" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scheduled && zone !== UAE
                    ? `= ${isoToZonedInput(zonedInputToIso(scheduled, zone), UAE).replace('T', ' ')} UAE`
                    : manual
                      ? 'For planning only: the app won’t post this format.'
                      : 'Leave empty to keep it as an unscheduled draft.'}
                </p>
              </div>
              <div className={cn(manual && 'invisible')}>
                <Label className="mb-2 block font-semibold">Who can see it</Label>
                <div className="flex items-center gap-2 [&>label]:flex-1">
                  <Globe className="size-4 shrink-0 text-muted-foreground" />
                  <SimpleSelect
                    value={visibility}
                    onChange={(v) => setVisibility(v as 'PUBLIC' | 'CONNECTIONS')}
                    options={[
                      { value: 'PUBLIC', label: 'Anyone (public)' },
                      { value: 'CONNECTIONS', label: 'Connections only' },
                    ]}
                    className="h-10 w-full flex-1 rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Best time to post for the chosen day, from this account's own past posts */}
            <PostingTimeHint accountId={accountId} scheduled={scheduled} zone={zone} onPick={setScheduled} />

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="mb-2 block font-semibold">Topic</Label>
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. LMS" className="h-10 rounded-xl" />
              </div>
              <div>
                <Label className="mb-2 block font-semibold">Industry</Label>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Education" className="h-10 rounded-xl" />
              </div>
              <div>
                <Label className="mb-2 block font-semibold">CTA</Label>
                <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. Comment LMS" className="h-10 rounded-xl" />
              </div>
            </div>
          </div>

          <footer className="mt-auto flex flex-wrap items-center justify-end gap-3 border-t bg-muted/30 px-6 py-4">
            {!canApprove && canEdit && <span className="mr-auto text-xs text-muted-foreground">Scheduling sends it to an approver first.</span>}
            <Button variant="outline" size="lg" onClick={() => save('draft')} disabled={!canEdit || !!saving}>
              {saving === 'draft' ? 'Saving…' : 'Save as draft'}
            </Button>
            <Button size="lg" onClick={() => save('schedule')} disabled={!canEdit || !!saving}>
              <CalendarClock /> {saving === 'schedule' ? 'Saving…' : canApprove ? 'Schedule post' : 'Send for approval'}
            </Button>
          </footer>
        </section>

        {/* ---------------- right: AI suggestions */}
        <AiPanel
          accountId={accountId}
          visual={visualFor(format, { file, media, removeImage, initial })}
          draft={{ format, caption, topic, industry, cta }}
          onImagePrompt={(text) => {
            setGenPrompt(text)
            if (format !== 'image') setFormat('image')
            toast.success('Prompt added to Generate with AI under Image')
          }}
          onUseText={(text) => {
            const before = caption
            setCaption(text)
            toast.success('Post text replaced', { action: { label: 'Undo', onClick: () => setCaption(before) } })
          }}
        />
      </div>

      <PreviewDialog
        open={preview}
        onClose={() => setPreview(false)}
        accountName={accountName}
        caption={caption}
        format={format}
        details={details}
        image={file}
        hasStoredImage={!!initial?.has_image && !removeImage}
      />
    </div>
  )
}

// ---------------------------------------------------------------- per-format fields

function FormatFields(props: {
  format: PlannedFormat
  details: PlannedDetails
  setDetail: <K extends keyof PlannedDetails>(k: K, v: PlannedDetails[K]) => void
  media: File | null
  setMedia: (f: File | null) => void
  initial?: PlannedPost
  file: File | null
  setFile: (f: File | null) => void
  removeImage: boolean
  setRemoveImage: (v: boolean) => void
  imageAlt: string
  setImageAlt: (v: string) => void
  imageGen: React.ReactNode
  carousel: { source: 'generate' | 'upload'; setSource: (s: 'generate' | 'upload') => void; generator: React.ReactNode }
}) {
  const { format, details, setDetail, media, setMedia, initial, file, setFile, removeImage, setRemoveImage, imageAlt, setImageAlt, imageGen, carousel } = props
  if (format === 'image') {
    return (
      <div>
        <Label className="mb-2 block font-semibold">Image</Label>
        {initial?.has_image && !removeImage && !file && (
          <div className="mb-2 flex items-center gap-3">
            <img src={api.plannedImageUrl(initial.id, initial.approved_at ?? 'x')} alt="" className="size-16 rounded-lg object-cover" />
            <Button size="xs" variant="outline" onClick={() => setRemoveImage(true)}>
              Remove image
            </Button>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground hover:bg-muted">
          <ImagePlus className="size-4" />
          {file ? file.name : initial?.has_image && !removeImage ? 'Replace image (JPG, PNG or GIF, max 10 MB)' : 'Add an image (JPG, PNG or GIF, max 10 MB)'}
          <input type="file" accept="image/jpeg,image/png,image/gif" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {(file || (initial?.has_image && !removeImage)) && (
          <Input className="mt-2 h-10 rounded-xl" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} placeholder="Alt text: describe the image for screen readers" />
        )}
        {file && file.name.startsWith('ai-image-') && <FilePreview file={file} />}
        <div className="mt-3">{imageGen}</div>
      </div>
    )
  }
  if (format === 'carousel') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="block font-semibold">Carousel</Label>
          <div role="tablist" aria-label="Carousel source" className="ml-auto flex rounded-lg bg-secondary p-1">
            {(['generate', 'upload'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={carousel.source === m}
                onClick={() => carousel.setSource(m)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  carousel.source === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'generate' ? 'Generate with AI' : media || initial?.has_media ? 'Attached PDF' : 'Upload a PDF'}
              </button>
            ))}
          </div>
        </div>
        <Input
          value={details.document_title ?? ''}
          onChange={(e) => setDetail('document_title', e.target.value)}
          maxLength={100}
          className="h-10 rounded-xl"
          placeholder="Document title shown on LinkedIn, e.g. 5 signs your school has outgrown its LMS"
        />
        {carousel.source === 'generate' ? (
          carousel.generator
        ) : (
          <>
            <MediaPicker accept="application/pdf" label="the PDF (up to 100 MB)" file={media} onFile={setMedia} current={initial?.has_media ? initial : undefined} />
            <p className="text-xs text-muted-foreground">LinkedIn carousels are PDF documents: one slide per page. Make the first slide the hook.</p>
          </>
        )}
      </div>
    )
  }
  if (format === 'video') {
    return (
      <div className="space-y-2">
        <Label className="block font-semibold">Video</Label>
        <MediaPicker accept="video/mp4,video/quicktime" label="the video (MP4 or MOV, up to 200 MB)" file={media} onFile={setMedia} current={initial?.has_media ? initial : undefined} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!details.subtitles} onChange={(e) => setDetail('subtitles', e.target.checked)} />
          Subtitles added (many people watch with the sound off)
        </label>
      </div>
    )
  }
  if (format === 'article') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="mb-2 block font-semibold">Article / newsletter title</Label>
          <Input value={details.title ?? ''} onChange={(e) => setDetail('title', e.target.value)} maxLength={150} className="h-10 rounded-xl" placeholder="e.g. Gulf business-tech brief: November" />
        </div>
        <div>
          <Label className="mb-2 block font-semibold">Link (if already published)</Label>
          <Input value={details.link ?? ''} onChange={(e) => setDetail('link', e.target.value)} className="h-10 rounded-xl" placeholder="https://…" />
        </div>
      </div>
    )
  }
  if (format === 'poll') {
    return (
      <div className="space-y-2">
        <Label className="block font-semibold">
          Poll question <span className="text-bad-fg">*</span>
        </Label>
        <Input value={details.question ?? ''} onChange={(e) => setDetail('question', e.target.value)} maxLength={140} className="h-10 rounded-xl" placeholder="e.g. What slows down your ERP project most?" />
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Input
              key={i}
              value={details.options?.[i] ?? ''}
              maxLength={30}
              className="h-10 rounded-xl"
              placeholder={`Option ${i + 1}${i < 2 ? ' *' : ' (optional)'}`}
              onChange={(e) => {
                const next = [...(details.options ?? [])]
                while (next.length <= i) next.push('')
                next[i] = e.target.value
                setDetail('options', next)
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Runs for</span>
          <SimpleSelect
            value={details.duration ?? '1w'}
            onChange={(v) => setDetail('duration', v as PlannedDetails['duration'])}
            options={Object.entries(DURATION_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <p className="text-xs text-muted-foreground">LinkedIn polls: question up to 140 characters, 2 to 4 options of up to 30 characters.</p>
      </div>
    )
  }
  return null
}

/** A chosen image file shown on the page (the temporary link is released when it changes) */
function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url ? <img src={url} alt="" className="mt-2 max-h-48 rounded-lg ring-1 ring-border" /> : null
}

export function MediaPicker({
  accept,
  label,
  file,
  onFile,
  current,
}: {
  accept: string
  label: string
  file: File | null
  onFile: (f: File | null) => void
  current?: PlannedPost
}) {
  return (
    <div>
      {current && !file && (
        <a href={api.plannedMediaUrl(current.id)} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1 text-xs underline">
          Current file: {current.media_name ?? 'open'} <ExternalLink className="size-3" />
        </a>
      )}
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground hover:bg-muted">
        <Upload className="size-4" />
        {file ? file.name : current ? `Replace ${label}` : `Attach ${label} for the approver to review`}
        <input type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  )
}

// ---------------------------------------------------------------- AI suggestions (only on Analyse)

type Draft = { format: PlannedFormat; caption: string; topic: string; industry: string; cta: string }

/** The post's image or PDF (or video, which the AI can't read), new or saved earlier */
type Visual = { key: string; name: string; kind: 'image' | 'pdf' | 'video'; load: () => Promise<File> } | null

function visualFor(
  format: PlannedFormat,
  { file, media, removeImage, initial }: { file: File | null; media: File | null; removeImage: boolean; initial?: PlannedPost },
): Visual {
  if (format === 'image') {
    if (file) return { key: `new:${file.name}:${file.size}`, name: file.name, kind: 'image', load: async () => file }
    if (initial?.has_image && !removeImage) {
      const url = api.plannedImageUrl(initial.id, initial.approved_at ?? 'x')
      return { key: `saved-image:${initial.id}`, name: 'the saved image', kind: 'image', load: () => fetchAsFile(url, 'image.jpg') }
    }
  }
  if (format === 'carousel' || format === 'video') {
    const kind = format === 'carousel' ? 'pdf' : 'video'
    if (media) return { key: `new:${media.name}:${media.size}`, name: media.name, kind, load: async () => media }
    if (initial?.has_media && initial.format === format) {
      const name = initial.media_name ?? (kind === 'pdf' ? 'carousel.pdf' : 'video')
      return { key: `saved-media:${initial.id}`, name, kind, load: () => fetchAsFile(api.plannedMediaUrl(initial.id), name) }
    }
  }
  return null
}

/** Shown once above both AI modes: which visual goes along, with a switch to leave it out */
function VisualChip({ visual, include, setInclude }: { visual: NonNullable<Visual>; include: boolean; setInclude: (v: boolean) => void }) {
  if (visual.kind === 'video') {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">
        <Paperclip className="size-3.5 shrink-0" /> The AI can’t watch videos, so it works from the text only.
      </p>
    )
  }
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-2.5 text-xs">
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">
          The AI will also look at <span className="font-medium">{visual.name}</span>
          {visual.kind === 'pdf' ? ' (every slide)' : ''}
        </span>
      </label>
      {include && visual.kind === 'pdf' && (
        <p className="mt-1 pl-6 text-muted-foreground">
          A PDF makes each request cost more (roughly $0.05–0.15 for a 10-slide deck). In Chat it’s cached after the first message, so
          later messages cost much less.
        </p>
      )}
    </div>
  )
}
const TABS = [
  { value: 'suggestions', label: 'Suggestions', icon: Sparkles },
  { value: 'competitors', label: 'Competitor insights', icon: LineChart },
  { value: 'ideas', label: 'Content ideas', icon: Lightbulb },
] as const
const FIX_ICON = { hashtags: Hash, shorter: AlignLeft, cta: MousePointerClick } as const

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied')
  } catch {
    toast.error('Couldn’t copy: select the text and copy it instead')
  }
}

function AnalyseMode({
  accountId,
  draft,
  onUseText,
  getAttachment,
  onImagePrompt,
}: {
  accountId: number
  draft: Draft
  onUseText: (text: string) => void
  getAttachment: () => Promise<File | null>
  onImagePrompt: (text: string) => void
}) {
  const auth = useAuth()
  const [instructions, setInstructions] = useState('')
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('suggestions')
  const [analysed, setAnalysed] = useState<{ result: PostAssistResult; caption: string; cost: number } | null>(null)
  const status = useQuery({ queryKey: ['post-assist', accountId], queryFn: () => api.postAssistStatus(accountId), staleTime: 30_000 })
  const run = useMutation({
    mutationFn: async () =>
      api.postAssist(
        {
          account_id: accountId,
          format: draft.format,
          caption: draft.caption,
          topic: draft.topic.trim() || null,
          industry: draft.industry.trim() || null,
          cta: draft.cta.trim() || null,
          instructions: instructions.trim() || null,
        },
        await getAttachment(),
      ),
    onSuccess: (r) => {
      setAnalysed({ result: r.result, caption: draft.caption, cost: r.cost_usd })
      setTab('suggestions')
      status.refetch()
    },
    onError: (e) => toast.error((e as Error).message),
  })
  useEffect(() => {
    setAnalysed(null)
  }, [accountId])

  const configured = status.data?.configured
  const left = status.data ? status.data.daily_limit - status.data.runs_today : null
  const stale = analysed && analysed.caption !== draft.caption
  const r = analysed?.result

  return (
      <div className="space-y-4">
        <div className="rounded-xl ring-1 ring-border">
          <div className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" /> Instructions for the AI <span className="font-normal text-muted-foreground">(optional)</span>
          </div>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
            rows={2}
            className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            placeholder="e.g. Make it more engaging, focus on school principals, add a stronger CTA, or suggest a visual idea…"
          />
          <div className="flex flex-wrap items-center gap-3 border-t px-4 py-2.5">
            <Button onClick={() => run.mutate()} disabled={!configured || !draft.caption.trim() || run.isPending || !auth.can('editor') || left === 0}>
              <Sparkles /> {run.isPending ? 'Analysing…' : analysed ? 'Analyse again' : 'Analyse'}
            </Button>
            <span className="text-xs text-muted-foreground">
              {!draft.caption.trim() ? 'Write some post text first.' : left != null && configured ? `${left} of ${status.data!.daily_limit} analyses left today` : ''}
            </span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {instructions.length} / {MAX_INSTRUCTIONS}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium ring-1 transition-colors',
                tab === t.value ? 'bg-primary/10 text-primary ring-primary/30' : 'text-muted-foreground ring-border hover:text-foreground',
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </div>

        {run.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : !r ? (
          <div className="rounded-xl border border-dashed px-6 py-10 text-center">
            <Sparkles className="mx-auto mb-3 size-6 text-primary/60" />
            <p className="text-sm font-medium">Nothing is sent to the AI until you click Analyse</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              You’ll get an improved version of the text, an image idea, quick fixes (hashtags, shorter, stronger CTA), notes from your
              Competitors page and follow-up post ideas.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {stale && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">You’ve edited the text since this analysis. Click “Analyse again” to refresh it.</p>}

            {tab === 'suggestions' && (
              <>
                <Block icon={Type} title="Improved post text" action={<Button variant="outline" size="sm" onClick={() => onUseText(r.improved_text)}>Use this</Button>}>
                  <TextBox text={r.improved_text} />
                  {r.what_changed.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {r.what_changed.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </Block>

                {r.image_prompt && (
                  <Block
                    icon={ImageIcon}
                    title="Image suggestion (prompt)"
                    subtitle="Generate it with the image AI, or brief your designer with it."
                    action={
                      <Button variant="outline" size="sm" onClick={() => onImagePrompt(r.image_prompt!)}>
                        Use for image
                      </Button>
                    }
                  >
                    <TextBox text={r.image_prompt} />
                  </Block>
                )}

                {r.cautions.length > 0 && (
                  <div className="flex gap-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <ul className="space-y-1">
                      {r.cautions.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="size-4 text-primary" /> Other suggestions
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {r.quick_fixes.map((f) => {
                      const Icon = FIX_ICON[f.kind]
                      return (
                        <button
                          key={f.kind}
                          type="button"
                          onClick={() => onUseText(f.text)}
                          title="Replace the post text with this version"
                          className="flex items-start gap-2.5 rounded-xl p-3 text-left ring-1 ring-border transition-colors hover:bg-muted"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="size-3.5" />
                          </span>
                          <span className="text-xs leading-snug font-medium">{f.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {tab === 'competitors' &&
              (r.competitor_insights.length ? (
                <Block icon={LineChart} title="From your Competitors page">
                  <ul className="list-disc space-y-1.5 pl-5 text-sm">
                    {r.competitor_insights.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">Based only on what your team recorded about competitors, not live data.</p>
                </Block>
              ) : (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No competitor notes to draw on.{' '}
                  <Link to="/brand/competitors" className="underline">
                    Add competitors
                  </Link>{' '}
                  and what you’ve observed about them, then analyse again.
                </p>
              ))}

            {tab === 'ideas' && (
              <div className="space-y-2">
                {r.content_ideas.map((i) => {
                  const Icon = FORMAT_ICON[i.format] ?? Lightbulb
                  return (
                    <div key={i.title} className="flex gap-3 rounded-xl p-4 ring-1 ring-border">
                      <IconTile icon={Icon} className="size-8" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{i.title}</div>
                        <div className="mt-0.5 text-sm text-muted-foreground">{i.angle}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{PLANNED_FORMAT_LABELS[i.format] ?? i.format}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-right text-[11px] text-muted-foreground">This analysis cost about ${analysed!.cost.toFixed(3)}</p>
          </div>
        )}
      </div>
  )
}

// ---------------------------------------------------------------- the AI card: Analyse (one shot) or Chat with AI (interactive)

const MODES = [
  { value: 'analyse', label: 'Analyse', icon: Sparkles },
  { value: 'chat', label: 'Chat with AI', icon: MessagesSquare },
] as const

function AiPanel({
  accountId,
  visual,
  draft,
  onUseText,
  onImagePrompt,
}: {
  accountId: number
  visual: Visual
  draft: Draft
  onUseText: (text: string) => void
  onImagePrompt: (text: string) => void
}) {
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('analyse')
  const [include, setInclude] = useState(true)
  // The prepared (shrunk) file is kept, so a chat doesn't re-process it on every message
  const prepared = useRef<{ key: string; file: File } | null>(null)
  const getAttachment = async (): Promise<File | null> => {
    if (!visual || !include || visual.kind === 'video') return null
    if (prepared.current?.key !== visual.key) prepared.current = { key: visual.key, file: await prepareForAI(await visual.load()) }
    return prepared.current.file
  }
  const status = useQuery({ queryKey: ['post-assist', accountId], queryFn: () => api.postAssistStatus(accountId), staleTime: 30_000 })
  return (
    <section className="rounded-2xl bg-card shadow-sm ring-1 ring-border">
      <header className="flex flex-wrap items-start gap-3 px-6 pt-5">
        <Sparkles className="mt-0.5 size-7 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight">AI suggestions</h2>
          <p className="text-sm text-muted-foreground">Improve your post, get ideas and data-backed recommendations.</p>
        </div>
        <div role="tablist" aria-label="AI mode" className="flex rounded-lg bg-secondary p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              role="tab"
              type="button"
              aria-selected={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === m.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <m.icon className="size-3.5" />
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-4 px-6 py-5">
        {status.data && !status.data.configured && (
          <div className="flex gap-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Claude isn’t connected yet, so the AI is switched off. It needs an Anthropic API key added to the backend (waiting on manager
              approval). Everything else on this page works without it.
            </span>
          </div>
        )}
        {visual && <VisualChip visual={visual} include={include} setInclude={setInclude} />}
        {/* Both stay mounted, so switching modes never loses an analysis or a conversation */}
        <div className={cn(mode !== 'analyse' && 'hidden')}>
          <AnalyseMode accountId={accountId} draft={draft} onUseText={onUseText} getAttachment={getAttachment} onImagePrompt={onImagePrompt} />
        </div>
        <div className={cn(mode !== 'chat' && 'hidden')}>
          <ChatMode accountId={accountId} draft={draft} onUseText={onUseText} getAttachment={getAttachment} />
        </div>
      </div>
    </section>
  )
}

type ChatEntry = { role: 'user'; content: string } | { role: 'assistant'; turn: ChatTurn }

/** What the model sees for its own earlier turns: what it said, the questions it asked and any version it wrote */
function assistantText(t: ChatTurn): string {
  const parts = [t.message]
  if (t.questions.length) parts.push(t.questions.map((q) => `- ${q.question} (options: ${q.options.join(' / ')})`).join('\n'))
  if (t.draft_text) parts.push(`Proposed post:\n${t.draft_text}`)
  return parts.join('\n\n')
}

function ChatMode({
  accountId,
  draft,
  onUseText,
  getAttachment,
}: {
  accountId: number
  draft: Draft
  onUseText: (text: string) => void
  getAttachment: () => Promise<File | null>
}) {
  const auth = useAuth()
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [text, setText] = useState('')
  const [cost, setCost] = useState(0)
  // Off by default: each message with web search costs a little more (searches + a short research step)
  const [web, setWeb] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const status = useQuery({ queryKey: ['post-chat', accountId], queryFn: () => api.postChatStatus(accountId), staleTime: 30_000 })
  const limit = status.data?.session_limit ?? 20
  const send = useMutation({
    mutationFn: async (history: ChatEntry[]) =>
      api.postChat(
        {
          account_id: accountId,
          format: draft.format,
          caption: draft.caption,
          topic: draft.topic.trim() || null,
          industry: draft.industry.trim() || null,
          cta: draft.cta.trim() || null,
          messages: history.map((e) => (e.role === 'user' ? { role: 'user', content: e.content } : { role: 'assistant', content: assistantText(e.turn) })),
          web_search: web,
        },
        await getAttachment(),
      ),
    onSuccess: (r) => {
      setEntries((list) => [...list, { role: 'assistant', turn: r.result }])
      setCost((c) => c + r.cost_usd)
      status.refetch()
    },
    onError: (e, history) => {
      toast.error((e as Error).message)
      // Put an unsent message back in the box so nothing typed is lost
      const last = history.at(-1)
      if (last?.role === 'user') {
        setEntries(history.slice(0, -1))
        setText(last.content)
      }
    },
  })
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must return nothing (or a clean-up function)
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [entries.length, send.isPending])
  useEffect(() => {
    setEntries([])
    setCost(0)
  }, [accountId])

  const configured = status.data?.configured
  const leftToday = status.data ? status.data.daily_limit - status.data.messages_today : null
  const full = entries.length >= limit
  const canSend = configured && auth.can('editor') && !send.isPending && !full && leftToday !== 0
  const submit = () => {
    const msg = text.trim()
    if (!msg || !canSend) return
    const next: ChatEntry[] = [...entries, { role: 'user', content: msg }]
    setEntries(next)
    setText('')
    send.mutate(next)
  }
  // Tapping an answer adds it to the reply box (one line per question), so several questions can be answered in one message
  const pick = (question: string, option: string) => {
    const lines = text.split('\n').filter((l) => l.trim() && !l.startsWith(`${question} →`))
    setText([...lines, `${question} → ${option}`].join('\n'))
  }
  const lastAssistant = [...entries].reverse().find((e) => e.role === 'assistant') as Extract<ChatEntry, { role: 'assistant' }> | undefined

  if (!entries.length && !send.isPending) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-10 text-center">
        <MessagesSquare className="mx-auto mb-3 size-6 text-primary/60" />
        <p className="text-sm font-medium">Work on this post together with the AI</p>
        <p className="mx-auto mt-1 mb-4 max-w-sm text-xs text-muted-foreground">
          It starts by asking you a few questions (goal, audience, what readers should do), then writes and revises the post with you. Every
          message is one AI request, so nothing is used until you start.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => send.mutate([])} disabled={!configured || !auth.can('editor') || leftToday === 0}>
            <MessagesSquare /> Start session
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={web} onChange={(ev) => setWeb(ev.target.checked)} />
            <Globe className="size-3.5" /> Search the web too
          </label>
        </div>
        {leftToday != null && configured && <p className="mt-2 text-xs text-muted-foreground">{leftToday} messages left today</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-xl ring-1 ring-border">
      <div className="max-h-[520px] min-h-64 space-y-4 overflow-y-auto p-4">
        {entries.map((e, i) =>
          e.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">{e.content}</div>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="rounded-2xl rounded-tl-md bg-muted/60 px-4 py-2.5 text-sm whitespace-pre-wrap">{e.turn.message}</div>
                {!!e.turn.sources?.length && (
                  <div className="rounded-xl bg-muted/30 px-3 py-2 text-xs">
                    <div className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
                      <Globe className="size-3.5" /> Searched the web ({e.turn.searches ?? 0} {e.turn.searches === 1 ? 'search' : 'searches'}). Sources:
                    </div>
                    <ul className="space-y-0.5">
                      {e.turn.sources.map((s) => (
                        <li key={s.url} className="truncate">
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {e.turn.questions.map((q) => (
                  <div key={q.question} className="rounded-xl px-3 py-2.5 ring-1 ring-border">
                    <div className="mb-2 text-sm font-medium">{q.question}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((o) => {
                        const chosen = e === lastAssistant && text.split('\n').includes(`${q.question} → ${o}`)
                        return (
                          <button
                            key={o}
                            type="button"
                            disabled={e !== lastAssistant || !canSend}
                            onClick={() => pick(q.question, o)}
                            className={cn(
                              'rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors disabled:opacity-60',
                              chosen ? 'bg-primary text-primary-foreground ring-transparent' : 'ring-border hover:bg-muted',
                            )}
                          >
                            {o}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {e.turn.draft_text && (
                  <Block icon={Type} title="Suggested post" action={<Button variant="outline" size="sm" onClick={() => onUseText(e.turn.draft_text!)}>Use this</Button>}>
                    <TextBox text={e.turn.draft_text} />
                  </Block>
                )}
              </div>
            </div>
          ),
        )}
        {send.isPending && (
          <div className="flex gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-3.5 animate-pulse" />
            </span>
            <div className="rounded-2xl rounded-tl-md bg-muted/60 px-4 py-2.5 text-sm text-muted-foreground">{web ? 'Searching the web, then thinking…' : 'Thinking…'}</div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="border-t p-3">
        {full ? (
          <p className="py-2 text-center text-sm text-muted-foreground">This session has reached {limit} messages. Start a new one to keep going.</p>
        ) : (
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(ev) => setText(ev.target.value.slice(0, 2000))}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault()
                  submit()
                }
              }}
              rows={2}
              placeholder="Answer, or ask for a change (e.g. “make it shorter”, “aim it at CTOs”)…"
              className="min-h-11 resize-none rounded-xl"
            />
            <Button size="icon" onClick={submit} disabled={!text.trim() || !canSend} aria-label="Send">
              <SendHorizontal />
            </Button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <label
            className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 ring-1', web ? 'bg-primary/10 text-primary ring-primary/30' : 'ring-border')}
            title="Let the AI look up current news, events and public competitor pages for your next messages (about $0.03–0.06 more per message)"
          >
            <input type="checkbox" className="sr-only" checked={web} onChange={(ev) => setWeb(ev.target.checked)} />
            <Globe className="size-3" /> Web search {web ? 'on' : 'off'}
          </label>
          <span>
            {entries.length} of {limit} messages · about ${cost.toFixed(3)} so far
          </span>
          <button
            type="button"
            onClick={() => {
              setEntries([])
              setCost(0)
              setText('')
            }}
            disabled={send.isPending}
            className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
          >
            <RotateCcw className="size-3" /> New session
          </button>
        </div>
      </div>
    </div>
  )
}

function Block({ icon, title, subtitle, action, children }: { icon: typeof Type; title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 ring-1 ring-border">
      <div className="mb-3 flex items-start gap-3">
        <IconTile icon={icon} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function TextBox({ text }: { text: string }) {
  return (
    <div className="relative rounded-lg bg-muted/40 px-4 py-3 pr-11 text-sm leading-relaxed whitespace-pre-wrap ring-1 ring-border">
      {text}
      <button type="button" onClick={() => copy(text)} aria-label="Copy" className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
        <Copy className="size-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- preview

function PreviewDialog({
  open,
  onClose,
  accountName,
  caption,
  format,
  details,
  image,
  hasStoredImage,
}: {
  open: boolean
  onClose: () => void
  accountName: string
  caption: string
  format: PlannedFormat
  details: PlannedDetails
  image: File | null
  hasStoredImage: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!image) {
      setImageUrl(null)
      return
    }
    const url = URL.createObjectURL(image)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])
  const short = hookPreview(caption)
  const cut = short.endsWith('…') || caption.trim().split('\n').length > 3
  const letters = accountName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>Roughly how it appears in the LinkedIn feed. Line breaks and the “…see more” point vary by device.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-card ring-1 ring-border">
          <div className="flex items-center gap-3 px-4 pt-4">
            <span className="flex size-11 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">{letters}</span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">{accountName}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Now · <Globe className="size-3" />
              </div>
            </div>
          </div>
          <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
            {expanded || !cut ? caption : short.replace(/…$/, '')}
            {cut && !expanded && (
              <button type="button" onClick={() => setExpanded(true)} className="ml-1 text-muted-foreground hover:underline">
                …see more
              </button>
            )}
          </div>
          {format === 'image' && (imageUrl || hasStoredImage) && (
            <div className="border-t bg-muted/40">{imageUrl ? <img src={imageUrl} alt="" className="max-h-80 w-full object-cover" /> : <div className="py-10 text-center text-xs text-muted-foreground">Saved image</div>}</div>
          )}
          {format === 'carousel' && <div className="border-t bg-muted/40 py-10 text-center text-xs text-muted-foreground">PDF carousel: {details.document_title || 'untitled'}</div>}
          {format === 'video' && <div className="border-t bg-muted/40 py-10 text-center text-xs text-muted-foreground">Video</div>}
          {format === 'article' && <div className="border-t bg-muted/40 px-4 py-4 text-sm font-semibold">{details.title || 'Article title'}</div>}
          {format === 'poll' && (
            <div className="space-y-2 border-t px-4 py-4">
              <div className="text-sm font-semibold">{details.question || 'Poll question'}</div>
              {(details.options ?? []).filter((o) => o.trim()).map((o) => (
                <div key={o} className="rounded-full px-4 py-1.5 text-center text-sm font-medium text-primary ring-1 ring-primary">
                  {o}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
