import type { ReactNode } from 'react'
import { cn } from '@/lib/shared/utils'

export const ARKADE_INFOMODE_CONTENT_CLASS = cn(
  'space-y-2 pr-1',
  '[&_a]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline',
)

export function ArkadeInfomodeHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-base font-semibold leading-tight text-popover-foreground">
      {children}
    </h2>
  )
}

export function ArkadeInfomodeParagraph({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
}
