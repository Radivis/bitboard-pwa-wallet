import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { BarkRailUnavailable } from '@/components/bark/BarkRailUnavailable'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useEsploraFeePresets } from '@/hooks/useEsploraFeePresets'
import { barkBoardPerformDeps, barkBoardReviewDeps } from '@/lib/bark/bark-board-live-deps'
import { performBarkBoard } from '@/lib/bark/perform-bark-board'
import { parseBarkBoardAmountSats, reviewBarkBoard, type BarkBoardReview } from '@/lib/bark/review-bark-board'
import { NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB } from '@/lib/esplora/esplora-fee-estimates'
import { errorMessage } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

const CONFIRMATION_NOTE =
  "Spendable Bark balance updates after the server's required confirmations and a Bark sync."

export function BarkBoardPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const navigate = useNavigate()
  const feePresetsQuery = useEsploraFeePresets(networkMode)
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

  async function onReview() {
    const amountSats = parseBarkBoardAmountSats(amountRaw)
    if (amountSats == null) {
      setReview(null)
      setReviewError('Enter a whole number of satoshis.')
      return
    }
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
      <p className="text-sm text-muted-foreground" data-testid="bark-board-confirmation-note">
        This sends public Signet coins from your on-chain wallet into Bark. Bark broadcasts the
        funding transaction. {CONFIRMATION_NOTE}
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Amount</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>Satoshis</span>
            <Input
              inputMode="numeric"
              value={amountRaw}
              onChange={(event) => {
                setAmountRaw(event.target.value)
                setReview(null)
              }}
              data-testid="bark-board-amount"
            />
          </label>
          <Button
            type="button"
            onClick={() => {
              void onReview()
            }}
            disabled={isReviewing || isConfirming}
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
            <p data-testid="bark-board-onchain-fee">
              On-chain fee: {formatSats(review.onchainFeeSats)}
            </p>
            <p data-testid="bark-board-offchain-fee">
              Bark board fee: {formatSats(review.offchainFeeSats)}
            </p>
            <p data-testid="bark-board-net-vtxo">
              VTXO you receive: {formatSats(review.netVtxoSats)}
            </p>
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
