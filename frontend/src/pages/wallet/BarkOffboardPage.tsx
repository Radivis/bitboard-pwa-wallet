import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { barkSessionBlockingScreen } from '@/components/bark/bark-session-blocking-screen'
import { BarkRailUnavailable } from '@/components/bark/BarkRailUnavailable'
import { BitcoinFiatDenominationSwitch } from '@/components/BitcoinFiatDenominationSwitch'
import { LabeledFiatBtcAmount } from '@/components/FiatBtcAmountDisplay'
import { SatsOrFiatAmountField } from '@/components/SatsOrFiatAmountField'
import { BarkPendingActionBanner } from '@/components/wallet/BarkPendingActionBanner'
import { DesignButton } from '@/components/design/DesignButton'
import {
  DesignCard,
  DesignCardContent,
  DesignCardHeader,
  DesignCardTitle,
} from '@/components/design/DesignCard'
import { PageHeader } from '@/components/PageHeader'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { useMainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import { barkOffboardPerformDeps, barkOffboardReviewDeps } from '@/lib/bark/bark-offboard-live-deps'
import { BarkOffboardParkedError, performBarkOffboard } from '@/lib/bark/perform-bark-offboard'
import {
  reviewBarkOffboardAll,
  reviewBarkOffboardAmount,
  type BarkOffboardReview,
} from '@/lib/bark/review-bark-offboard'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import {
  amountSatsFromSatsOrFiatField,
  satsOrFiatAmountReviewDecision,
} from '@/lib/fiat/sats-or-fiat-amount'
import { errorMessage } from '@/lib/shared/utils'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

const CONFIRMATION_NOTE =
  'The on-chain balance updates after the exit transaction confirms and the on-chain wallet syncs.'

export function BarkOffboardPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const spendableSats = useBarkSyncLifecycleSnapshot().spendableSats
  const fiatAmount = useMainnetFiatAmountProps()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [amountRaw, setAmountRaw] = useState('')
  const [review, setReview] = useState<BarkOffboardReview | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  if (!isBarkEnabled || !isBarkNetworkMode(networkMode)) {
    return (
      <BarkRailUnavailable
        title="Exit Bark to on-chain"
        message="Bark exit is available on Signet and Mainnet when Bark is enabled."
        backTo="/wallet"
        backLabel="Back"
      />
    )
  }

  const sessionBlockingScreen = barkSessionBlockingScreen(
    loadSnapshot.loadPhase,
    loadSnapshot.errorMessage,
  )
  if (sessionBlockingScreen) {
    return sessionBlockingScreen
  }

  const destinationAddress = currentAddress?.trim() ?? ''
  const canExitAll = spendableSats != null && spendableSats > 0
  const fiatPriceBlocksReview = fiatAmount.mainnetFiatEntry && !fiatAmount.hasUsableFiatSpot
  const parsedAmountSats = amountSatsFromSatsOrFiatField(amountRaw, {
    useFiatAmountEntry: fiatAmount.mainnetFiatEntry,
    btcPriceInFiat: fiatAmount.btcPriceInFiat,
  })

  function clearAmountEntry() {
    setAmountRaw('')
    setReview(null)
    setReviewError(null)
  }

  async function onReviewAmount() {
    const amountDecision = satsOrFiatAmountReviewDecision(amountRaw, fiatAmount)
    if (amountDecision.kind === 'blocked') {
      setReview(null)
      setReviewError(null)
      return
    }
    if (amountDecision.kind === 'invalid') {
      setReview(null)
      setReviewError(amountDecision.message)
      return
    }
    const amountSats = amountDecision.amountSats
    setIsReviewing(true)
    setReviewError(null)
    try {
      setReview(
        await reviewBarkOffboardAmount(barkOffboardReviewDeps(), {
          destinationAddress,
          amountSats,
        }),
      )
    } catch (err) {
      setReview(null)
      setReviewError(errorMessage(err))
    } finally {
      setIsReviewing(false)
    }
  }

  async function onReviewAll() {
    setIsReviewing(true)
    setReviewError(null)
    try {
      setReview(
        await reviewBarkOffboardAll(barkOffboardReviewDeps(), { destinationAddress }),
      )
    } catch (err) {
      setReview(null)
      setReviewError(errorMessage(err))
    } finally {
      setIsReviewing(false)
    }
  }

  async function onConfirm() {
    if (review == null) return
    setIsConfirming(true)
    try {
      const accepted = await performBarkOffboard(barkOffboardPerformDeps(), review)
      const acceptedMessage = `Exit broadcast. ${CONFIRMATION_NOTE}`
      toast.success(
        accepted.syncWarning == null
          ? acceptedMessage
          : `${acceptedMessage} ${accepted.syncWarning}`,
      )
      navigate({ to: '/wallet' })
    } catch (err) {
      if (err instanceof BarkOffboardParkedError) {
        await queryClient.invalidateQueries({ queryKey: ['bark', 'pending-actions'] })
      } else {
        toast.error(errorMessage(err) || 'Exit failed')
      }
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Exit Bark to on-chain" />
      {networkMode === 'mainnet' ? (
        <BitcoinFiatDenominationSwitch
          disabled={isReviewing || isConfirming}
          onFiatModeChange={clearAmountEntry}
        />
      ) : null}
      <BarkPendingActionBanner />
      <p className="design-type-regular text-muted-foreground" data-testid="bark-offboard-confirmation-note">
        This sends Bark funds to your on-chain address. Bark broadcasts the exit.{' '}
        {CONFIRMATION_NOTE}
      </p>
      {destinationAddress.length === 0 ? (
        <p data-testid="bark-offboard-address-missing">Your on-chain receive address is not ready.</p>
      ) : (
        <>
          <DesignCard>
            <DesignCardHeader>
              <DesignCardTitle>Destination</DesignCardTitle>
            </DesignCardHeader>
            <DesignCardContent>
              <p className="design-type-regular break-all" data-testid="bark-offboard-destination">
                {destinationAddress}
              </p>
            </DesignCardContent>
          </DesignCard>
          <DesignCard>
            <DesignCardHeader>
              <DesignCardTitle>Amount</DesignCardTitle>
            </DesignCardHeader>
            <DesignCardContent className="space-y-3">
              <SatsOrFiatAmountField
                satsLabel="Satoshis that should arrive on-chain"
                fiatLabel={`${fiatAmount.currency} that should arrive on-chain`}
                amountRaw={amountRaw}
                onAmountChange={(nextAmountRaw) => {
                  setAmountRaw(nextAmountRaw)
                  setReview(null)
                }}
                inputTestId="bark-offboard-amount"
                priceUnavailableTestId="bark-offboard-fiat-price-unavailable"
                btcPreviewTestId="bark-offboard-amount-btc-preview"
                fiat={fiatAmount}
                parsedAmountSats={parsedAmountSats}
              />
              <div className="flex flex-wrap gap-2">
                <DesignButton
                  type="button"
                  onClick={() => {
                    void onReviewAmount()
                  }}
                  disabled={isReviewing || isConfirming || fiatPriceBlocksReview}
                  data-testid="bark-offboard-review-amount"
                  icon={isReviewing ? <Loader2 className="animate-spin" aria-hidden /> : undefined}
                >
                  Review amount
                </DesignButton>
                <DesignButton
                  type="button"
                  appearance="secondary"
                  onClick={() => {
                    void onReviewAll()
                  }}
                  disabled={isReviewing || isConfirming || !canExitAll}
                  data-testid="bark-offboard-review-all"
                >
                  Exit entire balance
                </DesignButton>
              </div>
              {reviewError != null ? (
                <p className="design-type-regular text-destructive" data-testid="bark-offboard-review-error">
                  {reviewError}
                </p>
              ) : null}
            </DesignCardContent>
          </DesignCard>
          {review != null ? (
            <DesignCard>
              <DesignCardHeader>
                <DesignCardTitle>Review</DesignCardTitle>
              </DesignCardHeader>
              <DesignCardContent className="design-type-regular space-y-2">
                <LabeledFiatBtcAmount
                  label="Server fee:"
                  amountSats={review.feeSats}
                  testId="bark-offboard-fee"
                  fiat={fiatAmount}
                />
                <LabeledFiatBtcAmount
                  label="On-chain amount:"
                  amountSats={review.onchainAmountSats}
                  testId="bark-offboard-onchain-amount"
                  fiat={fiatAmount}
                />
                <DesignButton
                  type="button"
                  onClick={() => {
                    void onConfirm()
                  }}
                  disabled={isConfirming}
                  data-testid="bark-offboard-confirm"
                  icon={isConfirming ? <Loader2 className="animate-spin" aria-hidden /> : undefined}
                >
                  Confirm exit
                </DesignButton>
              </DesignCardContent>
            </DesignCard>
          ) : null}
        </>
      )}
    </div>
  )
}
