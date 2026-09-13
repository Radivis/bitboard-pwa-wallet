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

const CLASSIFICATION_ICONS: Record<ArkadeVtxoClassification, LucideIcon> = {
  pre_confirmed: BanknoteArrowUp,
  confirmed: Coins,
  recoverable_settleable: Forklift,
  recoverable_pending_operator_sweep: BrushCleaning,
  pending_recovery_due_to_expired_signer: PencilSparkles,
  exiting: SquareArrowRightExit,
  finalized: Trash2,
}

interface ArkadeVtxoClassificationIconProps {
  classification: ArkadeVtxoClassification
  className?: string
}

export function ArkadeVtxoClassificationIcon({
  classification,
  className,
}: ArkadeVtxoClassificationIconProps) {
  const Icon = CLASSIFICATION_ICONS[classification]
  return <Icon aria-hidden className={cn('shrink-0', className)} />
}
