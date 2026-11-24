import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { DashboardActivityRailBadge } from '@/components/DashboardActivityRailBadge'
import { ActivityTimeButton } from '@/components/ActivityTimeButton'
import {
  DesignTransactionCard,
  type DesignTransactionSettlement,
} from '@/components/design/DesignTransactionCard'
import { BarkIcon } from '@/components/icons/BarkIcon'
import { SignedBitcoinAmount } from '@/components/SignedBitcoinAmount'
import { barkMovementActivityLabel } from '@/lib/bark/bark-history'
import type { BarkMovementRow } from '@/workers/bark-api'

const SETTLEMENT: Record<BarkMovementRow['status'], DesignTransactionSettlement> = {
  pending: 'pending',
  successful: 'confirmed',
  failed: 'failed',
  canceled: 'canceled',
}

export function BarkMovementItem({ movement }: { movement: BarkMovementRow }) {
  const isDecrease = movement.effectiveBalanceSats < 0
  const amountSats = Math.abs(movement.effectiveBalanceSats)
  const sign =
    movement.effectiveBalanceSats < 0 ? '-' : movement.effectiveBalanceSats > 0 ? '+' : ''
  const details = [
    { label: 'Kind', value: movement.subsystemKind, prose: true as const },
    ...(movement.offchainFeeSats > 0
      ? [
          {
            label: 'Off-chain fee',
            value: (
              <BitcoinAmountDisplay
                amountSats={movement.offchainFeeSats}
                amountTypography="addresses"
              />
            ),
          },
        ]
      : []),
  ]

  return (
    <DesignTransactionCard
      data-testid={`bark-movement-${movement.id}`}
      direction={isDecrease ? 'sent' : 'received'}
      settlement={SETTLEMENT[movement.status]}
      amount={
        <SignedBitcoinAmount
          sign={sign}
          amountSats={amountSats}
          testId={`bark-movement-amount-${movement.id}`}
        />
      }
      time={
        movement.createdAtUnixSeconds > 0 ? (
          <ActivityTimeButton unixSeconds={movement.createdAtUnixSeconds} />
        ) : undefined
      }
      tags={
        <DashboardActivityRailBadge
          icon={BarkIcon}
          label={barkMovementActivityLabel(movement.subsystemName, movement.subsystemKind)}
        />
      }
      details={details}
    />
  )
}
