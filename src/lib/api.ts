// Typed client for the FastAPI backend. In dev, Vite proxies /api to :8000.

// 'untagged': imported from a LinkedIn export that didn't say what kind of post it was
export const FORMATS = ['image', 'carousel', 'video', 'poll', 'newsletter', 'text', 'untagged'] as const
export type PostFormat = (typeof FORMATS)[number]

export const CHECKPOINTS = ['1h', '6h', '24h', '48h', '7d'] as const
export type Checkpoint = (typeof CHECKPOINTS)[number]
export type CheckpointQ = Checkpoint | 'latest'

export const METRIC_FIELDS = [
  'impressions',
  'members_reached',
  'clicks',
  'reactions',
  'comments',
  'reposts',
  'video_views',
  'poll_votes',
  'newsletter_views',
  'newsletter_subscribers',
  'followers_gained',
] as const
export type MetricField = (typeof METRIC_FIELDS)[number]

export type Role = 'viewer' | 'editor' | 'approver' | 'admin'
export const ROLES: Role[] = ['viewer', 'editor', 'approver', 'admin']

export interface Me {
  enabled: boolean
  user: {
    email: string
    name: string | null
    role: Role
    can_switch_accounts: boolean
    dev: boolean
  } | null
  allowed_account_ids?: number[]
  default_account_id?: number | null
}

export interface TeamMember {
  id: number
  email: string
  name: string | null
  role: Role
  can_switch_accounts: boolean
  active: boolean
  last_login_at: string | null
}

export interface TeamMemberInput {
  email: string
  name: string | null
  role: Role
  can_switch_accounts: boolean
  active: boolean
}

export interface SegmentSettings {
  uae_country: string[]
  uae_cities: string[]
  education_industry: string[]
  decision_seniority: string[]
  decision_titles: string[]
  tech_functions: string[]
  partner_functions: string[]
}

export interface PerformanceSettings {
  min_history: number
  min_slot_posts: number
  cut_high: number
  cut_above: number
  cut_average: number
  cut_below: number
  trend_threshold: number
}

export interface BrandSettings {
  company_summary: string
  website: string
  services: string[]
  target_segments: string[]
  differentiators: string[]
  proof_points: string[]
  voice: string
  avoid: string[]
  competitors: string[]
  languages: string[]
}

export interface AppSettings {
  current: { segments: SegmentSettings; performance: PerformanceSettings; brand: BrandSettings }
  defaults: { segments: SegmentSettings; performance: PerformanceSettings; brand: BrandSettings }
}

export interface ClaudeUsage {
  month_start_uae: string
  runs: number
  failed_runs: number
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
  daily_limit_per_account: number
}

export interface ClaudeStatus {
  configured: boolean
  model: string
  key_hint: string | null
  usage: ClaudeUsage
}

export type IdeaType = 'post' | 'campaign' | 'outreach' | 'brand' | 'seo_aeo' | 'leads' | 'sales'

export type LeadSource = 'company_post' | 'founder_post' | 'company_page' | 'founder_profile' | 'website' | 'referral' | 'event' | 'other'
export type LeadStage = 'new' | 'talking' | 'proposal' | 'won' | 'lost'

export interface LeadInput {
  account_id: number
  received_on: string
  source: LeadSource
  post_id: number | null
  via_account_id: number | null
  company: string
  industry: string | null
  in_uae: boolean | null
  role: string | null
  decision_maker: boolean | null
  service: string | null
  stage: LeadStage
  value_aed: number | null
  closed_on: string | null
  notes: string | null
  /** In their words: how they heard about AVAIBE */
  how_heard: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  /** First reply by the team (ISO time) */
  replied_at: string | null
  /** Override; null = default rule (UAE-based decision-maker) */
  qualified: boolean | null
}

export interface Lead extends LeadInput {
  id: number
  /** The override if set, otherwise the default rule; null when unknown */
  is_qualified: boolean | null
  post_title: string | null
  post_topic: string | null
  post_format: string | null
  post_date: string | null
  via_account_name: string | null
  updated_at: string
}
type Level = 'low' | 'medium' | 'high'

export interface Idea {
  type: IdeaType
  title: string
  what: string
  when: string
  who: string
  why: string[]
  novelty: string
  boost: string
  risk: string
  confidence: Level
  confidence_reason: string
  effort: Level
  measure: { metric: string; period: string; target: string }
  draft_caption: string | null
}

export interface IdeasRun {
  id: number
  account_id: number
  focus: string | null
  status: 'ok' | 'error'
  model: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  result: { situation: string; ideas: Idea[]; data_gaps: string[] } | null
  error: string | null
  created_by: string | null
  created_at: string
}

