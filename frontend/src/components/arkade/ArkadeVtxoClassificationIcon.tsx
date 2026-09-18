import {
  BanknoteArrowUp,
  BrushCleaning,
  Coins,
  Forklift,
  PencilSparkles,
  SquareArrowRightExit,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/shared/utils'
import type { ArkadeVtxoClassification } from '@/workers/arkade-api'

function classificationIcon(classification: ArkadeVtxoClassification): LucideIcon {
  switch (classification) {
    case 'pre_confirmed':
      return BanknoteArrowUp
    case 'confirmed':
      return Coins
    case 'recoverable_settleable':
      return Forklift
    case 'recoverable_pending_operator_sweep':
      return BrushCleaning
    case 'pending_recovery_due_to_expired_signer':
      return PencilSparkles
    case 'exiting':
      return SquareArrowRightExit
    case 'finalized':
      return Trash2
  }
}

interface ArkadeVtxoClassificationIconProps {
  classification: ArkadeVtxoClassification
  className?: string
}

export function ArkadeVtxoClassificationIcon({
  classification,
  className,
}: ArkadeVtxoClassificationIconProps) {
  const Icon = classificationIcon(classification)
  return <Icon aria-hidden className={cn('shrink-0', className)} />
}
