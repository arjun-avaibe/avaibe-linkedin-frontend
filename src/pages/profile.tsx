import { useState } from 'react'
import { toast } from 'sonner'
import { Info, LogOut, SlidersHorizontal, UserRound } from 'lucide-react'
import { ROLE_HELP, ROLE_LABELS, useAuth } from '@/context/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader, Section, SimpleSelect } from '@/components/common'
import { useTz, ZONES, type ZoneId } from '@/context/timezone'

export const PROFILE_NAME_KEY = 'avaibe.profileName'

export function readProfileName(): string {
  try {
    return localStorage.getItem(PROFILE_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : ''
}

export function ProfilePage() {
  const auth = useAuth()
  if (auth.user && !auth.user.dev) return <SignedInProfile />
  return <LocalProfile />
}

function SignedInProfile() {
  const auth = useAuth()
  const tz = useTz()
  const u = auth.user!
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow="Your account" back="/" title="Profile" description="Your details come from your AVAIBE Microsoft account." />
      <Section icon={UserRound} title="Details">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd className="mt-1">{u.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Work email</dt>
            <dd className="mt-1">{u.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Role</dt>
            <dd className="mt-1">
              {ROLE_LABELS[u.role]} <span className="text-muted-foreground">· {ROLE_HELP[u.role]}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Accounts</dt>
            <dd className="mt-1">{u.can_switch_accounts ? 'Can switch between all accounts' : 'Company page only'}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">To change your role or access, ask an admin.</p>
      </Section>
      <Section icon={SlidersHorizontal} title="Preferences">
        <SimpleSelect
          label="Show times in"
          value={tz.zone}
          onChange={(v) => tz.setZone(v as ZoneId)}
          options={ZONES.map((z) => ({ value: z.id, label: z.long }))}
        />
      </Section>
      <Button variant="outline" onClick={() => auth.signOut()}>
        <LogOut /> Sign out
      </Button>
    </div>
  )
}

function LocalProfile() {
  const tz = useTz()
  const [name, setName] = useState(readProfileName)

  const save = () => {
    try {
      localStorage.setItem(PROFILE_NAME_KEY, name.trim())
      window.dispatchEvent(new Event('profile-changed'))
      toast.success('Profile saved on this device')
    } catch {
      toast.error('This browser is blocking local storage, so the name can’t be saved')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader eyebrow="Your account" back="/" title="Profile" description="Your details and personal preferences." />

      <div className="flex items-start gap-3 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-info-fg" />
        <span>
          Sign-in isn’t set up yet, so this profile is stored only in this browser. Once Microsoft sign-in is added, your name, email and
          role (Viewer, Editor, Approver or Admin) will come from your AVAIBE work account.
        </span>
      </div>

      <Section icon={UserRound} title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <Label className="mb-1.5 block">Role</Label>
            <Input value="Available after sign-in is set up" disabled />
          </div>
        </div>
      </Section>

      <Section icon={SlidersHorizontal} title="Preferences">
        <SimpleSelect
          label="Show times in"
          value={tz.zone}
          onChange={(v) => tz.setZone(v as ZoneId)}
          options={ZONES.map((z) => ({ value: z.id, label: z.long }))}
        />
      </Section>

      <Button onClick={save}>Save profile</Button>
    </div>
  )
}