/** Brand section: shared per-account documents */
export interface PageChecklistData {
  items: Record<string, { done: boolean; note?: string | null }>
}
export type CompetitorSegment = 'software' | 'erp' | 'edtech' | 'it_services' | 'agency' | 'other'
export interface Competitor {
  id: string
  name: string
  segment: CompetitorSegment
  website?: string | null
  linkedin_url?: string | null
  followers?: number | null
  posts_per_week?: number | null
  topics?: string | null
  positioning?: string | null
  strengths?: string | null
  opportunity?: string | null
  checked_on?: string | null
}
export interface CompetitorsData {
  competitors: Competitor[]
}
/** A founder's totals across ALL their posts (LinkedIn member analytics), written by the sync */
export interface MemberTotalsData {
  as_of: string | null
  followers: number | null
  totals: Partial<Record<
    | 'IMPRESSION' | 'MEMBERS_REACHED' | 'REACTION' | 'COMMENT' | 'RESHARE' | 'POST_SAVE' | 'POST_SEND' | 'LINK_CLICKS'
    | 'FOLLOWER_GAINED_FROM_CONTENT' | 'PROFILE_VIEW_FROM_CONTENT',
    number
  >>
}
export interface AccountDocs {
  page_checklist: PageChecklistData
  competitors: CompetitorsData
  member_totals: MemberTotalsData
}
export interface AccountDoc<K extends keyof AccountDocs> {
  kind: K
  data: AccountDocs[K]
  updated_by: string | null
  updated_at: string | null
}

/** The team's shared decision on a suggestion ("rule:<id>") or Claude idea ("ai:<run>:<index>") */
export type DecisionStatus = 'doing' | 'later' | 'dismissed' | 'done'
export interface Decision {
  key: string
  status: DecisionStatus
  until: string | null
  decided_by: string | null
  updated_at: string
}

export interface IdeasState {
  configured: boolean
  latest: IdeasRun | null
  runs_today: number
  daily_limit: number
  /** A run is in progress for this account (possibly started by someone else) */
  running: boolean
}

export interface LinkedInConfig {
  configured: boolean
  missing: string[]
}

export interface LinkedInConnection {
  account_id: number
  name: string | null
  email: string | null
  picture_url: string | null
  expires_at: string
  expired: boolean
  days_left: number
  connected_at: string | null
}

export type PlannedStatus = 'draft' | 'approved' | 'publishing' | 'published' | 'failed' | 'missed'

export const PLANNED_FORMATS = ['text', 'image', 'carousel', 'video', 'article', 'poll'] as const
export type PlannedFormat = (typeof PLANNED_FORMATS)[number]

/** Format-specific fields; only the ones for the post's format are stored */
export interface PlannedDetails {
  document_title?: string
  /** Carousel built in the app: its slides and look (the PDF is made in the browser and uploaded as the media file) */
  slides?: { headline: string; body: string }[]
  carousel_theme?: 'brand' | 'dark' | 'light'
  carousel_accent?: string
  subtitles?: boolean
  title?: string
  link?: string
  question?: string
  options?: string[]
  duration?: '1d' | '3d' | '1w' | '2w'
}

export interface PlannedPost {
  id: number
  /** Readable post ID (P-0042), kept when the post is published and tracked in Data */
  ref: string | null
  account_id: number
  format: PlannedFormat
  /** Empty for drafts made before goals existed */
  goal: PostGoal | null
  /** Posted by hand (carousel, video, article, poll): the app can't publish these yet */
  manual: boolean
  /** Posted by hand: a hand-posted format, or an account the app can't post to yet */
  by_hand: boolean
  details: PlannedDetails
  has_media: boolean
  media_name: string | null
  caption: string
  has_image: boolean
  image_alt: string | null
  visibility: 'PUBLIC' | 'CONNECTIONS'
  scheduled_at: string | null
  scheduled_at_uae: string | null
  scheduled_day_uae: string | null
  scheduled_slot_uae: string | null
  status: PlannedStatus
  topic: string | null
  industry: string | null
  cta: string | null
  keywords: string[]
  approved_at: string | null
  published_at: string | null
  linkedin_urn: string | null
  post_id: number | null
  error: string | null
  /** LinkedIn was busy: next automatic try (approved) or when to try again (failed). Null when not waiting. */
  retry_at: string | null
  attempts: number
}

