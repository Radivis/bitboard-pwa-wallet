import { Link } from '@tanstack/react-router'
import { FiatBtcAmountDisplay } from '@/components/FiatBtcAmountDisplay'
import { DesignBanner } from '@/components/design/DesignBanner'
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
    <DesignBanner
      role="status"
      status="warning"
      data-testid="arkade-pending-recovery-due-to-expired-signer-banner"
      title={
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.pendingRecoveryDueToExpiredSignerBanner}
          infoTitle={ARKADE_PENDING_RECOVERY_DUE_TO_EXPIRED_SIGNER_BANNER_INFOMODE.title}
          infoText={ARKADE_PENDING_RECOVERY_DUE_TO_EXPIRED_SIGNER_BANNER_INFOMODE.text}
          as="span"
        >
          Pending recovery after signer rotation
        </InfomodeWrapper>
      }
      description={
        <>
          <FiatBtcAmountDisplay
            amountSats={pendingRecoveryDueToExpiredSignerSats}
            showFiatLayout={mainnetFiatLayout}
            btcPriceInFiat={fiatRatesQuery.data?.btcPriceInFiat}
            currency={defaultFiatCurrency}
            rateLoading={fiatRatesQuery.isPending}
          />{' '}
          is locked under a deprecated operator signing key past the cooperative migration cutoff.
          Cooperative send and migrate are unavailable — use{' '}
          <Link to="/wallet/management" className="underline underline-offset-4">
            unilateral exit in Management
          </Link>
          .
        </>
      }
    />
  )
}
