import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, Clock3, Link2, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader, Section } from '@/components/common'
import { useAccount } from '@/context/account'
import { useDisconnectLinkedIn, useLinkedInConfig, useLinkedInConnections } from '@/hooks/queries'
import { api, type Account, type LinkedInConnection } from '@/lib/api'

const KIND_LABELS: Record<Account['kind'], string> = {
  company: 'Company page',
  founder: 'Founder profile',
  personal: 'Personal profile',
}

const PRODUCTS = [
  {
    name: 'Share on LinkedIn',
    status: 'active' as const,
    gives: 'Post to the connected person’s personal profile',
  },
  {
    name: 'Sign In with LinkedIn (OpenID Connect)',
    status: 'active' as const,
    gives: 'Identify the connected person (name, email, photo)',
  },
  {
    name: 'Community Management API',
    status: 'pending' as const,
    gives: 'Post as the company page, read page and post analytics, follower demographics. Needs approval with AVAIBE’s registered company details.',
  },
]

export function LinkedInPage() {
  const { accounts } = useAccount()
  const { data: config } = useLinkedInConfig()
  const { data: connections = [] } = useLinkedInConnections()
  const [params, setParams] = useSearchParams()

  // Result of the LinkedIn sign-in redirect
  useEffect(() => {
    const status = params.get('linkedin')
    if (!status) return
    if (status === 'connected') toast.success(`LinkedIn connected${params.get('name') ? `: ${params.get('name')}` : ''}`)
    else if (status === 'busy') {
      const wait = Number(params.get('wait')) || 2
      toast.info(`LinkedIn is busy right now (a lot of people are using it). Please try connecting again in about ${wait} minutes.`, { duration: 10_000 })
    } else toast.error(params.get('message') ?? 'LinkedIn connection failed')
    setParams({}, { replace: true })
  }, [params, setParams])

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader eyebrow="Connections" title="LinkedIn" description="Which LinkedIn accounts the app can post to, and what the LinkedIn app is allowed to do." />

      {config && !config.configured && (
        <div className="rounded-lg border border-warn/50 bg-warn/10 px-4 py-3 text-sm">
          <b>LinkedIn isn't set up yet.</b> Add {config.missing.join(', ')} to <code>backend/.env</code> and restart the backend.
        </div>
      )}

      <Section
        title="Connections"
        description="Connect a LinkedIn member to a personal or founder account to publish from the app. Connections last about 60 days, then need reconnecting."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>LinkedIn connection</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.name} {a.is_test && <Badge variant="outline">test</Badge>}
                </TableCell>
                <TableCell>{KIND_LABELS[a.kind]}</TableCell>
                <TableCell className="whitespace-normal">
                  <ConnectionCell account={a} connection={connections.find((c) => c.account_id === a.id)} configured={!!config?.configured} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          Add or rename accounts in <Link to="/settings?tab=general" className="underline">Settings → General</Link>.
        </p>
      </Section>

      <Section title="LinkedIn app permissions" description="Products enabled on the LinkedIn developer app.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>What it allows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PRODUCTS.map((p) => (
              <TableRow key={p.name}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  {p.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-good-fg">
                      <CheckCircle2 className="size-3.5" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-serious-fg">
                      <Clock3 className="size-3.5" /> Not approved yet
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs whitespace-normal text-muted-foreground">{p.gives}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">
          Redirect URL registered on the app: <code>http://localhost:8000/api/linkedin/callback</code>. This changes when the app is hosted.
        </p>
      </Section>
    </div>
  )
}

function ConnectionCell({ account, connection, configured }: { account: Account; connection?: LinkedInConnection; configured: boolean }) {
  const disconnect = useDisconnectLinkedIn()
  const [busy, setBusy] = useState(false)

  if (account.kind === 'company') {
    return <span className="text-xs text-muted-foreground">Manual tracking (needs Community Management API)</span>
  }

  const connect = async () => {
    setBusy(true)
    try {
      const { url } = await api.linkedinAuthUrl(account.id)
      window.location.href = url // LinkedIn sign-in, then back to this page
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  if (!connection) {
    return (
      <Button size="sm" variant="outline" disabled={!configured || busy} onClick={connect}>
        <Link2 /> {busy ? 'Opening LinkedIn…' : 'Connect LinkedIn'}
      </Button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {connection.picture_url && <img src={connection.picture_url} alt="" className="size-6 rounded-full" />}
      <span className="text-sm">{connection.name ?? 'Connected'}</span>
      {connection.expired ? (
        <Badge variant="outline" className="border-bad/40 text-bad-fg">expired</Badge>
      ) : connection.days_left <= 7 ? (
        <Badge variant="outline" className="border-serious/40 text-serious-fg">expires in {connection.days_left}d</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">valid {connection.days_left} more days</span>
      )}
      {(connection.expired || connection.days_left <= 7) && (
        <Button size="xs" variant="outline" disabled={busy} onClick={connect}>
          Reconnect
        </Button>
      )}
      <Button
        size="xs"
        variant="ghost"
        disabled={disconnect.isPending}
        onClick={() => disconnect.mutate(account.id, { onSuccess: () => toast.success('Disconnected'), onError: (e) => toast.error(e.message) })}
      >
        <Unlink /> Disconnect
      </Button>
    </div>
  )
}