export interface PlannedPostInput {
  account_id: number
  format: PlannedFormat
  details: PlannedDetails
  caption: string
  image_alt: string | null
  visibility: 'PUBLIC' | 'CONNECTIONS'
  scheduled_at: string | null // ISO 8601 with offset/UTC
  goal: PostGoal
  topic: string | null
  industry: string | null
  cta: string | null
  keywords: string[]
}

/** What a post aims for (required on Create post) */
export type PostGoal = 'brand' | 'leads' | 'sales' | 'engagement'
export const POST_GOALS: { value: PostGoal; label: string; hint: string }[] = [
  { value: 'brand', label: 'Brand', hint: 'Brand awareness: get AVAIBE known to the right people in the UAE' },
  { value: 'leads', label: 'Leads', hint: 'Bring in enquiries: comments, DMs, demo requests' },
  { value: 'sales', label: 'Sales', hint: 'Move people already talking to AVAIBE towards a deal' },
  { value: 'engagement', label: 'Engagement', hint: 'Start conversations and grow the community' },
]

export interface Account {
  id: number
  name: string
  kind: 'company' | 'founder' | 'personal'
  linkedin_url: string | null
  is_test: boolean
  /** Founder / personal profiles: the company page they belong to */
  parent_id?: number | null
}

export interface Classification {
  label: string
  baseline: string
  percentile?: number
}

export type Snapshot = {
  id: number
  post_id: number
  checkpoint: Checkpoint
  captured_at: string
  notes: string | null
  engagements: number | null
  engagement_rate: number | null
  click_rate: number | null
  /** From LinkedIn's member (founder) post analytics only */
  saves?: number | null
  sends?: number | null
  profile_views?: number | null
} & Record<MetricField, number | null>

export interface PostSummary {
  id: number
  /** Readable post ID (P-0042): the same one the post had as a draft */
  ref: string | null
  account_id: number
  post_url: string | null
  linkedin_post_id: string | null
  author: string | null
  published_at: string
  published_at_uae: string
  published_at_ist: string
  day_uae: string
  /** Null when only the date is known */
  slot_uae: string | null
  /** False for posts imported from a LinkedIn export: only the date is known */
  time_known: boolean
  /** Audience: true = targeted subset, false = all followers, null = unknown (manual or export) */
  targeted: boolean | null
  format: PostFormat
  topic: string | null
  /** The topic/CTA were suggested from the caption on import and nobody has confirmed them yet */
  topic_suggested: boolean
  industry: string | null
  keywords: string[]
  cta: string | null
  hashtags: string[]
  caption: string | null
  notes: string | null
  /** What the post aimed for, when it was planned in the app */
  goal?: PostGoal | null
}

export const DIMENSIONS = ['location', 'industry', 'seniority', 'job_title', 'job_function', 'company_size', 'company'] as const
export type Dimension = (typeof DIMENSIONS)[number]

export interface Shares {
  uae_share: number | null
  education_share: number | null
  decision_maker_share: number | null
  /** Job functions in Settings → Audience definitions (may be missing on older data) */
  tech_share?: number | null
  partner_share?: number | null
}

export interface AudienceRow {
  dimension: Dimension
  value: string
  pct: number
}

export interface Post extends PostSummary {
  snapshots: Snapshot[]
  audience: AudienceRow[]
  audience_captured_at: string | null
  shares: Shares
  classification?: Classification | null
}

/** Audience statistics returned alongside most aggregates. Shares are 0..1 lower bounds. */
export interface AudienceStats {
  posts_with_audience: number
  median_uae_share: number | null
  median_education_share: number | null
  median_decision_maker_share: number | null
  median_uae_impressions: number | null
  median_education_impressions: number | null
}

export interface PageAudienceRow {
  dimension: Dimension
  value: string
  count: number | null
  pct: number | null
}

export interface PageAudienceSnapshot {
  as_of: string
  audience: 'followers' | 'visitors'
  total: number | null
  rows: PageAudienceRow[]
  shares: Shares
}

export interface PageAudienceInput {
  as_of: string
  audience: 'followers' | 'visitors'
  total: number | null
  rows: PageAudienceRow[]
}

export interface PostInput {
  account_id: number
  post_url: string | null
  author: string | null
  published_at: string // ISO 8601 with offset/UTC (naive values are read as UAE time by the API)
  /** Omit to keep what is stored; false = only the date is known */
  time_known?: boolean
  format: PostFormat
  topic: string | null
  industry: string | null
  keywords: string[]
  cta: string | null
  hashtags: string[]
  caption: string | null
  notes: string | null
}

export type SnapshotInput = Partial<Record<MetricField, number | null>> & {
  captured_at?: string | null
  notes?: string | null
}

