/**
 * Mock backend for UI work without the API (npm run dev:mock).
 *
 * Every call that api.ts would send to /api is answered here instead, from sample data kept in this browser
 * (localStorage), so the whole app can be clicked through: sign in, dashboards, create → approve → publish,
 * leads, settings… Changes survive a reload; the "Reset sample data" button in the banner starts over.
 *
 * Nothing here is sent anywhere. AI features return canned, plausible answers.
 */
import {
  ApiError,
  type Account,
  type AccountDocs,
  type AudienceRow,
  type Checkpoint,
  type CheckpointQ,
  type ExportImportResult,
  type Idea,
  type IdeasRun,
  type Lead,
  type LeadInput,
  type Me,
  type PageAudienceInput,
  type PlannedPost,
  type PlannedPostInput,
  type PostAssistResult,
  type PostFormat,
  type PostInput,
  type SnapshotInput,
  type TeamMemberInput,
} from '@/lib/api'
import * as A from './analytics'
import { clearMockFile, setMockFile } from './files'
import { buildSnapshot, computeShares, createSeed, DB_VERSION, DEFAULT_BRAND, DEFAULT_PERFORMANCE, DEFAULT_SEGMENTS, type MockDb, type StoredPost } from './seed'
import { DAY, istIso, slotOf, uaeHour, uaeIso, uaeWeekday } from './util'

const STORAGE_KEY = 'avaibe.mockDb'

// ---------------------------------------------------------------- storage

let db: MockDb = load()

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb
      if (parsed.version === DB_VERSION) return parsed
    }
  } catch {
    /* unreadable or blocked: start fresh */
  }
  const fresh = createSeed()
  persist(fresh)
  return fresh
}

function persist(d: MockDb = db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
  } catch {
    /* private window or full: changes last until reload */
  }
}

/** Start again from the sample data (keeps the demo sign-in) */
export function resetMockData() {
  db = createSeed()
  persist()
}

// ---------------------------------------------------------------- helpers

type Params = Record<string, string | number | boolean | null | undefined>
type Opts = { params?: Params; body?: unknown; form?: FormData }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nid = () => db.nextId++
const nref = () => `P-${String(db.nextRef++).padStart(4, '0')}`
const now = () => Date.now()
const iso = (ts = now()) => new Date(ts).toISOString()
const ME_EMAIL = 'you@avaibe.example'

function notFound(what = 'Not found'): never {
  throw new ApiError(404, what)
}
function bad(msg: string): never {
  throw new ApiError(400, msg)
}

const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v))
const str = (v: unknown) => (v == null || v === '' ? undefined : String(v))

function range(p: Params): A.Range | undefined {
  if (p.days) return { days: Number(p.days) }
  if (p.from || p.to) return { from: str(p.from), to: str(p.to) }
  return undefined
}

