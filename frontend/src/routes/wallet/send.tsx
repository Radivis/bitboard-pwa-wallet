import { useMemo, useCallback, useState, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import { ArrowUpRight, ArrowLeft, Loader2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { LightningAddress } from '@getalby/lightning-tools'
import { PageHeader } from '@/components/PageHeader'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WalletUnlock } from '@/components/WalletUnlock'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NETWORK_LABELS, useWalletStore } from '@/stores/walletStore'
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
  bolt11NetworkModeFromPrefix,
  tryDecodeBolt11Invoice,
  type LightningNetworkMode,
} from '@/lib/lightning-utils'
import { createBackendService } from '@/lib/lightning-backend-service'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'
import { useLightningStore } from '@/stores/lightningStore'
import { useLightningPayMutation } from '@/hooks/useLightningMutations'
import { walletOwnerKey } from '@/lib/lab-utils'
import {
  useBuildTransactionMutation,
  useBroadcastTransactionMutation,
  useLabSendMutation,
} from '@/hooks/useSendMutations'
import { cn } from '@/lib/utils'

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
      'A reasonable default when you want a normal confirmation time without overpaying. Pick this for typical transfers if you are unsure—then switch to High if blocks are full or you are in a hurry, or Low if you are happy to wait.',
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

export function SendFlow() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const balance = useWalletStore((s) => s.balance)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const lightningEnabled = useFeatureStore((s) => s.lightningEnabled)
  const lightningAvailable = lightningEnabled && isLightningSupported(networkMode)
  const connectedLightningWallets = useLightningStore((s) => s.connectedWallets)

  const matchingLightningConnections = useMemo((): ConnectedLightningWallet[] => {
    if (
      !lightningEnabled ||
      !isLightningSupported(networkMode) ||
      activeWalletId == null
    ) {
      return []
    }
    const lnMode = networkMode as LightningNetworkMode
    return connectedLightningWallets.filter(
      (w) => w.walletId === activeWalletId && w.networkMode === lnMode,
    )
  }, [lightningEnabled, networkMode, activeWalletId, connectedLightningWallets])

  const hasAnyLightningConnection = useLightningStore((s) =>
    activeWalletId != null
      ? s.getConnectionsForWallet(activeWalletId).length > 0
      : false,
  )

  const [selectedLightningConnectionId, setSelectedLightningConnectionId] =
    useState<string | null>(null)
  const [isResolvingLightningAddress, setIsResolvingLightningAddress] =
    useState(false)

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
    () =>
      normalizeLightningDestination(
        recipient.trim().replace(/^bitcoin:/i, ''),
      ),
    [recipient],
  )

  const isLightningDestination = useMemo(
    () => lightningAvailable && isValidLightningDestination(normalizedRecipient),
    [lightningAvailable, normalizedRecipient],
  )

  const isLightningSendMode = isLightningDestination

  const decodedBolt11 = useMemo(() => {
    if (!isValidBolt11Invoice(normalizedRecipient)) return null
    return tryDecodeBolt11Invoice(normalizedRecipient)
  }, [normalizedRecipient])

  const bolt11NetworkMismatch = useMemo(() => {
    if (!isValidBolt11Invoice(normalizedRecipient)) return false
    const invNetwork = bolt11NetworkModeFromPrefix(normalizedRecipient)
    if (invNetwork == null) return false
    return invNetwork !== networkMode
  }, [normalizedRecipient, networkMode])

  const needsUserLightningAmount = useMemo(() => {
    if (!isLightningSendMode) return false
    if (isLightningAddress(normalizedRecipient)) return true
    if (!isValidBolt11Invoice(normalizedRecipient)) return false
    return decodedBolt11 == null || decodedBolt11.satoshi === 0
  }, [isLightningSendMode, normalizedRecipient, decodedBolt11])

  const lightningPayAmountSats = useMemo(() => {
    if (!isLightningSendMode) return 0
    if (isValidBolt11Invoice(normalizedRecipient)) {
      if (decodedBolt11 != null && decodedBolt11.satoshi > 0) {
        return decodedBolt11.satoshi
      }
      return amountSats
    }
    return amountSats
  }, [isLightningSendMode, normalizedRecipient, decodedBolt11, amountSats])

  const bolt11DecodeOk = useMemo(() => {
    if (!isValidBolt11Invoice(normalizedRecipient)) return true
    return decodedBolt11 != null
  }, [normalizedRecipient, decodedBolt11])

  const recipientFormatValid = useMemo(
    () =>
      normalizedRecipient.length > 0 &&
      (isValidAddress(normalizedRecipient, networkMode) ||
        (lightningAvailable &&
          isValidLightningDestination(normalizedRecipient))),
    [normalizedRecipient, networkMode, lightningAvailable],
  )

  const lightningRecipientOk =
    !isLightningSendMode || matchingLightningConnections.length > 0

  useEffect(() => {
    if (!isLightningSendMode) {
      setSelectedLightningConnectionId(null)
      return
    }
    const ids = matchingLightningConnections.map((c) => c.id)
    if (matchingLightningConnections.length === 1) {
      setSelectedLightningConnectionId(matchingLightningConnections[0].id)
    } else if (matchingLightningConnections.length > 1) {
      setSelectedLightningConnectionId((prev) =>
        prev != null && ids.includes(prev) ? prev : null,
      )
    } else {
      setSelectedLightningConnectionId(null)
    }
  }, [isLightningSendMode, matchingLightningConnections])

  const lnBalanceQueries = useQueries({
    queries: matchingLightningConnections.map((conn) => ({
      queryKey: ['send-page-ln-balance', conn.id],
      queryFn: () => createBackendService(conn.config).getBalance(),
      enabled: isLightningSendMode && matchingLightningConnections.length > 0,
      staleTime: 30_000,
    })),
  })

  const selectedLightningWallet = useMemo(
    () =>
      matchingLightningConnections.find(
        (c) => c.id === selectedLightningConnectionId,
      ) ?? null,
    [matchingLightningConnections, selectedLightningConnectionId],
  )

  const selectedLnBalanceIndex = matchingLightningConnections.findIndex(
    (c) => c.id === selectedLightningConnectionId,
  )
  const selectedLnBalanceQuery =
    selectedLnBalanceIndex >= 0 ? lnBalanceQueries[selectedLnBalanceIndex] : null
  const selectedLnBalanceSats = selectedLnBalanceQuery?.data?.balanceSats

  const hasLightningWalletSelected =
    selectedLightningConnectionId != null && selectedLightningWallet != null

  const lightningAmountInputOk =
    !needsUserLightningAmount || isValidAmountSats(amountSats)

  const lightningBalanceOk =
    hasLightningWalletSelected &&
    selectedLnBalanceQuery?.isSuccess === true &&
    selectedLnBalanceSats !== undefined &&
    lightningPayAmountSats <= selectedLnBalanceSats

  const canBuildLightning =
    recipientFormatValid &&
    lightningRecipientOk &&
    matchingLightningConnections.length > 0 &&
    hasLightningWalletSelected &&
    !bolt11NetworkMismatch &&
    bolt11DecodeOk &&
    lightningAmountInputOk &&
    lightningPayAmountSats >= 1 &&
    lightningBalanceOk &&
    (isLightningAddress(normalizedRecipient)
      ? isValidAmountSats(amountSats)
      : true)

  const isLabWithNoBalance =
    networkMode === 'lab' && (labBalanceSats === 0 || labBalanceSats === null)

  const canBuildOnChain =
    !isLightningSendMode &&
    normalizedRecipient.length > 0 &&
    isValidAddress(normalizedRecipient, networkMode) &&
    isValidAmountSats(amountSats) &&
    amountSats <= confirmedBalance &&
    !isLabWithNoBalance

  const canBuild = isLightningSendMode ? canBuildLightning : canBuildOnChain

  const handleLightningAddressPay = useCallback(async () => {
    if (!selectedLightningWallet || !isValidAmountSats(amountSats)) return
    setIsResolvingLightningAddress(true)
    try {
      const la = new LightningAddress(normalizedRecipient)
      await la.fetch()
      const inv = await la.requestInvoice({ satoshi: amountSats })
      const pr = inv.paymentRequest
      const invNet = bolt11NetworkModeFromPrefix(pr)
      if (invNet !== networkMode) {
        toast.error(
          'This invoice is for a different network. Switch network in Settings.',
        )
        return
      }
      lightningPayMutation.mutate({
        bolt11: pr,
        config: selectedLightningWallet.config,
      })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not fetch Lightning invoice',
      )
    } finally {
      setIsResolvingLightningAddress(false)
    }
  }, [
    selectedLightningWallet,
    amountSats,
    normalizedRecipient,
    networkMode,
    lightningPayMutation,
  ])

  const handleSubmitBuild = useCallback(() => {
    if (!canBuild) return

    if (isLightningSendMode) {
      if (isLightningAddress(normalizedRecipient)) {
        void handleLightningAddressPay()
        return
      }

      if (!selectedLightningWallet) {
        toast.error('Select a Lightning wallet to pay from.')
        return
      }

      if (!isValidBolt11Invoice(normalizedRecipient)) return

      const amountMsatsForAmountless =
        decodedBolt11 != null &&
        decodedBolt11.satoshi === 0 &&
        isValidAmountSats(amountSats)
          ? amountSats * 1000
          : undefined

      lightningPayMutation.mutate({
        bolt11: normalizedRecipient,
        config: selectedLightningWallet.config,
        ...(amountMsatsForAmountless != null
          ? { amountMsats: amountMsatsForAmountless }
          : {}),
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
    isLightningSendMode,
    normalizedRecipient,
    selectedLightningWallet,
    networkMode,
    setStep,
    lightningPayMutation,
    buildMutation,
    amountSats,
    effectiveFeeRate,
    handleLightningAddressPay,
    decodedBolt11,
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
    lightningPayMutation.isPending ||
    isResolvingLightningAddress

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
                <Button className="flex-1" onClick={handleConfirmSend}>
                  Confirm and Send
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pageTitle = isLightningSendMode ? 'Send Lightning' : 'Send Bitcoin'
  const cardTitle = isLightningSendMode ? 'Pay with Lightning' : 'Send Transaction'
  const submitLabel = isLightningSendMode
    ? 'Pay with Lightning'
    : networkMode === 'lab'
      ? 'Review Transaction'
      : 'Review Transaction'

  return (
    <div className="space-y-6">
      <PageHeader title={pageTitle} icon={ArrowUpRight} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5" />
            {cardTitle}
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
              <Label htmlFor="recipient-address">
                {isLightningSendMode ? 'Invoice or Lightning address' : 'Recipient Address'}
              </Label>
              <Input
                id="recipient-address"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={
                  lightningAvailable
                    ? 'bc1q… or BOLT11 invoice or Lightning address'
                    : 'bc1q…'
                }
                disabled={isPending}
              />
              {recipient && !recipientFormatValid && (
                <p className="text-xs text-destructive">
                  {isLightningSendMode
                    ? 'Invalid Lightning invoice or Lightning address.'
                    : `Invalid address for ${networkMode}`}
                </p>
              )}
              {recipient && isLightningSendMode && !lightningRecipientOk && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {hasAnyLightningConnection ? (
                    <>
                      No Lightning wallet for {NETWORK_LABELS[networkMode]}. Connect
                      one for this network in{' '}
                      <Link to="/wallet/management" className="underline">
                        Management
                      </Link>
                      .
                    </>
                  ) : (
                    <>
                      No Lightning wallet connected. Connect one in{' '}
                      <Link to="/wallet/management" className="underline">
                        Management
                      </Link>
                      .
                    </>
                  )}
                </p>
              )}
              {isLightningSendMode &&
                isValidBolt11Invoice(normalizedRecipient) &&
                bolt11NetworkMismatch && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    This invoice is for a different Bitcoin network than your
                    current mode. Switch network in{' '}
                    <Link to="/settings" className="font-medium underline">
                      Settings
                    </Link>
                    .
                  </p>
                )}
              {isLightningSendMode &&
                isValidBolt11Invoice(normalizedRecipient) &&
                !bolt11DecodeOk && (
                  <p className="text-xs text-destructive">
                    Could not read this BOLT11 invoice. Check the payment request
                    and try again.
                  </p>
                )}
            </div>

            {isLightningSendMode &&
              matchingLightningConnections.length > 0 && (
                <div className="space-y-2">
                  <Label>Pay from Lightning wallet</Label>
                  <p className="text-xs text-muted-foreground">
                    {matchingLightningConnections.length > 1
                      ? 'Select which connected wallet should pay this invoice.'
                      : 'Using your connected Lightning wallet for this network.'}
                  </p>
                  <ul className="space-y-2">
                    {matchingLightningConnections.map((conn, index) => {
                      const q = lnBalanceQueries[index]
                      const isSelected = conn.id === selectedLightningConnectionId
                      return (
                        <li key={conn.id}>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              setSelectedLightningConnectionId(conn.id)
                            }
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left text-sm transition-colors',
                              isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/50',
                            )}
                          >
                            <span className="min-w-0 flex-1 font-medium">
                              {conn.label}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                              {q?.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : q?.isError ? (
                                <span className="text-destructive">—</span>
                              ) : (
                                <>
                                  <Zap className="h-3 w-3" />
                                  {formatSats(q?.data?.balanceSats ?? 0)} sats
                                </>
                              )}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

            {isLightningSendMode &&
              decodedBolt11?.description != null &&
              decodedBolt11.description.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Memo: </span>
                  {decodedBolt11.description}
                </p>
              )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="send-amount">
                  {needsUserLightningAmount
                    ? `Amount (${amountUnit === 'btc' ? 'BTC' : 'sats'})`
                    : isLightningSendMode && !needsUserLightningAmount
                      ? 'Amount (from invoice)'
                      : `Amount (${amountUnit === 'btc' ? 'BTC' : 'sats'})`}
                </Label>
                {(needsUserLightningAmount || !isLightningSendMode) && (
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
                )}
              </div>
              {isLightningSendMode && !needsUserLightningAmount ? (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm tabular-nums">
                  {formatBTC(lightningPayAmountSats)} BTC (
                  {formatSats(lightningPayAmountSats)} sats)
                </p>
              ) : (
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
              )}
              <p className="text-xs text-muted-foreground">
                {isLightningSendMode ? (
                  <>
                    Lightning wallet:{' '}
                    {selectedLnBalanceQuery?.isPending ? (
                      'Loading balance…'
                    ) : selectedLnBalanceQuery?.isSuccess ? (
                      <>
                        {formatBTC(selectedLnBalanceSats ?? 0)} BTC (
                        {formatSats(selectedLnBalanceSats ?? 0)} sats)
                      </>
                    ) : (
                      '—'
                    )}
                  </>
                ) : (
                  <>
                    Available: {formatBTC(confirmedBalance)} BTC (
                    {formatSats(confirmedBalance)} sats)
                  </>
                )}
              </p>
              {isLabWithNoBalance && !isLightningSendMode && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No balance. Mine blocks or make a transaction to your wallet in
                  the lab.
                </p>
              )}
            </div>

            {!isLightningSendMode && (
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
                    const { infoTitle, infoText } =
                      FEE_PRESET_INFOMODE[preset.label]
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
            )}

            {buildMutation.isPending ? (
              <LoadingSpinner text="Building transaction..." />
            ) : (
              <Button type="submit" className="w-full" disabled={!canBuild}>
                {submitLabel}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
