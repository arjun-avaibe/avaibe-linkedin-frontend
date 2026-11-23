/**
 * One function per backend endpoint (addresses in endpoints.ts, transport in client.ts).
 * Screens don't call these directly: they use the React Query hooks in each page's queries/ folder
 * (or src/hooks/queries.ts for the shared ones).
 */
import { API_BASE, fileForm, http, toForm } from './client'
import { API_ENDPOINTS as E } from './endpoints'
import type {
  Account,
  AccountDoc,
  AccountDocs,
  AnalysePart,
  AppSettings,
  AudienceRow,
  CalendarData,
  CalendarItem,
  ChatTurn,
  Checkpoint,
  CheckpointQ,
  ClaudeStatus,
  Decision,
  DecisionStatus,
  DueSnapshot,
  ExportImportResult,
  IdeasRun,
  IdeasState,
  ImportResult,
  LastImports,
  Lead,
  LeadInput,
  LinkedInConfig,
  LinkedInConnection,
  Me,
  Overview,
  PageAudienceInput,
  PageAudienceSnapshot,
  PageDay,
  PlannedDetails,
  PlannedPost,
  PlannedPostInput,
  Post,
  PostAssistRun,
  PostGoal,
  PostInput,
  SimilarResponse,
  Snapshot,
  SnapshotInput,
  SuggestionsResult,
  TeamMember,
  TeamMemberInput,
} from './types'

type SettingsSection = 'segments' | 'performance' | 'brand'

