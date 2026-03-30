import { useMemo, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WalletUnlock } from '@/components/WalletUnlock'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useWalletStore } from '@/stores/walletStore'
import { useSendStore } from '@/stores/sendStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import {
  isValidAddress,
  formatBTC,
  formatSats,
  truncateAddress,
} from '@/lib/bitcoin-utils'
import {
  isLightningSupported,
  isValidLightningDestination,
  isValidBolt11Invoice,
  isLightningAddress,
  normalizeLightningDestination,
} from '@/lib/lightning-utils'
import { useLightningStore } from '@/stores/lightningStore'
import { useLightningPayMutation } from '@/hooks/useLightningMutations'
import { walletOwnerKey } from '@/lib/lab-utils'
import {
  useBuildTransactionMutation,
  useBroadcastTransactionMutation,
  useLabSendMutation,
} from '@/hooks/useSendMutations'

export const Route = createFileRoute('/wallet/send')({
  component: SendPage,
})

const FEE_PRESETS = [
  { label: 'Low', rate: 1 },
  { label: 'Medium', rate: 3 },
  { label: 'High', rate: 5 },
] as const

const FEE_PRESET_INFOMODE: Record<
  (typeof FEE_PRESETS)[number]['label'],
  { infoTitle: string; infoText: string }
> = {
  Low: {
    infoTitle: 'Low fee',
    infoText:
      'Best when the mempool is calm or you do not care if confirmation takes longer. You pay less total fee, but in a busy period your transaction might sit unconfirmed longer than with Medium or High.',
  },
  Medium: {
    infoTitle: 'Medium fee',
    infoText:
      'A reasonable default when you want a normal confirmation time without overpaying. Pick this for typical transfers if you are unsure—then switch to High if blocks are full and you are in a hurry, or Low if you are happy to wait.',
  },
  High: {
    infoTitle: 'High fee',
    infoText:
      'Use when you want priority during congestion—paying more per vB makes it more attractive for miners to include your transaction in the next blocks. Good for time-sensitive payments; you spend more in fees than with Low or Medium.',
  },
}

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
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const lightningAvailable = lightningEnabled && isLightningSupported(networkMode)
  const activeConnection = useLightningStore((s) =>
    activeWalletId != null ? s.getActiveConnection(activeWalletId) : null,
  )
  const lightningPayMutation = useLightningPayMutation()

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
    () => normalizeLightningDestination(recipient.trim().replace(/^bitcoin:/i, '')),
    [recipient],
  )

  const isLightningDestination = useMemo(
    () => lightningAvailable && isValidLightningDestination(normalizedRecipient),
    [lightningAvailable, normalizedRecipient],
  )

  const addressValid = useMemo(
    () =>
      normalizedRecipient.length > 0 &&
      (isValidAddress(normalizedRecipient, networkMode) || isLightningDestination),
    [normalizedRecipient, networkMode, isLightningDestination],
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

    if (isLightningDestination) {
      if (isLightningAddress(normalizedRecipient)) {
        toast.info(
          'Lightning Address payments are not yet supported — paste a BOLT11 invoice instead.',
        )
        return
      }

      if (!activeConnection) {
        toast.error('Connect a Lightning wallet first (Settings → Management).')
        return
      }

      if (!isValidBolt11Invoice(normalizedRecipient)) return

      lightningPayMutation.mutate({
        bolt11: normalizedRecipient,
        config: activeConnection.config,
      })
      return
    }

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
    isLightningDestination,
    normalizedRecipient,
    activeConnection,
    networkMode,
    setStep,
    lightningPayMutation,
    buildMutation,
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
    labSendMutation.isPending ||
    lightningPayMutation.isPending

  if (step === 2 && (psbt || networkMode === 'lab')) {
    return (
      <div className="space-y-6">
        <PageHeader title="Review Transaction" icon={ArrowUpRight} />

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
      <PageHeader title="Send Bitcoin" icon={ArrowUpRight} />

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
                placeholder={lightningAvailable ? 'bc1q... or Lightning address' : 'bc1q...'}
                disabled={isPending}
              />
              {recipient && !addressValid && (
                <p className="text-xs text-destructive">
                  Invalid {lightningAvailable ? 'address or Lightning destination' : 'address'} for {networkMode}
                </p>
              )}
              {isLightningDestination && !activeConnection && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No Lightning wallet connected.{' '}
                  <a href="/wallet/management" className="underline">
                    Connect one
                  </a>{' '}
                  to send Lightning payments.
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
              <Label>
                <InfomodeWrapper
                  as="span"
                  infoId="send-fee-rate-label"
                  infoTitle="Fee rate (sat/vB)"
                  infoText="Miners prioritize transactions that pay more per byte of block space. The number is satoshis per virtual byte (sat/vB). Bitboard currently offers simple fixed presets (not live mempool data—smarter estimation may come later). In general: use Low when you are not in a rush, Medium for everyday sends, High when the network is busy or you need faster confirmation, and Custom only when you already have a target rate from an explorer or another trusted source."
                >
                  Fee Rate (sat/vB)
                </InfomodeWrapper>
              </Label>
              <p className="text-xs text-muted-foreground">
                Static presets for now. Dynamic fee estimation will be added
                later.
              </p>
              <div className="flex gap-2">
                {FEE_PRESETS.map((preset) => {
                  const { infoTitle, infoText } = FEE_PRESET_INFOMODE[preset.label]
                  return (
                    <InfomodeWrapper
                      key={preset.label}
                      infoId={`send-fee-preset-${preset.label.toLowerCase()}`}
                      infoTitle={infoTitle}
                      infoText={infoText}
                      className="min-w-0 flex-1"
                    >
                      <Button
                        type="button"
                        variant={
                          !useCustomFee && feeRate === preset.rate
                            ? 'default'
                            : 'outline'
                        }
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setFeeRate(preset.rate)
                          setUseCustomFee(false)
                        }}
                      >
                        {preset.label} ({preset.rate})
                      </Button>
                    </InfomodeWrapper>
                  )
                })}
                <InfomodeWrapper
                  infoId="send-fee-custom-button"
                  infoTitle="Custom fee"
                  infoText="Switch here when you already know the exact sat/vB you want—for example from a mempool dashboard, a node, or advice that matches current network conditions. After selecting Custom, type that number in the field below; use it if presets feel too coarse or you are following a specific recommendation."
                  className="min-w-0 flex-1"
                >
                  <Button
                    type="button"
                    variant={useCustomFee ? 'default' : 'outline'}
                    size="sm"
                    className="w-full"
                    onClick={() => setUseCustomFee(true)}
                  >
                    Custom
                  </Button>
                </InfomodeWrapper>
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
