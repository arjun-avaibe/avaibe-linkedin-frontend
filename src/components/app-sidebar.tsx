import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Inbox,
  Kanban,
  Swords,
  ChevronRight,
  ChevronsUpDown,
  Check,
  Database,
  LayoutDashboard,
  Lightbulb,
  Link2,
  LogOut,
  Monitor,
  Moon,
  Send,
  SquarePen,
  Settings,
  Sun,
  UserRound,
  Clock,
} from 'lucide-react'
import { ROLE_LABELS, useAuth } from '@/context/auth'
import type { Role } from '@/lib/api'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
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
import { useAccount } from '@/context/account'
import { ACCENTS, useTheme, type Accent, type Theme } from '@/context/theme'
import { useTz, ZONES, type ZoneId } from '@/context/timezone'
import { usePlanned } from '@/hooks/queries'
import { SUGGESTION_AREAS, useSuggestionItems } from '@/hooks/suggestion-items'
import { needsAction } from '@/lib/publishing'
import { cn } from '@/lib/utils'
import { readProfileName } from '@/pages/profile'
import { UserAvatar } from '@/components/user-avatar'

// Set VITE_COPY_LABEL (e.g. "Test2") on an editable copy, so it can't be confused with the original
const COPY_LABEL = import.meta.env.VITE_COPY_LABEL as string | undefined

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; role: Role }

const OVERVIEW: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, role: 'viewer' },
  { to: '/data', label: 'Data', icon: Database, role: 'viewer' },
]
const CONTENT: NavItem[] = [
  { to: '/create', label: 'Create post', icon: SquarePen, role: 'editor' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, role: 'viewer' },
  { to: '/publishing', label: 'Publishing', icon: Send, role: 'viewer' },
]
const BRAND: NavItem[] = [
  { to: '/brand/suggestions', label: 'Brand suggestions', icon: Lightbulb, role: 'viewer' },
  { to: '/brand/competitors', label: 'Competitors', icon: Swords, role: 'viewer' },
]
const LEADS: NavItem[] = [
  { to: '/leads/suggestions', label: 'Lead suggestions', icon: Lightbulb, role: 'viewer' },
  { to: '/leads/log', label: 'Leads log', icon: Inbox, role: 'viewer' },
]
const SALES: NavItem[] = [
  { to: '/sales/suggestions', label: 'Sales suggestions', icon: Lightbulb, role: 'viewer' },
  { to: '/sales/pipeline', label: 'Pipeline', icon: Kanban, role: 'viewer' },
]

/** A sidebar section whose items fold away: open while you're on one of its pages, or when clicked. */
function useFoldingSection(prefix: string) {
  const { pathname } = useLocation()
  const inside = pathname.startsWith(prefix)
  const [manual, setManual] = useState<{ path: string; open: boolean } | null>(null)
  // A manual open/close lasts until the page changes; then the section follows where you are
  const open = manual && manual.path === pathname ? manual.open : inside
  return { open, toggle: () => setManual({ path: pathname, open: !open }) }
}

const KIND_LABEL: Record<string, string> = { company: 'Company page', founder: 'Founder profile', personal: 'Personal profile' }

