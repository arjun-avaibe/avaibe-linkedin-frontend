/**
 * Profile: who you are in the app (photo, name, email, role) and your personal preferences.
 * Left: a profile card with the photo. Right: one "Personal details" card of label/field rows.
 * Until Microsoft sign-in is set up, the name and photo are kept in this browser.
 */
import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Camera, Info, Trash2 } from 'lucide-react'
import { ROLE_HELP, ROLE_LABELS, useAuth } from '@/context/auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PageHeader, SimpleSelect } from '@/components/common'
import { UserAvatar } from '@/components/user-avatar'
import { useTz, ZONES, type ZoneId } from '@/context/timezone'
import { removeProfilePhoto, saveProfilePhoto, useMe } from '@/lib/me'

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
  const signedIn = !!auth.user && !auth.user.dev
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Your account" back="/" title="Profile" description="Your photo, details and preferences." />
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ProfileCard />
        {signedIn ? <SignedInDetails /> : <LocalDetails />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- left: who you are

function ProfileCard() {
  const me = useMe()
  const file = useRef<HTMLInputElement>(null)
  return (
    <Card className="items-center px-6 py-7 text-center">
      <div className="relative">
        <UserAvatar className="size-24 text-2xl ring-4 ring-background" />
        <button
          type="button"
          onClick={() => file.current?.click()}
          aria-label={me.photo ? 'Change photo' : 'Upload photo'}
          title={me.photo ? 'Change photo' : 'Upload photo'}
          className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-card transition-transform hover:scale-105"
        >
          <Camera className="size-4" />
        </button>
      </div>
      <div className="mt-4 w-full min-w-0">
        <div className="truncate text-lg font-semibold">{me.name}</div>
        {me.email && <div className="truncate text-sm text-muted-foreground">{me.email}</div>}
        <span className="mt-2 inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{me.role ?? 'Local mode'}</span>
      </div>
      <div className="mt-5 flex w-full flex-col gap-2 border-t pt-5">
        <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
          <Camera /> {me.photo ? 'Change photo' : 'Upload photo'}
        </Button>
        {me.photo && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              removeProfilePhoto()
              toast.success('Photo removed')
            }}
          >
            <Trash2 /> Remove photo
          </Button>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">JPG, PNG or WebP, up to 10 MB</p>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            await saveProfilePhoto(f)
            toast.success('Photo updated')
          } catch (err) {
            toast.error((err as Error).message)
          }
        }}
      />
    </Card>
  )
}

// ---------------------------------------------------------------- right: details and preferences

/** One settings row: label (and a hint) on the left, the value or field on the right */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t px-6 py-4 first:border-t-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center sm:gap-6">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  )
}

function DetailsCard({ footer, children }: { footer?: ReactNode; children: ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <div className="px-6 pt-5 pb-3">
        <h2 className="text-base font-semibold">Personal details</h2>
      </div>
      <div className="border-t">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-3 border-t bg-muted/30 px-6 py-3">{footer}</div>}
    </Card>
  )
}

function TimeZoneSelect() {
  const tz = useTz()
  return <SimpleSelect value={tz.zone} onChange={(v) => tz.setZone(v as ZoneId)} options={ZONES.map((z) => ({ value: z.id, label: z.long }))} />
}

function SignedInDetails() {
  const u = useAuth().user!
  return (
    <DetailsCard>
      <Row label="Name">{u.name ?? '—'}</Row>
      <Row label="Work email">{u.email}</Row>
      <Row label="Role" hint="Ask an admin to change it">
        {ROLE_LABELS[u.role]} <span className="text-muted-foreground">· {ROLE_HELP[u.role]}</span>
      </Row>
      <Row label="Accounts">{u.can_switch_accounts ? 'Can switch between all accounts' : 'Company page only'}</Row>
      <Row label="Show times in" hint="Dates and times across the app">
        <TimeZoneSelect />
      </Row>
    </DetailsCard>
  )
}

function LocalDetails() {
  const [saved, setSaved] = useState(readProfileName)
  const [name, setName] = useState(saved)
  const changed = name.trim() !== saved

  const save = () => {
    try {
      localStorage.setItem(PROFILE_NAME_KEY, name.trim())
      setSaved(name.trim())
      window.dispatchEvent(new Event('profile-changed'))
      toast.success('Saved')
    } catch {
      toast.error('This browser is blocking local storage, so the name can’t be saved')
    }
  }

  return (
    <div className="space-y-3">
      <DetailsCard
        footer={
          <>
            {changed && (
              <Button variant="ghost" onClick={() => setName(saved)}>
                Cancel
              </Button>
            )}
            <Button onClick={save} disabled={!changed}>
              Save changes
            </Button>
          </>
        }
      >
        <Row label="Display name" hint="Shown at the top right">
          <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && changed && save()} placeholder="Your name" className="max-w-sm" />
        </Row>
        <Row label="Role">
          <span className="text-muted-foreground">Comes from your work account once sign-in is set up</span>
        </Row>
        <Row label="Show times in" hint="Dates and times across the app">
          <TimeZoneSelect />
        </Row>
      </DetailsCard>
      <p className="flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        Sign-in isn’t set up yet, so your name and photo are saved in this browser only. Time zone changes apply straight away.
      </p>
    </div>
  )
}
