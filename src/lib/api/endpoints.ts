/**
 * Every backend address in one place (relative to /api). When the backend renames or moves an endpoint,
 * change it here only.
 */
export const API_ENDPOINTS = {
  AUTH: {
    ME: '/auth/me',
    LOGOUT: '/auth/logout',
  },
  TEAM: {
    LIST: '/team',
    MEMBER: (id: number) => `/team/${id}`,
    DEFAULT_ACCOUNT: '/team/default-account/set',
  },
  ACCOUNTS: {
    LIST: '/accounts',
    PAGE_AUDIENCE: (accountId: number) => `/accounts/${accountId}/page-audience`,
    PAGE_DAILY: (accountId: number) => `/accounts/${accountId}/page-daily`,
    LAST_IMPORTS: (accountId: number) => `/accounts/${accountId}/last-imports`,
    DOC: (accountId: number, kind: string) => `/accounts/${accountId}/docs/${kind}`,
  },
  POSTS: {
    LIST: '/posts',
    ONE: (id: number) => `/posts/${id}`,
    SNAPSHOT: (postId: number, checkpoint: string) => `/posts/${postId}/snapshots/${checkpoint}`,
    AUDIENCE: (postId: number) => `/posts/${postId}/audience`,
  },
  ANALYTICS: {
    OVERVIEW: '/analytics/overview',
    SUGGESTIONS: '/analytics/suggestions',
    DUE_SNAPSHOTS: '/analytics/due-snapshots',
    SIMILAR_POSTS: '/analytics/similar-posts',
  },
  CALENDAR: {
    MONTH: '/calendar',
    ITEMS: '/calendar/items',
  },
  LEADS: {
    LIST: '/leads',
    ONE: (id: number) => `/leads/${id}`,
    REPLIED: (id: number) => `/leads/${id}/replied`,
  },
  SETTINGS: {
    ALL: '/settings',
    SECTION: (section: string) => `/settings/${section}`,
    RESET: (section: string) => `/settings/${section}/reset`,
    CLAUDE: '/settings/claude',
  },
  SUGGESTIONS: {
    DECISIONS: '/suggestions/decisions',
  },
  AI: {
    IDEAS: '/ai/ideas',
    IDEA_TO_DRAFT: (runId: number, index: number) => `/ai/ideas/${runId}/${index}/draft`,
    POST_ASSIST: '/ai/post-assist',
    POST_CHAT: '/ai/post-chat',
  },
  LINKEDIN: {
    CONFIG: '/linkedin/config',
    CONNECTIONS: '/linkedin/connections',
    CONNECTION: (accountId: number) => `/linkedin/connections/${accountId}`,
    AUTH_URL: '/linkedin/auth-url',
  },
  PLANNER: {
    LIST: '/planner',
    ONE: (id: number) => `/planner/${id}`,
    ACTION: (id: number, action: string) => `/planner/${id}/${action}`,
    IMAGE: (id: number) => `/planner/${id}/image`,
    MEDIA: (id: number) => `/planner/${id}/media`,
    MARK_POSTED: (id: number) => `/planner/${id}/mark-posted`,
  },
  IMPORT: {
    CSV: '/import/csv',
    LINKEDIN_EXPORT: '/import/linkedin-export',
  },
} as const
