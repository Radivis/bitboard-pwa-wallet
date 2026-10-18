import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  BarkDenominationAmountField,
  BarkReviewedAmountLine,
} from '@/components/bark/BarkDenominationAmountField'
import { barkSessionBlockingScreen } from '@/components/bark/bark-session-blocking-screen'
import { BarkRailUnavailable } from '@/components/bark/BarkRailUnavailable'
import { BitcoinFiatDenominationSwitch } from '@/components/BitcoinFiatDenominationSwitch'
import { amountSatsFromSatsOrFiatField } from '@/components/wallet/send/amount-sats-from-sats-or-fiat-field'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useEsploraFeePresets } from '@/hooks/useEsploraFeePresets'
import { useMainnetFiatAmountProps } from '@/hooks/useMainnetFiatAmountProps'
import { barkBoardPerformDeps, barkBoardReviewDeps } from '@/lib/bark/bark-board-live-deps'
import { barkAmountReviewDecision } from '@/lib/bark/bark-denomination-amount'
import { performBarkBoard } from '@/lib/bark/perform-bark-board'
import { reviewBarkBoard, type BarkBoardReview } from '@/lib/bark/review-bark-board'
import { NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB } from '@/lib/esplora/esplora-fee-estimates'
import { errorMessage } from '@/lib/shared/utils'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

const CONFIRMATION_NOTE =
  "Spendable Bark balance updates after the server's required confirmations and a Bark sync."

export function BarkBoardPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const navigate = useNavigate()
  const feePresetsQuery = useEsploraFeePresets(networkMode)
  const fiatAmount = useMainnetFiatAmountProps()
  const feeRateSatPerVb =
    feePresetsQuery.data?.Medium ?? NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB.Medium
  const [amountRaw, setAmountRaw] = useState('')
  const [review, setReview] = useState<BarkBoardReview | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [isReviewing, setIsReviewing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

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

  async function onReview() {
    const amountDecision = barkAmountReviewDecision(amountRaw, fiatAmount)
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
      const nextReview = await reviewBarkBoard(barkBoardReviewDeps(networkMode), {
        amountSats,
        feeRateSatPerVb,
      })
      setReview(nextReview)
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
        This sends public Signet coins from your on-chain wallet into Bark. Bark broadcasts the
        funding transaction. {CONFIRMATION_NOTE}
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Amount</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <BarkDenominationAmountField
            satsLabel="Satoshis"
            fiatLabel={`Amount (${fiatAmount.currency})`}
            amountRaw={amountRaw}
            onAmountChange={(nextAmountRaw) => {
              setAmountRaw(nextAmountRaw)
              setReview(null)
            }}
            inputTestId="bark-board-amount"
            priceUnavailableTestId="bark-board-fiat-price-unavailable"
            btcPreviewTestId="bark-board-amount-btc-preview"
            mainnetFiatEntry={fiatAmount.mainnetFiatEntry}
            hasUsableFiatSpot={fiatAmount.hasUsableFiatSpot}
            currency={fiatAmount.currency}
            parsedAmountSats={parsedAmountSats}
          />
          <Button
            type="button"
            onClick={() => {
              void onReview()
            }}
            disabled={isReviewing || isConfirming || fiatPriceBlocksReview}
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
          <CardContent className="space-y-2 text-sm">
            <BarkReviewedAmountLine
              label="On-chain fee:"
              amountSats={review.onchainFeeSats}
              testId="bark-board-onchain-fee"
              fiat={fiatAmount}
            />
            <BarkReviewedAmountLine
              label="Bark board fee:"
              amountSats={review.offchainFeeSats}
              testId="bark-board-offchain-fee"
              fiat={fiatAmount}
            />
            <BarkReviewedAmountLine
              label="VTXO you receive:"
              amountSats={review.netVtxoSats}
              testId="bark-board-net-vtxo"
              fiat={fiatAmount}
            />
            <Button
              type="button"
              onClick={() => {
                void onConfirm()
              }}
              disabled={isConfirming}
              data-testid="bark-board-confirm"
            >
              {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm board
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