export const httpApi = {
  // ---- accounts
  accounts: () => http.get<Account[]>(E.ACCOUNTS.LIST),
  createAccount: (body: Omit<Account, 'id'>) => http.post<Account>(E.ACCOUNTS.LIST, body),

  // ---- posts and their numbers
  /** Omit account_id for all accounts */
  posts: (params: { account_id?: number; format?: string; checkpoint?: CheckpointQ; metric?: string }) => http.get<Post[]>(E.POSTS.LIST, params),
  post: (id: number) => http.get<Post>(E.POSTS.ONE(id)),
  createPost: (body: PostInput) => http.post<Post>(E.POSTS.LIST, body),
  updatePost: (id: number, body: PostInput) => http.put<Post>(E.POSTS.ONE(id), body),
  deletePost: (id: number) => http.del(E.POSTS.ONE(id)),
  saveSnapshot: (postId: number, checkpoint: Checkpoint, body: SnapshotInput) => http.put<Snapshot>(E.POSTS.SNAPSHOT(postId, checkpoint), body),
  deleteSnapshot: (postId: number, checkpoint: Checkpoint) => http.del(E.POSTS.SNAPSHOT(postId, checkpoint)),
  saveAudience: (postId: number, rows: AudienceRow[]) => http.put<Post>(E.POSTS.AUDIENCE(postId), { rows }),

  // ---- analysis
  overview: (p: { account_id: number; checkpoint: CheckpointQ }) => http.get<Overview>(E.ANALYTICS.OVERVIEW, p),
  suggestions: (p: { account_id: number }) => http.get<SuggestionsResult>(E.ANALYTICS.SUGGESTIONS, p),
  dueSnapshots: (p: { account_id: number }) => http.get<DueSnapshot[]>(E.ANALYTICS.DUE_SNAPSHOTS, p),
  similarPosts: (body: { account_id: number; queries: { key: string; text: string; topic?: string | null }[] }) =>
    http.post<SimilarResponse>(E.ANALYTICS.SIMILAR_POSTS, body),
  calendar: (p: { account_id: number; from: string; to: string }) => http.get<CalendarData>(E.CALENDAR.MONTH, p),
  calendarItems: (p: { from: string; to: string }) => http.get<{ from: string; to: string; items: CalendarItem[] }>(E.CALENDAR.ITEMS, p),

  // ---- page audience, documents, imports
  pageAudience: (accountId: number) => http.get<PageAudienceSnapshot[]>(E.ACCOUNTS.PAGE_AUDIENCE(accountId)),
  savePageAudience: (accountId: number, body: PageAudienceInput) => http.put<{ saved: number }>(E.ACCOUNTS.PAGE_AUDIENCE(accountId), body),
  deletePageAudience: (accountId: number, as_of: string, audience: string) => http.del(E.ACCOUNTS.PAGE_AUDIENCE(accountId), { as_of, audience }),
  accountDoc: <K extends keyof AccountDocs>(accountId: number, kind: K) => http.get<AccountDoc<K>>(E.ACCOUNTS.DOC(accountId, kind)),
  saveAccountDoc: <K extends keyof AccountDocs>(accountId: number, kind: K, data: AccountDocs[K]) =>
    http.put<AccountDoc<K>>(E.ACCOUNTS.DOC(accountId, kind), data),
  lastImports: (accountId: number) => http.get<LastImports>(E.ACCOUNTS.LAST_IMPORTS(accountId)),
  pageDaily: (accountId: number) => http.get<PageDay[]>(E.ACCOUNTS.PAGE_DAILY(accountId)),
  importCsv: (accountId: number, file: File) => http.upload<ImportResult>(E.IMPORT.CSV, fileForm(file), { account_id: accountId }),
  importLinkedInExport: (accountId: number, files: File[], exportedOn: string | null, confirmProfile = false) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    if (exportedOn) form.append('exported_on', exportedOn)
    // Company-page exports into a founder/personal profile need an explicit yes (the API refuses otherwise)
    if (confirmProfile) form.append('confirm_profile', '1')
    return http.upload<ExportImportResult>(E.IMPORT.LINKEDIN_EXPORT, form, { account_id: accountId })
  },

  // ---- leads
  leads: (accountId: number) => http.get<Lead[]>(E.LEADS.LIST, { account_id: accountId }),
  createLead: (body: LeadInput) => http.post<Lead>(E.LEADS.LIST, body),
  updateLead: (id: number, body: LeadInput) => http.put<Lead>(E.LEADS.ONE(id), body),
  deleteLead: (id: number) => http.del(E.LEADS.ONE(id)),
  leadReplied: (id: number) => http.post<Lead>(E.LEADS.REPLIED(id)),

  // ---- who you are, and the team
  me: () => http.get<Me>(E.AUTH.ME),
  logout: () => http.post<{ signed_out: boolean }>(E.AUTH.LOGOUT),
  team: () => http.get<{ members: TeamMember[]; default_account_id: number | null }>(E.TEAM.LIST),
  addMember: (body: TeamMemberInput) => http.post<TeamMember>(E.TEAM.LIST, body),
  updateMember: (id: number, body: TeamMemberInput) => http.put<TeamMember>(E.TEAM.MEMBER(id), body),
  removeMember: (id: number) => http.del(E.TEAM.MEMBER(id)),
  setDefaultAccount: (accountId: number) => http.put<{ default_account_id: number }>(E.TEAM.DEFAULT_ACCOUNT, { default_account_id: accountId }),

  // ---- settings
  settings: () => http.get<AppSettings>(E.SETTINGS.ALL),
  saveSettings: <K extends SettingsSection>(section: K, body: AppSettings['current'][K]) => http.put<AppSettings['current'][K]>(E.SETTINGS.SECTION(section), body),
  resetSettings: (section: SettingsSection) => http.post<unknown>(E.SETTINGS.RESET(section)),
  claudeStatus: () => http.get<ClaudeStatus>(E.SETTINGS.CLAUDE),

  // ---- suggestions and AI
  decisions: (accountId: number) => http.get<Decision[]>(E.SUGGESTIONS.DECISIONS, { account_id: accountId }),
  decide: (body: { account_id: number; key: string; status: DecisionStatus | null }) =>
    http.put<{ key: string; status: DecisionStatus | null }>(E.SUGGESTIONS.DECISIONS, body),
  ideas: (accountId: number) => http.get<IdeasState>(E.AI.IDEAS, { account_id: accountId }),
  generateIdeas: (body: { account_id: number; focus: string | null }) => http.post<IdeasRun>(E.AI.IDEAS, body),
  ideaToDraft: (runId: number, index: number) => http.post<{ planned_id: number }>(E.AI.IDEA_TO_DRAFT(runId, index)),
  postAssistStatus: (accountId: number) => http.get<{ configured: boolean; runs_today: number; daily_limit: number }>(E.AI.POST_ASSIST, { account_id: accountId }),
  postAssist: (
    body: {
      account_id: number
      format: string
      caption: string
      topic: string | null
      industry: string | null
      cta: string | null
      goal?: PostGoal | null
      focus: AnalysePart[]
      scheduled_at: string | null
      details: PlannedDetails
      media_attached: boolean
    },
    attachment?: File | null,
  ) => (attachment ? http.upload<PostAssistRun>(E.AI.POST_ASSIST, toForm(body, attachment)) : http.post<PostAssistRun>(E.AI.POST_ASSIST, body)),
  postChatStatus: (accountId: number) =>
    http.get<{ configured: boolean; messages_today: number; daily_limit: number; session_limit: number }>(E.AI.POST_CHAT, { account_id: accountId }),
  postChat: (
    body: {
      account_id: number
      format: string
      caption: string
      topic: string | null
      industry: string | null
      cta: string | null
      goal?: PostGoal | null
      messages: { role: 'user' | 'assistant'; content: string }[]
      web_search?: boolean
    },
    attachment?: File | null,
  ) => {
    type ChatRun = Omit<PostAssistRun, 'result'> & { result: ChatTurn }
    return attachment ? http.upload<ChatRun>(E.AI.POST_CHAT, toForm(body, attachment)) : http.post<ChatRun>(E.AI.POST_CHAT, body)
  },

  // ---- LinkedIn
  linkedinConfig: () => http.get<LinkedInConfig>(E.LINKEDIN.CONFIG),
  linkedinConnections: () => http.get<LinkedInConnection[]>(E.LINKEDIN.CONNECTIONS),
  linkedinAuthUrl: (accountId: number) => http.get<{ url: string }>(E.LINKEDIN.AUTH_URL, { account_id: accountId }),
  linkedinDisconnect: (accountId: number) => http.del(E.LINKEDIN.CONNECTION(accountId)),

  // ---- publishing
  planned: (accountId: number) => http.get<PlannedPost[]>(E.PLANNER.LIST, { account_id: accountId }),
  createPlanned: (body: PlannedPostInput) => http.post<PlannedPost>(E.PLANNER.LIST, body),
  updatePlanned: (id: number, body: PlannedPostInput) => http.put<PlannedPost>(E.PLANNER.ONE(id), body),
  deletePlanned: (id: number) => http.del(E.PLANNER.ONE(id)),
  plannedAction: (id: number, action: 'approve' | 'unapprove' | 'publish', body?: { now?: boolean }) =>
    http.post<PlannedPost>(E.PLANNER.ACTION(id, action), body),
  markPosted: (id: number, postUrl: string) => http.post<PlannedPost>(E.PLANNER.MARK_POSTED(id), { post_url: postUrl }),
  uploadPlannedImage: (id: number, file: File) => http.upload<PlannedPost>(E.PLANNER.IMAGE(id), fileForm(file)),
  removePlannedImage: (id: number) => http.del<PlannedPost>(E.PLANNER.IMAGE(id)),
  uploadPlannedMedia: (id: number, file: File) => http.upload<PlannedPost>(E.PLANNER.MEDIA(id), fileForm(file)),
  /** Addresses for <img> / links, not calls */
  plannedImageUrl: (id: number, bust?: string) => `${API_BASE}${E.PLANNER.IMAGE(id)}${bust ? `?v=${encodeURIComponent(bust)}` : ''}`,
  plannedMediaUrl: (id: number) => `${API_BASE}${E.PLANNER.MEDIA(id)}`,
}
