import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
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
import {
  useSendStore,
  type OnchainDustWarning,
  type SendAmountUnit,
} from '@/stores/sendStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import {
  isValidAddress,
  formatBTC,
  formatSats,
  truncateAddress,
} from '@/lib/bitcoin-utils'
import { errorMessage } from '@/lib/utils'
import {
  formatAmountInputFromSats,
  UX_DUST_FLOOR_SATS,
} from '@/lib/bitcoin-dust'
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
import { DustChangeChoiceModal } from '@/components/wallet/send/DustChangeChoiceModal'
import {
  labBitcoinAddressesEqual,
  lookupLabAddressOwner,
  resolveDeadLabEntityRecipient,
} from '@/lib/lab-utils'
import { getLabWorker, initLabWorkerWithState } from '@/workers/lab-factory'
import { runLabOp } from '@/lib/lab-coordinator'
import {
  useBuildTransactionMutation,
  useBroadcastTransactionMutation,
  useLabSendMutation,
} from '@/hooks/useSendMutations'
import type { PrepareOnchainSendResult } from '@/workers/crypto-api'
import { useCryptoStore } from '@/stores/cryptoStore'

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

function amountSatsFromForm(amountStr: string, unit: SendAmountUnit): number {
  if (!amountStr) return 0
  return unit === 'btc'
    ? Math.floor(parseFloat(amountStr) * 100_000_000)
    : parseInt(amountStr, 10) || 0
}

/** Shown on the review step below the amount summary so it stays visible when confirming. */
function OnchainDustWarningReviewBanner({
  warning,
  amountUnit,
}: {
  warning: OnchainDustWarning | null
  amountUnit: SendAmountUnit
}) {
  if (warning == null) return null
  return (
    <div className="font-bold text-destructive text-sm space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
      {warning.raisedToMin546 ? (
        <p>
          Amount was below the minimum spendable output ({formatSats(UX_DUST_FLOOR_SATS)}{' '}
          sats). The amount shown above was set to{' '}
          {amountUnit === 'btc'
            ? `${formatBTC(UX_DUST_FLOOR_SATS)} BTC`
            : `${formatSats(UX_DUST_FLOOR_SATS)} sats`}
          .
        </p>
      ) : null}
      {warning.bumpedChangeFree ? (
        <p>
          The amount was increased so this payment does not leave change below the dust limit
          (change-free transfer).
        </p>
      ) : null}
    </div>
  )
}

