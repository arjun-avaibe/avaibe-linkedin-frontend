/**
 * Top-right of every page: notifications and your profile picture.
 * Notifications stay minimal on purpose: one line per kind of thing (never one per post), at most 5 lines.
 */
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { AlertTriangle, Bell, CalendarDays, Camera, ChevronDown, Clock, Hourglass, Link2, LogOut, Monitor, Moon, Sun, Trash2, UserRound } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ACCENTS, useTheme, type Accent, type Theme } from '@/context/theme'
import { useTz, ZONES, type ZoneId } from '@/context/timezone'
import { UserAvatar } from '@/components/user-avatar'
import { todayUae, ymd } from '@/components/period'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'
import { usePlanned } from '@/hooks/queries'
import { api } from '@/lib/api'
import { removeProfilePhoto, saveProfilePhoto, useMe } from '@/lib/me'
import { cn } from '@/lib/utils'

export function TopBar() {
  return (
    <div className="ml-auto flex items-center gap-2">
      <Notifications />
      <ProfileButton />
    </div>
  )
}

// ---------------------------------------------------------------- notifications

interface Note {
  key: string // changes when the content changes, so a new situation counts as unread again
  tone: 'alert' | 'todo' | 'info'
  icon: typeof Bell
  text: string
  sub?: string
  to: string
}

const MAX_NOTES = 5
const SEEN_KEY = 'avaibe.notesSeen'
const HOLIDAY_KINDS = new Set(['uae_holiday', 'event'])

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
  } catch {
    return []
  }
}

function useNotes(): Note[] {
  const { account } = useAccount()
  const { data: planned = [] } = usePlanned(account?.id)
  const today = todayUae()
  const until = ymd(addDays(parseISO(today), 7))
  const { data: cal } = useQuery({
    queryKey: ['calendar-items', today, until],
    queryFn: () => api.calendarItems({ from: today, to: until }),
    staleTime: 60 * 60_000,
  })

  return useMemo(() => {
    const notes: Note[] = []
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
    // Problems first, then to-dos, then what's coming up
    const problems = planned.filter((p) => p.status === 'failed' || p.status === 'missed').length
    if (problems) {
      notes.push({
        key: `problem:${problems}`,
        tone: 'alert',
        icon: AlertTriangle,
        text: `${plural(problems, 'post', 'posts')} failed or missed ${problems === 1 ? 'its' : 'their'} time`,
        sub: 'Check and reschedule',
        to: '/publishing?status=problem',
      })
    }
    const drafts = planned.filter((p) => p.status === 'draft').length
    if (drafts) {
      notes.push({ key: `drafts:${drafts}`, tone: 'todo', icon: Hourglass, text: `${plural(drafts, 'draft', 'drafts')} waiting for approval`, to: '/publishing?status=draft' })
    }
    const toMark = planned.filter((p) => p.status === 'approved' && p.manual).length
    if (toMark) {
      notes.push({
        key: `mark:${toMark}`,
        tone: 'todo',
        icon: Hourglass,
        text: `${plural(toMark, 'post', 'posts')} to post on LinkedIn and mark as posted`,
        to: '/publishing?status=action',
      })
    }
    // Holidays and industry events in the next 7 days (UAE time), soonest first
    const upcoming = (cal?.items ?? [])
      .filter((i) => HOLIDAY_KINDS.has(i.kind) && i.end >= today)
      .sort((a, b) => a.start.localeCompare(b.start))
    for (const i of upcoming) {
      const when = i.start <= today ? 'Today' : format(parseISO(i.start), 'EEE d MMM')
      notes.push({
        key: `cal:${i.title}:${i.start}`,
        tone: 'info',
        icon: CalendarDays,
        text: i.kind === 'uae_holiday' ? `UAE holiday: ${i.title}` : i.title,
        sub: `${when}${i.status === 'expected' ? ' (date expected)' : ''}`,
        to: `/calendar?month=${i.start.slice(0, 7)}`,
      })
    }
    return notes.slice(0, MAX_NOTES)
  }, [planned, cal, today])
}

function Notifications() {
  const notes = useNotes()
  const [seen, setSeen] = useState<string[]>(readSeen)
  const unread = notes.filter((n) => !seen.includes(n.key)).length
  const open = (o: boolean) => {
    if (!o || !notes.length) return
    // Opening the list marks what's in it as seen; only these keys are kept, so the store never grows
    const keys = notes.map((n) => n.key)
    setSeen(keys)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(keys))
    } catch {
      /* private window: the dot simply comes back next time */
    }
  }
  return (
    <Popover onOpenChange={open}>
      <PopoverTrigger
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        className="relative flex size-9 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-xs transition-colors hover:text-foreground"
      >
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-bad ring-2 ring-card" aria-hidden />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">Notifications</div>
        {notes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>
        ) : (
          <ul className="py-1">
            {notes.map((n) => (
              <li key={n.key}>
                <Link to={n.to} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted">
                  <span
                    className={cn(
                      'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                      n.tone === 'alert' ? 'bg-bad/10 text-bad-fg' : n.tone === 'todo' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <n.icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug">{n.text}</span>
                    {n.sub && <span className="block text-xs text-muted-foreground">{n.sub}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------- profile picture: everything about you

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function ProfileButton() {
  const me = useMe()
  const auth = useAuth()
  const navigate = useNavigate()
  const { theme, setTheme, accent, setAccent } = useTheme()
  const tz = useTz()
  const file = useRef<HTMLInputElement>(null)
  const canSignOut = auth.enabled || !!auth.demoEmail

  return (
    <>
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
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Your profile" className="flex items-center gap-1 rounded-full p-0.5 transition-opacity hover:opacity-90">
          <UserAvatar className="size-9 ring-2 ring-card" />
          <ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-3 text-foreground">
              <UserAvatar className="size-10" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{me.name}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {[me.role ?? (me.signedIn ? null : 'Local mode'), me.email].filter(Boolean).join(' · ')}
                </span>
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/profile')}>
            <UserRound /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => file.current?.click()}>
            <Camera /> {me.photo ? 'Change photo' : 'Add a photo'}
          </DropdownMenuItem>
          {me.photo && (
            <DropdownMenuItem onClick={removeProfilePhoto}>
              <Trash2 /> Remove photo
            </DropdownMenuItem>
          )}
          {auth.can('approver') && (
            <DropdownMenuItem onClick={() => navigate('/linkedin')}>
              <Link2 /> LinkedIn connections
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {theme === 'dark' ? <Moon /> : theme === 'system' ? <Monitor /> : <Sun />} Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Mode</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                  {THEME_OPTIONS.map((t) => (
                    <DropdownMenuRadioItem key={t.value} value={t.value}>
                      <t.icon /> {t.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Accent colour</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={accent} onValueChange={(v) => setAccent(v as Accent)}>
                  {ACCENTS.map((a) => (
                    <DropdownMenuRadioItem key={a.value} value={a.value} closeOnClick={false}>
                      <span className="size-3.5 rounded-full" style={{ background: a.swatch }} aria-hidden /> {a.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Clock /> Time zone <span className="ml-auto pl-2 text-xs text-muted-foreground">{tz.label}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={tz.zone} onValueChange={(v) => tz.setZone(v as ZoneId)}>
                {ZONES.map((z) => (
                  <DropdownMenuRadioItem key={z.id} value={z.id}>
                    {z.long}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {canSignOut && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => auth.signOut()}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
