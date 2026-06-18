import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { amountSatsFromForm, amountSatsFromSendForm } from '@/components/wallet/send/amount-sats-from-form'
import { WalletUnlockOrNearZeroLoading } from '@/components/WalletUnlockOrNearZeroLoading'
import { SendTransactionEntryCard } from '@/components/wallet/send/SendTransactionEntryCard'
import { SendTransactionReviewStep } from '@/components/wallet/send/SendTransactionReviewStep'
import { useWalletStore } from '@/stores/walletStore'
import { useSendStore } from '@/stores/sendStore'
import { useFeatureStore } from '@/stores/featureStore'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { recipientAndAmountFromScannedPayload } from '@/lib/wallet/bip21'
import { errorMessage } from '@/lib/shared/utils'
import { formatAmountInputFromSats } from '@/lib/wallet/bitcoin-dust'
import { useLightningStore } from '@/stores/lightningStore'
import { walletLabOwner } from '@/lib/lab/lab-owner'
import {
  labBitcoinAddressesEqual,
  resolveDeadLabEntityRecipient,
  sumLabWalletUtxoSats,
} from '@/lib/lab/lab-utils'
import { getLabWorker, initLabWorkerWithState } from '@/workers/lab-factory'
import { runLabOp } from '@/lib/lab/lab-coordinator'
import {
  useBuildTransactionMutation,
  useBroadcastTransactionMutation,
  useLabSendMutation,
} from '@/hooks/useSendMutations'
import type { PrepareOnchainSendResult, ReviewInputUtxo } from '@/workers/crypto-api'
import { useCryptoStore } from '@/stores/cryptoStore'
import { toBitcoinNetwork } from '@/lib/wallet/bitcoin-utils'
import { reviewUtxoToOutpoint } from '@/lib/wallet/manual-utxo-selection'
import { resolveLabSendAmountSats } from '@/lib/lab/lab-send-submit'
import { useFiatDenominationStore } from '@/stores/fiatDenominationStore'
import { useBitcoinDisplayUnitStore } from '@/stores/bitcoinDisplayUnitStore'
import { useMainnetFiatRatesQuery } from '@/hooks/useMainnetFiatRatesQuery'
import { walletSendPageTitle } from '@/lib/wallet/wallet-lab-ui-copy'
import { formatFiatInputStringFromSats } from '@/lib/fiat/format-fiat-display'
import { isUsableBtcSpotPriceInFiat } from '@/lib/fiat/is-usable-btc-spot-price-in-fiat'
import {
  applySendReviewTxSummaryToStore,
  clearSendReviewTxSummaryFromStore,
} from '@/lib/wallet/send-review-summary'
import { buildLabSendMutationParams } from '@/lib/lab/lab-send-submit'
import { normalizeSendRecipient } from '@/lib/wallet/send/normalize-send-recipient'
import { computeSendPageBalances } from '@/lib/wallet/send/send-page-balances'
import {
  canBuildOnChainSend,
  canProceedToSendReview,
  isLabWithNoBalance,
  isSendFiatRateOk,
} from '@/lib/wallet/send/send-build-eligibility'
import { resolveLabDraftAmountWithMinDustFloor } from '@/lib/wallet/send/lab-min-dust-floor'
import {
  minOutputSizeRaisedToastMessage,
  onchainDustPrepareWarningLines,
} from '@/lib/wallet/send/onchain-dust-prepare-messages'

import { useSendFlowFees } from './fees'
import { useSendFlowLightning } from './lightning'
import { useSendFlowArkade } from './arkade'
import { SendFlowDustModals } from './modals'

