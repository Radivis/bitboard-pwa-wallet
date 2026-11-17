import type { CSSProperties } from 'react'
import { Bitcoin, Zap } from 'lucide-react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { BarkIcon } from '@/components/icons/BarkIcon'

export type ReceiveRail = 'bitcoin' | 'lightning' | 'arkade' | 'bark'

interface ReceiveRailIconProps {
  rail: ReceiveRail
  className?: string
  style?: CSSProperties
}

export function ReceiveRailIcon({ rail, className, style }: ReceiveRailIconProps) {
  switch (rail) {
    case 'bitcoin':
      return <Bitcoin aria-hidden className={className} style={style} />
    case 'lightning':
      return <Zap aria-hidden className={className} style={style} />
    case 'arkade':
      return <ArkadeIcon className={className} style={style} />
    case 'bark':
      return <BarkIcon className={className} style={style} />
  }
}