export function SendFlow() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const balance = useWalletStore((s) => s.balance)
  const activeWalletId = useWalletStore((s) => s.activeWalletId)
  const currentAddress = useWalletStore((s) => s.currentAddress)
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
  const [dustCase2Modal, setDustCase2Modal] = useState<null | {
    pendingOutcome: PrepareOnchainSendResult
    changeFreeMaxSats: number
  }>(null)
  const [labDustCase2Modal, setLabDustCase2Modal] = useState<null | {
    changeFreeMaxSats: number
    exactAmountSats: number
    originalAmountSats: number
  }>(null)
  const [labApplyChangeFreeBump, setLabApplyChangeFreeBump] = useState(false)
  const [labReviewPending, setLabReviewPending] = useState(false)
  /** Pre-bump payment (e.g. 800). Lab crypto builds from this and applies `applyChangeFreeBump` internally; the store amount is the max for display only. */
  const labChangeFreeBumpBaseAmountSatsRef = useRef<number | null>(null)

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
    onchainDustWarning,
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

  const applyOnchainPrepareOutcomeToSendStore = useCallback(
    (outcome: PrepareOnchainSendResult) => {
      const { amountUnit: unit } = useSendStore.getState()
      if (outcome.raisedToMinDust || outcome.bumpedChangeFree) {
        const lines: string[] = []
        if (outcome.raisedToMinDust) {
          lines.push(
            `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`,
          )
        }
        if (outcome.bumpedChangeFree) {
          lines.push(
            'Change for this transaction would have been below the dust limit; the amount was increased to make the transfer change-free.',
          )
        }
        toast.warning(lines.join(' '))
        useSendStore.setState({
          amount: formatAmountInputFromSats(outcome.finalAmountSats, unit),
          onchainDustWarning: {
            previousSats: outcome.originalAmountSats,
            raisedToMin546: outcome.raisedToMinDust,
            bumpedChangeFree: outcome.bumpedChangeFree,
          },
        })
      }
      useSendStore.getState().setPsbt(outcome.psbtBase64)
      useSendStore.getState().setStep(2)
    },
    [],
  )

  useEffect(() => {
    if (step === 1) setLabApplyChangeFreeBump(false)
  }, [step])

  const amountSats = useMemo(
    () => amountSatsFromForm(amount, amountUnit),
    [amount, amountUnit],
  )

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

  const handleSubmitBuild = useCallback(async () => {
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
      labChangeFreeBumpBaseAmountSatsRef.current = null
      let draftAmountSats = amountSats
      if (
        confirmedBalance >= UX_DUST_FLOOR_SATS &&
        isValidSendAmountSats(amountSats) &&
        amountSats > 0 &&
        amountSats < UX_DUST_FLOOR_SATS
      ) {
        draftAmountSats = UX_DUST_FLOOR_SATS
        const prev = amountSats
        toast.warning(
          `Amount was below the minimum output size (${UX_DUST_FLOOR_SATS} sats). It was increased automatically.`,
        )
        useSendStore.setState({
          amount: formatAmountInputFromSats(UX_DUST_FLOOR_SATS, amountUnit),
          onchainDustWarning: {
            previousSats: prev,
            raisedToMin546: true,
            bumpedChangeFree: false,
          },
        })
      }

      if (activeWalletId == null) {
        toast.error('No active wallet')
        return
      }

      setLabReviewPending(true)
      try {
        await runLabOp(async () => {
          await initLabWorkerWithState()
          const labWorker = getLabWorker()
          const walletChangeAddress = await useCryptoStore
            .getState()
            .getLabChangeAddress()

          const knownRecipientOwner =
            currentAddress != null &&
            labBitcoinAddressesEqual(normalizedRecipient, currentAddress)
              ? walletLabOwner(activeWalletId)
              : undefined

          const { utxosJson } = await labWorker.prepareLabWalletTransaction({
            walletId: activeWalletId,
            toAddress: normalizedRecipient,
            amountSats: draftAmountSats,
            feeRateSatPerVb: effectiveFeeRate,
            walletChangeAddress,
            knownRecipientOwner,
          })

          const draft = await useCryptoStore.getState().draftLabPsbtTransaction({
            utxosJson,
            toAddress: normalizedRecipient,
            amountSats: draftAmountSats,
            feeRateSatPerVb: effectiveFeeRate,
            changeAddress: walletChangeAddress,
          })

          if (draft.changeFreeBumpAvailable) {
            labChangeFreeBumpBaseAmountSatsRef.current = draft.finalAmountSats
            setLabDustCase2Modal({
              changeFreeMaxSats: draft.changeFreeMaxSats,
              exactAmountSats: draft.finalAmountSats,
              originalAmountSats: draft.originalAmountSats,
            })
            return
          }

          setLabApplyChangeFreeBump(false)
          labChangeFreeBumpBaseAmountSatsRef.current = null
          setStep(2)
        })
      } catch (err) {
        toast.error(errorMessage(err) || 'Failed to prepare lab transaction')
      } finally {
        setLabReviewPending(false)
      }
      return
    }

    try {
      const outcome = await buildMutation.mutateAsync({
        normalizedRecipient,
        amountSats,
        effectiveFeeRate,
        applyChangeFreeBump: false,
      })
      if (outcome.changeFreeBumpAvailable) {
        setDustCase2Modal({
          pendingOutcome: outcome,
          changeFreeMaxSats: outcome.changeFreeMaxSats,
        })
        return
      }
      applyOnchainPrepareOutcomeToSendStore(outcome)
    } catch {
      /* mutation toasts */
    }
  }, [
    canBuild,
    isLightningSendMode,
    normalizedRecipient,
    selectedLightningWallet,
    networkMode,
    lightningPayMutation,
    buildMutation,
    amountSats,
    effectiveFeeRate,
    handleLightningAddressPay,
    decodedBolt11,
    confirmedBalance,
    amountUnit,
    applyOnchainPrepareOutcomeToSendStore,
    activeWalletId,
    currentAddress,
    setStep,
  ])

  const handleConfirmSend = useCallback(() => {
    if (networkMode === 'lab') {
      if (deadLabRecipientInfo != null) {
        setDeadLabRecipientModalOpen(true)
        return
      }
      const { amount: amountFromStore, amountUnit: unitFromStore } =
        useSendStore.getState()
      const parsedFromStore = amountSatsFromForm(amountFromStore, unitFromStore)
      const amountForLab =
        labApplyChangeFreeBump && labChangeFreeBumpBaseAmountSatsRef.current != null
          ? labChangeFreeBumpBaseAmountSatsRef.current
          : parsedFromStore
      labSendMutation.mutate({
        normalizedRecipient,
        amountSats: amountForLab,
        effectiveFeeRate,
        applyChangeFreeBump: labApplyChangeFreeBump,
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
    labApplyChangeFreeBump,
  ])

  const handleConfirmDeadLabRecipientSend = useCallback(() => {
    setDeadLabRecipientModalOpen(false)
    const { amount: amountFromStore, amountUnit: unitFromStore } =
      useSendStore.getState()
    const parsedFromStore = amountSatsFromForm(amountFromStore, unitFromStore)
    const amountForLab =
      labApplyChangeFreeBump && labChangeFreeBumpBaseAmountSatsRef.current != null
        ? labChangeFreeBumpBaseAmountSatsRef.current
        : parsedFromStore
    labSendMutation.mutate({
      normalizedRecipient,
      amountSats: amountForLab,
      effectiveFeeRate,
      applyChangeFreeBump: labApplyChangeFreeBump,
    })
  }, [
    labSendMutation,
    normalizedRecipient,
    effectiveFeeRate,
    labApplyChangeFreeBump,
  ])

  const isPending =
    buildMutation.isPending ||
    labReviewPending ||
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
            addressType={deadLabRecipientInfo.addressType}
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
              {!isLightningSendMode && (
                <OnchainDustWarningReviewBanner
                  warning={onchainDustWarning}
                  amountUnit={amountUnit}
                />
              )}
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
                  onChange={(e) => setAmount(e.target.value, { fromUser: true })}
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

            {buildMutation.isPending ||
            (networkMode === 'lab' && labReviewPending) ? (
              <LoadingSpinner
                text={
                  networkMode === 'lab'
                    ? 'Preparing transaction...'
                    : 'Building transaction...'
                }
              />
            ) : (
              <Button type="submit" className="w-full" disabled={!canBuild}>
                {submitLabel}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <DustChangeChoiceModal
        open={dustCase2Modal != null}
        onOpenChange={(o) => {
          if (!o) setDustCase2Modal(null)
        }}
        exactAmountSats={dustCase2Modal?.pendingOutcome.finalAmountSats ?? 0}
        changeFreeMaxSats={dustCase2Modal?.changeFreeMaxSats ?? 0}
        onKeepExact={() => {
          if (!dustCase2Modal) return
          const pending = dustCase2Modal.pendingOutcome
          setDustCase2Modal(null)
          applyOnchainPrepareOutcomeToSendStore(pending)
        }}
        onIncreaseToChangeFree={async () => {
          if (!dustCase2Modal) return
          try {
            const outcome = await buildMutation.mutateAsync({
              normalizedRecipient,
              amountSats,
              effectiveFeeRate,
              applyChangeFreeBump: true,
            })
            setDustCase2Modal(null)
            applyOnchainPrepareOutcomeToSendStore(outcome)
          } catch {
            /* mutation onError */
          }
        }}
        isPending={buildMutation.isPending}
      />
      <DustChangeChoiceModal
        open={labDustCase2Modal != null}
        onOpenChange={(o) => {
          if (!o) {
            setLabDustCase2Modal(null)
            labChangeFreeBumpBaseAmountSatsRef.current = null
          }
        }}
        exactAmountSats={labDustCase2Modal?.exactAmountSats ?? 0}
        changeFreeMaxSats={labDustCase2Modal?.changeFreeMaxSats ?? 0}
        onKeepExact={() => {
          setLabDustCase2Modal(null)
          setLabApplyChangeFreeBump(false)
          labChangeFreeBumpBaseAmountSatsRef.current = null
          setStep(2)
        }}
        onIncreaseToChangeFree={() => {
          if (!labDustCase2Modal) return
          useSendStore.setState({
            amount: formatAmountInputFromSats(
              labDustCase2Modal.changeFreeMaxSats,
              amountUnit,
            ),
            onchainDustWarning: {
              previousSats: labDustCase2Modal.originalAmountSats,
              raisedToMin546: false,
              bumpedChangeFree: true,
            },
          })
          setLabApplyChangeFreeBump(true)
          setLabDustCase2Modal(null)
          setStep(2)
        }}
        isPending={false}
      />
    </div>
  )
}
