/**
 * Who is signed in. The server is the authority on permissions; the UI only hides what a person
 * can't use, so screens stay uncluttered. Every action is checked again on the server.
 */
import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ROLES, type Me, type Role } from '@/lib/api'
import { readDemoEmail, writeDemoEmail } from '@/lib/demo-session'
import { useMe } from '@/pages/auth/queries'

interface AuthCtx {
  me: Me | undefined
  isLoading: boolean
  error: Error | null
  user: NonNullable<Me['user']> | null
  /** Sign-in is configured (false = local dev mode, everyone acts as admin) */
  enabled: boolean
  signedIn: boolean
  can: (role: Role) => boolean
  canSwitch: boolean
  signOut: () => Promise<void>
  /** Local mode only: the email typed on the demo sign-in screen (null = not signed in to the demo) */
  demoEmail: string | null
  demoSignIn: (email: string) => void
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data: me, isLoading, error } = useMe()
  const user = me?.user ?? null
  const [demoEmail, setDemoEmail] = useState<string | null>(readDemoEmail)
  const enabled = !!me?.enabled

  const value: AuthCtx = {
    me,
    isLoading,
    error: error as Error | null,
    user,
    enabled,
    signedIn: !!user,
    can: (role) => !!user && ROLES.indexOf(user.role) >= ROLES.indexOf(role),
    canSwitch: !!user?.can_switch_accounts,
    signOut: async () => {
      if (enabled) await api.logout()
      writeDemoEmail(null)
      setDemoEmail(null)
      qc.clear()
      window.location.href = '/signin?signed_out=1'
    },
    demoEmail: enabled ? null : demoEmail,
    demoSignIn: (email) => {
      writeDemoEmail(email)
      setDemoEmail(email)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

export const ROLE_LABELS: Record<Role, string> = {
  viewer: 'Viewer',
  editor: 'Editor',
  approver: 'Approver',
  admin: 'Admin',
}

export const ROLE_HELP: Record<Role, string> = {
  viewer: 'Sees dashboards and posts',
  editor: 'Also adds posts, numbers and drafts',
  approver: 'Also approves and publishes posts',
  admin: 'Also manages team, accounts, LinkedIn and settings',
}
