import { Link } from '@tanstack/react-router'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import {
  ARKADE_BALANCE_BOARDING_INFOMODE,
  ARKADE_BALANCE_BOARDING_PENDING_INFOMODE,
  ARKADE_BALANCE_BUMPER_INFOMODE,
  ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE,
  ARKADE_BALANCE_RECOVERABLE_INFOMODE,
  ARKADE_BALANCE_VTXOS_INFOMODE,
  ARKADE_INFOMODE_IDS,
} from '@/lib/arkade/arkade-infomode'
import { ArkadeBumperWalletInfomodeContent } from '@/components/arkade/infomode/ArkadeBumperWalletInfomodeContent'
import type { ArkadeBalanceInfo } from '@/workers/arkade-api'
import {
  arkadeCollaborativeExitInProgressSats,
  arkadeDashboardSpendableSats,
  arkadeHasBoardingBalance,
  arkadeHasExitInProgress,
  arkadeOffchainSpendableSats,
  arkadeOnchainBumperSats,
  arkadeUnilateralExitInProgressSats,
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
  const unilateralExitSats = arkadeUnilateralExitInProgressSats(balance)
  const collaborativeExitSats = arkadeCollaborativeExitInProgressSats(balance)
  const showExitBreakdown = arkadeHasExitInProgress(balance)
  const pendingRecoverySats = balance.pendingRecoverySats ?? 0
  const showPendingRecovery = pendingRecoverySats > 0
  const onchainBumperSats = arkadeOnchainBumperSats(balance)
  const showBumperBreakdown = onchainBumperSats > 0
  const showRecoverableTotal =
    balance.totalSats > dashboardSpendableSats + boardingPendingSats + onchainBumperSats

  return (
    <div className="space-y-1">
      <BitcoinAmountDisplay
        amountSats={dashboardSpendableSats}
        data-testid={amountTestId}
      />
      {showBoardingBreakdown && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {boardingSpendableSats > 0 && (
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.balanceBoarding}
              infoTitle={ARKADE_BALANCE_BOARDING_INFOMODE.title}
              infoText={ARKADE_BALANCE_BOARDING_INFOMODE.text}
              as="span"
            >
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
            </InfomodeWrapper>
          )}
          {boardingPendingSats > 0 && (
            <InfomodeWrapper
              infoId="arkade-balance-boarding-pending"
              infoTitle={ARKADE_BALANCE_BOARDING_PENDING_INFOMODE.title}
              infoText={ARKADE_BALANCE_BOARDING_PENDING_INFOMODE.text}
              as="span"
            >
              <p data-testid="arkade-balance-boarding-pending">
                Pending boarding confirmation:{' '}
                <BitcoinAmountDisplay amountSats={boardingPendingSats} size="sm" />
              </p>
            </InfomodeWrapper>
          )}
          {boardingSpendableSats > 0 && offchainSpendableSats > 0 && (
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.balanceVtxos}
              infoTitle={ARKADE_BALANCE_VTXOS_INFOMODE.title}
              infoText={ARKADE_BALANCE_VTXOS_INFOMODE.text}
              as="span"
            >
              <p>
                Offchain VTXOs:{' '}
                <BitcoinAmountDisplay amountSats={offchainSpendableSats} size="sm" />
              </p>
            </InfomodeWrapper>
          )}
        </div>
      )}
      {showExitBreakdown && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {unilateralExitSats > 0 && (
            <InfomodeWrapper
              infoId="arkade-balance-unilateral-exit"
              infoTitle={ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE.title}
              infoText={ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE.text}
              as="span"
            >
              <p data-testid="arkade-balance-unilateral-exit">
                Unilateral exit in progress: −{' '}
                <BitcoinAmountDisplay amountSats={unilateralExitSats} size="sm" />
              </p>
            </InfomodeWrapper>
          )}
          {collaborativeExitSats > 0 && (
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.balanceExitProgress}
              infoTitle={ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE.title}
              infoText={ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE.text}
              as="span"
            >
              <p data-testid="arkade-balance-collaborative-exit">
                Collaborative exit in progress: −{' '}
                <BitcoinAmountDisplay amountSats={collaborativeExitSats} size="sm" />
              </p>
            </InfomodeWrapper>
          )}
        </div>
      )}
      {showPendingRecovery && (
        <p className="text-xs text-muted-foreground" data-testid="arkade-balance-pending-recovery">
          Pending recovery (deprecated signer):{' '}
          <BitcoinAmountDisplay amountSats={pendingRecoverySats} size="sm" />
        </p>
      )}
      {showBumperBreakdown && (
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.bumperWallet}
          infoTitle={ARKADE_BALANCE_BUMPER_INFOMODE.title}
          infoText={ARKADE_BALANCE_BUMPER_INFOMODE.text}
          infoComponent={ArkadeBumperWalletInfomodeContent}
          as="span"
        >
          <p className="text-xs text-muted-foreground" data-testid="arkade-balance-bumper">
            Bumper wallet (exit fees):{' '}
            <BitcoinAmountDisplay amountSats={onchainBumperSats} size="sm" />
          </p>
        </InfomodeWrapper>
      )}
      {showRecoverableTotal && (
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.balanceRecoverable}
          infoTitle={ARKADE_BALANCE_RECOVERABLE_INFOMODE.title}
          infoText={ARKADE_BALANCE_RECOVERABLE_INFOMODE.text}
          as="span"
        >
          <p className="text-xs text-muted-foreground">
            Total (incl. recoverable):{' '}
            <BitcoinAmountDisplay amountSats={balance.totalSats} size="sm" />
          </p>
        </InfomodeWrapper>
      )}
    </div>
  )
}