export function AppSidebar() {
  const { pathname } = useLocation()
  const { account } = useAccount()
  const { counts } = useSuggestionItems(account?.id)
  const { data: planned = [] } = usePlanned(account?.id)
  const publishingWaiting = planned.filter(needsAction).length
  // Brand, Leads and Sales suggestions are counted in their own sections, not under Suggestions
  const suggestionCount = SUGGESTION_AREAS.reduce((n, a) => n + counts[a.id], 0)
  const auth = useAuth()
  const navigate = useNavigate()
  const brand = useFoldingSection('/brand')
  const leads = useFoldingSection('/leads')
  const sales = useFoldingSection('/sales')
  const inSuggestions = pathname.startsWith('/suggestions')
  // The area list folds open on the Suggestions pages; clicking the heading there opens/closes it
  const [manualOpen, setManualOpen] = useState<boolean | null>(null)
  const suggestionsOpen = inSuggestions && (manualOpen ?? true)
  const toggleSuggestions = () => {
    if (!inSuggestions) {
      setManualOpen(null)
      navigate('/suggestions/content')
    } else setManualOpen(!suggestionsOpen)
  }

  const isActive = (to: string) =>
    to === '/'
      ? pathname === '/'
      : to === '/data'
        ? pathname.startsWith('/data') || pathname.startsWith('/import') || pathname.startsWith('/posts') // Import and Posts live inside Data now
        : pathname.startsWith(to)

  const renderItems = (items: NavItem[]) =>
    items
      .filter((item) => auth.can(item.role))
      .map((item) => (
        <SidebarMenuItem key={item.to}>
          <SidebarMenuButton
            isActive={isActive(item.to)}
            tooltip={item.label}
            render={<NavLink to={item.to} end />}
          >
            <item.icon />
            <span>{item.label}</span>
          </SidebarMenuButton>
          {item.to === '/publishing' && publishingWaiting > 0 && (
            <span
              aria-label={`${publishingWaiting} posts need action`}
              title={`${publishingWaiting} post${publishingWaiting === 1 ? '' : 's'} waiting for someone`}
              className="pointer-events-none absolute top-2.5 right-2 size-2 rounded-full bg-bad ring-2 ring-sidebar group-data-[collapsible=icon]:top-1 group-data-[collapsible=icon]:right-1"
            />
          )}
        </SidebarMenuItem>
      ))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(OVERVIEW)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Content</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderItems(CONTENT)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(
          [
            ['Brand', brand, BRAND, counts.brand],
            ['Leads', leads, LEADS, counts.leads],
            ['Sales', sales, SALES, counts.sales],
          ] as const
        ).map(([label, sec, items, count]) => (
          <SidebarGroup key={label}>
            <SidebarGroupLabel
              render={<button type="button" onClick={sec.toggle} aria-expanded={sec.open} />}
              className="cursor-pointer hover:text-sidebar-foreground"
            >
              {label}
              {!sec.open && count > 0 && <span className="ml-1.5 tabular-nums">· {count}</span>}
              <ChevronRight className={cn('ml-auto transition-transform', sec.open && 'rotate-90')} />
            </SidebarGroupLabel>
            {sec.open && (
              <SidebarGroupContent>
                <SidebarMenu>{renderItems(items)}</SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>Insights</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={inSuggestions && !suggestionsOpen} tooltip="Suggestions" onClick={toggleSuggestions}>
                  <Lightbulb />
                  <span>Suggestions</span>
                  <ChevronRight className={cn('ml-auto transition-transform group-data-[collapsible=icon]:hidden', suggestionsOpen && 'rotate-90')} />
                </SidebarMenuButton>
                {!suggestionsOpen && suggestionCount > 0 && (
                  <SidebarMenuBadge title="Suggestions needing attention" className="right-7">
                    {suggestionCount}
                  </SidebarMenuBadge>
                )}
                {suggestionsOpen && (
                  <SidebarMenuSub>
                    {SUGGESTION_AREAS.map((a) => (
                      <SidebarMenuSubItem key={a.id}>
                        <SidebarMenuSubButton isActive={pathname === `/suggestions/${a.id}`} render={<NavLink to={`/suggestions/${a.id}`} />}>
                          <span>{a.label}</span>
                        </SidebarMenuSubButton>
                        {counts[a.id] > 0 && (
                          <span className="pointer-events-none absolute top-1 right-1 text-xs text-muted-foreground tabular-nums">{counts[a.id]}</span>
                        )}
                      </SidebarMenuSubItem>
                    ))}
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        size="sm"
                        isActive={pathname === '/suggestions/planned'}
                        render={<NavLink to="/suggestions/planned" />}
                        className="text-muted-foreground"
                      >
                        <span>Planned features</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {COPY_LABEL && (
          <div
            className="px-2 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden"
            title="Editable copy of the app with its own database. The original is on port 5173."
          >
            {COPY_LABEL} · editable copy
          </div>
        )}
        <ProfileMenu />
      </SidebarFooter>
    </Sidebar>
  )
}

/** Top of the sidebar: product mark + the current account, which switches accounts when allowed. */
function WorkspaceSwitcher() {
  const { accounts, account, setAccountId } = useAccount()
  const auth = useAuth()

  const face = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
        {(account?.name ?? 'a').slice(0, 1).toUpperCase()}
      </span>
      <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-sm font-semibold">{account?.name ?? 'No account'}</span>
        <span className="truncate text-xs text-muted-foreground">{account ? KIND_LABEL[account.kind] ?? account.kind : 'avaibe'}</span>
      </span>
    </>
  )

  if (!auth.canSwitch || accounts.length < 2) {
    return <div className="flex items-center gap-2 p-1">{face}</div>
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip="Switch account" />}>
            {face}
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Accounts</DropdownMenuLabel>
              {accounts.map((a) => (
                <DropdownMenuItem key={a.id} onClick={() => setAccountId(a.id)}>
                  <span className="flex size-6 items-center justify-center rounded border text-xs font-medium">{a.name.slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {KIND_LABEL[a.kind] ?? a.kind}
                      {a.is_test ? ' · test' : ''}
                    </span>
                  </span>
                  {a.id === account?.id && <Check className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Bottom-left: who you are, with settings, appearance, time zone and sign-out in one menu. */
function ProfileMenu() {
  const auth = useAuth()
  const navigate = useNavigate()
  const { theme, setTheme, accent, setAccent } = useTheme()
  const tz = useTz()
  const [localName, setLocalName] = useState(readProfileName)
  useEffect(() => {
    const update = () => setLocalName(readProfileName())
    window.addEventListener('profile-changed', update)
    return () => window.removeEventListener('profile-changed', update)
  }, [])

  const signedIn = auth.user && !auth.user.dev
  const name = signedIn ? (auth.user!.name ?? auth.user!.email) : localName || auth.demoEmail?.split('@')[0] || 'You'
  const sub = signedIn ? `${ROLE_LABELS[auth.user!.role]} · ${auth.user!.email}` : 'Local mode · sign-in off'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={name} />}>
            <UserAvatar />
            <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{signedIn ? ROLE_LABELS[auth.user!.role] : (auth.demoEmail ?? 'Local mode')}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-foreground">
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="truncate text-xs font-normal text-muted-foreground">{sub}</div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <UserRound /> Profile
            </DropdownMenuItem>
            {auth.can('admin') && (
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings /> Settings
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
                    {THEMES.map((t) => (
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
            {(signedIn || auth.demoEmail) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => auth.signOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
