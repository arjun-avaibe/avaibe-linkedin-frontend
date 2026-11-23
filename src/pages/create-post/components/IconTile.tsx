import { Type } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A small rounded icon tile, used in card headings */
export function IconTile({ icon: Icon, className }: { icon: typeof Type; className?: string }) {
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary', className)}>
      <Icon className="size-4.5" />
    </span>
  )
}