function formJson(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  form.forEach((v, k) => {
    if (typeof v !== 'string') return
    try {
      out[k] = /^[[{]/.test(v) ? JSON.parse(v) : v
    } catch {
      out[k] = v
    }
  })
  return out
}

function getPost(id: number) {
  return db.posts.find((p) => p.id === id) ?? notFound('Post not found')
}
function getPlanned(id: number) {
  return db.planned.find((p) => p.id === id) ?? notFound('Draft not found')
}

function leadView(l: Lead): Lead {
  const post = l.post_id ? db.posts.find((p) => p.id === l.post_id) : undefined
  const via = l.via_account_id ? db.accounts.find((a) => a.id === l.via_account_id) : undefined
  const rule = l.in_uae == null || l.decision_maker == null ? null : l.in_uae && l.decision_maker
  return {
    ...l,
    is_qualified: l.qualified ?? rule,
    post_title: post ? (post.caption ?? '').split('\n')[0].slice(0, 80) : null,
    post_topic: post?.topic ?? null,
    post_format: post?.format ?? null,
    post_date: post?.published_at_uae.slice(0, 10) ?? null,
    via_account_name: via?.name ?? null,
  }
}

function scheduleFields(scheduled_at: string | null) {
  if (!scheduled_at) return { scheduled_at: null, scheduled_at_uae: null, scheduled_day_uae: null, scheduled_slot_uae: null }
  const ts = Date.parse(scheduled_at)
  return { scheduled_at: iso(ts), scheduled_at_uae: uaeIso(ts), scheduled_day_uae: uaeWeekday(ts), scheduled_slot_uae: slotOf(uaeHour(ts)) }
}

function canPublishFromApp(accountId: number) {
  return db.connections.some((c) => c.account_id === accountId && !c.expired)
}

function plannedFrom(body: PlannedPostInput, prev?: PlannedPost): PlannedPost {
  const manual = ['carousel', 'video', 'article', 'poll'].includes(body.format)
  const formatChanged = prev && prev.format !== body.format
  return {
    id: prev?.id ?? nid(),
    ref: prev?.ref ?? nref(),
    account_id: body.account_id,
    format: body.format,
    goal: body.goal,
    manual,
    by_hand: manual || !canPublishFromApp(body.account_id),
    details: body.details ?? {},
    has_media: formatChanged ? false : (prev?.has_media ?? false),
    media_name: formatChanged ? null : (prev?.media_name ?? null),
    caption: body.caption,
    has_image: formatChanged && body.format !== 'image' ? false : (prev?.has_image ?? false),
    image_alt: body.image_alt,
    visibility: body.visibility,
    ...scheduleFields(body.scheduled_at),
    // Editing an approved post sends it back to draft until it is published again
    status: prev && prev.status !== 'approved' ? prev.status : 'draft',
    topic: body.topic,
    industry: body.industry,
    cta: body.cta,
    keywords: body.keywords ?? [],
    approved_at: null,
    published_at: prev?.published_at ?? null,
    linkedin_urn: prev?.linkedin_urn ?? null,
    post_id: prev?.post_id ?? null,
    error: null,
    retry_at: null,
    attempts: 0,
  }
}

/** A planner post that went out becomes a tracked post (Data → Posts), keeping its P-number */
function publishToPosts(p: PlannedPost, postUrl?: string): StoredPost {
  const ts = now()
  const account = db.accounts.find((a) => a.id === p.account_id)
  const urn = `urn:li:activity:${7300000000000000000 + p.id * 7919}`
  const format: PostFormat = p.format === 'article' ? 'newsletter' : p.format
  const post: StoredPost = {
    id: nid(),
    ref: p.ref,
    account_id: p.account_id,
    post_url: postUrl ?? `https://www.linkedin.com/feed/update/${urn}`,
    linkedin_post_id: urn,
    author: account?.name ?? null,
    published_at: iso(ts),
    published_at_uae: uaeIso(ts),
    published_at_ist: istIso(ts),
    day_uae: uaeWeekday(ts),
    slot_uae: slotOf(uaeHour(ts)),
    time_known: true,
    targeted: false,
    format,
    topic: p.topic,
    topic_suggested: false,
    industry: p.industry,
    keywords: p.keywords,
    cta: p.cta,
    hashtags: (p.caption.match(/#\w+/g) ?? []).slice(0, 6),
    caption: p.caption,
    notes: null,
    snapshots: [],
    audience: [],
    audience_captured_at: null,
  }
  db.posts.push(post)
  p.status = 'published'
  p.published_at = post.published_at
  p.linkedin_urn = urn
  p.post_id = post.id
  p.error = null
  return post
}

/** Scheduled posts the "server" would have published by now */
function runScheduler() {
  const t = now()
  let changed = false
  for (const p of db.planned) {
    if (p.status === 'approved' && !p.by_hand && p.scheduled_at && Date.parse(p.scheduled_at) <= t) {
      publishToPosts(p)
      changed = true
    }
    if (p.status === 'approved' && p.by_hand && p.scheduled_at && Date.parse(p.scheduled_at) < t - 2 * DAY) {
      p.status = 'missed'
      changed = true
    }
  }
  if (changed) persist()
}

// ---------------------------------------------------------------- AI (canned answers)

const IDEA_BANK: Idea[] = [
  {
    type: 'post',
    title: 'Before / after: one school’s fee collection',
    what: 'A carousel showing the old process (5 steps, 3 weeks) next to the new one (2 taps, same day).',
    when: 'Tuesday 10 AM-12 PM UAE, within 2 weeks',
    who: 'Bursars and principals of UAE private schools',
    why: ['Case studies are your best-performing topic', 'Carousels get the most reach on this page'],
    novelty: 'You haven’t shown a process side by side yet',
    boost: 'More saves and shares from school staff',
    risk: 'Needs the school’s permission to be named',
    confidence: 'high',
    confidence_reason: 'Matches the top topic and format in your own data',
    effort: 'medium',
    measure: { metric: 'Impressions at 7 days', period: 'One post', target: '2,500+' },
    draft_caption: 'Fee day at a Dubai school, before and after.\n\nBefore: 5 steps, 3 weeks, 400 phone calls.\nAfter: 2 taps, same day.\n\nSwipe to see what changed →',
  },
  {
    type: 'campaign',
    title: '“Back to school, ready” 3-week series',
    what: 'Six short posts in August on what schools should set up before term starts.',
    when: 'August, 2 posts a week',
    who: 'School leadership teams',
    why: ['Schools plan systems before the new academic year', 'Series build habit with followers'],
    novelty: 'First seasonal series on the page',
    boost: 'Steady reach for 3 weeks and demo requests',
    risk: 'Summer: lower activity in July–August',
    confidence: 'medium',
    confidence_reason: 'Seasonal timing is sound; not tested on this page',
    effort: 'high',
    measure: { metric: 'Demo requests', period: 'August', target: '5+' },
    draft_caption: null,
  },
  {
    type: 'leads',
    title: 'Offer the “School systems checklist” by DM',
    what: 'End a post with “Comment CHECKLIST and we’ll send it”, then reply by DM.',
    when: 'Next post on School ERP',
    who: 'UAE decision-makers in education',
    why: ['Comment-to-DM turns reach into conversations', '“Send a DM” posts already bring leads'],
    novelty: 'New lead magnet',
    boost: 'Direct conversations with qualified people',
    risk: 'Needs someone to reply within a few hours',
    confidence: 'medium',
    confidence_reason: 'Common practice; your DM posts look promising',
    effort: 'low',
    measure: { metric: 'Leads from the post', period: '2 weeks', target: '3+' },
    draft_caption: 'We made a one-page checklist of what a school system should handle in 2026.\n\nComment CHECKLIST and we’ll send it to you.',
  },
  {
    type: 'outreach',
    title: 'Founders comment on 5 principal posts a week',
    what: 'Rania and Karan leave thoughtful comments on posts by UAE school leaders.',
    when: 'Every week, 15 minutes',
    who: 'Founders',
    why: ['Founder profiles reach further than the page', 'Comments put you in front of decision-makers'],
    novelty: 'No outreach routine yet',
    boost: 'Profile views and connection requests from target people',
    risk: 'Must be genuine, not promotional',
    confidence: 'medium',
    confidence_reason: 'Well-known LinkedIn practice',
    effort: 'low',
    measure: { metric: 'Profile views from content', period: '4 weeks', target: '+20%' },
    draft_caption: null,
  },
  {
    type: 'brand',
    title: 'Put the UAE in the page tagline',
    what: 'Change the tagline to say what AVAIBE does, for whom and where.',
    when: 'This week',
    who: 'Page admin',
    why: ['Visitors decide in seconds', 'UAE visitors are much more likely to visit than follow today'],
    novelty: 'Page setup item still open',
    boost: 'More visitors follow the page',
    risk: 'None',
    confidence: 'medium',
    confidence_reason: 'Common practice',
    effort: 'low',
    measure: { metric: 'Follows per 100 visitors', period: '30 days', target: 'Higher than before' },
    draft_caption: null,
  },
  {
    type: 'seo_aeo',
    title: 'Publish a “School ERP in the UAE” guide on the website',
    what: 'A plain-language guide that AI assistants and Google can quote.',
    when: 'This month',
    who: 'Marketing',
    why: ['People ask ChatGPT and Gemini which ERP to choose', 'No UAE-specific guide ranks today'],
    novelty: 'First long-form page',
    boost: 'Named in AI answers and search results',
    risk: 'Takes a few days to write well',
    confidence: 'low',
    confidence_reason: 'Hard to measure quickly',
    effort: 'high',
    measure: { metric: 'Visits from search', period: '3 months', target: '200 / month' },
    draft_caption: null,
  },
  {
    type: 'sales',
    title: 'Follow up on proposals older than 10 days',
    what: 'A short, useful follow-up (a case study, not “just checking in”).',
    when: 'This week',
    who: 'Whoever owns each proposal',
    why: ['Two proposals have had no reply for over 10 days'],
    novelty: 'Pipeline hygiene',
    boost: 'Fewer deals going quiet',
    risk: 'None',
    confidence: 'high',
    confidence_reason: 'From the Pipeline',
    effort: 'low',
    measure: { metric: 'Proposals moved on', period: '2 weeks', target: '2' },
    draft_caption: null,
  },
]

function makeIdeasRun(accountId: number, focus: string | null): IdeasRun {
  const shift = db.ideaRuns.length % IDEA_BANK.length
  const ideas = [...IDEA_BANK.slice(shift), ...IDEA_BANK.slice(0, shift)]
  return {
    id: nid(),
    account_id: accountId,
    focus,
    status: 'ok',
    model: 'mock (no AI call)',
    input_tokens: 18_400,
    output_tokens: 3_100,
    cost_usd: 0.1,
    result: {
      situation:
        'The page is growing steadily (impressions up about a third over six months). Carousels and case studies do best; posting is regular but Fridays and evenings underperform. Few posts have audience numbers, so reach among UAE decision-makers is still uncertain.',
      ideas: focus ? ideas.map((i) => ({ ...i, why: [...i.why, `Fits the focus: ${focus}`] })) : ideas,
      data_gaps: ['Audience numbers on recent posts', 'Lead source for 3 leads'],
    },
    error: null,
    created_by: ME_EMAIL,
    created_at: iso(),
  }
}

function postAssist(body: Record<string, unknown>): PostAssistResult {
  const focus = (body.focus as string[]) ?? ['text']
  const caption = String(body.caption ?? '').trim()
  const first = caption.split('\n')[0] || 'Your opening line'
  const format = String(body.format ?? 'text')
  return {
    text: focus.includes('text')
      ? {
          improved_text: `${first}\n\nHere’s what we see in UAE schools every term: good teams held back by tools that don’t talk to each other.\n\nThree things that help straight away:\n1. One login for parents, teachers and finance\n2. Fees paid in two taps\n3. Reports that build themselves\n\nWhich one would save your team the most time?`,
          what_changed: ['Shorter opening, so the first line fits before “…see more”', 'Added a list people can skim', 'Ends with a question to invite comments'],
          quick_fixes: [
            { kind: 'hashtags', title: 'Add 3 focused hashtags', text: '#UAE #EdTech #SchoolERP' },
            { kind: 'shorter', title: 'Shorter version', text: `${first}\n\nOne login. Fees in two taps. Reports that build themselves.\n\nWhat would help your school most?` },
            { kind: 'cta', title: 'Stronger call to action', text: 'Want to see it on your own data? Comment DEMO and we’ll send a 20-minute slot.' },
          ],
        }
      : null,
    visual: focus.includes('visual')
      ? {
          notes: ['Use one clear message on the image, at most 8 words', 'Show a real screen or a real person, not stock art', 'Keep text away from the edges: LinkedIn crops on mobile'],
          prompt:
            format === 'carousel'
              ? null
              : { prompt: 'Bright modern school office in Dubai, a bursar smiling at a laptop showing a clean dashboard, soft daylight, shallow depth of field, brand purple accents', settings: ['Aspect 1:1', 'Photorealistic', 'No text in the image'], tips: ['Generate 4 and pick the most natural one', 'Add the headline in the app, not in the prompt'] },
          slide_prompts:
            format === 'carousel'
              ? {
                  document_title: '5 signs your school has outgrown spreadsheets',
                  style: 'Clean, brand purple and white, large type',
                  slides: [
                    { headline: '5 signs your school has outgrown spreadsheets', body: 'A 60-second check', prompt: 'Minimal cover, stacked paper turning into a tablet' },
                    { headline: 'Fees are chased by phone', body: 'Parents want two taps', prompt: 'Phone with a payment confirmation' },
                    { headline: 'Ready for one system?', body: 'Book a walkthrough', prompt: 'Simple calendar icon, brand colours' },
                  ],
                  tips: ['Keep 3–7 slides', 'One idea per slide'],
                }
              : null,
        }
      : null,
    timing: focus.includes('timing')
      ? {
          verdict: body.scheduled_at ? 'A good time: working-day mornings do best for this page.' : 'No time picked yet. Working-day mornings do best for this page.',
          suggestions: ['Avoid Friday afternoons and weekends', 'Reply to comments in the first hour'],
          suggested_time: 'Tuesday 10:00',
        }
      : null,
    poll: focus.includes('poll')
      ? { question: 'Where would AI help your school most this year?', options: ['Admissions', 'Timetabling', 'Parent messages', 'Reports'], notes: ['Keep options under 30 characters', 'A 1-week poll gets the most votes'] }
      : null,
    cautions: caption.length < 40 ? ['The post is very short; add one concrete detail or number.'] : [],
  }
}

function chatReply(body: Record<string, unknown>) {
  const messages = (body.messages as { role: string; content: string }[]) ?? []
  const last = messages.at(-1)?.content ?? ''
  const turn = messages.filter((m) => m.role === 'user').length
  const web = !!body.web_search
  if (turn <= 1) {
    return {
      message: `Happy to help with that. To make the post land with UAE decision-makers, two quick questions:`,
      questions: [
        { question: 'Who is it mainly for?', options: ['School principals', 'Bursars / finance', 'IT managers', 'SME owners'] },
        { question: 'What should readers do after reading?', options: ['Book a demo', 'Comment', 'Visit the website', 'Just remember us'] },
      ],
      draft_text: null,
      ...(web ? { sources: [{ title: 'UAE private schools: market overview (sample)', url: 'https://example.com/uae-schools' }], searches: 1 } : {}),
    }
  }
  return {
    message: 'Here’s a draft based on what you said. I kept the first line short so it shows before “…see more”. Want it shorter, or more personal?',
    questions: [{ question: 'Tone?', options: ['Keep it', 'More personal', 'More data', 'Shorter'] }],
    draft_text: `${last.length > 10 && last.length < 120 ? last.replace(/\.$/, '') + '.' : 'Most UAE schools still chase fees by phone.'}\n\nWe helped one Dubai school move to two-tap payments. Same-day collection, 400 fewer calls a term.\n\nWhat’s the one task you’d automate first?\n\n#UAE #EdTech`,
    ...(web ? { sources: [{ title: 'Digital payments in UAE education (sample)', url: 'https://example.com/payments' }], searches: 1 } : {}),
  }
}

// ---------------------------------------------------------------- router

type Handler = (m: RegExpMatchArray, o: Opts & { params: Params }) => unknown | Promise<unknown>
const routes: [string, RegExp, Handler][] = []
const on = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), h])
const id = (m: RegExpMatchArray, k = 'id') => Number(m.groups![k])

// ---- auth and team
on('GET', '/auth/me', (): Me => ({
  enabled: false, // local mode: the demo sign-in screen, nothing checked
  user: { email: ME_EMAIL, name: 'You', role: 'admin', can_switch_accounts: true, dev: true },
  allowed_account_ids: db.accounts.map((a) => a.id),
  default_account_id: db.defaultAccountId,
}))
on('POST', '/auth/logout', () => ({ signed_out: true }))
on('GET', '/team', () => ({ members: db.team, default_account_id: db.defaultAccountId }))
on('POST', '/team', (_m, { body }) => {
  const b = body as TeamMemberInput
  if (db.team.some((t) => t.email.toLowerCase() === b.email.toLowerCase())) bad('That email is already on the team')
  const member = { ...b, id: nid(), last_login_at: null }
  db.team.push(member)
  return member
})
on('PUT', '/team/default-account/set', (_m, { body }) => {
  db.defaultAccountId = (body as { default_account_id: number }).default_account_id
  return { default_account_id: db.defaultAccountId }
})
on('PUT', '/team/:id', (m, { body }) => {
  const t = db.team.find((x) => x.id === id(m)) ?? notFound()
  Object.assign(t, body)
  return t
})
on('DELETE', '/team/:id', (m) => {
  db.team = db.team.filter((x) => x.id !== id(m))
})

// ---- accounts
on('GET', '/accounts', () => db.accounts)
on('POST', '/accounts', (_m, { body }) => {
  const a = { ...(body as Omit<Account, 'id'>), id: nid() }
  db.accounts.push(a)
  db.pageDaily[a.id] = []
  return a
})
on('GET', '/accounts/:id/page-audience', (m) => db.pageAudience[id(m)] ?? [])
on('PUT', '/accounts/:id/page-audience', (m, { body }) => {
  const b = body as PageAudienceInput
  const list = (db.pageAudience[id(m)] ??= []).filter((s) => !(s.as_of === b.as_of && s.audience === b.audience))
  list.push({ ...b, shares: computeShares(b.rows, db.settings.segments) })
  db.pageAudience[id(m)] = list
  return { saved: b.rows.length }
})
on('DELETE', '/accounts/:id/page-audience', (m, { params }) => {
  db.pageAudience[id(m)] = (db.pageAudience[id(m)] ?? []).filter((s) => !(s.as_of === params.as_of && s.audience === params.audience))
})
on('GET', '/accounts/:id/docs/:kind', (m) => {
  const kind = m.groups!.kind as keyof AccountDocs
  const empty: AccountDocs = { page_checklist: { items: {} }, competitors: { competitors: [] }, member_totals: { as_of: null, followers: null, totals: {} } }
  return db.docs[`${id(m)}:${kind}`] ?? { kind, data: empty[kind], updated_by: null, updated_at: null }
})
on('PUT', '/accounts/:id/docs/:kind', (m, { body }) => {
  const kind = m.groups!.kind as keyof AccountDocs
  const doc = { kind, data: body as AccountDocs[typeof kind], updated_by: ME_EMAIL, updated_at: iso() }
  db.docs[`${id(m)}:${kind}`] = doc
  return doc
})
on('GET', '/accounts/:id/last-imports', (m) => db.lastImports[id(m)] ?? {})
on('GET', '/accounts/:id/page-daily', (m) => db.pageDaily[id(m)] ?? [])

// ---- posts and numbers
on('GET', '/posts', (_m, { params }) => {
  const cp = (str(params.checkpoint) ?? 'latest') as CheckpointQ
  return db.posts
    .filter((p) => (params.account_id ? p.account_id === Number(params.account_id) : true))
    .filter((p) => (params.format ? p.format === params.format : true))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .map((p) => A.toPost(db, p, cp))
})
on('GET', '/posts/:id', (m) => A.toPost(db, getPost(id(m))))
on('POST', '/posts', (_m, { body }) => {
  const b = body as PostInput
  const ts = Date.parse(b.published_at.length <= 16 ? `${b.published_at}+04:00` : b.published_at)
  const timeKnown = b.time_known ?? true
  const p: StoredPost = {
    ...b,
    id: nid(),
    ref: nref(),
    linkedin_post_id: null,
    published_at: iso(ts),
    published_at_uae: uaeIso(ts),
    published_at_ist: istIso(ts),
    day_uae: uaeWeekday(ts),
    slot_uae: timeKnown ? slotOf(uaeHour(ts)) : null,
    time_known: timeKnown,
    targeted: null,
    topic_suggested: false,
    snapshots: [],
    audience: [],
    audience_captured_at: null,
  }
  db.posts.push(p)
  return A.toPost(db, p)
})
on('PUT', '/posts/:id', (m, { body }) => {
  const p = getPost(id(m))
  const b = body as PostInput
  const ts = Date.parse(b.published_at.length <= 16 ? `${b.published_at}+04:00` : b.published_at)
  const timeKnown = b.time_known ?? p.time_known
  Object.assign(p, b, {
    published_at: iso(ts),
    published_at_uae: uaeIso(ts),
    published_at_ist: istIso(ts),
    day_uae: uaeWeekday(ts),
    slot_uae: timeKnown ? slotOf(uaeHour(ts)) : null,
    time_known: timeKnown,
    topic_suggested: false,
  })
  return A.toPost(db, p)
})
on('DELETE', '/posts/:id', (m) => {
  db.posts = db.posts.filter((p) => p.id !== id(m))
})
on('PUT', '/posts/:id/snapshots/:cp', (m, { body }) => {
  const p = getPost(id(m))
  const cp = m.groups!.cp as Checkpoint
  const b = body as SnapshotInput
  const values = { ...b } as Record<string, number | null | string | undefined>
  const base = buildSnapshot(nid(), p.id, cp, Date.parse(p.published_at), {}, p.format)
  const n = (k: string) => (typeof values[k] === 'number' ? (values[k] as number) : null)
  const snap = {
    ...base,
    impressions: n('impressions'),
    members_reached: n('members_reached'),
    clicks: n('clicks'),
    reactions: n('reactions'),
    comments: n('comments'),
    reposts: n('reposts'),
    video_views: n('video_views'),
    poll_votes: n('poll_votes'),
    newsletter_views: n('newsletter_views'),
    newsletter_subscribers: n('newsletter_subscribers'),
    followers_gained: n('followers_gained'),
    captured_at: b.captured_at ?? iso(),
    notes: b.notes ?? null,
  }
  const eng = [snap.clicks, snap.reactions, snap.comments, snap.reposts].reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null)
  snap.engagements = eng
  snap.engagement_rate = eng != null && snap.impressions ? eng / snap.impressions : null
  snap.click_rate = snap.clicks != null && snap.impressions ? snap.clicks / snap.impressions : null
  p.snapshots = [...p.snapshots.filter((s) => s.checkpoint !== cp), snap]
  return snap
})
on('DELETE', '/posts/:id/snapshots/:cp', (m) => {
  const p = getPost(id(m))
  p.snapshots = p.snapshots.filter((s) => s.checkpoint !== m.groups!.cp)
})
on('PUT', '/posts/:id/audience', (m, { body }) => {
  const p = getPost(id(m))
  p.audience = (body as { rows: AudienceRow[] }).rows
  p.audience_captured_at = p.audience.length ? iso() : null
  return A.toPost(db, p)
})

