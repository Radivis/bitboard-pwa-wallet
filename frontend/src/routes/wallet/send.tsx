import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { LightningAddress } from '@getalby/lightning-tools'
import { isValidSendAmountSats } from '@/components/wallet/send/send-amount'
import { WalletUnlockOrNearZeroLoading } from '@/components/WalletUnlockOrNearZeroLoading'
import { amountSatsFromForm } from '@/components/wallet/send/amount-sats-from-form'
import { SendTransactionEntryCard } from '@/components/wallet/send/SendTransactionEntryCard'
import { SendTransactionReviewStep } from '@/components/wallet/send/SendTransactionReviewStep'
import { useWalletStore } from '@/stores/walletStore'
import { useSendStore } from '@/stores/sendStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { isValidAddress, msatsAmountNumberFromSatsExact, MAX_SATS_MSAT_AMOUNT_NUMBER } from '@/lib/bitcoin-utils'
import {
  preferredRecipientFromBitcoinUri,
  recipientAndAmountFromScannedPayload,
  tryParseBitcoinUri,
} from '@/lib/bip21'
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
  const utxos = useMemo(() => labState?.utxos ?? [], [labState?.utxos])
  const addressToOwner = useMemo(
    () => labState?.addressToOwner ?? {},
    [labState?.addressToOwner],
  )
  const labEntities = useMemo(() => labState?.entities ?? [], [labState?.entities])
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
            raisedToDustMin: outcome.raisedToMinDust,
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

  const normalizedRecipient = useMemo(() => {
    const t = recipient.trim()
    const bip21 = tryParseBitcoinUri(t)
    if (bip21 != null) {
      return normalizeLightningDestination(preferredRecipientFromBitcoinUri(bip21))
    }
    const core = t.replace(/^bitcoin:/i, '')
    return normalizeLightningDestination(core)
  }, [recipient])

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

  /** Amountless bolt11 pays pass msats (= sats * 1000); require exact IEEE-safe products (see `msatsAmountNumberFromSatsExact`). */
  const lightningAmountlessBolt11PayMsatsExactOk = useMemo(() => {
    if (!needsUserLightningAmount) return true
    if (!isValidBolt11Invoice(normalizedRecipient)) return true
    if (decodedBolt11 == null || decodedBolt11.satoshi !== 0) return true
    return (
      Number.isInteger(amountSats) && amountSats <= MAX_SATS_MSAT_AMOUNT_NUMBER
    )
  }, [
    needsUserLightningAmount,
    normalizedRecipient,
    decodedBolt11,
    amountSats,
  ])

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
    lightningAmountlessBolt11PayMsatsExactOk &&
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
        isValidSendAmountSats(amountSats) &&
        amountSats <= MAX_SATS_MSAT_AMOUNT_NUMBER
          ? msatsAmountNumberFromSatsExact(amountSats)
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
            raisedToDustMin: true,
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

  const applyScannedPayload = useCallback(
    (raw: string) => {
      const { recipient: nextRecipient, amountStr } =
        recipientAndAmountFromScannedPayload(raw, amountUnit)
      setRecipient(nextRecipient)
      if (amountStr !== undefined) {
        setAmount(amountStr, { fromUser: true })
      }
    },
    [amountUnit, setRecipient, setAmount],
  )

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
      <SendTransactionReviewStep
        networkMode={networkMode}
        recipient={recipient}
        amountSats={amountSats}
        effectiveFeeRate={effectiveFeeRate}
        onchainDustWarning={onchainDustWarning}
        amountUnit={amountUnit}
        isLightningSendMode={isLightningSendMode}
        isPending={isPending}
        deadLabRecipientInfo={deadLabRecipientInfo}
        deadLabRecipientModalOpen={deadLabRecipientModalOpen}
        onDeadLabRecipientModalOpenChange={(open) => {
          if (!open) setDeadLabRecipientModalOpen(false)
        }}
        onDeadLabRecipientCancel={() => setDeadLabRecipientModalOpen(false)}
        onConfirmDeadLabRecipientSend={handleConfirmDeadLabRecipientSend}
        labSendPendingForDeadLabModal={labSendMutation.isPending}
        onBack={() => setStep(1)}
        onConfirmSend={handleConfirmSend}
        labConfirmSendDisabled={labConfirmSendDisabled}
      />
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
      <SendTransactionEntryCard
        pageTitle={pageTitle}
        cardTitle={cardTitle}
        submitLabel={submitLabel}
        isLightningSendMode={isLightningSendMode}
        networkMode={networkMode}
        recipient={recipient}
        onRecipientChange={setRecipient}
        recipientFormatValid={recipientFormatValid}
        lightningAvailable={lightningAvailable}
        hasAnyLightningConnection={hasAnyLightningConnection}
        lightningRecipientOk={lightningRecipientOk}
        normalizedRecipient={normalizedRecipient}
        bolt11NetworkMismatch={bolt11NetworkMismatch}
        bolt11DecodeOk={bolt11DecodeOk}
        matchingLightningConnections={matchingLightningConnections}
        balanceQueries={balanceQueries}
        selectedLightningConnectionId={selectedLightningConnectionId}
        onSelectLightningConnection={setSelectedLightningConnectionId}
        decodedBolt11={decodedBolt11}
        needsUserLightningAmount={needsUserLightningAmount}
        amountUnit={amountUnit}
        onAmountUnitChange={setAmountUnit}
        amount={amount}
        onAmountChange={setAmount}
        lightningPayAmountSats={lightningPayAmountSats}
        selectedLnBalanceQuery={selectedLnBalanceQuery}
        selectedLnBalanceSats={selectedLnBalanceSats}
        confirmedBalance={confirmedBalance}
        isLabWithNoBalance={isLabWithNoBalance}
        feeRate={feeRate}
        customFeeRate={customFeeRate}
        useCustomFee={useCustomFee}
        onFeeRateChange={setFeeRate}
        onCustomFeeRateChange={setCustomFeeRate}
        onUseCustomFeeChange={setUseCustomFee}
        isPending={isPending}
        buildOrLabPreparing={
          buildMutation.isPending || (networkMode === 'lab' && labReviewPending)
        }
        canBuild={canBuild}
        onSubmitBuild={handleSubmitBuild}
        onApplyScannedPayload={applyScannedPayload}
      />

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
              raisedToDustMin: false,
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
