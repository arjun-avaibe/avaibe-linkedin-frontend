import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/top-bar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccount } from '@/context/account'
import { useAuth } from '@/context/auth'

// Set VITE_DEMO_BANNER=1 when running a copy with sample data, so nobody mistakes it for real results
const DEMO = import.meta.env.VITE_DEMO_BANNER === '1'

export function Layout() {
  const auth = useAuth()
  const { pathname } = useLocation()
  const { error } = useAccount()

  if (auth.isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Skeleton className="h-10 w-40" />
      </div>
    )
  }
  if (auth.error) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">Can't reach the backend.</p>
          <p className="mt-1 text-muted-foreground">
            Start it with <code>start-dev.ps1</code> and check that PostgreSQL is running. ({auth.error.message})
          </p>
        </div>
      </div>
    )
  }
  // Sign-in configured but nobody signed in: go to the sign-in page
  if (auth.enabled && !auth.signedIn) return <Navigate to="/signin" replace />
  // Local mode: go through the demo sign-in screen first (nothing is checked)
  if (!auth.enabled && !auth.demoEmail) return <Navigate to="/signin" replace />

  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0: a long unbreakable line (a post title, a wide chart) must never push the page wider than the window */}
      <SidebarInset className="min-w-0">
        {DEMO && (
          <div className="bg-primary px-4 py-1.5 text-center text-xs font-medium text-primary-foreground">
            Demo data: the numbers on these screens are sample figures for illustration, not AVAIBE’s real results.
          </div>
        )}
        {/* Header: sidebar toggle on the left; notifications and profile picture on the right.
            Account switching, appearance, time zone and settings stay in the sidebar. */}
        <header className="flex h-14 shrink-0 items-center px-4 md:px-8">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          {/* Notifications and your profile picture, like most product dashboards */}
          <TopBar />
        </header>
        <div key={pathname} className="page-enter flex-1 px-4 pb-10 md:px-8">
          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium">Couldn't load accounts.</p>
              <p className="mt-1 text-muted-foreground">({error.message})</p>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