// ---- analytics
const acct = (p: Params) => Number(p.account_id)
const cpOf = (p: Params) => (str(p.checkpoint) ?? 'latest') as CheckpointQ
on('GET', '/analytics/overview', (_m, { params }) => A.overview(db, acct(params), cpOf(params)))
on('GET', '/analytics/rankings', (_m, { params }) =>
  A.rankings(db, acct(params), cpOf(params), str(params.metric) ?? 'impressions', num(params.limit) ?? 5, range(params)),
)
on('GET', '/analytics/formats', (_m, { params }) => A.formats(db, acct(params), cpOf(params), range(params)))
on('GET', '/analytics/heatmap', (_m, { params }) =>
  A.heatmap(db, acct(params), cpOf(params), str(params.metric) ?? 'impressions', str(params.format), range(params)),
)
on('GET', '/analytics/best-slots', (_m, { params }) => A.bestSlots(db, acct(params), cpOf(params), range(params)))
on('GET', '/analytics/groups', (_m, { params }) => A.groups(db, acct(params), cpOf(params), str(params.by) ?? 'topic', range(params)))
on('GET', '/analytics/consistency', (_m, { params }) => A.consistency(db, acct(params), cpOf(params)))
on('GET', '/analytics/suggestions', (_m, { params }) => A.suggestions(db, acct(params)))
on('GET', '/analytics/due-snapshots', (_m, { params }) => A.dueSnapshots(db, acct(params)))
on('GET', '/analytics/timing', (_m, { params }) => A.timing(db, acct(params), str(params.metric)))
on('POST', '/analytics/similar-posts', (_m, { body }) => {
  const b = body as { account_id: number; queries: { key: string; text: string; topic?: string | null }[] }
  return A.similarPosts(db, b.account_id, b.queries)
})
on('GET', '/calendar', (_m, { params }) => A.calendar(db, acct(params), String(params.from), String(params.to)))
on('GET', '/calendar/items', (_m, { params }) => ({
  from: String(params.from),
  to: String(params.to),
  items: A.itemsBetween(String(params.from), String(params.to)),
}))

