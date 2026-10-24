import type { ReactNode } from 'react'
import { DesignBanner } from '@/components/design/DesignBanner'

type BarkInfoNoticeProps = {
  children: ReactNode
  'data-testid': string
} & Record<`data-${string}`, string | number | boolean | undefined>

/** Warning notice used inside Bark cards and pages. */
export function BarkInfoNotice({ children, ...dataAttributes }: BarkInfoNoticeProps) {
  return <DesignBanner status="warning" role="status" title={children} {...dataAttributes} />
}