export interface Overview extends AudienceStats {
  checkpoint: string
  /** The checkpoint most posts have a snapshot for */
  suggested_checkpoint: Checkpoint
  posts_total: number
  posts_time_unknown: number
  posts_untagged: number
  posts_topic_suggested: number
  posts_at_checkpoint: number
  median_impressions: number | null
  median_engagement_rate: number | null
  median_click_rate: number | null
  total_clicks: number | null
  total_followers_gained: number | null
}

export interface RankedRow {
  post: PostSummary
  checkpoint: string
  value: number | null
  impressions: number | null
  engagements: number | null
  engagement_rate: number | null
  clicks: number | null
  comments: number | null
  classification: Classification | null
}

export interface Rankings {
  metric: string
  checkpoint: string
  top: RankedRow[]
  bottom: RankedRow[]
  note: string | null
}

export interface FormatRow extends AudienceStats {
  format: PostFormat
  posts: number
  median_impressions: number | null
  median_engagement_rate: number | null
  median_clicks: number | null
  median_comments: number | null
  key_metric: string
  median_key_metric: number | null
  followers_gained: number | null
}

export interface HeatCell {
  day: string
  slot: string
  posts: number
  median: number | null
  low_confidence: boolean
}

export interface SlotSuggestion {
  day: string
  slot: string
  median: number
  posts: number
}

export interface Heatmap {
  metric: string
  checkpoint: string
  format: string | null
  days: string[]
  slots: string[]
  min_posts_per_slot: number
  /** Median over every timed post: "your typical post", for comparing slots */
  overall_median?: number | null
  /** Posts left out because only their date is known */
  posts_without_time: number
  cells: HeatCell[]
  suggestion: SlotSuggestion | null
}

export interface BestSlot {
  format: PostFormat
  metric: string
  posts: number
  suggestion: SlotSuggestion | null
}

export interface GroupRow extends AudienceStats {
  key: string
  posts: number
  median_impressions: number | null
  median_engagement_rate: number | null
  median_comments: number | null
  median_clicks: number | null
  followers_gained: number | null
}

export interface WindowStats extends AudienceStats {
  posts: number
  total_impressions: number | null
  median_impressions: number | null
  median_engagement_rate: number | null
  total_clicks: number | null
  followers_gained: number | null
}

export type Trend = 'improving' | 'declining' | 'stable' | 'unknown'

export interface Consistency {
  checkpoint: string
  windows: {
    days: number
    current: WindowStats
    previous: WindowStats
    median_impressions_trend: Trend
    engagement_rate_trend: Trend
    followers_trend: Trend
    uae_impressions_trend: Trend
  }[]
  weekly_posts: { week_start: string; posts: number }[]
  weeks_without_posts: number
  format_share_90d: { format: PostFormat; impressions: number; share: number | null }[]
  dominant_format_90d: { format: PostFormat; impressions: number; share: number } | null
}

export interface DueSnapshot {
  post_id: number
  topic: string | null
  format: PostFormat
  checkpoint: Checkpoint
  due_at: string
  due_at_uae: string
  hours_late: number
  closes_at: string
  closes_at_uae: string
}

export interface Suggestion {
  id: string
  // 'page' = company-page setup items, made in the app (lib/page-checklist.ts) and shown as Brand suggestions
  category: 'data' | 'timing' | 'format' | 'topic' | 'cta' | 'consistency' | 'trend' | 'page' | 'lead'
  priority: 'high' | 'medium' | 'low'
  title: string
  when: string
  who: string
  why: string[]
  boost: string
  risk: string
  confidence: { level: 'high' | 'medium' | 'low'; reason: string }
  measure: { metric: string; period: string; target: string }
  action: { label: string; to: string } | null
  /** Data fixes: how much is done so far */
  progress: { done: number; total: number; label: string } | null
  /** Topic suggestions: the topic they are about */
  topic?: string | null
}

/** Past posts on the same topic as an idea, and how they did vs the account's typical post */
export interface SimilarResult {
  topic: string | null
  count: number
  with_numbers: number
  median_impressions: number | null
  verdict: 'above' | 'below' | 'similar' | null
  posts: { id: number; hook: string; published: string; impressions: number | null }[]
}
export interface SimilarResponse {
  checkpoint: string
  baseline: number | null
  results: Record<string, SimilarResult>
}

export interface SuggestionsResult {
  metric: string
  metric_label: string
  baseline: number | null
  /** The post age suggestions compare at (7d for history imported from LinkedIn) */
  checkpoint?: string
  generated_at?: string
  suggestions: Suggestion[]
}