// ---- leads
on('GET', '/leads', (_m, { params }) =>
  db.leads.filter((l) => l.account_id === acct(params)).sort((a, b) => b.received_on.localeCompare(a.received_on)).map(leadView),
)
on('POST', '/leads', (_m, { body }) => {
  const l = leadView({ ...(body as LeadInput), id: nid(), updated_at: iso() } as Lead)
  db.leads.push(l)
  return l
})
on('PUT', '/leads/:id', (m, { body }) => {
  const i = db.leads.findIndex((l) => l.id === id(m))
  if (i < 0) notFound('Lead not found')
  db.leads[i] = leadView({ ...db.leads[i], ...(body as LeadInput), updated_at: iso() })
  return db.leads[i]
})
on('DELETE', '/leads/:id', (m) => {
  db.leads = db.leads.filter((l) => l.id !== id(m))
})
on('POST', '/leads/:id/replied', (m) => {
  const l = db.leads.find((x) => x.id === id(m)) ?? notFound('Lead not found')
  l.replied_at = iso()
  l.updated_at = iso()
  return leadView(l)
})

// ---- settings
on('GET', '/settings', () => ({
  current: db.settings,
  defaults: { segments: DEFAULT_SEGMENTS, performance: DEFAULT_PERFORMANCE, brand: DEFAULT_BRAND },
}))
on('PUT', '/settings/:section', (m, { body }) => {
  const s = m.groups!.section as keyof MockDb['settings']
  ;(db.settings as Record<string, unknown>)[s] = body
  return body
})
on('POST', '/settings/:section/reset', (m) => {
  const s = m.groups!.section as keyof MockDb['settings']
  const defaults = { segments: DEFAULT_SEGMENTS, performance: DEFAULT_PERFORMANCE, brand: DEFAULT_BRAND }
  ;(db.settings as Record<string, unknown>)[s] = defaults[s]
  return defaults[s]
})
on('GET', '/settings/claude', () => ({
  configured: true,
  model: 'mock (no AI call)',
  key_hint: 'sk-…mock',
  usage: {
    month_start_uae: iso(Date.parse(new Date().toISOString().slice(0, 8) + '01T00:00:00+04:00')),
    runs: 23 + db.ideaRuns.length,
    failed_runs: 1,
    input_tokens: 412_000,
    output_tokens: 61_000,
    estimated_cost_usd: 2.15,
    daily_limit_per_account: 20,
  },
}))

