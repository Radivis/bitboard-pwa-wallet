import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/shared/utils'

/** Official Bark brand mark (`frontend/public/bark-logomark.svg`). */
const BARK_LOGOMARK_SRC = '/bark-logomark.svg'

const barkLogomarkMaskStyle = {
  maskImage: `url(${BARK_LOGOMARK_SRC})`,
  WebkitMaskImage: `url(${BARK_LOGOMARK_SRC})`,
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
  maskSize: 'contain',
} as const

export function BarkIcon({ className, style, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{ ...barkLogomarkMaskStyle, ...style }}
      {...props}
    />
  )
}
