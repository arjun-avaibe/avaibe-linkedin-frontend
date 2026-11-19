import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/context/auth'
import { useAccounts } from '@/hooks/queries'
import type { Account } from '@/lib/api'

interface AccountCtx {
  accounts: Account[]
  account: Account | undefined
  setAccountId: (id: number) => void
  isLoading: boolean
  error: Error | null
}

const Ctx = createContext<AccountCtx | null>(null)
// v2: earlier builds remembered the test page; start everyone on the real account once
const STORAGE_KEY = 'avaibe.accountId.v2'

function readStored(): number | null {
  // A shared link can open a specific account: ?account=4
  const fromLink = new URLSearchParams(window.location.search).get('account')
  if (fromLink && /^\d+$/.test(fromLink)) return Number(fromLink)
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const { signedIn, me } = useAuth()
  // Only the accounts this person may see come back from the server
  const { data: accounts = [], isLoading, error } = useAccounts(signedIn)
  const [accountId, setId] = useState<number | null>(readStored)

  // Nothing valid stored: open the default account (the real company page), then the first real account
  useEffect(() => {
    if (!accounts.length || accounts.some((a) => a.id === accountId)) return
    const fallback =
      accounts.find((a) => a.id === me?.default_account_id) ?? accounts.find((a) => !a.is_test) ?? accounts[0]
    setId(fallback.id)
  }, [accounts, accountId, me?.default_account_id])

  const setAccountId = (id: number) => {
    setId(id)
    try {
      localStorage.setItem(STORAGE_KEY, String(id))
    } catch {
      /* storage unavailable: selection just won't persist */
    }
  }

  const account = accounts.find((a) => a.id === accountId)
  return <Ctx.Provider value={{ accounts, account, setAccountId, isLoading, error }}>{children}</Ctx.Provider>
}

export function useAccount() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider')
  return ctx
}
