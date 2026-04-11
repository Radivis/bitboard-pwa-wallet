import { useMemo, useCallback, useState, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { ArrowUpRight, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { LightningAddress } from '@getalby/lightning-tools'
import { PageHeader } from '@/components/PageHeader'
import { SendLightningWalletPicker } from '@/components/wallet/send/SendLightningWalletPicker'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import { isValidSendAmountSats } from '@/components/wallet/send/send-amount'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { WalletUnlockOrNearZeroLoading } from '@/components/WalletUnlockOrNearZeroLoading'
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
} from '@/lib/lightning-utils'
import { useLightningStore } from '@/stores/lightningStore'
import { useLightningPayMutation } from '@/hooks/useLightningMutations'
import { useSendLightningBalances } from '@/hooks/useSendLightningBalances'
import { MAX_BOLT11_PAYMENT_REQUEST_LENGTH } from '@/lib/lightning-input-limits'
import { labOwnersEqual, walletLabOwner } from '@/lib/lab-owner'
import { DeadLabEntityRecipientModal } from '@/components/lab/DeadLabEntityRecipientModal'
import { lookupLabAddressOwner, resolveDeadLabEntityRecipient } from '@/lib/lab-utils'
import {
  useBuildTransactionMutation,
  useBroadcastTransactionMutation,
  useLabSendMutation,
} from '@/hooks/useSendMutations'

export const Route = createFileRoute('/wallet/send')({
  component: SendPage,
})

export function SendPage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const walletStatus = useWalletStore((s) => s.walletStatus)

  if (!activeWalletId) {
    navigate({ to: '/setup' })
    return null
  }

  if (walletStatus !== 'unlocked' && walletStatus !== 'syncing') {
    return <WalletUnlockOrNearZeroLoading />
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

  const hasAnyLightningConnection = useLightningStore((s) =>
    activeWalletId != null
      ? s.getConnectionsForWallet(activeWalletId).length > 0
      : false,
  )

  const [isResolvingLightningAddress, setIsResolvingLightningAddress] =
    useState(false)
  const [deadLabRecipientModalOpen, setDeadLabRecipientModalOpen] = useState(false)

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
  const labEntities = labState?.entities ?? []
  const labChainReady =
    networkMode === 'lab' && labState != null && !labChainPending

  const buildMutation = useBuildTransactionMutation()
  const broadcastMutation = useBroadcastTransactionMutation()
  const labSendMutation = useLabSendMutation()

  const labBalanceSats =
    networkMode === 'lab' && activeWalletId != null && labChainReady
      ? utxos
          .filter((u) => {
            const o = lookupLabAddressOwner(u.address, addressToOwner)
            return o != null && labOwnersEqual(o, walletLabOwner(activeWalletId))
          })
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

  const deadLabRecipientInfo = useMemo(() => {
    if (networkMode !== 'lab' || !labChainReady) return null
    return resolveDeadLabEntityRecipient(
      normalizedRecipient,
      addressToOwner,
      labEntities,
    )
  }, [networkMode, labChainReady, normalizedRecipient, addressToOwner, labEntities])

  useEffect(() => {
    setDeadLabRecipientModalOpen(false)
  }, [networkMode, normalizedRecipient])

  useEffect(() => {
    if (step !== 2) setDeadLabRecipientModalOpen(false)
  }, [step])

  const isLightningDestination = useMemo(
    () => lightningAvailable && isValidLightningDestination(normalizedRecipient),
    [lightningAvailable, normalizedRecipient],
  )

  const isLightningSendMode = isLightningDestination

  const {
    matchingLightningConnections,
    selectedLightningConnectionId,
    setSelectedLightningConnectionId,
    balanceQueries,
    selectedLightningWallet,
    selectedLnBalanceQuery,
    selectedLnBalanceSats,
    hasLightningWalletSelected,
  } = useSendLightningBalances({
    lightningEnabled,
    networkMode,
    activeWalletId,
    connectedLightningWallets,
    isLightningSendMode,
  })

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

  const lightningPayloadLengthOk =
    !isLightningSendMode ||
    normalizedRecipient.length <= MAX_BOLT11_PAYMENT_REQUEST_LENGTH

  const lightningAmountInputOk =
    !needsUserLightningAmount || isValidSendAmountSats(amountSats)

  const lightningBalanceOk =
    hasLightningWalletSelected &&
    selectedLnBalanceQuery?.isSuccess === true &&
    selectedLnBalanceSats !== undefined &&
    lightningPayAmountSats <= selectedLnBalanceSats

  const canBuildLightning =
    recipientFormatValid &&
    lightningRecipientOk &&
    lightningPayloadLengthOk &&
    matchingLightningConnections.length > 0 &&
    hasLightningWalletSelected &&
    !bolt11NetworkMismatch &&
    bolt11DecodeOk &&
    lightningAmountInputOk &&
    lightningPayAmountSats >= 1 &&
    lightningBalanceOk &&
    (isLightningAddress(normalizedRecipient)
      ? isValidSendAmountSats(amountSats)
      : true)

  const isLabWithNoBalance =
    networkMode === 'lab' && (labBalanceSats === 0 || labBalanceSats === null)

  const canBuildOnChain =
    !isLightningSendMode &&
    normalizedRecipient.length > 0 &&
    isValidAddress(normalizedRecipient, networkMode) &&
    isValidSendAmountSats(amountSats) &&
    amountSats <= confirmedBalance &&
    !isLabWithNoBalance

  const canBuild = isLightningSendMode ? canBuildLightning : canBuildOnChain

  const handleLightningAddressPay = useCallback(async () => {
    if (!selectedLightningWallet || !isValidSendAmountSats(amountSats)) return
    setIsResolvingLightningAddress(true)
    try {
      const recipientLightningAddress = new LightningAddress(normalizedRecipient)
      await recipientLightningAddress.fetch()
      const lud16Invoice = await recipientLightningAddress.requestInvoice({
        satoshi: amountSats,
      })
      const bolt11PaymentRequest = lud16Invoice.paymentRequest
      const invoiceNetworkMode = bolt11NetworkModeFromPrefix(bolt11PaymentRequest)
      if (invoiceNetworkMode !== networkMode) {
        toast.error(
          'This invoice is for a different network. Switch network in Settings.',
        )
        return
      }
      lightningPayMutation.mutate({
        bolt11: bolt11PaymentRequest,
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
        isValidSendAmountSats(amountSats)
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
      if (deadLabRecipientInfo != null) {
        setDeadLabRecipientModalOpen(true)
        return
      }
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
    deadLabRecipientInfo,
    normalizedRecipient,
    amountSats,
    effectiveFeeRate,
    labSendMutation,
    broadcastMutation,
  ])

  const handleConfirmDeadLabRecipientSend = useCallback(() => {
    setDeadLabRecipientModalOpen(false)
    labSendMutation.mutate({
      normalizedRecipient,
      amountSats,
      effectiveFeeRate,
    })
  }, [labSendMutation, normalizedRecipient, amountSats, effectiveFeeRate])

  const isPending =
    buildMutation.isPending ||
    broadcastMutation.isPending ||
    labSendMutation.isPending ||
    lightningPayMutation.isPending ||
    isResolvingLightningAddress

  const labConfirmSendDisabled =
    isPending || (networkMode === 'lab' && deadLabRecipientModalOpen)

  if (step === 2 && (psbt || networkMode === 'lab')) {
    return (
      <div className="space-y-6">
        {networkMode === 'lab' && deadLabRecipientInfo != null ? (
          <DeadLabEntityRecipientModal
            open={deadLabRecipientModalOpen}
            onOpenChange={(open) => {
              if (!open) setDeadLabRecipientModalOpen(false)
            }}
            onCancel={() => setDeadLabRecipientModalOpen(false)}
            entityDisplayName={deadLabRecipientInfo.displayName}
            onConfirm={handleConfirmDeadLabRecipientSend}
            isPending={labSendMutation.isPending}
          />
        ) : null}

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
                  disabled={labConfirmSendDisabled}
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
              {isLightningSendMode && !lightningPayloadLengthOk && (
                <p className="text-xs text-destructive">
                  Payment request is too long (
                  {MAX_BOLT11_PAYMENT_REQUEST_LENGTH} characters max).
                </p>
              )}
            </div>

            {isLightningSendMode && (
              <SendLightningWalletPicker
                connectedLightningWallets={matchingLightningConnections}
                balanceQueries={balanceQueries}
                selectedConnectionId={selectedLightningConnectionId}
                onSelectConnection={setSelectedLightningConnectionId}
                disabled={isPending}
              />
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
              <SendOnChainFeeSection
                feeRate={feeRate}
                customFeeRate={customFeeRate}
                useCustomFee={useCustomFee}
                isPending={isPending}
                setFeeRate={setFeeRate}
                setCustomFeeRate={setCustomFeeRate}
                setUseCustomFee={setUseCustomFee}
              />
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
