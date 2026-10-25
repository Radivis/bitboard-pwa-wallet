import { Link } from '@tanstack/react-router'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { FiatBtcAmountDisplay, LabeledFiatBtcAmount } from '@/components/FiatBtcAmountDisplay'
import { useMainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import {
  ARKADE_BALANCE_BOARDING_INFOMODE,
  ARKADE_BALANCE_BOARDING_PENDING_INFOMODE,
  ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE,
  ARKADE_BALANCE_RECOVERABLE_INFOMODE,
  ARKADE_BALANCE_RECOVERABLE_PENDING_OPERATOR_SWEEP_INFOMODE,
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
  arkadeRecoverablePendingOperatorSweepSats,
  arkadeRecoverablePendingOperatorSweepVtxoCount,
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
  const fiatAmount = useMainnetFiatAmountProps()
  const fiatAmountProps = {
    showFiatLayout: fiatAmount.showFiatLayout,
    btcPriceInFiat: fiatAmount.btcPriceInFiat,
    currency: fiatAmount.currency,
    rateLoading: fiatAmount.rateLoading,
  }

  const boardingSpendableSats = balance.boardingSpendableSats ?? 0
  const boardingPendingSats = balance.boardingPendingSats ?? 0
  const offchainSpendableSats = arkadeOffchainSpendableSats(balance)
  const dashboardSpendableSats = arkadeDashboardSpendableSats(balance)
  const showBoardingBreakdown = arkadeHasBoardingBalance(balance)
  const unilateralExitSats = arkadeUnilateralExitInProgressSats(balance)
  const collaborativeExitSats = arkadeCollaborativeExitInProgressSats(balance)
  const showExitBreakdown = arkadeHasExitInProgress(balance)
  const pendingRecoveryDueToExpiredSignerSats =
    balance.pendingRecoveryDueToExpiredSignerSats ?? 0
  const showPendingRecoveryDueToExpiredSigner = pendingRecoveryDueToExpiredSignerSats > 0
  const pendingOperatorSweepSats = arkadeRecoverablePendingOperatorSweepSats(balance)
  const pendingOperatorSweepCount = arkadeRecoverablePendingOperatorSweepVtxoCount(balance)
  const pendingOperatorSweepVtxoLabel = pendingOperatorSweepCount === 1 ? 'VTXO' : 'VTXOs'
  const showPendingOperatorSweep = pendingOperatorSweepSats > 0
  const onchainBumperSats = arkadeOnchainBumperSats(balance)
  const showBumperBreakdown = onchainBumperSats > 0
  const showRecoverableTotal =
    balance.totalSats > dashboardSpendableSats + boardingPendingSats + onchainBumperSats

  return (
    <div className="space-y-1">
      <FiatBtcAmountDisplay
        amountSats={dashboardSpendableSats}
        {...fiatAmountProps}
        amountTypography="largeBalances"
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
              <LabeledFiatBtcAmount
                label={
                  <>
                    Incl. on-chain boarding (ready to{' '}
                    <Link
                      to="/wallet/arkade/board"
                      className="text-primary underline-offset-4 hover:underline"
                      data-testid="arkade-balance-settle-in-management-link"
                    >
                      settle in management
                    </Link>
                    ):
                  </>
                }
                amountSats={boardingSpendableSats}
                testId="arkade-balance-boarding-spendable"
                amountTypography="smallBalances"
                fiat={fiatAmountProps}
              />
            </InfomodeWrapper>
          )}
          {boardingPendingSats > 0 && (
            <InfomodeWrapper
              infoId="arkade-balance-boarding-pending"
              infoTitle={ARKADE_BALANCE_BOARDING_PENDING_INFOMODE.title}
              infoText={ARKADE_BALANCE_BOARDING_PENDING_INFOMODE.text}
              as="span"
            >
              <LabeledFiatBtcAmount
                label="Pending boarding confirmation:"
                amountSats={boardingPendingSats}
                testId="arkade-balance-boarding-pending"
                amountTypography="smallBalances"
                fiat={fiatAmountProps}
              />
            </InfomodeWrapper>
          )}
          {boardingSpendableSats > 0 && offchainSpendableSats > 0 && (
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.balanceVtxos}
              infoTitle={ARKADE_BALANCE_VTXOS_INFOMODE.title}
              infoText={ARKADE_BALANCE_VTXOS_INFOMODE.text}
              as="span"
            >
              <LabeledFiatBtcAmount
                label="Offchain VTXOs:"
                amountSats={offchainSpendableSats}
                amountTypography="smallBalances"
                fiat={fiatAmountProps}
              />
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
              <LabeledFiatBtcAmount
                label="Unilateral exit in progress: −"
                amountSats={unilateralExitSats}
                testId="arkade-balance-unilateral-exit"
                amountTypography="smallBalances"
                fiat={fiatAmountProps}
              />
            </InfomodeWrapper>
          )}
          {collaborativeExitSats > 0 && (
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.balanceExitProgress}
              infoTitle={ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE.title}
              infoText={ARKADE_BALANCE_EXIT_PROGRESS_INFOMODE.text}
              as="span"
            >
              <LabeledFiatBtcAmount
                label="Collaborative exit in progress: −"
                amountSats={collaborativeExitSats}
                testId="arkade-balance-collaborative-exit"
                amountTypography="smallBalances"
                fiat={fiatAmountProps}
              />
            </InfomodeWrapper>
          )}
        </div>
      )}
      {showPendingRecoveryDueToExpiredSigner && (
        <LabeledFiatBtcAmount
          label="Pending recovery (expired signer):"
          amountSats={pendingRecoveryDueToExpiredSignerSats}
          testId="arkade-balance-pending-recovery-due-to-expired-signer"
          className="text-xs text-muted-foreground"
          amountTypography="smallBalances"
          fiat={fiatAmountProps}
        />
      )}
      {showPendingOperatorSweep && (
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.balanceRecoverablePendingOperatorSweep}
          infoTitle={ARKADE_BALANCE_RECOVERABLE_PENDING_OPERATOR_SWEEP_INFOMODE.title}
          infoText={ARKADE_BALANCE_RECOVERABLE_PENDING_OPERATOR_SWEEP_INFOMODE.text}
          as="span"
        >
          <LabeledFiatBtcAmount
            label={`Expired — waiting for operator sweep (${pendingOperatorSweepCount} ${pendingOperatorSweepVtxoLabel}):`}
            amountSats={pendingOperatorSweepSats}
            testId="arkade-balance-recoverable-pending-operator-sweep"
            className="text-xs text-muted-foreground"
            amountTypography="smallBalances"
            fiat={fiatAmountProps}
          />
        </InfomodeWrapper>
      )}
      {showBumperBreakdown && (
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.bumperWallet}
          infoComponent={ArkadeBumperWalletInfomodeContent}
          as="span"
        >
          <LabeledFiatBtcAmount
            label="Bumper wallet (exit fees):"
            amountSats={onchainBumperSats}
            testId="arkade-balance-bumper"
            className="text-xs text-muted-foreground"
            amountTypography="smallBalances"
            fiat={fiatAmountProps}
          />
        </InfomodeWrapper>
      )}
      {showRecoverableTotal && (
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.balanceRecoverable}
          infoTitle={ARKADE_BALANCE_RECOVERABLE_INFOMODE.title}
          infoText={ARKADE_BALANCE_RECOVERABLE_INFOMODE.text}
          as="span"
        >
          <LabeledFiatBtcAmount
            label="Total (incl. recoverable):"
            amountSats={balance.totalSats}
            className="text-xs text-muted-foreground"
            amountTypography="smallBalances"
            fiat={fiatAmountProps}
          />
        </InfomodeWrapper>
      )}
    </div>
  )
}
