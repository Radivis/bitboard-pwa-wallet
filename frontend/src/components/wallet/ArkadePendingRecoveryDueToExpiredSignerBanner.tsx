import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { useMainnetFiatRatesQuery } from '@/hooks/useMainnetFiatRatesQuery'
import { useArkadeBalanceQuery } from '@/hooks/useArkadeQueries'
import {
  ARKADE_INFOMODE_IDS,
  ARKADE_PENDING_RECOVERY_DUE_TO_EXPIRED_SIGNER_BANNER_INFOMODE,
} from '@/lib/arkade/arkade-infomode'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

export function ArkadePendingRecoveryDueToExpiredSignerBanner() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const fiatDenominationMode = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.fiatDenominationMode,
  )
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )
  const balanceQuery = useArkadeBalanceQuery()
  const fiatRatesQuery = useMainnetFiatRatesQuery()

  const pendingRecoveryDueToExpiredSignerSats =
    balanceQuery.data?.pendingRecoveryDueToExpiredSignerSats ?? 0
  const mainnetFiatLayout = networkMode === 'mainnet' && fiatDenominationMode

  if (pendingRecoveryDueToExpiredSignerSats <= 0) {
    return null
  }

  return (
    <div
      className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
      role="status"
      data-testid="arkade-pending-recovery-due-to-expired-signer-banner"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="space-y-2">
          <InfomodeWrapper
            infoId={ARKADE_INFOMODE_IDS.pendingRecoveryDueToExpiredSignerBanner}
            infoTitle={ARKADE_PENDING_RECOVERY_DUE_TO_EXPIRED_SIGNER_BANNER_INFOMODE.title}
            infoText={ARKADE_PENDING_RECOVERY_DUE_TO_EXPIRED_SIGNER_BANNER_INFOMODE.text}
            as="span"
          >
            <p className="font-medium">Pending recovery after signer rotation</p>
          </InfomodeWrapper>
          <p className="text-muted-foreground">
            <FiatBtcAmountDisplay
              amountSats={pendingRecoveryDueToExpiredSignerSats}
              showFiatLayout={mainnetFiatLayout}
              btcPriceInFiat={fiatRatesQuery.data?.btcPriceInFiat}
              currency={defaultFiatCurrency}
              rateLoading={fiatRatesQuery.isPending}
            />{' '}
            is locked under a deprecated operator signing key past the cooperative migration cutoff.
            Cooperative send and migrate are unavailable — use{' '}
            <Link
              to="/wallet/management"
              className="text-primary underline-offset-4 hover:underline"
            >
              unilateral exit in Management
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
