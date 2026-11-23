/**
 * Create post (and Edit post): write, check and schedule a LinkedIn post on one page.
 * Left: the post. Right: AI suggestions, which only run when someone clicks Analyse (opening the page costs nothing).
 * Scheduling still follows the approval flow: an approver's "Schedule post" saves and approves in one step;
 * anyone else's sends the draft for approval.
 */
import { Link, useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccount } from '@/context/account'
import { usePlanned } from '@/hooks/queries'
import { Editor } from './components/Editor'

export function CreatePostPage() {
  const { id } = useParams()
  const { account } = useAccount()
  const { data: planned, isLoading } = usePlanned(account?.id)
  const editing = id ? planned?.find((p) => p.id === Number(id)) : undefined

  if (!account) return null
  if (id && isLoading) return <Skeleton className="h-[70vh] rounded-2xl" />
  if (id && !editing) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center text-sm text-muted-foreground">
        This post isn’t in {account.name}’s queue. It may belong to another account or have been deleted.{' '}
        <Link to="/publishing" className="underline">
          Back to Publishing
        </Link>
      </div>
    )
  }
  // key: switching between posts (or to a new one) starts from a clean form
  return <Editor key={editing?.id ?? 'new'} accountId={account.id} accountName={account.name} initial={editing} />
}
