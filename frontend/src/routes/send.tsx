import { useMemo, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WalletUnlock } from '@/components/WalletUnlock'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useWalletStore } from '@/stores/walletStore'
import { useSendStore } from '@/stores/sendStore'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import {
  isValidAddress,
  formatBTC,
  formatSats,
  truncateAddress,
} from '@/lib/bitcoin-utils'
import { walletOwnerKey } from '@/lib/lab-utils'
import {
  useBuildTransactionMutation,
  useBroadcastTransactionMutation,
  useLabSendMutation,
} from '@/hooks/useSendMutations'

export const Route = createFileRoute('/send')({
  component: SendPage,
})

const FEE_PRESETS = [
  { label: 'Low', rate: 1 },
  { label: 'Medium', rate: 3 },
  { label: 'High', rate: 5 },
] as const

/** Max satoshis we pass to the worker (JS safe integer range). */
const MAX_SAFE_SATS = Number.MAX_SAFE_INTEGER

function isValidAmountSats(n: number): boolean {
  return (
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= MAX_SAFE_SATS
  )
}

export function SendPage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)

  if (!activeWalletId) {
    navigate({ to: '/setup' })
    return null
  }

  if (walletStatus !== 'unlocked' && walletStatus !== 'syncing') {
    return <WalletUnlock />
  }

  return <SendFlow />
}

function SendFlow() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const balance = useWalletStore((s) => s.balance)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)

  const {
    step,
    recipient,
    amount,
    amountUnit,
    feeRate,
    customFeeRate,
    useCustomFee,
    psbt,
    setStep,
    setRecipient,
    setAmount,
    setAmountUnit,
    setFeeRate,
    setCustomFeeRate,
    setUseCustomFee,
  } = useSendStore()

  const { data: labState, isPending: labChainPending } = useLabChainStateQuery()
  const utxos = labState?.utxos ?? []
  const addressToOwner = labState?.addressToOwner ?? {}
  const labChainReady =
    networkMode === 'lab' && labState != null && !labChainPending

  const buildMutation = useBuildTransactionMutation()
  const broadcastMutation = useBroadcastTransactionMutation()
  const labSendMutation = useLabSendMutation()

  const labBalanceSats =
    networkMode === 'lab' && activeWalletId != null && labChainReady
      ? utxos
          .filter(
            (u) => addressToOwner[u.address] === walletOwnerKey(activeWalletId),
          )
          .reduce((sum, u) => sum + u.amountSats, 0)
      : null

  const confirmedBalance =
    networkMode === 'lab' && labBalanceSats !== null
      ? labBalanceSats
      : balance?.confirmed ?? 0

  const effectiveFeeRate = useCustomFee ? parseInt(customFeeRate) || 1 : feeRate

  const amountSats = useMemo(() => {
    if (!amount) return 0
    return amountUnit === 'btc'
      ? Math.floor(parseFloat(amount) * 100_000_000)
      : parseInt(amount) || 0
  }, [amount, amountUnit])

  const normalizedRecipient = useMemo(
    () => recipient.trim().replace(/^bitcoin:/i, ''),
    [recipient],
  )

  const addressValid = useMemo(
    () =>
      normalizedRecipient.length > 0 &&
      isValidAddress(normalizedRecipient, networkMode),
    [normalizedRecipient, networkMode],
  )

  const isLabWithNoBalance =
    networkMode === 'lab' && (labBalanceSats === 0 || labBalanceSats === null)
  const canBuild =
    addressValid &&
    isValidAmountSats(amountSats) &&
    amountSats <= confirmedBalance &&
    !isLabWithNoBalance

  const handleSubmitBuild = useCallback(() => {
    if (!canBuild) return

    if (networkMode === 'lab') {
      setStep(2)
      return
    }

    buildMutation.mutate({
      normalizedRecipient,
      amountSats,
      effectiveFeeRate,
    })
  }, [
    canBuild,
    networkMode,
    setStep,
    buildMutation,
    normalizedRecipient,
    amountSats,
    effectiveFeeRate,
  ])

  const handleConfirmSend = useCallback(() => {
    if (networkMode === 'lab') {
      labSendMutation.mutate({
        normalizedRecipient,
        amountSats,
        effectiveFeeRate,
      })
    } else {
      broadcastMutation.mutate()
    }
  }, [
    networkMode,
    normalizedRecipient,
    amountSats,
    effectiveFeeRate,
    labSendMutation,
    broadcastMutation,
  ])

  const isPending =
    buildMutation.isPending ||
    broadcastMutation.isPending ||
    labSendMutation.isPending

  if (step === 2 && (psbt || networkMode === 'lab')) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Review Transaction</h2>

        <Card>
          <CardHeader>
            <CardTitle>Transaction Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recipient</span>
                <span className="font-mono">{truncateAddress(recipient)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span>
                  {formatBTC(amountSats)} BTC ({formatSats(amountSats)} sats)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee rate</span>
                <span>{effectiveFeeRate} sat/vB</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
                disabled={isPending}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>

              {isPending ? (
                <div className="flex-1">
                  <LoadingSpinner
                    text={
                      networkMode === 'lab'
                        ? 'Adding to mempool...'
                        : 'Broadcasting...'
                    }
                  />
                </div>
              ) : (
                <Button
                  className="flex-1"
                  onClick={handleConfirmSend}
                >
                  Confirm and Send
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Send Bitcoin</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5" />
            Send Transaction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmitBuild()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="recipient-address">Recipient Address</Label>
              <Input
                id="recipient-address"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="bc1q..."
                disabled={isPending}
              />
              {recipient && !addressValid && (
                <p className="text-xs text-destructive">
                  Invalid address for {networkMode}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="send-amount">
                  Amount ({amountUnit === 'btc' ? 'BTC' : 'sats'})
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setAmountUnit(amountUnit === 'btc' ? 'sats' : 'btc')
                  }
                  className="h-auto py-0 text-xs"
                >
                  Switch to {amountUnit === 'btc' ? 'sats' : 'BTC'}
                </Button>
              </div>
              <Input
                id="send-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={amountUnit === 'btc' ? '0.00000000' : '0'}
                step={amountUnit === 'btc' ? '0.00000001' : '1'}
                min="0"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Available: {formatBTC(confirmedBalance)} BTC (
                {formatSats(confirmedBalance)} sats)
              </p>
              {isLabWithNoBalance && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No balance. Mine blocks or make a transaction to your wallet in
                  the lab.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Fee Rate (sat/vB)</Label>
              <p className="text-xs text-muted-foreground">
                Static presets for now. Dynamic fee estimation will be added
                later.
              </p>
              <div className="flex gap-2">
                {FEE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant={
                      !useCustomFee && feeRate === preset.rate
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setFeeRate(preset.rate)
                      setUseCustomFee(false)
                    }}
                  >
                    {preset.label} ({preset.rate})
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={useCustomFee ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setUseCustomFee(true)}
                >
                  Custom
                </Button>
              </div>
              {useCustomFee && (
                <Input
                  type="number"
                  value={customFeeRate}
                  onChange={(e) => setCustomFeeRate(e.target.value)}
                  placeholder="Custom fee rate"
                  min="1"
                  disabled={isPending}
                />
              )}
            </div>

            {buildMutation.isPending ? (
              <LoadingSpinner text="Building transaction..." />
            ) : (
              <Button
                type="submit"
                className="w-full"
                disabled={!canBuild}
              >
                Review Transaction
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
