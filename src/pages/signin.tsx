import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/auth'

const ERRORS: Record<string, string> = {
  not_invited: 'Your AVAIBE account isn’t on the team list yet. Ask an admin to add you, then sign in again.',
  disabled: 'Your access has been switched off. Contact an admin if you think this is a mistake.',
  tenant: 'Please sign in with your AVAIBE work account.',
  expired: 'The sign-in took too long or the link was used already. Please try again.',
  invalid: 'The sign-in couldn’t be verified. Please try again.',
  no_email: 'Microsoft didn’t share an email address for this account.',
  microsoft: 'Microsoft couldn’t complete the sign-in.',
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-4" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export function SignInPage() {
  const { signedIn, enabled, isLoading, demoEmail } = useAuth()
  const [params] = useSearchParams()
  const error = params.get('error')
  const detail = params.get('message')

  // Already signed in (for real, or through the demo screen in local mode): go to the app
  if (!isLoading && (enabled ? signedIn : !!demoEmail) && !params.get('signed_out')) return <Navigate to="/" replace />
  // Local mode: the demo sign-in screen
  if (!isLoading && !enabled) return <DemoSignIn signedOut={!!params.get('signed_out')} />

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4">
      <div className="app-backdrop" aria-hidden />
      <div className="signin-orb" aria-hidden />
      <div
        data-slot="card"
        className="page-enter relative w-full max-w-sm rounded-2xl p-8"
      >
        <div className="mb-8 flex items-center gap-3">
          <img src="/brand/logo-mark.png" alt="" className="size-9" />
          <div>
            <div className="text-[26px] leading-none tracking-tight">avaibe</div>
            <div className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">LinkedIn intelligence</div>
          </div>
        </div>

        <h1 className="text-gradient text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your AVAIBE Microsoft work account.</p>

        {params.get('signed_out') && !error && (
          <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">You’ve been signed out.</p>
        )}
        {error && (
          <div className="mt-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad-fg">
            {ERRORS[error] ?? 'Sign-in failed. Please try again.'}
            {detail && <div className="mt-1 text-xs opacity-80">{detail}</div>}
          </div>
        )}

        <Button className="mt-6 h-10 w-full" onClick={() => (window.location.href = '/api/auth/login')}>
          <MicrosoftLogo /> Sign in with Microsoft
        </Button>
        <p className="mt-4 text-center text-xs text-muted-foreground">Access is by invitation. Ask an admin if you need it.</p>
      </div>
    </div>
  )
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Local mode: looks like the product's sign-in, but nothing is checked and the password is never kept. */
function DemoSignIn({ signedOut }: { signedOut: boolean }) {
  const { demoSignIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!EMAIL.test(email.trim())) return setError('Enter a valid email address.')
    if (!password) return setError('Enter your password.')
    demoSignIn(email.trim().toLowerCase())
    setPassword('')
    navigate('/', { replace: true })
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4">
      <div className="app-backdrop" aria-hidden />
      <div className="signin-orb" aria-hidden />
      <form data-slot="card" onSubmit={submit} noValidate className="page-enter relative w-full max-w-sm rounded-2xl p-8">
        <div className="mb-8 flex items-center gap-3">
          <img src="/brand/logo-mark.png" alt="" className="size-9" />
          <div>
            <div className="text-[26px] leading-none tracking-tight">avaibe</div>
            <div className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">LinkedIn intelligence</div>
          </div>
        </div>

        <h1 className="text-gradient text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to see how your LinkedIn is doing.</p>

        {signedOut && <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">You’ve been signed out.</p>}

        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              placeholder="name@company.com"
              aria-invalid={!!error && !EMAIL.test(email.trim())}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(null)
                }}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-bad-fg">
              {error}
            </p>
          )}
          <Button type="submit" className="h-10 w-full">
            Sign in
          </Button>
        </div>

        <p className="mt-5 rounded-md bg-muted/60 px-3 py-2 text-center text-[11px] text-muted-foreground">
          Demo sign-in: any email works, nothing is checked and your password isn’t saved or sent anywhere.
        </p>
      </form>
    </div>
  )
}