// ---- suggestions and ideas
on('GET', '/suggestions/decisions', (_m, { params }) => db.decisions[acct(params)] ?? [])
on('PUT', '/suggestions/decisions', (_m, { body }) => {
  const b = body as { account_id: number; key: string; status: import('@/lib/api').DecisionStatus | null }
  const list = (db.decisions[b.account_id] ?? []).filter((d) => d.key !== b.key)
  if (b.status) list.push({ key: b.key, status: b.status, until: b.status === 'later' ? iso(now() + 14 * DAY) : null, decided_by: ME_EMAIL, updated_at: iso() })
  db.decisions[b.account_id] = list
  return { key: b.key, status: b.status }
})
on('GET', '/ai/ideas', (_m, { params }) => ({
  configured: true,
  latest: db.ideaRuns.filter((r) => r.account_id === acct(params)).at(-1) ?? null,
  runs_today: db.aiRunsToday,
  daily_limit: 20,
  running: false,
}))
on('POST', '/ai/ideas', async (_m, { body }) => {
  await wait(1800) // feel like thinking
  const b = body as { account_id: number; focus: string | null }
  const run = makeIdeasRun(b.account_id, b.focus)
  db.ideaRuns.push(run)
  db.aiRunsToday++
  return run
})
on('POST', '/ai/ideas/:run/:index/draft', (m) => {
  const run = db.ideaRuns.find((r) => r.id === id(m, 'run')) ?? notFound('Run not found')
  const idea = run.result?.ideas[id(m, 'index')] ?? notFound('Idea not found')
  const p = plannedFrom({
    account_id: run.account_id,
    format: 'text',
    details: {},
    caption: idea.draft_caption ?? `${idea.title}\n\n${idea.what}`,
    image_alt: null,
    visibility: 'PUBLIC',
    scheduled_at: null,
    goal: idea.type === 'leads' ? 'leads' : idea.type === 'sales' ? 'sales' : 'brand',
    topic: null,
    industry: null,
    cta: null,
    keywords: [],
  })
  db.planned.push(p)
  return { planned_id: p.id }
})
on('GET', '/ai/post-assist', () => ({ configured: true, runs_today: db.aiRunsToday, daily_limit: 20 }))
on('POST', '/ai/post-assist', async (_m, { body, form }) => {
  await wait(1400)
  db.aiRunsToday++
  return { id: nid(), status: 'ok', model: 'mock (no AI call)', cost_usd: 0.02, input_tokens: 2400, output_tokens: 700, result: postAssist(form ? formJson(form) : (body as Record<string, unknown>)), created_at: iso() }
})
on('GET', '/ai/post-chat', () => ({ configured: true, messages_today: db.aiRunsToday, daily_limit: 60, session_limit: 20 }))
on('POST', '/ai/post-chat', async (_m, { body, form }) => {
  await wait(1100)
  db.aiRunsToday++
  return { id: nid(), status: 'ok', model: 'mock (no AI call)', cost_usd: 0.01, input_tokens: 1200, output_tokens: 300, result: chatReply(form ? formJson(form) : (body as Record<string, unknown>)), created_at: iso() }
})