export interface ImportResult {
  posts_created: number
  posts_updated: number
  snapshots_saved: number
  errors: { row: number; error: string }[]
}

export interface ExportFileResult {
  file: string
  kind: 'content' | 'followers' | 'visitors' | 'competitors' | null
  exported_on?: string
  errors: string[]
  skipped?: string
  days_saved?: number
  days_new?: number
  days_changed?: number
  days_unchanged?: number
  posts_created?: number
  /** Already stored and something changed (usually newer numbers) */
  posts_updated?: number
  /** Already stored and identical: nothing was added */
  posts_unchanged?: number
  snapshots_saved?: number
  snapshots_kept_manual?: number
  posts_too_new?: number
  demographic_rows?: number
  demographic_total?: number
  demographic_status?: 'new' | 'changed' | 'unchanged'
}

/** Compare posts → Ask AI why: Claude's reading of the difference */
export interface CompareExplanation {
  summary: string
  reasons: { reason: string; confidence: 'high' | 'medium' | 'low' }[]
  try_next: string[]
  caveats: string[]
}

/** Analyse → a prompt for an outside image/video tool (Seedance, Seedream…) */
export interface VisualPrompt {
  prompt: string
  settings: string[]
  tips: string[]
}
export interface CarouselPrompts {
  document_title: string
  style: string
  slides: { headline: string; body: string; prompt: string }[]
  tips: string[]
}
/** The parts of a post Analyse can review (picked after clicking Analyse) */
export type AnalysePart = 'text' | 'visual' | 'timing' | 'poll'

/** Create post → Analyse: Claude's suggestions for one draft (only ever runs on click).
    Each review is filled only for the parts of the post the team picked. */
export interface PostAssistResult {
  text: {
    improved_text: string
    what_changed: string[]
    quick_fixes: { kind: 'hashtags' | 'shorter' | 'cta'; title: string; text: string }[]
  } | null
  visual: { notes: string[]; prompt: VisualPrompt | null; slide_prompts: CarouselPrompts | null } | null
  timing: { verdict: string; suggestions: string[]; suggested_time: string | null } | null
  poll: { question: string; options: string[]; notes: string[] } | null
  cautions: string[]
}

export interface PostAssistRun {
  id: number
  status: string
  model: string
  cost_usd: number
  input_tokens: number | null
  output_tokens: number | null
  result: PostAssistResult
  created_at: string
}

/** Create post → Chat with AI: one turn of the conversation */
export interface ChatTurn {
  message: string
  questions: { question: string; options: string[] }[]
  draft_text: string | null
  /** When web search was on for that message: the pages it drew on */
  sources?: { title: string; url: string }[]
  searches?: number
}

/** When each LinkedIn export type was last imported for an account */
export type LastImports = Partial<Record<'content' | 'followers' | 'visitors', { at: string | null; exported_on: string; file: string | null }>>

export interface ExportImportResult {
  account: string
  account_kind: Account['kind']
  files: ExportFileResult[]
}