export function SendPage() {
  const navigate = useNavigate()
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const walletStatus = useWalletStore((walletState) => walletState.walletStatus)

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
  const networkMode = useWalletStore((walletState) => walletState.networkMode)
  const balance = useWalletStore((walletState) => walletState.balance)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const isLightningEnabled = useFeatureStore((featureState) => featureState.isLightningEnabled)
  const isUtxoSelectionEnabled = useFeatureStore(
    (featureState) => featureState.isUtxoSelectionEnabled,
  )
  const connectedLightningWallets = useLightningStore((lightningState) => lightningState.connectedWallets)

  const hasAnyLightningConnection = useLightningStore((lightningState) =>
    activeWalletId != null
      ? lightningState.getConnectionsForWallet(activeWalletId).length > 0
      : false,
  )

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

  const {
    step,
    recipient,
    amount,
    amountUnit,
    feePresetSelection,
    psbt,
    onchainDustWarning,
    reviewFeeSats,
    reviewChangeSats,
    reviewInputUtxos,
    setStep,
    setRecipient,
    setAmount,
    setAmountUnit,
  } = useSendStore()

  const {
    presetSatPerVbByLabel,
    feeEstimatesRefreshing,
    handleSelectFeePreset,
    effectiveFeeRate,
    customFeeRate,
    customFeeParsed,
    useCustomFee,
    setCustomFeeRate,
    setUseCustomFee,
  } = useSendFlowFees()

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
      ? sumLabWalletUtxoSats(utxos, addressToOwner, activeWalletId)
      : null

  const { confirmedBalance, totalBalanceSats } = computeSendPageBalances({
    networkMode,
    labBalanceSats,
    balance,
  })

  const applyOnchainPrepareOutcomeToSendStore = useCallback(
    (outcome: PrepareOnchainSendResult) => {
      const { amountUnit: unit } = useSendStore.getState()
      if (outcome.isRaisedToMinDust || outcome.isBumpedChangeFree) {
        const lines = onchainDustPrepareWarningLines(outcome)
        toast.warning(lines.join(' '))
        useSendStore.setState({
          amount: formatAmountInputFromSats(outcome.finalAmountSats, unit),
          onchainDustWarning: {
            previousSats: outcome.originalAmountSats,
            isRaisedToMinDust: outcome.isRaisedToMinDust,
            isBumpedChangeFree: outcome.isBumpedChangeFree,
          },
        })
      }
      applySendReviewTxSummaryToStore({
        feeSats: outcome.feeSats,
        changeSats: outcome.changeSats,
        inputUtxos: outcome.inputUtxos,
      })
      useSendStore.getState().setPsbt(outcome.psbtBase64)
      useSendStore.getState().setStep(2)
    },
    [],
  )

  const applyOnchainReviewSummaryFromOutcome = useCallback(
    (outcome: PrepareOnchainSendResult) => {
      applySendReviewTxSummaryToStore({
        feeSats: outcome.feeSats,
        changeSats: outcome.changeSats,
        inputUtxos: outcome.inputUtxos,
      })
      useSendStore.getState().setPsbt(outcome.psbtBase64)
    },
    [],
  )

  useEffect(() => {
    if (step === 1) {
      setLabApplyChangeFreeBump(false)
      clearSendReviewTxSummaryFromStore()
      useSendStore.getState().setIsManualUtxoSelectionActive(false)
    }
  }, [step])

  const fiatDenominationMode = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.fiatDenominationMode,
  )
  const defaultFiatCurrency = useFiatDenominationStore(
    (fiatDenominationState) => fiatDenominationState.defaultFiatCurrency,
  )
  const mainnetFiatMode =
    networkMode === 'mainnet' && fiatDenominationMode

  const fiatRatesQuery = useMainnetFiatRatesQuery()
  const btcPriceInFiat = fiatRatesQuery.data?.btcPriceInFiat

  const amountSats = useMemo(
    () =>
      amountSatsFromSendForm(amount, amountUnit, {
        useFiatAmountEntry: mainnetFiatMode,
        btcPriceInFiat,
      }),
    [amount, amountUnit, mainnetFiatMode, btcPriceInFiat],
  )

  const normalizedRecipient = useMemo(
    () => normalizeSendRecipient(recipient),
    [recipient],
  )

  const {
    lightningAvailable,
    isLightningSendMode,
    isResolvingLightningPayee,
    lightningPayMutation,
    matchingLightningConnections,
    selectedLightningConnectionId,
    setSelectedLightningConnectionId,
    balanceQueries,
    selectedLnBalanceQuery,
    selectedLnBalanceSats,
    decodedBolt11,
    bolt11NetworkMismatch,
    bolt11DecodeOk,
    needsUserLightningAmount,
    lightningPayAmountSats,
    lightningRecipientOk,
    canBuildLightning,
    submitLightningPayment,
  } = useSendFlowLightning({
    isLightningEnabled,
    networkMode,
    activeWalletId,
    connectedLightningWallets,
    normalizedRecipient,
    amountSats,
  })

  const {
    arkadeAvailable,
    isArkadeSendMode,
    recipientFormatValid: arkadeRecipientFormatValid,
    canBuildArkade,
    submitArkadePayment,
    arkadeBalanceSats,
    arkadeBalanceLoading,
    arkadeSendMutation,
  } = useSendFlowArkade({
    networkMode,
    normalizedRecipient,
    amountSats,
    lightningAvailable,
  })

  const recipientFormatValidForUi = arkadeRecipientFormatValid

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

  const labWithNoBalance = isLabWithNoBalance({ networkMode, labBalanceSats })

  const canBuildOnChain = canBuildOnChainSend({
    isLightningSendMode,
    isArkadeSendMode,
    normalizedRecipient,
    networkMode,
    amountSats,
    confirmedBalance,
    isLabWithNoBalance: labWithNoBalance,
    useCustomFee,
    customFeeParsed,
  })

  const fiatRateOk = isSendFiatRateOk({
    mainnetFiatMode,
    isLightningSendMode,
    needsUserLightningAmount,
    btcPriceInFiat,
    fiatRatesQueryIsError: fiatRatesQuery.isError,
  })

  const canBuild = canProceedToSendReview({
    isLightningSendMode,
    isArkadeSendMode,
    canBuildLightning,
    canBuildArkade,
    canBuildOnChain,
    fiatRateOk,
  })

  const prepareLabDraftForReview = useCallback(
    async (params: {
      draftAmountSats: number
      applyChangeFreeBump: boolean
      selectedOutpoints?: Array<{ txid: string; vout: number }>
    }) => {
      if (activeWalletId == null) {
        throw new Error('No active wallet')
      }
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
        amountSats: params.draftAmountSats,
        feeRateSatPerVb: effectiveFeeRate,
        walletChangeAddress,
        knownRecipientOwner,
        selectedOutpoints: params.selectedOutpoints,
      })

      return useCryptoStore.getState().draftLabPsbtTransaction({
        utxosJson,
        toAddress: normalizedRecipient,
        amountSats: params.draftAmountSats,
        feeRateSatPerVb: effectiveFeeRate,
        changeAddress: walletChangeAddress,
        applyChangeFreeBump: params.applyChangeFreeBump,
      })
    },
    [activeWalletId, currentAddress, effectiveFeeRate, normalizedRecipient],
  )

  const resolveReviewPaymentAmountSats = useCallback(() => {
    if (networkMode === 'lab') {
      return resolveLabSendAmountSats(
        labApplyChangeFreeBump,
        labChangeFreeBumpBaseAmountSatsRef,
      )
    }
    return amountSats
  }, [networkMode, labApplyChangeFreeBump, amountSats])

  const loadAllWalletUtxos = useCallback(async (): Promise<ReviewInputUtxo[]> => {
    if (activeWalletId == null) {
      return []
    }
    if (networkMode === 'lab') {
      await initLabWorkerWithState()
      return getLabWorker().listLabWalletUtxos({ walletId: activeWalletId })
    }
    return useCryptoStore.getState().listWalletUtxos()
  }, [activeWalletId, networkMode])

  const rebuildWithSelectedUtxos = useCallback(
    async (selected: ReviewInputUtxo[]) => {
      const selectedOutpoints = selected.map(reviewUtxoToOutpoint)
      const paymentAmountSats = resolveReviewPaymentAmountSats()

      if (networkMode === 'lab') {
        await runLabOp(async () => {
          const draft = await prepareLabDraftForReview({
            draftAmountSats: paymentAmountSats,
            applyChangeFreeBump: labApplyChangeFreeBump,
            selectedOutpoints,
          })
          applySendReviewTxSummaryToStore({
            feeSats: draft.feeSats,
            changeSats: draft.changeSats,
            inputUtxos: draft.inputUtxos,
          })
        })
        return
      }

      const outcome = await useCryptoStore.getState().prepareOnchainSendTransaction({
        toAddress: normalizedRecipient,
        amountSats: paymentAmountSats,
        feeRateSatPerVb: effectiveFeeRate,
        network: toBitcoinNetwork(networkMode),
        applyChangeFreeBump: false,
        selectedOutpoints,
      })
      applyOnchainReviewSummaryFromOutcome(outcome)
    },
    [
      networkMode,
      resolveReviewPaymentAmountSats,
      labApplyChangeFreeBump,
      prepareLabDraftForReview,
      normalizedRecipient,
      effectiveFeeRate,
      applyOnchainReviewSummaryFromOutcome,
    ],
  )

  const revertToAutoSelection = useCallback(async () => {
    useSendStore.getState().setIsManualUtxoSelectionActive(false)
    const paymentAmountSats = resolveReviewPaymentAmountSats()

    if (networkMode === 'lab') {
      await runLabOp(async () => {
        const draft = await prepareLabDraftForReview({
          draftAmountSats: paymentAmountSats,
          applyChangeFreeBump: labApplyChangeFreeBump,
        })
        applySendReviewTxSummaryToStore({
          feeSats: draft.feeSats,
          changeSats: draft.changeSats,
          inputUtxos: draft.inputUtxos,
        })
      })
      return
    }

    const outcome = await useCryptoStore.getState().prepareOnchainSendTransaction({
      toAddress: normalizedRecipient,
      amountSats: paymentAmountSats,
      feeRateSatPerVb: effectiveFeeRate,
      network: toBitcoinNetwork(networkMode),
      applyChangeFreeBump: false,
    })
    applyOnchainReviewSummaryFromOutcome(outcome)
  }, [
    networkMode,
    resolveReviewPaymentAmountSats,
    labApplyChangeFreeBump,
    prepareLabDraftForReview,
    normalizedRecipient,
    effectiveFeeRate,
    applyOnchainReviewSummaryFromOutcome,
  ])

  const handleManualSelectionStateChange = useCallback(
    (state: { manualSelectionEnabled: boolean; confirmBlocked: boolean }) => {
      const sendStore = useSendStore.getState()
      if (sendStore.isManualUtxoSelectionActive !== state.manualSelectionEnabled) {
        sendStore.setIsManualUtxoSelectionActive(state.manualSelectionEnabled)
      }
    },
    [],
  )

  const handleLabIncreaseToChangeFreeReview = useCallback(async () => {
    if (labDustCase2Modal == null) return
    setLabReviewPending(true)
    try {
      await runLabOp(async () => {
        const baseAmountSats = labDustCase2Modal.exactAmountSats
        const draft = await prepareLabDraftForReview({
          draftAmountSats: baseAmountSats,
          applyChangeFreeBump: true,
        })
        useSendStore.setState({
          amount: formatAmountInputFromSats(draft.finalAmountSats, amountUnit),
          onchainDustWarning: {
            previousSats: labDustCase2Modal.originalAmountSats,
            isRaisedToMinDust: false,
            isBumpedChangeFree: true,
          },
        })
        applySendReviewTxSummaryToStore({
          feeSats: draft.feeSats,
          changeSats: draft.changeSats,
          inputUtxos: draft.inputUtxos,
        })
        setLabApplyChangeFreeBump(true)
        labChangeFreeBumpBaseAmountSatsRef.current = baseAmountSats
        setLabDustCase2Modal(null)
        setStep(2)
      })
    } catch (err) {
      toast.error(errorMessage(err) || 'Failed to prepare lab transaction')
    } finally {
      setLabReviewPending(false)
    }
  }, [
    labDustCase2Modal,
    amountUnit,
    prepareLabDraftForReview,
    setStep,
  ])

  const handleSubmitBuild = useCallback(async () => {
    if (!canBuild) return

    if (isLightningSendMode) {
      submitLightningPayment()
      return
    }

    if (isArkadeSendMode) {
      try {
        await submitArkadePayment()
      } catch {
        /* mutation toasts */
      }
      return
    }

    if (networkMode === 'lab') {
      labChangeFreeBumpBaseAmountSatsRef.current = null
      const { draftAmountSats, dustAdjustment } =
        resolveLabDraftAmountWithMinDustFloor({
          amountSats,
          confirmedBalance,
        })
      if (dustAdjustment != null) {
        toast.warning(minOutputSizeRaisedToastMessage())
        useSendStore.setState({
          amount: formatAmountInputFromSats(draftAmountSats, amountUnit),
          onchainDustWarning: dustAdjustment,
        })
      }

      if (activeWalletId == null) {
        toast.error('No active wallet')
        return
      }

      setLabReviewPending(true)
      try {
        await runLabOp(async () => {
          const draft = await prepareLabDraftForReview({
            draftAmountSats,
            applyChangeFreeBump: false,
          })

          applySendReviewTxSummaryToStore({
            feeSats: draft.feeSats,
            changeSats: draft.changeSats,
            inputUtxos: draft.inputUtxos,
          })

          if (draft.isChangeFreeBumpAvailable) {
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
      if (outcome.isChangeFreeBumpAvailable) {
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
    isArkadeSendMode,
    submitArkadePayment,
    normalizedRecipient,
    networkMode,
    buildMutation,
    amountSats,
    effectiveFeeRate,
    amountUnit,
    applyOnchainPrepareOutcomeToSendStore,
    activeWalletId,
    setStep,
    submitLightningPayment,
    confirmedBalance,
    prepareLabDraftForReview,
  ])

  const submitLabSend = useCallback(() => {
    labSendMutation.mutate(
      buildLabSendMutationParams(
        normalizedRecipient,
        effectiveFeeRate,
        labApplyChangeFreeBump,
        labChangeFreeBumpBaseAmountSatsRef,
      ),
    )
  }, [
    labSendMutation,
    normalizedRecipient,
    effectiveFeeRate,
    labApplyChangeFreeBump,
  ])

  const handleConfirmSend = useCallback(() => {
    if (networkMode === 'lab') {
      if (deadLabRecipientInfo != null) {
        setDeadLabRecipientModalOpen(true)
        return
      }
      submitLabSend()
    } else {
      broadcastMutation.mutate()
    }
  }, [
    networkMode,
    deadLabRecipientInfo,
    submitLabSend,
    broadcastMutation,
  ])

  const handleConfirmDeadLabRecipientSend = useCallback(() => {
    setDeadLabRecipientModalOpen(false)
    submitLabSend()
  }, [submitLabSend])

  const applyScannedPayload = useCallback(
    (scannedPayload: string) => {
      const { recipient: nextRecipient, amountStr } =
        recipientAndAmountFromScannedPayload(scannedPayload, amountUnit)
      setRecipient(nextRecipient)
      if (amountStr !== undefined) {
        if (
          networkMode === 'mainnet' &&
          fiatDenominationMode &&
          isUsableBtcSpotPriceInFiat(btcPriceInFiat)
        ) {
          const satsFromQr = amountSatsFromForm(amountStr, amountUnit)
          setAmount(
            formatFiatInputStringFromSats(
              satsFromQr,
              btcPriceInFiat,
              defaultFiatCurrency,
            ),
            { fromUser: true },
          )
        } else {
          setAmount(amountStr, { fromUser: true })
        }
      }
    },
    [
      amountUnit,
      setRecipient,
      setAmount,
      networkMode,
      fiatDenominationMode,
      btcPriceInFiat,
      defaultFiatCurrency,
    ],
  )

  const handleFiatModeUserToggle = useCallback((nextFiatMode: boolean) => {
    useSendStore.setState({ amount: '', onchainDustWarning: null })
    if (!nextFiatMode) {
      useSendStore
        .getState()
        .setAmountUnit(useBitcoinDisplayUnitStore.getState().defaultBitcoinUnit)
    }
  }, [])

  const isPending =
    buildMutation.isPending ||
    labReviewPending ||
    broadcastMutation.isPending ||
    labSendMutation.isPending ||
    lightningPayMutation.isPending ||
    arkadeSendMutation.isPending ||
    isResolvingLightningPayee

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
        isUtxoSelectionEnabled={isUtxoSelectionEnabled}
        onLoadAllWalletUtxos={loadAllWalletUtxos}
        onRebuildWithSelectedUtxos={rebuildWithSelectedUtxos}
        onRevertToAutoSelection={revertToAutoSelection}
        onManualSelectionStateChange={handleManualSelectionStateChange}
        mainnetFiatMode={mainnetFiatMode}
        defaultFiatCurrency={defaultFiatCurrency}
        btcPriceInFiat={btcPriceInFiat}
        fiatRatesLoading={fiatRatesQuery.isPending}
        reviewFeeSats={reviewFeeSats}
        reviewChangeSats={reviewChangeSats}
        reviewInputUtxos={reviewInputUtxos}
        spendableBalanceSats={confirmedBalance}
        totalBalanceSats={totalBalanceSats}
      />
    )
  }

  const pageTitle = isLightningSendMode
    ? 'Send Lightning'
    : isArkadeSendMode
      ? 'Send on Arkade'
      : walletSendPageTitle(networkMode)
  const cardTitle = isLightningSendMode
    ? 'Pay with Lightning'
    : isArkadeSendMode
      ? 'Arkade payment'
      : 'Send Transaction'
  const submitLabel = isLightningSendMode
    ? 'Pay with Lightning'
    : isArkadeSendMode
      ? 'Send on Arkade'
      : 'Review Transaction'

  return (
    <div className="space-y-6">
      <SendTransactionEntryCard
        pageTitle={pageTitle}
        cardTitle={cardTitle}
        submitLabel={submitLabel}
        isLightningSendMode={isLightningSendMode}
        isArkadeSendMode={isArkadeSendMode}
        arkadeAvailable={arkadeAvailable}
        arkadeBalanceSats={arkadeBalanceSats}
        arkadeBalanceLoading={arkadeBalanceLoading}
        networkMode={networkMode}
        recipient={recipient}
        onRecipientChange={setRecipient}
        recipientFormatValid={recipientFormatValidForUi}
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
        isLabWithNoBalance={labWithNoBalance}
        feePresetSelection={feePresetSelection}
        presetSatPerVbByLabel={presetSatPerVbByLabel}
        feeEstimatesRefreshing={feeEstimatesRefreshing}
        customFeeRate={customFeeRate}
        useCustomFee={useCustomFee}
        onSelectFeePreset={handleSelectFeePreset}
        onCustomFeeRateChange={setCustomFeeRate}
        onUseCustomFeeChange={setUseCustomFee}
        isPending={isPending}
        buildOrLabPreparing={
          buildMutation.isPending || (networkMode === 'lab' && labReviewPending)
        }
        canBuild={canBuild}
        onSubmitBuild={handleSubmitBuild}
        onApplyScannedPayload={applyScannedPayload}
        mainnetFiatMode={mainnetFiatMode}
        defaultFiatCurrency={defaultFiatCurrency}
        btcPriceInFiat={btcPriceInFiat}
        fiatRatesLoading={fiatRatesQuery.isPending}
        parsedAmountSats={amountSats}
        onFiatModeUserToggle={handleFiatModeUserToggle}
      />

      <SendFlowDustModals
        dustCase2Modal={dustCase2Modal}
        setDustCase2Modal={setDustCase2Modal}
        labDustCase2Modal={labDustCase2Modal}
        setLabDustCase2Modal={setLabDustCase2Modal}
        labChangeFreeBumpBaseAmountSatsRef={labChangeFreeBumpBaseAmountSatsRef}
        buildMutation={buildMutation}
        normalizedRecipient={normalizedRecipient}
        amountSats={amountSats}
        effectiveFeeRate={effectiveFeeRate}
        applyOnchainPrepareOutcomeToSendStore={applyOnchainPrepareOutcomeToSendStore}
        setStep={setStep}
        setLabApplyChangeFreeBump={setLabApplyChangeFreeBump}
        onLabIncreaseToChangeFreeReview={handleLabIncreaseToChangeFreeReview}
        labReviewPending={labReviewPending}
      />
    </div>
  )
}
