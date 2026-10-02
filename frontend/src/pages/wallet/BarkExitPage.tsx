import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { BarkRailUnavailable } from '@/components/bark/BarkRailUnavailable'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import { barkExitPerformDeps, barkExitReviewDeps } from '@/lib/bark/bark-exit-live-deps'
import { BarkOffboardParkedError, performBarkExit } from '@/lib/bark/perform-bark-exit'
import {
  parseBarkExitAmountSats,
  reviewBarkExitAll,
  reviewBarkExitAmount,
  type BarkExitReview,
} from '@/lib/bark/review-bark-exit'
import { errorMessage } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

const CONFIRMATION_NOTE =
  'The on-chain balance updates after the exit transaction confirms and the on-chain wallet syncs.'

export function BarkExitPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const spendableSats = useBarkSyncLifecycleSnapshot().spendableSats
  const navigate = useNavigate()
  const [amountRaw, setAmountRaw] = useState('')
  const [review, setReview] = useState<BarkExitReview | null>(null)
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

  const destinationAddress = currentAddress?.trim() ?? ''
  const canExitAll = spendableSats != null && spendableSats > 0

  async function onReviewAmount() {
    const amountSats = parseBarkExitAmountSats(amountRaw)
    if (amountSats == null) {
      setReview(null)
      setReviewError('Enter a whole number of satoshis.')
      return
    }
    setIsReviewing(true)
    setReviewError(null)
    try {
      setReview(
        await reviewBarkExitAmount(barkExitReviewDeps(), {
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
        await reviewBarkExitAll(barkExitReviewDeps(), { destinationAddress }),
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
      const accepted = await performBarkExit(barkExitPerformDeps(), review)
      const acceptedMessage = `Exit broadcast. ${CONFIRMATION_NOTE}`
      toast.success(
        accepted.syncWarning == null
          ? acceptedMessage
          : `${acceptedMessage} ${accepted.syncWarning}`,
      )
      navigate({ to: '/wallet' })
    } catch (err) {
      if (err instanceof BarkOffboardParkedError) {
        toast.error(err.message)
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
      <p className="text-sm text-muted-foreground" data-testid="bark-exit-confirmation-note">
        This sends Bark funds to your on-chain Signet address. Bark broadcasts the exit.{' '}
        {CONFIRMATION_NOTE}
      </p>
      {destinationAddress.length === 0 ? (
        <p data-testid="bark-exit-address-missing">Your on-chain receive address is not ready.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Destination</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="break-all text-sm" data-testid="bark-exit-destination">
                {destinationAddress}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Amount</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span>Satoshis that should arrive on-chain</span>
                <Input
                  inputMode="numeric"
                  value={amountRaw}
                  onChange={(event) => {
                    setAmountRaw(event.target.value)
                    setReview(null)
                  }}
                  data-testid="bark-exit-amount"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    void onReviewAmount()
                  }}
                  disabled={isReviewing || isConfirming}
                  data-testid="bark-exit-review-amount"
                >
                  {isReviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Review amount
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void onReviewAll()
                  }}
                  disabled={isReviewing || isConfirming || !canExitAll}
                  data-testid="bark-exit-review-all"
                >
                  Exit entire balance
                </Button>
              </div>
              {reviewError != null ? (
                <p className="text-sm text-destructive" data-testid="bark-exit-review-error">
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
                <p data-testid="bark-exit-fee">Server fee: {formatSats(review.feeSats)}</p>
                <p data-testid="bark-exit-onchain-amount">
                  On-chain amount: {formatSats(review.onchainAmountSats)}
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    void onConfirm()
                  }}
                  disabled={isConfirming}
                  data-testid="bark-exit-confirm"
                >
                  {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm exit
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
