/**
 * Generate with AI: post images and carousel slides from the image AI (provider plugged in on the server).
 * Nothing is generated without a click; every image is costed and counted against a daily limit.
 * Carousels: Claude plans the slides and one visual style, the image AI draws each slide, and the slides are
 * joined into the PDF LinkedIn needs.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { jsPDF } from 'jspdf'
import { toast } from 'sonner'
import { Check, ImagePlus, Layers, RefreshCw, Sparkles, TriangleAlert, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { SimpleSelect } from '@/components/common'
import { api, type ImageShape } from '@/lib/api'
import { cn } from '@/lib/utils'

const SHAPES: { value: ImageShape; label: string; ratio: string }[] = [
  { value: 'square', label: 'Square (1:1)', ratio: 'aspect-square' },
  { value: 'portrait', label: 'Portrait (4:5)', ratio: 'aspect-[4/5]' },
  { value: 'landscape', label: 'Landscape (1.91:1)', ratio: 'aspect-[1.91/1]' },
]

async function toFile(url: string, name: string): Promise<File> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error('Couldn’t load the generated image')
  const blob = await res.blob()
  return new File([blob], name, { type: blob.type || 'image/png' })
}

function useImageStatus(accountId: number) {
  return useQuery({ queryKey: ['image-status', accountId], queryFn: () => api.imageStatus(accountId), staleTime: 30_000 })
}

function NotConnected() {
  return (
    <p className="flex gap-2 rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-xs">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      The image AI isn’t connected yet. It switches on once your manager chooses a provider and its API key is added.
    </p>
  )
}

// ---------------------------------------------------------------- one post image

export function ImageGenerator({ accountId, prompt, setPrompt, onUse }: { accountId: number; prompt: string; setPrompt: (p: string) => void; onUse: (f: File) => void }) {
  const qc = useQueryClient()
  const status = useImageStatus(accountId)
  const [shape, setShape] = useState<ImageShape>('square')
  const [count, setCount] = useState('2')
  const [picked, setPicked] = useState<number | null>(null)
  const gen = useMutation({
    mutationFn: () => api.generateImages({ account_id: accountId, prompt, shape, count: Number(count) }),
    onSuccess: () => {
      setPicked(0)
      qc.invalidateQueries({ queryKey: ['image-status', accountId] })
    },
    onError: (e) => toast.error((e as Error).message),
  })
  const [using, setUsing] = useState(false)
  const st = status.data
  const left = st ? st.daily_limit - st.images_today : null
  const ratio = SHAPES.find((s) => s.value === (gen.variables ? shape : shape))?.ratio

  return (
    <div className="space-y-3 rounded-xl p-4 ring-1 ring-border">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wand2 className="size-4 text-primary" /> Generate with AI
      </div>
      {st && !st.configured && <NotConnected />}
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
        rows={3}
        className="rounded-lg text-sm"
        placeholder="Describe the image, e.g. a modern UAE classroom with students using tablets, bright and clean, purple accents. Tip: Analyse suggests a prompt you can use."
      />
      <div className="flex flex-wrap items-center gap-3">
        <SimpleSelect label="Shape" value={shape} onChange={(v) => setShape(v as ImageShape)} options={SHAPES} />
        <SimpleSelect label="Options" value={count} onChange={setCount} options={['1', '2', '4'].map((n) => ({ value: n, label: n }))} />
        <Button size="sm" onClick={() => gen.mutate()} disabled={!st?.configured || !prompt.trim() || gen.isPending || (left != null && left < Number(count))}>
          <Sparkles /> {gen.isPending ? 'Generating…' : 'Generate'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {st?.configured && st.price_per_image != null ? `≈ $${(st.price_per_image * Number(count)).toFixed(2)} · ` : ''}
          {left != null && st?.configured ? `${left} images left today` : ''}
        </span>
      </div>

      {gen.isPending && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: Number(count) }, (_, i) => (
            <Skeleton key={i} className={cn('rounded-lg', ratio)} />
          ))}
        </div>
      )}
      {gen.data && !gen.isPending && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {gen.data.images.map((im, i) => (
              <button
                key={im.url}
                type="button"
                onClick={() => setPicked(i)}
                className={cn('relative overflow-hidden rounded-lg ring-2 transition', picked === i ? 'ring-primary' : 'ring-transparent hover:ring-border')}
              >
                <img src={im.url} alt={`Option ${i + 1}`} className="w-full object-cover" />
                {picked === i && (
                  <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={picked == null || using}
              onClick={async () => {
                setUsing(true)
                try {
                  onUse(await toFile(gen.data!.images[picked!].url, `ai-image-${gen.data!.run_id}.png`))
                  toast.success('Image added to the post. Check any text in it before posting.')
                } catch (e) {
                  toast.error((e as Error).message)
                } finally {
                  setUsing(false)
                }
              }}
            >
              <ImagePlus /> Use this image
            </Button>
            <span className="text-xs text-muted-foreground">Cost: about ${gen.data.cost_usd.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- a whole carousel

type PlanSlide = { headline: string; body: string }
type SlideImage = { url: string; busy: boolean; error?: string }

/** Generated slides → one PDF (LinkedIn carousel, 1080 × 1350 pages) */
async function slidesToPdf(urls: string[], name: string): Promise<File> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [1080, 1350], hotfixes: ['px_scaling'], compress: true })
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i], { credentials: 'same-origin' })
    if (!res.ok) throw new Error(`Couldn’t load slide ${i + 1}`)
    const blob = await res.blob()
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error(`Couldn’t read slide ${i + 1}`))
      r.readAsDataURL(blob)
    })
    if (i > 0) pdf.addPage([1080, 1350], 'portrait')
    pdf.addImage(data, blob.type.includes('png') ? 'PNG' : 'JPEG', 0, 0, 1080, 1350)
  }
  return new File([pdf.output('blob')], name, { type: 'application/pdf' })
}

