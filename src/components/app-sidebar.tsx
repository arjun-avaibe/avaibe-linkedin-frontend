import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  Check,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Database,
  Inbox,
  Kanban,
  LayoutDashboard,
  Lightbulb,
  Send,
  Settings,
  Swords,
} from 'lucide-react'
import { useAuth } from '@/context/auth'
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
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAccount } from '@/context/account'
import { usePlanned } from '@/hooks/queries'
import { useSuggestionItems } from '@/hooks/suggestion-items'
import { needsAction } from '@/lib/publishing'
import { cn } from '@/lib/utils'
import { HelpDialog } from '@/components/help-dialog'

// Set VITE_COPY_LABEL (e.g. "Test2") on an editable copy, so it can't be confused with the original
const COPY_LABEL = import.meta.env.VITE_COPY_LABEL as string | undefined

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; role: Role }

const OVERVIEW: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, role: 'viewer' },
  { to: '/data', label: 'Data', icon: Database, role: 'viewer' },
]
// Content follows the work: Suggestions (what to post) → Calendar (when) → Publishing (write, approve, post).
// Create post opens from Publishing → New post (or a calendar day), so it has no item of its own.
const CONTENT: NavItem[] = [
  { to: '/suggestions/content', label: 'Suggestions', icon: Lightbulb, role: 'viewer' },
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
  const { pathname, search } = useLocation()
  const { account } = useAccount()
  const { counts } = useSuggestionItems(account?.id)
  const { data: planned = [] } = usePlanned(account?.id)
  const publishingWaiting = planned.filter(needsAction).length
  // Content suggestions only: Brand, Leads and Sales are counted in their own sections
  const suggestionCount = counts.content
  const auth = useAuth()
  const [help, setHelp] = useState(false)
  const brand = useFoldingSection('/brand')
  const leads = useFoldingSection('/leads')
  const sales = useFoldingSection('/sales')
  const fromCalendar = new URLSearchParams(search).get('from') === 'calendar'
  const isActive = (to: string) => {
    if (to === '/') return pathname === '/'
    // Import and Posts live inside Data now
    if (to === '/data') return pathname.startsWith('/data') || pathname.startsWith('/import') || pathname.startsWith('/posts')
    if (to === '/suggestions/content') return pathname.startsWith('/suggestions')
    // New / Edit post open from Publishing, or from a calendar day
    if (to === '/publishing') return pathname.startsWith('/publishing') || (pathname.startsWith('/create') && !fromCalendar)
    if (to === '/calendar') return pathname.startsWith('/calendar') || (pathname.startsWith('/create') && fromCalendar)
    return pathname.startsWith(to)
  }

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
          {item.to === '/suggestions/content' && suggestionCount > 0 && (
            <SidebarMenuBadge title="Suggestions needing attention">{suggestionCount}</SidebarMenuBadge>
          )}
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
            <SidebarMenu>
              {renderItems(CONTENT)}
            </SidebarMenu>
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
        {/* Pinned at the bottom: workspace settings (admins) and help. Your own profile is under your picture, top right. */}
        <SidebarMenu>
          {auth.can('admin') && (
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname.startsWith('/settings')} tooltip="Settings" render={<NavLink to="/settings" />}>
                <Settings />
                <span>Settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Help" onClick={() => setHelp(true)}>
              <CircleHelp />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <HelpDialog open={help} onClose={() => setHelp(false)} />
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

