/**
 * The one place that talks to the backend over HTTP: session cookie, Django's CSRF header, errors, sign-in redirect.
 * Use the `http` helpers (get / post / put / del / upload); never call fetch from a screen.
 */

/** An error answer from the API (the sample data answers with the same error) */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type Params = Record<string, string | number | boolean | null | undefined>
type Options = { params?: Params; body?: unknown; form?: FormData }

/** Where the backend is mounted; in dev Vite forwards it to the Django server */
export const API_BASE = '/api'

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

async function request<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' } // send the session cookie
  const headers: Record<string, string> = {}
  if (opts.form) {
    init.body = opts.form
  } else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body)
    headers['Content-Type'] = 'application/json'
  }
  if (method !== 'GET') {
    // Django's protection against forged cross-site requests: echo the csrftoken cookie back in a header
    const token = csrfToken()
    if (token) headers['X-CSRFToken'] = token
  }
  init.headers = headers
  const res = await fetch(`${API_BASE}${path}${qs(opts.params)}`, init)
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

export const http = {
  get: <T>(path: string, params?: Params) => request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown, params?: Params) => request<T>('POST', path, { body, params }),
  put: <T>(path: string, body?: unknown, params?: Params) => request<T>('PUT', path, { body, params }),
  del: <T = void>(path: string, params?: Params) => request<T>('DELETE', path, { params }),
  /** Multipart upload (files) */
  upload: <T>(path: string, form: FormData, params?: Params) => request<T>('POST', path, { form, params }),
}

/** A JSON body as multipart form fields plus one file (lists and objects are sent as JSON text) */
export function toForm(body: Record<string, unknown>, file: File): FormData {
  const form = new FormData()
  for (const [k, v] of Object.entries(body)) {
    if (v == null) continue
    form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  form.append('attachment', file)
  return form
}

/** One file under the field name the backend expects */
export function fileForm(file: File, field = 'file'): FormData {
  const form = new FormData()
  form.append(field, file)
  return form
}