export interface PageDay {
  date: string
  impressions: number | null
  unique_impressions: number | null
  clicks: number | null
  reactions: number | null
  comments: number | null
  reposts: number | null
  page_views: number | null
  unique_visitors: number | null
  new_followers: number | null
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Params = Record<string, string | number | boolean | null | undefined>

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function qs(params?: Params): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export type CalendarKind = 'uae_holiday' | 'india_holiday' | 'period' | 'event' | 'awareness' | 'business'

export interface CalendarItem {
  start: string
  end: string
  title: string
  kind: CalendarKind
  status: 'confirmed' | 'expected'
  note: string
}

export interface CalendarPost {
  id: number
  ref: string | null
  account_id: number
  account_name: string
  account_kind: string
  date: string
  time: string | null
  format: string
  title: string
  impressions: number | null
  checkpoint: string | null
  vs_typical: number | null
}

export interface CalendarPlanned {
  id: number
  ref: string | null
  date: string
  time: string
  slot: string
  format: string
  status: string
  title: string
}

export type EffectVerdict = 'better' | 'worse' | 'no_clear_difference' | 'too_few' | 'untested'

export interface TimingEffect {
  key: string
  label: string
  posts: number
  lift: number
  low: number
  high: number
  verdict: EffectVerdict
}

export interface TimingBacktest {
  ran: boolean
  reason?: string
  train?: number
  test?: number
  improvement_pct?: number
  verdict?: 'helps' | 'no_difference' | 'worse'
  text?: string
}

export interface DateAdvice {
  date: string
  weekday: string
  labels: string[]
  weekend: boolean
  best_slot: string
  best_lift: number
  clear: boolean
  slots: { slot: string; lift: number; posts: number }[]
  date_lift: number
  date_posts: number
  test_slot: string | null
}

export type CalendarTiming =
  | { ready: false; posts_used: number; reason: string }
  | { ready: true; posts_used: number; backtest: TimingBacktest; special: Record<string, TimingEffect>; days: Record<string, DateAdvice> }

export interface CalendarData {
  from: string
  to: string
  accounts: { id: number; name: string; kind: string }[]
  posts: CalendarPost[]
  planned: CalendarPlanned[]
  items: CalendarItem[]
  timing: CalendarTiming
  dates_cover: [number, number]
}

export interface TimingModel {
  metric: string
  metric_label: string
  checkpoint: string
  posts_used: number
  posts_without_time: number
  prior: number
  min_posts: number
  ready: boolean
  reason?: string
  days?: TimingEffect[]
  slots?: TimingEffect[]
  special?: TimingEffect[]
  ramadan_slots?: TimingEffect[]
  formats?: { key: string; posts: number; lift: number }[]
  topics?: { key: string; posts: number; lift: number }[]
  spread?: { day: number | null; slot: number | null; format: number | null; topic: number | null }
  backtest?: TimingBacktest
  upcoming?: DateAdvice[]
}

/** A JSON body as multipart form fields plus one file (lists and objects are sent as JSON text) */
function toForm(body: Record<string, unknown>, file: File): FormData {
  const form = new FormData()
  for (const [k, v] of Object.entries(body)) {
    if (v == null) continue
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  form.append('attachment', file)
  return form
}

async function request<T>(method: string, path: string, opts: { params?: Params; body?: unknown; form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method }
  if (opts.form) {
    init.body = opts.form
  } else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  init.credentials = 'same-origin' // send the session cookie
  if (method !== 'GET') {
    // Django's protection against forged cross-site requests: echo the csrftoken cookie back in a header
    const token = csrfToken()
    if (token) init.headers = { ...(init.headers as Record<string, string> | undefined), 'X-CSRFToken': token }
  }
  const res = await fetch(`/api${path}${qs(opts.params)}`, init)
  if (res.status === 401 && !path.startsWith('/auth/') && window.location.pathname !== '/signin') {
    // Session ended or never started: go to the sign-in page
    window.location.href = '/signin'
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const data = await res.json()
      msg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  accounts: () => request<Account[]>('GET', '/accounts'),
  createAccount: (body: Omit<Account, 'id'>) => request<Account>('POST', '/accounts', { body }),

  /** Omit account_id for all accounts */
  posts: (params: { account_id?: number; format?: string; checkpoint?: CheckpointQ; metric?: string }) =>
    request<Post[]>('GET', '/posts', { params }),
  post: (id: number) => request<Post>('GET', `/posts/${id}`),
  createPost: (body: PostInput) => request<Post>('POST', '/posts', { body }),
  updatePost: (id: number, body: PostInput) => request<Post>('PUT', `/posts/${id}`, { body }),
  deletePost: (id: number) => request<void>('DELETE', `/posts/${id}`),
  saveSnapshot: (postId: number, checkpoint: Checkpoint, body: SnapshotInput) =>
    request<Snapshot>('PUT', `/posts/${postId}/snapshots/${checkpoint}`, { body }),
  deleteSnapshot: (postId: number, checkpoint: Checkpoint) =>
    request<void>('DELETE', `/posts/${postId}/snapshots/${checkpoint}`),

  overview: (p: { account_id: number; checkpoint: CheckpointQ }) => request<Overview>('GET', '/analytics/overview', { params: p }),
  // days: posts published in the last N days; from/to: custom UAE dates (inclusive); none = all time
  rankings: (p: { account_id: number; checkpoint: CheckpointQ; metric: string; limit?: number; days?: number; from?: string; to?: string }) =>
    request<Rankings>('GET', '/analytics/rankings', { params: p }),
  formats: (p: { account_id: number; checkpoint: CheckpointQ; days?: number; from?: string; to?: string }) => request<FormatRow[]>('GET', '/analytics/formats', { params: p }),
  heatmap: (p: { account_id: number; checkpoint: CheckpointQ; metric: string; format?: string; days?: number; from?: string; to?: string }) =>
    request<Heatmap>('GET', '/analytics/heatmap', { params: p }),
  bestSlots: (p: { account_id: number; checkpoint: CheckpointQ; days?: number; from?: string; to?: string }) => request<BestSlot[]>('GET', '/analytics/best-slots', { params: p }),
  groups: (p: { account_id: number; checkpoint: CheckpointQ; by: string; days?: number; from?: string; to?: string }) => request<GroupRow[]>('GET', '/analytics/groups', { params: p }),
  consistency: (p: { account_id: number; checkpoint: CheckpointQ }) => request<Consistency>('GET', '/analytics/consistency', { params: p }),
  suggestions: (p: { account_id: number }) => request<SuggestionsResult>('GET', '/analytics/suggestions', { params: p }),
  leads: (accountId: number) => request<Lead[]>('GET', '/leads', { params: { account_id: accountId } }),
  createLead: (body: LeadInput) => request<Lead>('POST', '/leads', { body }),
  updateLead: (id: number, body: LeadInput) => request<Lead>('PUT', `/leads/${id}`, { body }),
  deleteLead: (id: number) => request<void>('DELETE', `/leads/${id}`),
  leadReplied: (id: number) => request<Lead>('POST', `/leads/${id}/replied`),
  timing: (p: { account_id: number; metric?: string }) => request<TimingModel>('GET', '/analytics/timing', { params: p }),
  calendar: (p: { account_id: number; from: string; to: string }) => request<CalendarData>('GET', '/calendar', { params: p }),
  calendarItems: (p: { from: string; to: string }) => request<{ from: string; to: string; items: CalendarItem[] }>('GET', '/calendar/items', { params: p }),
  dueSnapshots: (p: { account_id: number }) => request<DueSnapshot[]>('GET', '/analytics/due-snapshots', { params: p }),

  saveAudience: (postId: number, rows: AudienceRow[]) => request<Post>('PUT', `/posts/${postId}/audience`, { body: { rows } }),

  pageAudience: (accountId: number) => request<PageAudienceSnapshot[]>('GET', `/accounts/${accountId}/page-audience`),
  savePageAudience: (accountId: number, body: PageAudienceInput) =>
    request<{ saved: number }>('PUT', `/accounts/${accountId}/page-audience`, { body }),
  deletePageAudience: (accountId: number, as_of: string, audience: string) =>
    request<void>('DELETE', `/accounts/${accountId}/page-audience`, { params: { as_of, audience } }),

  me: () => request<Me>('GET', '/auth/me'),
  logout: () => request<{ signed_out: boolean }>('POST', '/auth/logout'),
  team: () => request<{ members: TeamMember[]; default_account_id: number | null }>('GET', '/team'),
  addMember: (body: TeamMemberInput) => request<TeamMember>('POST', '/team', { body }),
  updateMember: (id: number, body: TeamMemberInput) => request<TeamMember>('PUT', `/team/${id}`, { body }),
  removeMember: (id: number) => request<void>('DELETE', `/team/${id}`),
  setDefaultAccount: (accountId: number) =>
    request<{ default_account_id: number }>('PUT', '/team/default-account/set', { body: { default_account_id: accountId } }),

  settings: () => request<AppSettings>('GET', '/settings'),
  saveSettings: <K extends 'segments' | 'performance' | 'brand'>(section: K, body: AppSettings['current'][K]) =>
    request<AppSettings['current'][K]>('PUT', `/settings/${section}`, { body }),
  resetSettings: (section: 'segments' | 'performance' | 'brand') => request<unknown>('POST', `/settings/${section}/reset`),
  claudeStatus: () => request<ClaudeStatus>('GET', '/settings/claude'),

  similarPosts: (body: { account_id: number; queries: { key: string; text: string; topic?: string | null }[] }) =>
    request<SimilarResponse>('POST', '/analytics/similar-posts', { body }),

  accountDoc: <K extends keyof AccountDocs>(accountId: number, kind: K) =>
    request<AccountDoc<K>>('GET', `/accounts/${accountId}/docs/${kind}`),
  saveAccountDoc: <K extends keyof AccountDocs>(accountId: number, kind: K, data: AccountDocs[K]) =>
    request<AccountDoc<K>>('PUT', `/accounts/${accountId}/docs/${kind}`, { body: data }),

  decisions: (accountId: number) => request<Decision[]>('GET', '/suggestions/decisions', { params: { account_id: accountId } }),
  decide: (body: { account_id: number; key: string; status: DecisionStatus | null }) =>
    request<{ key: string; status: DecisionStatus | null }>('PUT', '/suggestions/decisions', { body }),

  ideas: (accountId: number) => request<IdeasState>('GET', '/ai/ideas', { params: { account_id: accountId } }),
  generateIdeas: (body: { account_id: number; focus: string | null }) => request<IdeasRun>('POST', '/ai/ideas', { body }),
  ideaToDraft: (runId: number, index: number) => request<{ planned_id: number }>('POST', `/ai/ideas/${runId}/${index}/draft`),

  linkedinConfig: () => request<LinkedInConfig>('GET', '/linkedin/config'),
  linkedinConnections: () => request<LinkedInConnection[]>('GET', '/linkedin/connections'),
  linkedinAuthUrl: (accountId: number) => request<{ url: string }>('GET', '/linkedin/auth-url', { params: { account_id: accountId } }),
  linkedinDisconnect: (accountId: number) => request<void>('DELETE', `/linkedin/connections/${accountId}`),

  planned: (accountId: number) => request<PlannedPost[]>('GET', '/planner', { params: { account_id: accountId } }),
  createPlanned: (body: PlannedPostInput) => request<PlannedPost>('POST', '/planner', { body }),
  updatePlanned: (id: number, body: PlannedPostInput) => request<PlannedPost>('PUT', `/planner/${id}`, { body }),
  deletePlanned: (id: number) => request<void>('DELETE', `/planner/${id}`),
  plannedAction: (id: number, action: 'approve' | 'unapprove' | 'publish', body?: { now?: boolean }) =>
    request<PlannedPost>('POST', `/planner/${id}/${action}`, body ? { body } : {}),
  uploadPlannedImage: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<PlannedPost>('POST', `/planner/${id}/image`, { form })
  },
  removePlannedImage: (id: number) => request<PlannedPost>('DELETE', `/planner/${id}/image`),
  uploadPlannedMedia: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<PlannedPost>('POST', `/planner/${id}/media`, { form })
  },
  removePlannedMedia: (id: number) => request<PlannedPost>('DELETE', `/planner/${id}/media`),
  plannedMediaUrl: (id: number) => `/api/planner/${id}/media`,
  markPosted: (id: number, postUrl: string) => request<PlannedPost>('POST', `/planner/${id}/mark-posted`, { body: { post_url: postUrl } }),
  plannedImageUrl: (id: number, bust?: string) => `/api/planner/${id}/image${bust ? `?v=${encodeURIComponent(bust)}` : ''}`,

  importCsv: (accountId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<ImportResult>('POST', '/import/csv', { params: { account_id: accountId }, form })
  },
  importLinkedInExport: (accountId: number, files: File[], exportedOn: string | null, confirmProfile = false) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    if (exportedOn) form.append('exported_on', exportedOn)
    // Company-page exports into a founder/personal profile need an explicit yes (the API refuses otherwise)
    if (confirmProfile) form.append('confirm_profile', '1')
    return request<ExportImportResult>('POST', '/import/linkedin-export', { params: { account_id: accountId }, form })
  },
  /** Compare posts → Ask AI why */
  comparePosts: (body: { account_id: number; post_ids: number[]; checkpoint: Checkpoint }) =>
    request<Omit<PostAssistRun, 'result'> & { result: CompareExplanation }>('POST', '/ai/compare-posts', { body }),
  postAssistStatus: (accountId: number) =>
    request<{ configured: boolean; runs_today: number; daily_limit: number }>('GET', '/ai/post-assist', { params: { account_id: accountId } }),
  postAssist: (
    body: { account_id: number; format: string; caption: string; topic: string | null; industry: string | null; cta: string | null; goal?: PostGoal | null; focus: AnalysePart[]; scheduled_at: string | null; details: PlannedDetails; media_attached: boolean },
    attachment?: File | null,
  ) => request<PostAssistRun>('POST', '/ai/post-assist', attachment ? { form: toForm(body, attachment) } : { body }),
  postChatStatus: (accountId: number) =>
    request<{ configured: boolean; messages_today: number; daily_limit: number; session_limit: number }>('GET', '/ai/post-chat', { params: { account_id: accountId } }),
  postChat: (body: {
    account_id: number
    format: string
    caption: string
    topic: string | null
    industry: string | null
    cta: string | null
    goal?: PostGoal | null
    messages: { role: 'user' | 'assistant'; content: string }[]
    web_search?: boolean
  }, attachment?: File | null) =>
    request<Omit<PostAssistRun, 'result'> & { result: ChatTurn }>('POST', '/ai/post-chat', attachment ? { form: toForm(body, attachment) } : { body }),
  lastImports: (accountId: number) => request<LastImports>('GET', `/accounts/${accountId}/last-imports`),
  pageDaily: (accountId: number) => request<PageDay[]>('GET', `/accounts/${accountId}/page-daily`),
}
