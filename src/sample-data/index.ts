import type {
  Account,
  AccountDoc,
  AccountDocs,
  Api,
  AudienceRow,
  ChatTurn,
  DecisionStatus,
  ExportImportResult,
  Idea,
  IdeasRun,
  ImportResult,
  Lead,
  LeadInput,
  Me,
  PageAudienceInput,
  PlannedPost,
  PlannedPostInput,
  PostAssistResult,
  PostAssistRun,
  PostFormat,
  PostInput,
  SnapshotInput,
  TeamMember,
  TeamMemberInput,
} from '@/lib/api'
import { ApiError } from '@/lib/api/client'
import * as A from './analytics'
import { buildSnapshot, computeShares, createSeed, DB_VERSION, DEFAULT_BRAND, DEFAULT_PERFORMANCE, DEFAULT_SEGMENTS, type MockDb, type StoredPost } from './seed'
import { DAY, istIso, slotOf, uaeHour, uaeIso, uaeWeekday } from './util'

const STORAGE_KEY = 'avaibe.sampleData'
const ME_EMAIL = 'you@avaibe.example'
const DEFAULTS = { segments: DEFAULT_SEGMENTS, performance: DEFAULT_PERFORMANCE, brand: DEFAULT_BRAND }

let cache: MockDb | null = null

function db(): MockDb {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb
      if (parsed.version === DB_VERSION) return (cache = parsed)
    }
  } catch {}
  cache = createSeed()
  save()
  return cache
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {}
}

export function resetSampleData() {
  cache = createSeed()
  save()
}

function ok<T>(value: T): Promise<T> {
  return Promise.resolve(value === undefined ? value : structuredClone(value))
}
function saved<T>(value: T): Promise<T> {
  save()
  return ok(value)
}
const fail = (status: number, msg: string): Promise<never> => Promise.reject(new ApiError(status, msg))

const nid = () => db().nextId++
const nref = () => `P-${String(db().nextRef++).padStart(4, '0')}`
const iso = (ts = Date.now()) => new Date(ts).toISOString()
const parseTime = (v: string) => Date.parse(v.length <= 16 ? `${v}+04:00` : v)

const files = /* @__PURE__ */ new Map<string, string>()
function setFile(kind: 'image' | 'media', id: number, file: File) {
  clearFile(kind, id)
  files.set(`${kind}:${id}`, URL.createObjectURL(file))
}
function clearFile(kind: 'image' | 'media', id: number) {
  const url = files.get(`${kind}:${id}`)
  if (url) URL.revokeObjectURL(url)
  files.delete(`${kind}:${id}`)
}
const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  /* @__PURE__ */ encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#22c1c3"/></linearGradient></defs><rect width="1200" height="1200" fill="url(#g)"/><text x="600" y="610" font-family="sans-serif" font-size="64" fill="#fff" text-anchor="middle" opacity="0.9">Sample image</text></svg>`,
  )
const fileUrl = (kind: 'image' | 'media', id: number) => files.get(`${kind}:${id}`) ?? PLACEHOLDER

