import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/shared/utils'

/** Official Arkade brand mark (`frontend/public/arkade-mark.svg`, from docs.arkadeos.com). */
const ARKADE_MARK_SRC = '/arkade-mark.svg'

const arkadeMarkMaskStyle = {
  maskImage: `url(${ARKADE_MARK_SRC})`,
  WebkitMaskImage: `url(${ARKADE_MARK_SRC})`,
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
  maskSize: 'contain',
} as const

export function ArkadeIcon({ className, style, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{ ...arkadeMarkMaskStyle, ...style }}
      {...props}
    />
  )
}