export function CarouselGenerator({
  accountId,
  draft,
  title,
  onTitle,
  onUse,
}: {
  accountId: number
  draft: { caption: string; topic: string; industry: string; cta: string }
  title: string
  onTitle: (t: string) => void
  onUse: (pdf: File) => void
}) {
  const qc = useQueryClient()
  const status = useImageStatus(accountId)
  const claude = useQuery({ queryKey: ['post-assist', accountId], queryFn: () => api.postAssistStatus(accountId), staleTime: 30_000 })
  const [count, setCount] = useState('6')
  const [style, setStyle] = useState('')
  const [plan, setPlan] = useState<PlanSlide[]>([])
  const [images, setImages] = useState<(SlideImage | null)[]>([])
  const [running, setRunning] = useState(false)
  const [attaching, setAttaching] = useState(false)
  useEffect(() => setImages((im) => plan.map((_, i) => im[i] ?? null)), [plan.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const planIt = useMutation({
    mutationFn: () =>
      api.writeCarousel({
        account_id: accountId,
        caption: draft.caption,
        topic: draft.topic.trim() || null,
        industry: draft.industry.trim() || null,
        cta: draft.cta.trim() || null,
        instructions: null,
        slide_count: Number(count),
      }),
    onSuccess: (r) => {
      setPlan(r.result.slides)
      setStyle(r.result.visual_style)
      setImages(r.result.slides.map(() => null))
      if (r.result.document_title && !title) onTitle(r.result.document_title.slice(0, 100))
    },
    onError: (e) => toast.error((e as Error).message),
  })

  const drawOne = async (i: number) => {
    setImages((im) => im.map((x, j) => (j === i ? { url: x?.url ?? '', busy: true } : x)))
    try {
      const r = await api.generateSlide({ account_id: accountId, style, headline: plan[i].headline, body: plan[i].body, index: i, total: plan.length })
      setImages((im) => im.map((x, j) => (j === i ? { url: r.images[0].url, busy: false } : x)))
    } catch (e) {
      setImages((im) => im.map((x, j) => (j === i ? { url: x?.url ?? '', busy: false, error: (e as Error).message } : x)))
      throw e
    } finally {
      qc.invalidateQueries({ queryKey: ['image-status', accountId] })
    }
  }
  const drawAll = async () => {
    setRunning(true)
    try {
      for (let i = 0; i < plan.length; i++) await drawOne(i) // one at a time: progress shows, and a failure stops the spend
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const st = status.data
  const left = st ? st.daily_limit - st.images_today : null
  const done = images.filter((x) => x?.url && !x.busy).length
  const ready = plan.length >= 2 && done === plan.length

  return (
    <div className="space-y-3 rounded-xl p-4 ring-1 ring-border">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wand2 className="size-4 text-primary" /> Generate with AI
      </div>
      {st && !st.configured && <NotConnected />}

      {/* Step 1: Claude plans the slides and one style */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">1</span>
        <SimpleSelect value={count} onChange={setCount} options={['4', '5', '6', '7', '8', '10'].map((n) => ({ value: n, label: `${n} slides` }))} />
        <Button variant="outline" size="sm" onClick={() => planIt.mutate()} disabled={!claude.data?.configured || planIt.isPending || running}>
          <Sparkles /> {planIt.isPending ? 'Planning…' : plan.length ? 'Plan again' : 'Plan slides with AI'}
        </Button>
        <span className="text-xs text-muted-foreground">{claude.data && !claude.data.configured ? 'Planning needs Claude to be connected.' : 'From the post text, topic and CTA.'}</span>
      </div>

      {plan.length > 0 && (
        <>
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">Visual style (used for every slide)</div>
            <Textarea value={style} onChange={(e) => setStyle(e.target.value.slice(0, 600))} rows={2} className="rounded-lg text-sm" />
          </div>
          <ol className="space-y-1.5">
            {plan.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                <Input value={s.headline} maxLength={120} onChange={(e) => setPlan(plan.map((p, j) => (j === i ? { ...p, headline: e.target.value } : p)))} className="h-8 flex-1 rounded-lg text-sm font-medium" />
                <Input value={s.body} maxLength={400} onChange={(e) => setPlan(plan.map((p, j) => (j === i ? { ...p, body: e.target.value } : p)))} className="h-8 flex-[1.4] rounded-lg text-sm" placeholder="(no supporting text)" />
              </li>
            ))}
          </ol>

          {/* Step 2: the image AI draws each slide */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">2</span>
            <Button size="sm" onClick={drawAll} disabled={!st?.configured || running || !style.trim() || (left != null && left < plan.length)}>
              <Layers /> {running ? `Drawing slide ${Math.min(done + 1, plan.length)} of ${plan.length}…` : done ? 'Draw all again' : `Draw ${plan.length} slides`}
            </Button>
            <span className="text-xs text-muted-foreground">
              {st?.configured && st.price_per_image != null ? `≈ $${(st.price_per_image * plan.length).toFixed(2)} · ` : ''}
              {left != null && st?.configured ? `${left} images left today` : ''}
            </span>
          </div>

          {images.some(Boolean) && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
              {plan.map((_, i) => {
                const im = images[i]
                return (
                  <div key={i} className="w-32 shrink-0 space-y-1">
                    {im?.busy ? (
                      <Skeleton className="aspect-[4/5] rounded-lg" />
                    ) : im?.url ? (
                      <img src={im.url} alt={`Slide ${i + 1}`} className="aspect-[4/5] w-full rounded-lg object-cover ring-1 ring-border" />
                    ) : (
                      <div className="flex aspect-[4/5] items-center justify-center rounded-lg bg-muted/50 text-center text-[11px] text-muted-foreground ring-1 ring-border">
                        {im?.error ? 'Failed' : 'Not drawn yet'}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={!st?.configured || running || !!im?.busy}
                      onClick={() => drawOne(i).catch((e) => toast.error((e as Error).message))}
                      className="flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw className="size-3" /> {im?.url ? 'Redraw' : 'Draw'} {i + 1}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Step 3: join into the PDF */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">3</span>
            <Button
              size="sm"
              variant="outline"
              disabled={!ready || attaching || running}
              onClick={async () => {
                setAttaching(true)
                try {
                  const name = `${(title || 'carousel').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'carousel'}.pdf`
                  onUse(await slidesToPdf(images.map((x) => x!.url), name))
                  toast.success('Carousel PDF attached. Proofread every slide before posting.')
                } catch (e) {
                  toast.error((e as Error).message)
                } finally {
                  setAttaching(false)
                }
              }}
            >
              <Check /> {attaching ? 'Making the PDF…' : 'Use these slides'}
            </Button>
            <span className="text-xs text-muted-foreground">Image AIs can misspell words: check each slide’s text.</span>
          </div>
        </>
      )}
    </div>
  )
}