function leadView(l: Lead): Lead {
  const d = db()
  const post = l.post_id ? d.posts.find((p) => p.id === l.post_id) : undefined
  const via = l.via_account_id ? d.accounts.find((a) => a.id === l.via_account_id) : undefined
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

const canPublishFromApp = (accountId: number) => db().connections.some((c) => c.account_id === accountId && !c.expired)

function plannedFrom(body: PlannedPostInput, prev?: PlannedPost): PlannedPost {
  const manual = ['carousel', 'video', 'article', 'poll'].includes(body.format)
  const formatChanged = !!prev && prev.format !== body.format
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

function publishToPosts(p: PlannedPost, postUrl?: string) {
  const d = db()
  const ts = Date.now()
  const urn = `urn:li:activity:${7300000000000000000 + p.id * 7919}`
  const format: PostFormat = p.format === 'article' ? 'newsletter' : p.format
  const post: StoredPost = {
    id: nid(),
    ref: p.ref,
    account_id: p.account_id,
    post_url: postUrl ?? `https://www.linkedin.com/feed/update/${urn}`,
    linkedin_post_id: urn,
    author: d.accounts.find((a) => a.id === p.account_id)?.name ?? null,
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
  d.posts.push(post)
  Object.assign(p, { status: 'published', published_at: post.published_at, linkedin_urn: urn, post_id: post.id, error: null })
}

function catchUpSchedule() {
  const now = Date.now()
  let changed = false
  for (const p of db().planned) {
    if (p.status !== 'approved' || !p.scheduled_at) continue
    const at = Date.parse(p.scheduled_at)
    if (!p.by_hand && at <= now) {
      publishToPosts(p)
      changed = true
    } else if (p.by_hand && at < now - 2 * DAY) {
      p.status = 'missed'
      changed = true
    }
  }
  if (changed) save()
}

function postFields(b: PostInput, timeKnown: boolean) {
  const ts = parseTime(b.published_at)
  return {
    published_at: iso(ts),
    published_at_uae: uaeIso(ts),
    published_at_ist: istIso(ts),
    day_uae: uaeWeekday(ts),
    slot_uae: timeKnown ? slotOf(uaeHour(ts)) : null,
    time_known: timeKnown,
  }
}

const getPost = (id: number) => db().posts.find((p) => p.id === id)
const getPlanned = (id: number) => db().planned.find((p) => p.id === id)

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

const SAMPLE_MODEL = 'sample answer (no AI call)'

function ideasRun(accountId: number, focus: string | null): IdeasRun {
  const shift = db().ideaRuns.length % IDEA_BANK.length
  const ideas = [...IDEA_BANK.slice(shift), ...IDEA_BANK.slice(0, shift)]
  return {
    id: nid(),
    account_id: accountId,
    focus,
    status: 'ok',
    model: SAMPLE_MODEL,
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

function assist(body: { format: string; caption: string; focus: string[]; scheduled_at: string | null }): PostAssistResult {
  const first = body.caption.trim().split('\n')[0] || 'Your opening line'
  const has = (part: string) => body.focus.includes(part)
  return {
    text: has('text')
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
    visual: has('visual')
      ? {
          notes: ['Use one clear message on the image, at most 8 words', 'Show a real screen or a real person, not stock art', 'Keep text away from the edges: LinkedIn crops on mobile'],
          prompt:
            body.format === 'carousel'
              ? null
              : {
                  prompt: 'Bright modern school office in Dubai, a bursar smiling at a laptop showing a clean dashboard, soft daylight, shallow depth of field, brand purple accents',
                  settings: ['Aspect 1:1', 'Photorealistic', 'No text in the image'],
                  tips: ['Generate 4 and pick the most natural one', 'Add the headline in the app, not in the prompt'],
                },
          slide_prompts:
            body.format === 'carousel'
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
    timing: has('timing')
      ? {
          verdict: body.scheduled_at ? 'A good time: working-day mornings do best for this page.' : 'No time picked yet. Working-day mornings do best for this page.',
          suggestions: ['Avoid Friday afternoons and weekends', 'Reply to comments in the first hour'],
          suggested_time: 'Tuesday 10:00',
        }
      : null,
    poll: has('poll')
      ? { question: 'Where would AI help your school most this year?', options: ['Admissions', 'Timetabling', 'Parent messages', 'Reports'], notes: ['Keep options under 30 characters', 'A 1-week poll gets the most votes'] }
      : null,
    cautions: body.caption.trim().length < 40 ? ['The post is very short; add one concrete detail or number.'] : [],
  }
}

function chatTurn(messages: { role: string; content: string }[], webSearch: boolean): ChatTurn {
  const last = messages.at(-1)?.content ?? ''
  const turn = messages.filter((m) => m.role === 'user').length
  const sources = webSearch ? { sources: [{ title: 'UAE private schools: market overview (sample)', url: 'https://example.com/uae-schools' }], searches: 1 } : {}
  if (turn <= 1) {
    return {
      message: 'Happy to help with that. To make the post land with UAE decision-makers, two quick questions:',
      questions: [
        { question: 'Who is it mainly for?', options: ['School principals', 'Bursars / finance', 'IT managers', 'SME owners'] },
        { question: 'What should readers do after reading?', options: ['Book a demo', 'Comment', 'Visit the website', 'Just remember us'] },
      ],
      draft_text: null,
      ...sources,
    }
  }
  const opener = last.length > 10 && last.length < 120 ? last.replace(/\.$/, '') + '.' : 'Most UAE schools still chase fees by phone.'
  return {
    message: 'Here’s a draft based on what you said. I kept the first line short so it shows before “…see more”. Want it shorter, or more personal?',
    questions: [{ question: 'Tone?', options: ['Keep it', 'More personal', 'More data', 'Shorter'] }],
    draft_text: `${opener}\n\nWe helped one Dubai school move to two-tap payments. Same-day collection, 400 fewer calls a term.\n\nWhat’s the one task you’d automate first?\n\n#UAE #EdTech`,
    ...sources,
  }
}

const aiRun = <R>(result: R) => {
  db().aiRunsToday++
  return { id: nid(), status: 'ok', model: SAMPLE_MODEL, cost_usd: 0.02, input_tokens: 2400, output_tokens: 700, result, created_at: iso() }
}

export const sampleApi: Api = {
  accounts: () => ok(db().accounts),
  createAccount: (body) => {
    const a: Account = { ...body, id: nid() }
    db().accounts.push(a)
    db().pageDaily[a.id] = []
    return saved(a)
  },

  posts: ({ account_id, format, checkpoint = 'latest' }) =>
    ok(
      db()
        .posts.filter((p) => (account_id ? p.account_id === account_id : true) && (format ? p.format === format : true))
        .sort((a, b) => b.published_at.localeCompare(a.published_at))
        .map((p) => A.toPost(db(), p, checkpoint)),
    ),
  post: (id) => {
    const p = getPost(id)
    return p ? ok(A.toPost(db(), p)) : fail(404, 'Post not found')
  },
  createPost: (b) => {
    const p: StoredPost = {
      ...b,
      ...postFields(b, b.time_known ?? true),
      id: nid(),
      ref: nref(),
      linkedin_post_id: null,
      targeted: null,
      topic_suggested: false,
      snapshots: [],
      audience: [],
      audience_captured_at: null,
    }
    db().posts.push(p)
    return saved(A.toPost(db(), p))
  },
  updatePost: (id, b) => {
    const p = getPost(id)
    if (!p) return fail(404, 'Post not found')
    Object.assign(p, b, postFields(b, b.time_known ?? p.time_known), { topic_suggested: false })
    return saved(A.toPost(db(), p))
  },
  deletePost: (id) => {
    db().posts = db().posts.filter((p) => p.id !== id)
    return saved(undefined)
  },
  saveSnapshot: (postId, checkpoint, body) => {
    const p = getPost(postId)
    if (!p) return fail(404, 'Post not found')
    const n = (k: keyof SnapshotInput) => (typeof body[k] === 'number' ? (body[k] as number) : null)
    const snap = {
      ...buildSnapshot(nid(), p.id, checkpoint, Date.parse(p.published_at), {}, p.format),
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
      captured_at: body.captured_at ?? iso(),
      notes: body.notes ?? null,
    }
    const parts = [snap.clicks, snap.reactions, snap.comments, snap.reposts].filter((v): v is number => v != null)
    snap.engagements = parts.length ? parts.reduce((a, b) => a + b, 0) : null
    snap.engagement_rate = snap.engagements != null && snap.impressions ? snap.engagements / snap.impressions : null
    snap.click_rate = snap.clicks != null && snap.impressions ? snap.clicks / snap.impressions : null
    p.snapshots = [...p.snapshots.filter((s) => s.checkpoint !== checkpoint), snap]
    return saved(snap)
  },
  deleteSnapshot: (postId, checkpoint) => {
    const p = getPost(postId)
    if (p) p.snapshots = p.snapshots.filter((s) => s.checkpoint !== checkpoint)
    return saved(undefined)
  },
  saveAudience: (postId, rows: AudienceRow[]) => {
    const p = getPost(postId)
    if (!p) return fail(404, 'Post not found')
    p.audience = rows
    p.audience_captured_at = rows.length ? iso() : null
    return saved(A.toPost(db(), p))
  },

  overview: ({ account_id, checkpoint }) => ok(A.overview(db(), account_id, checkpoint)),
  suggestions: ({ account_id }) => ok(A.suggestions(db(), account_id)),
  dueSnapshots: ({ account_id }) => ok(A.dueSnapshots(db(), account_id)),
  similarPosts: ({ account_id, queries }) => ok(A.similarPosts(db(), account_id, queries)),
  calendar: ({ account_id, from, to }) => ok(A.calendar(db(), account_id, from, to)),
  calendarItems: ({ from, to }) => ok({ from, to, items: A.itemsBetween(from, to) }),

  pageAudience: (accountId) => ok(db().pageAudience[accountId] ?? []),
  savePageAudience: (accountId, body: PageAudienceInput) => {
    const d = db()
    const list = (d.pageAudience[accountId] ?? []).filter((s) => !(s.as_of === body.as_of && s.audience === body.audience))
    list.push({ ...body, shares: computeShares(body.rows, d.settings.segments) })
    d.pageAudience[accountId] = list
    return saved({ saved: body.rows.length })
  },
  deletePageAudience: (accountId, as_of, audience) => {
    db().pageAudience[accountId] = (db().pageAudience[accountId] ?? []).filter((s) => !(s.as_of === as_of && s.audience === audience))
    return saved(undefined)
  },
  accountDoc: <K extends keyof AccountDocs>(accountId: number, kind: K) => {
    const empty: AccountDocs = { page_checklist: { items: {} }, competitors: { competitors: [] }, member_totals: { as_of: null, followers: null, totals: {} } }
    const doc = db().docs[`${accountId}:${kind}`] ?? { kind, data: empty[kind], updated_by: null, updated_at: null }
    return ok(doc as AccountDoc<K>)
  },
  saveAccountDoc: <K extends keyof AccountDocs>(accountId: number, kind: K, data: AccountDocs[K]) => {
    const doc: AccountDoc<K> = { kind, data, updated_by: ME_EMAIL, updated_at: iso() }
    db().docs[`${accountId}:${kind}`] = doc as AccountDoc<keyof AccountDocs>
    return saved(doc)
  },
  lastImports: (accountId) => ok(db().lastImports[accountId] ?? {}),
  pageDaily: (accountId) => ok(db().pageDaily[accountId] ?? []),
  importCsv: (_accountId, file): Promise<ImportResult> =>
    ok({ posts_created: 0, posts_updated: 0, snapshots_saved: 0, errors: [{ row: 0, error: `Sample data: “${file.name}” was not read. Imports need the backend.` }] }),
  importLinkedInExport: (accountId, files, exportedOn) => {
    const d = db()
    const a = d.accounts.find((x) => x.id === accountId)
    if (!a) return fail(404, 'Account not found')
    const on = exportedOn ?? new Date().toISOString().slice(0, 10)
    const result: ExportImportResult = {
      account: a.name,
      account_kind: a.kind,
      files: files.map((f) => {
        const kind = /follower/i.test(f.name) ? 'followers' : /visitor/i.test(f.name) ? 'visitors' : /compet/i.test(f.name) ? 'competitors' : 'content'
        return {
          file: f.name,
          kind,
          exported_on: on,
          errors: [],
          skipped: 'Sample data: the file was not read. Imports need the backend.',
        }
      }),
    }
    const last = (d.lastImports[accountId] ??= {})
    for (const f of result.files) if (f.kind === 'content' || f.kind === 'followers' || f.kind === 'visitors') last[f.kind] = { at: iso(), exported_on: on, file: f.file }
    return saved(result)
  },

  leads: (accountId) =>
    ok(db().leads.filter((l) => l.account_id === accountId).sort((a, b) => b.received_on.localeCompare(a.received_on)).map(leadView)),
  createLead: (body: LeadInput) => {
    const l = leadView({ ...body, id: nid(), updated_at: iso() } as Lead)
    db().leads.push(l)
    return saved(l)
  },
  updateLead: (id, body) => {
    const d = db()
    const i = d.leads.findIndex((l) => l.id === id)
    if (i < 0) return fail(404, 'Lead not found')
    d.leads[i] = leadView({ ...d.leads[i], ...body, updated_at: iso() })
    return saved(d.leads[i])
  },
  deleteLead: (id) => {
    db().leads = db().leads.filter((l) => l.id !== id)
    return saved(undefined)
  },
  leadReplied: (id) => {
    const l = db().leads.find((x) => x.id === id)
    if (!l) return fail(404, 'Lead not found')
    l.replied_at = iso()
    l.updated_at = iso()
    return saved(leadView(l))
  },

  me: (): Promise<Me> =>
    ok({
      enabled: false,
      user: { email: ME_EMAIL, name: 'You', role: 'admin', can_switch_accounts: true, dev: true },
      allowed_account_ids: db().accounts.map((a) => a.id),
      default_account_id: db().defaultAccountId,
    }),
  logout: () => ok({ signed_out: true }),
  team: () => ok({ members: db().team, default_account_id: db().defaultAccountId }),
  addMember: (b: TeamMemberInput) => {
    if (db().team.some((t) => t.email.toLowerCase() === b.email.toLowerCase())) return fail(400, 'That email is already on the team')
    const m: TeamMember = { ...b, id: nid(), last_login_at: null }
    db().team.push(m)
    return saved(m)
  },
  updateMember: (id, b) => {
    const m = db().team.find((x) => x.id === id)
    if (!m) return fail(404, 'Team member not found')
    Object.assign(m, b)
    return saved(m)
  },
  removeMember: (id) => {
    db().team = db().team.filter((x) => x.id !== id)
    return saved(undefined)
  },
  setDefaultAccount: (accountId) => {
    db().defaultAccountId = accountId
    return saved({ default_account_id: accountId })
  },

  settings: () => ok({ current: db().settings, defaults: DEFAULTS }),
  saveSettings: (section, body) => {
    ;(db().settings as Record<string, unknown>)[section] = body
    return saved(body)
  },
  resetSettings: (section) => {
    ;(db().settings as Record<string, unknown>)[section] = DEFAULTS[section]
    return saved(DEFAULTS[section])
  },
  claudeStatus: () =>
    ok({
      configured: true,
      model: SAMPLE_MODEL,
      key_hint: 'sk-…sample',
      usage: {
        month_start_uae: iso(Date.parse(new Date().toISOString().slice(0, 8) + '01T00:00:00+04:00')),
        runs: 23 + db().ideaRuns.length,
        failed_runs: 1,
        input_tokens: 412_000,
        output_tokens: 61_000,
        estimated_cost_usd: 2.15,
        daily_limit_per_account: 20,
      },
    }),

  decisions: (accountId) => ok(db().decisions[accountId] ?? []),
  decide: ({ account_id, key, status }: { account_id: number; key: string; status: DecisionStatus | null }) => {
    const d = db()
    const list = (d.decisions[account_id] ?? []).filter((x) => x.key !== key)
    if (status) list.push({ key, status, until: status === 'later' ? iso(Date.now() + 14 * DAY) : null, decided_by: ME_EMAIL, updated_at: iso() })
    d.decisions[account_id] = list
    return saved({ key, status })
  },
  ideas: (accountId) =>
    ok({
      configured: true,
      latest: db().ideaRuns.filter((r) => r.account_id === accountId).at(-1) ?? null,
      runs_today: db().aiRunsToday,
      daily_limit: 20,
      running: false,
    }),
  generateIdeas: ({ account_id, focus }) => {
    const run = ideasRun(account_id, focus)
    db().ideaRuns.push(run)
    db().aiRunsToday++
    return saved(run)
  },
  ideaToDraft: (runId, index) => {
    const idea = db().ideaRuns.find((r) => r.id === runId)?.result?.ideas[index]
    const run = db().ideaRuns.find((r) => r.id === runId)
    if (!run || !idea) return fail(404, 'Idea not found')
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
    db().planned.push(p)
    return saved({ planned_id: p.id })
  },
  postAssistStatus: () => ok({ configured: true, runs_today: db().aiRunsToday, daily_limit: 20 }),
  postAssist: (body) => saved(aiRun(assist(body)) as PostAssistRun),
  postChatStatus: () => ok({ configured: true, messages_today: db().aiRunsToday, daily_limit: 60, session_limit: 20 }),
  postChat: (body) => saved(aiRun(chatTurn(body.messages, !!body.web_search))),

  linkedinConfig: () => ok({ configured: true, missing: [] }),
  linkedinConnections: () => ok(db().connections),
  linkedinAuthUrl: (accountId) => {
    const d = db()
    const a = d.accounts.find((x) => x.id === accountId)
    if (!a) return fail(404, 'Account not found')
    d.connections = d.connections.filter((c) => c.account_id !== a.id)
    d.connections.push({ account_id: a.id, name: a.name.replace(/ \(.*\)$/, ''), email: null, picture_url: null, expires_at: iso(Date.now() + 60 * DAY), expired: false, days_left: 60, connected_at: iso() })
    for (const p of d.planned) if (p.account_id === a.id && !p.manual) p.by_hand = false
    return saved({ url: `/linkedin?linkedin=connected&name=${encodeURIComponent(a.name)}` })
  },
  linkedinDisconnect: (accountId) => {
    const d = db()
    d.connections = d.connections.filter((c) => c.account_id !== accountId)
    for (const p of d.planned) if (p.account_id === accountId) p.by_hand = true
    return saved(undefined)
  },

  planned: (accountId) => {
    catchUpSchedule()
    return ok(db().planned.filter((p) => p.account_id === accountId).sort((a, b) => (a.scheduled_at ?? '9999').localeCompare(b.scheduled_at ?? '9999')))
  },
  createPlanned: (body) => {
    const p = plannedFrom(body)
    db().planned.push(p)
    return saved(p)
  },
  updatePlanned: (id, body) => {
    const prev = getPlanned(id)
    if (!prev) return fail(404, 'Draft not found')
    if (prev.status === 'published') return fail(400, 'This post is already on LinkedIn and can’t be edited here')
    const p = plannedFrom(body, prev)
    db().planned = db().planned.map((x) => (x.id === id ? p : x))
    return saved(p)
  },
  deletePlanned: (id) => {
    clearFile('image', id)
    clearFile('media', id)
    db().planned = db().planned.filter((p) => p.id !== id)
    return saved(undefined)
  },
  plannedAction: (id, action, body) => {
    const p = getPlanned(id)
    if (!p) return fail(404, 'Draft not found')
    if (action === 'approve') {
      if (!p.caption.trim()) return fail(400, 'Add the post text before scheduling it')
      Object.assign(p, { status: 'approved', approved_at: iso(), error: null })
    } else if (action === 'unapprove') {
      Object.assign(p, { status: 'draft', approved_at: null })
    } else {
      if (p.by_hand) return fail(400, 'This post has to be posted on LinkedIn by hand, then marked as posted')
      if (body?.now || !p.scheduled_at || Date.parse(p.scheduled_at) <= Date.now()) publishToPosts(p)
      else Object.assign(p, { status: 'approved', approved_at: iso() })
    }
    return saved(p)
  },
  markPosted: (id, postUrl) => {
    const p = getPlanned(id)
    if (!p) return fail(404, 'Draft not found')
    if (!/linkedin\.com/.test(postUrl)) return fail(400, 'Paste the link to the post on LinkedIn')
    publishToPosts(p, postUrl)
    return saved(p)
  },
  uploadPlannedImage: (id, file) => {
    const p = getPlanned(id)
    if (!p) return fail(404, 'Draft not found')
    setFile('image', id, file)
    p.has_image = true
    return saved(p)
  },
  removePlannedImage: (id) => {
    const p = getPlanned(id)
    if (!p) return fail(404, 'Draft not found')
    clearFile('image', id)
    p.has_image = false
    return saved(p)
  },
  uploadPlannedMedia: (id, file) => {
    const p = getPlanned(id)
    if (!p) return fail(404, 'Draft not found')
    setFile('media', id, file)
    Object.assign(p, { has_media: true, media_name: file.name })
    return saved(p)
  },
  plannedImageUrl: (id) => fileUrl('image', id),
  plannedMediaUrl: (id) => fileUrl('media', id),
}

