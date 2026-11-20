import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/common'
import { PostForm } from '@/components/post-form'
import { useAccount } from '@/context/account'
import { useSavePost } from '@/hooks/queries'

export function NewPostPage() {
  const { account } = useAccount()
  const save = useSavePost()
  const navigate = useNavigate()
  if (!account) return null

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Data" title="Add post" description={`Record a post published on ${account.name}. You'll add performance snapshots next.`} />
      <Card>
        <CardContent>
          <PostForm
            accountId={account.id}
            submitLabel="Save post"
            submitting={save.isPending}
            onSubmit={(body) =>
              save.mutate(body, {
                onSuccess: (p) => {
                  toast.success('Post saved')
                  navigate(`/posts/${p.id}`)
                },
                onError: (e) => toast.error(e.message),
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
