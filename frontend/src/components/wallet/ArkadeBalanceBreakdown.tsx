import { Link } from '@tanstack/react-router'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import type { ArkadeBalanceInfo } from '@/workers/arkade-api'
import {
  arkadeDashboardSpendableSats,
  arkadeHasBoardingBalance,
  arkadeOffchainSpendableSats,
} from '@/lib/arkade/arkade-balance-display'

interface ArkadeBalanceBreakdownProps {
  balance: ArkadeBalanceInfo
  amountTestId?: string
}

export function ArkadeBalanceBreakdown({
  balance,
  amountTestId,
}: ArkadeBalanceBreakdownProps) {
  const boardingSpendableSats = balance.boardingSpendableSats ?? 0
  const boardingPendingSats = balance.boardingPendingSats ?? 0
  const offchainSpendableSats = arkadeOffchainSpendableSats(balance)
  const dashboardSpendableSats = arkadeDashboardSpendableSats(balance)
  const showBoardingBreakdown = arkadeHasBoardingBalance(balance)
  const showRecoverableTotal =
    balance.totalSats > dashboardSpendableSats + boardingPendingSats

  return (
    <div className="space-y-1">
      <BitcoinAmountDisplay
        amountSats={dashboardSpendableSats}
        data-testid={amountTestId}
      />
      {showBoardingBreakdown && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {boardingSpendableSats > 0 && (
            <p data-testid="arkade-balance-boarding-spendable">
              Incl. on-chain boarding (ready to{' '}
              <Link
                to="/wallet/arkade/board"
                className="text-primary underline-offset-4 hover:underline"
                data-testid="arkade-balance-settle-in-management-link"
              >
                settle in management
              </Link>
              ):{' '}
              <BitcoinAmountDisplay amountSats={boardingSpendableSats} size="sm" />
            </p>
          )}
          {boardingPendingSats > 0 && (
            <p data-testid="arkade-balance-boarding-pending">
              Pending boarding confirmation:{' '}
              <BitcoinAmountDisplay amountSats={boardingPendingSats} size="sm" />
            </p>
          )}
          {boardingSpendableSats > 0 && offchainSpendableSats > 0 && (
            <p>
              Offchain VTXOs:{' '}
              <BitcoinAmountDisplay amountSats={offchainSpendableSats} size="sm" />
            </p>
          )}
        </div>
      )}
      {showRecoverableTotal && (
        <p className="text-xs text-muted-foreground">
          Total (incl. recoverable):{' '}
          <BitcoinAmountDisplay amountSats={balance.totalSats} size="sm" />
        </p>
      )}
    </div>
  )
}
