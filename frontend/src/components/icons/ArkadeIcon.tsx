import type { ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/shared/utils'

/** Official Arkade brand mark (`frontend/public/arkade-mark.svg`, from docs.arkadeos.com). */
const ARKADE_MARK_SRC = '/arkade-mark.svg'

export function ArkadeIcon({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      src={ARKADE_MARK_SRC}
      alt=""
      aria-hidden
      className={cn('inline-block shrink-0', className)}
      {...props}
    />
  )
}
