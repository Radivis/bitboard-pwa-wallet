import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

type BarkInfoNoticeProps = {
  children: ReactNode
  'data-testid': string
} & Record<`data-${string}`, string | number | boolean | undefined>

/** Amber status notice with an info icon, used inside Bark cards and pages. */
export function BarkInfoNotice({ children, ...dataAttributes }: BarkInfoNoticeProps) {
  return (
    <div
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      role="status"
      {...dataAttributes}
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p className="text-amber-800 dark:text-amber-300">{children}</p>
      </div>
    </div>
  )
}