// ---- LinkedIn
on('GET', '/linkedin/config', () => ({ configured: true, missing: [] }))
on('GET', '/linkedin/connections', () => db.connections)
on('GET', '/linkedin/auth-url', (_m, { params }) => {
  // No real LinkedIn: connect straight away and come back as if the sign-in succeeded
  const a = db.accounts.find((x) => x.id === acct(params)) ?? notFound('Account not found')
  db.connections = db.connections.filter((c) => c.account_id !== a.id)
  db.connections.push({ account_id: a.id, name: a.name.replace(/ \(.*\)$/, ''), email: null, picture_url: null, expires_at: iso(now() + 60 * DAY), expired: false, days_left: 60, connected_at: iso() })
  for (const p of db.planned) if (p.account_id === a.id && !p.manual) p.by_hand = false
  return { url: `/linkedin?linkedin=connected&name=${encodeURIComponent(a.name)}` }
})
on('DELETE', '/linkedin/connections/:id', (m) => {
  db.connections = db.connections.filter((c) => c.account_id !== id(m))
  for (const p of db.planned) if (p.account_id === id(m)) p.by_hand = true
})

// ---- publishing (planner)
on('GET', '/planner', (_m, { params }) => {
  runScheduler()
  return db.planned
    .filter((p) => p.account_id === acct(params))
    .sort((a, b) => (a.scheduled_at ?? '9999').localeCompare(b.scheduled_at ?? '9999'))
})
on('POST', '/planner', (_m, { body }) => {
  const p = plannedFrom(body as PlannedPostInput)
  db.planned.push(p)
  return p
})
on('PUT', '/planner/:id', (m, { body }) => {
  const prev = getPlanned(id(m))
  if (prev.status === 'published') bad('This post is already on LinkedIn and can’t be edited here')
  const p = plannedFrom(body as PlannedPostInput, prev)
  db.planned = db.planned.map((x) => (x.id === p.id ? p : x))
  return p
})
on('DELETE', '/planner/:id', (m) => {
  clearMockFile('image', id(m))
  clearMockFile('media', id(m))
  db.planned = db.planned.filter((p) => p.id !== id(m))
})
on('POST', '/planner/:id/(?<action>approve|unapprove|publish|mark-posted)', (m, { body }) => {
  const p = getPlanned(id(m))
  const action = m.groups!.action
  if (action === 'approve') {
    if (!p.caption.trim()) bad('Add the post text before scheduling it')
    p.status = 'approved'
    p.approved_at = iso()
    p.error = null
  } else if (action === 'unapprove') {
    p.status = 'draft'
    p.approved_at = null
  } else if (action === 'publish') {
    const nowFlag = (body as { now?: boolean } | undefined)?.now
    if (p.by_hand) bad('This post has to be posted on LinkedIn by hand, then marked as posted')
    if (nowFlag || !p.scheduled_at || Date.parse(p.scheduled_at) <= now()) publishToPosts(p)
    else {
      p.status = 'approved'
      p.approved_at = iso()
    }
  } else if (action === 'mark-posted') {
    const url = (body as { post_url?: string } | undefined)?.post_url
    if (!url || !/linkedin\.com/.test(url)) bad('Paste the link to the post on LinkedIn')
    publishToPosts(p, url)
  }
  return p
})
on('POST', '/planner/:id/image', (m, { form }) => {
  const p = getPlanned(id(m))
  const f = form?.get('file')
  if (!(f instanceof File)) bad('No file')
  setMockFile('image', p.id, f)
  p.has_image = true
  return p
})
on('DELETE', '/planner/:id/image', (m) => {
  const p = getPlanned(id(m))
  clearMockFile('image', p.id)
  p.has_image = false
  return p
})
on('POST', '/planner/:id/media', (m, { form }) => {
  const p = getPlanned(id(m))
  const f = form?.get('file')
  if (!(f instanceof File)) bad('No file')
  setMockFile('media', p.id, f)
  p.has_media = true
  p.media_name = f.name
  return p
})
on('DELETE', '/planner/:id/media', (m) => {
  const p = getPlanned(id(m))
  clearMockFile('media', p.id)
  p.has_media = false
  p.media_name = null
  return p
})

