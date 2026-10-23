import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { barkSessionBlockingScreen } from '@/components/bark/bark-session-blocking-screen'
import { BarkRailUnavailable } from '@/components/bark/BarkRailUnavailable'
import { BitcoinFiatDenominationSwitch } from '@/components/BitcoinFiatDenominationSwitch'
import { LabeledFiatBtcAmount } from '@/components/FiatBtcAmountDisplay'
import { SatsOrFiatAmountField } from '@/components/SatsOrFiatAmountField'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import { useMainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import { barkBoardPerformDeps, barkBoardReviewDeps } from '@/lib/bark/bark-board-live-deps'
import { performBarkBoard } from '@/lib/bark/perform-bark-board'
import {
  repriceBarkBoardOnchain,
  reviewBarkBoard,
  type BarkBoardReview,
} from '@/lib/bark/review-bark-board'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import {
  amountSatsFromSatsOrFiatField,
  satsOrFiatAmountReviewDecision,
} from '@/lib/fiat/sats-or-fiat-amount'
import { errorMessage } from '@/lib/shared/utils'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

const CONFIRMATION_NOTE =
  "Spendable Bark balance updates after the server's required confirmations and a Bark sync."

export function BarkBoardPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const navigate = useNavigate()
  const {
    feePresetSelection,
    presetSatPerVbByLabel,
    feeEstimatesRefreshing,
    handleSelectFeePreset,
    handleSelectCustomMode,
    effectiveFeeRate,
    customFeeParsed,
    customFeeRate,
    setCustomFeeRate,
    useCustomFee,
  } = useOnchainFeeRateSelection(networkMode)
  const fiatAmount = useMainnetFiatAmountProps()
  const [amountRaw, setAmountRaw] = useState('')
  const [review, setReview] = useState<BarkBoardReview | null>(null)
  const [reviewedAtFeeRate, setReviewedAtFeeRate] = useState<number | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [repriceError, setRepriceError] = useState<string | null>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [isRepricing, setIsRepricing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const reviewRef = useRef(review)
  // Replacing the review object must not start another rebuild. The effect
  // reads the current review here and reruns only when the selected rate changes.
  reviewRef.current = review

  useEffect(() => {
    const currentReview = reviewRef.current
    if (currentReview == null || reviewedAtFeeRate == null) return
    if (useCustomFee && customFeeParsed == null) {
      setIsRepricing(false)
      return
    }
    if (effectiveFeeRate === reviewedAtFeeRate) {
      setIsRepricing(false)
      setRepriceError(null)
      return
    }

    let ignoreStaleResult = false
    setIsRepricing(true)
    setRepriceError(null)
    const feeRateSatPerVb = effectiveFeeRate
    void repriceBarkBoardOnchain(
      barkBoardReviewDeps(networkMode),
      currentReview,
      feeRateSatPerVb,
    )
      .then((nextReview) => {
        if (ignoreStaleResult) return
        setReview(nextReview)
        setReviewedAtFeeRate(feeRateSatPerVb)
      })
      .catch((err) => {
        if (ignoreStaleResult) return
        setRepriceError(errorMessage(err))
      })
      .finally(() => {
        if (!ignoreStaleResult) setIsRepricing(false)
      })
    return () => {
      ignoreStaleResult = true
    }
  }, [reviewedAtFeeRate, effectiveFeeRate, useCustomFee, customFeeParsed, networkMode])

  if (!isBarkEnabled || !isBarkNetworkMode(networkMode)) {
    return (
      <BarkRailUnavailable
        title="Board to Bark"
        message="Bark boarding is available on Signet and Mainnet when Bark is enabled."
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

  const customFeeRateIsMissing = useCustomFee && customFeeParsed == null
  const reviewedRateIsCurrent =
    reviewedAtFeeRate != null && effectiveFeeRate === reviewedAtFeeRate
  const confirmDisabled =
    isConfirming ||
    isRepricing ||
    customFeeRateIsMissing ||
    repriceError != null ||
    !reviewedRateIsCurrent
  const fiatPriceBlocksReview = fiatAmount.mainnetFiatEntry && !fiatAmount.hasUsableFiatSpot
  const parsedAmountSats = amountSatsFromSatsOrFiatField(amountRaw, {
    useFiatAmountEntry: fiatAmount.mainnetFiatEntry,
    btcPriceInFiat: fiatAmount.btcPriceInFiat,
  })

  function discardReview() {
    setReview(null)
    setReviewedAtFeeRate(null)
    setRepriceError(null)
    setIsRepricing(false)
  }

  function clearAmountEntry() {
    setAmountRaw('')
    setReviewError(null)
    discardReview()
  }

  async function onReview() {
    const amountDecision = satsOrFiatAmountReviewDecision(amountRaw, fiatAmount)
    if (amountDecision.kind === 'blocked') {
      setReviewError(null)
      discardReview()
      return
    }
    if (amountDecision.kind === 'invalid') {
      discardReview()
      setReviewError(amountDecision.message)
      return
    }
    const amountSats = amountDecision.amountSats
    const feeRateSatPerVb = effectiveFeeRate
    setIsReviewing(true)
    setReviewError(null)
    setRepriceError(null)
    try {
      const nextReview = await reviewBarkBoard(barkBoardReviewDeps(networkMode), {
        amountSats,
        feeRateSatPerVb,
      })
      setReview(nextReview)
      setReviewedAtFeeRate(feeRateSatPerVb)
    } catch (err) {
      discardReview()
      setReviewError(errorMessage(err))
    } finally {
      setIsReviewing(false)
    }
  }

  async function onConfirm() {
    if (review == null) return
    setIsConfirming(true)
    try {
      const accepted = await performBarkBoard(barkBoardPerformDeps(), review.psbtBase64)
      const acceptedMessage =
        'Board accepted. Spendable Bark balance updates after confirmations and a Bark sync.'
      toast.success(
        accepted.localWalletWarning == null
          ? acceptedMessage
          : `${acceptedMessage} ${accepted.localWalletWarning}`,
      )
      navigate({ to: '/wallet' })
    } catch (err) {
      toast.error(errorMessage(err) || 'Board failed')
    } finally {
      setIsConfirming(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Board to Bark" />
      {networkMode === 'mainnet' ? (
        <BitcoinFiatDenominationSwitch
          disabled={isReviewing || isConfirming}
          onFiatModeChange={clearAmountEntry}
        />
      ) : null}
      <p className="text-sm text-muted-foreground" data-testid="bark-board-confirmation-note">
        This sends coins from your on-chain wallet into Bark. Bark broadcasts the funding
        transaction. {CONFIRMATION_NOTE}
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Amount</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SatsOrFiatAmountField
            satsLabel="Satoshis"
            fiatLabel={`Amount (${fiatAmount.currency})`}
            amountRaw={amountRaw}
            onAmountChange={(nextAmountRaw) => {
              setAmountRaw(nextAmountRaw)
              discardReview()
            }}
            inputTestId="bark-board-amount"
            priceUnavailableTestId="bark-board-fiat-price-unavailable"
            btcPreviewTestId="bark-board-amount-btc-preview"
            fiat={fiatAmount}
            parsedAmountSats={parsedAmountSats}
          />
          <Button
            type="button"
            onClick={() => {
              void onReview()
            }}
            disabled={isReviewing || isConfirming || isRepricing || fiatPriceBlocksReview}
            data-testid="bark-board-review"
          >
            {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Review
          </Button>
          {reviewError != null ? (
            <p className="text-sm text-destructive" data-testid="bark-board-review-error">
              {reviewError}
            </p>
          ) : null}
        </CardContent>
      </Card>
      {review != null ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div data-testid="bark-board-fee-rate">
              <SendOnChainFeeSection
                feePresetSelection={feePresetSelection}
                presetSatPerVbByLabel={presetSatPerVbByLabel}
                feeEstimatesRefreshing={feeEstimatesRefreshing}
                customFeeRate={customFeeRate}
                useCustomFee={useCustomFee}
                isPending={isConfirming}
                onSelectPreset={handleSelectFeePreset}
                setCustomFeeRate={setCustomFeeRate}
                onSelectCustomMode={handleSelectCustomMode}
              />
            </div>
            <LabeledFiatBtcAmount
              label="On-chain fee:"
              amountSats={review.onchainFeeSats}
              testId="bark-board-onchain-fee"
              fiat={fiatAmount}
            />
            <LabeledFiatBtcAmount
              label="Bark board fee:"
              amountSats={review.offchainFeeSats}
              testId="bark-board-offchain-fee"
              fiat={fiatAmount}
            />
            <LabeledFiatBtcAmount
              label="VTXO you receive:"
              amountSats={review.netVtxoSats}
              testId="bark-board-net-vtxo"
              fiat={fiatAmount}
            />
            {repriceError != null ? (
              <p className="text-sm text-destructive" data-testid="bark-board-reprice-error">
                {repriceError}
              </p>
            ) : null}
            <Button
              type="button"
              onClick={() => {
                void onConfirm()
              }}
              disabled={confirmDisabled}
              data-testid="bark-board-confirm"
            >
              {isConfirming || isRepricing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm board
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