// ---- imports (files are not read: the mock pretends they went in)
on('POST', '/import/csv', (_m, { form }) => {
  const f = form?.get('file')
  return { posts_created: 0, posts_updated: 0, snapshots_saved: 0, errors: f instanceof File ? [{ row: 0, error: `Mock mode: “${f.name}” was not read. Imports need the backend.` }] : [] }
})
on('POST', '/import/linkedin-export', (_m, { params, form }): ExportImportResult => {
  const a = db.accounts.find((x) => x.id === acct(params)) ?? notFound('Account not found')
  const files = (form?.getAll('files') ?? []).filter((f): f is File => f instanceof File)
  const exportedOn = (form?.get('exported_on') as string | null) ?? new Date().toISOString().slice(0, 10)
  const result: ExportImportResult = {
    account: a.name,
    account_kind: a.kind,
    files: files.map((f) => {
      const kind = /follower/i.test(f.name) ? 'followers' : /visitor/i.test(f.name) ? 'visitors' : /compet/i.test(f.name) ? 'competitors' : 'content'
      return {
        file: f.name,
        kind,
        exported_on: exportedOn,
        errors: [],
        days_saved: 30,
        days_new: 2,
        days_changed: 5,
        days_unchanged: 23,
        posts_created: kind === 'content' ? 0 : undefined,
        posts_updated: kind === 'content' ? 0 : undefined,
        posts_unchanged: kind === 'content' ? A.accountPosts(db, a.id).length : undefined,
        snapshots_saved: 0,
        demographic_status: kind === 'content' ? undefined : 'unchanged',
        skipped: 'Mock mode: the file was not read. Imports need the backend.',
      }
    }),
  }
  const li = (db.lastImports[a.id] ??= {})
  for (const f of result.files) {
    if (f.kind === 'content' || f.kind === 'followers' || f.kind === 'visitors') li[f.kind] = { at: iso(), exported_on: exportedOn, file: f.file }
  }
  return result
})

// ---------------------------------------------------------------- entry point

export async function mockRequest<T>(method: string, path: string, opts: Opts = {}): Promise<T> {
  // A short pause so loading states can be seen and designed
  await wait(120 + Math.random() * 220)
  const params = opts.params ?? {}
  for (const [m, re, h] of routes) {
    if (m !== method) continue
    const match = path.match(re)
    if (!match) continue
    const result = await h(match, { ...opts, params })
    if (method !== 'GET') persist()
    // Hand out copies, as a real server would: screens must not change the stored data by accident
    return (result === undefined ? undefined : structuredClone(result)) as T
  }
  console.warn(`[mock api] no handler for ${method} ${path}`)
  throw new ApiError(404, `Mock mode: ${method} ${path} is not mocked yet`)
}

