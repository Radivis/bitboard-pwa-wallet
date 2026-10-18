import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useBarkEmergencyExitQuery } from '@/hooks/useBarkEmergencyExitQuery'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import { barkExitTopologyQueryKey, useBarkExitTopologyQuery } from '@/hooks/useBarkExitTopologyQuery'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { barkVtxoListQueryKey, useBarkVtxoListQuery } from '@/hooks/useBarkVtxoListQuery'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import {
  emergencyExitClaimEnabled,
  overlayPendingEmergencyClaim,
} from '@/lib/bark/bark-emergency-claim'
import {
  barkExitTopologyVtxoIds,
  emergencyExitStartBlocked,
} from '@/lib/bark/bark-emergency-exit'
import {
  barkEmergencyExitFundingStatusFor,
  barkEmergencyExitScopeFor,
  barkEmergencyExitUnfundedParentTxidsFor,
} from '@/lib/bark/bark-emergency-exit-funding-status'
import { catchUpOnchainWalletForBarkExit } from '@/lib/bark/bark-emergency-exit-onchain-catch-up-live'
import {
  barkEmergencyExitClaimDeps,
  barkEmergencyExitReviewDeps,
  barkEmergencyExitStartDeps,
  runBarkEmergencyExitProgress,
} from '@/lib/bark/bark-emergency-exit-live-deps'
import {
  barkEmergencyExitChildrenWaitForFunds,
  claimBarkEmergencyExits,
  startBarkEmergencyExit,
} from '@/lib/bark/perform-bark-emergency-exit'
import {
  BARK_EMERGENCY_EXIT_AUTOMATION_PAUSE_LABELS,
  effectiveBarkEmergencyExitMaxFeeRate,
} from '@/lib/bark/bark-emergency-exit-automated-fee'
import {
  syncBarkEmergencyExitAutomation,
  stopBarkEmergencyExitAutomation,
} from '@/lib/bark/bark-emergency-exit-automation'
import { resolveAutomatedStepFeeRateSatPerVb, defaultMaxFeeRateSatPerVb } from '@/lib/onchain/automated-step-fee-rate'
import { errorMessage } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { DEFAULT_BARK_EMERGENCY_EXIT_FEE_PRESET } from '@/lib/wallet/wallet-domain-types'
import {
  clearBarkEmergencyExitAutomationPause,
  pauseBarkEmergencyExitAutomation,
  useBarkEmergencyExitAutomationStore,
} from '@/stores/barkEmergencyExitAutomationStore'
import { useBarkEmergencyExitFundingStore } from '@/stores/barkEmergencyExitFundingStore'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { BarkEmergencyExitEstimate, BarkEmergencyExitFeePrefs, BarkVtxoRow } from '@/workers/bark-api'
import { getBarkWorker } from '@/workers/bark-factory'

export const BARK_EMERGENCY_EXIT_CANCEL_NOTE =
  'Cancel is only possible before the final exit transaction is broadcast. Ancestor transactions may already be on-chain.'

export const BARK_EMERGENCY_EXIT_CLAIM_NOTE = 'The on-chain balance updates after the claim confirms.'

export function barkPendingEmergencyClaimQueryKey(
  walletId: number | null,
  networkMode: string,
) {
  return ['bark', 'pending-emergency-claim', walletId, networkMode] as const
}

export function barkProceedAutomaticallyQueryKey(
  walletId: number | null,
  networkMode: string,
) {
  return ['bark', 'proceed-automatically', walletId, networkMode] as const
}

export function barkEmergencyExitFeePrefsQueryKey(
  walletId: number | null,
  networkMode: string,
) {
  return ['bark', 'emergency-exit-fee-prefs', walletId, networkMode] as const
}

export type BarkEmergencyExitReview = {
  vtxoIds: string[]
  estimate: BarkEmergencyExitEstimate
}

export function useBarkEmergencyExitPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((walletState) => walletState.activeWalletId)
  const currentAddress = useWalletStore((walletState) => walletState.currentAddress)
  const confirmedSats = useWalletStore((walletState) => walletState.balance?.confirmedSats ?? 0)
  const isBarkEnabled = useFeatureStore((featureState) => featureState.isBarkEnabled)
  const feeSelection = useOnchainFeeRateSelection(networkMode)
  const manualFeeRateSatPerVb = feeSelection.effectiveFeeRate
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const vtxoListQuery = useBarkVtxoListQuery()
  const exitQuery = useBarkEmergencyExitQuery()
  const pendingClaimQuery = useQuery({
    queryKey: barkPendingEmergencyClaimQueryKey(activeWalletId, networkMode),
    enabled:
      isBarkEnabled &&
      isBarkNetworkMode(networkMode) &&
      loadSnapshot.loadPhase === 'loaded' &&
      activeWalletId != null,
    queryFn: () => getBarkWorker().readPendingEmergencyClaim(),
  })
  const proceedAutomaticallyQuery = useQuery({
    queryKey: barkProceedAutomaticallyQueryKey(activeWalletId, networkMode),
    enabled:
      isBarkEnabled &&
      isBarkNetworkMode(networkMode) &&
      loadSnapshot.loadPhase === 'loaded' &&
      activeWalletId != null,
    queryFn: () => getBarkWorker().readProceedAutomatically(),
  })
  const feePrefsQuery = useQuery({
    queryKey: barkEmergencyExitFeePrefsQueryKey(activeWalletId, networkMode),
    enabled:
      isBarkEnabled &&
      isBarkNetworkMode(networkMode) &&
      loadSnapshot.loadPhase === 'loaded' &&
      activeWalletId != null,
    queryFn: () => getBarkWorker().readEmergencyExitFeePrefs(),
  })
  const queryClient = useQueryClient()

  const proceedAutomatically = proceedAutomaticallyQuery.data === true
  const automaticProgressInFlight = useBarkEmergencyExitAutomationStore(
    (automationState) => automationState.inFlight,
  )
  const automaticProgressError = useBarkEmergencyExitAutomationStore(
    (automationState) => automationState.errorMessage,
  )
  const pausedReason = useBarkEmergencyExitAutomationStore(
    (automationState) => automationState.pausedReason,
  )
  const automatedFeePresetLabel =
    feePrefsQuery.data?.feePresetLabel ?? DEFAULT_BARK_EMERGENCY_EXIT_FEE_PRESET
  const maxFeeRateSatPerVb = effectiveBarkEmergencyExitMaxFeeRate(
    feePrefsQuery.data?.maxFeeRateSatPerVb ?? null,
    feeSelection.presetSatPerVbByLabel.High,
  )
  const automatedFeeResolution = resolveAutomatedStepFeeRateSatPerVb(
    automatedFeePresetLabel,
    feeSelection.presetSatPerVbByLabel,
    maxFeeRateSatPerVb,
  )
  const displayedPauseReason =
    !proceedAutomatically
      ? null
      : (pausedReason ?? (automatedFeeResolution.capExceeded ? 'feeCapExceeded' : null))
  const feeRateForActions = proceedAutomatically
    ? automatedFeeResolution.feeRateSatPerVb
    : manualFeeRateSatPerVb
  const exitScope = useMemo(
    () => barkEmergencyExitScopeFor(activeWalletId, networkMode),
    [activeWalletId, networkMode],
  )
  const fundingStatus = barkEmergencyExitFundingStatusFor(
    useBarkEmergencyExitFundingStore((fundingState) => fundingState.fundingStatus),
    exitScope,
  )
  const unfundedParentTxids = barkEmergencyExitUnfundedParentTxidsFor(
    useBarkEmergencyExitFundingStore((fundingState) => fundingState.unfundedParents),
    exitScope,
  )

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [wholeWallet, setWholeWallet] = useState(false)
  const [review, setReview] = useState<BarkEmergencyExitReview | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  useEffect(() => {
    setReview(null)
  }, [feeRateForActions])
  const vtxoRows = vtxoListQuery.data?.rows ?? []
  const spendableVtxos = vtxoRows.filter((row) => row.state === 'spendable')
  const topologyVtxoIds = useMemo(
    () =>
      barkExitTopologyVtxoIds({
        wholeWallet,
        selectedIds,
        spendableIds: (vtxoListQuery.data?.rows ?? [])
          .filter((row) => row.state === 'spendable')
          .map((row) => row.id),
        liveExitIds: (exitQuery.data ?? []).map((row) => row.vtxoId),
      }),
    [wholeWallet, selectedIds, vtxoListQuery.data, exitQuery.data],
  )
  const topologyQuery = useBarkExitTopologyQuery(topologyVtxoIds)

  const unavailable = !isBarkEnabled || !isBarkNetworkMode(networkMode)
  const sessionReady = loadSnapshot.loadPhase === 'loaded'
  const destinationAddress = currentAddress?.trim() ?? ''
  const liveExits = useMemo(
    () => overlayPendingEmergencyClaim(exitQuery.data ?? [], pendingClaimQuery.data ?? null),
    [exitQuery.data, pendingClaimQuery.data],
  )
  const liveExitsLoading = exitQuery.isLoading
  const liveExitsError = exitQuery.isError
    ? errorMessage(exitQuery.error) || 'Could not load live exits.'
    : null
  const claimEnabled = emergencyExitClaimEnabled(liveExits)
  const startBlocked =
    review != null && emergencyExitStartBlocked(confirmedSats, review.estimate.exitBroadcastFeeSats)
  const exitTreeError = topologyQuery.isError
    ? errorMessage(topologyQuery.error) || 'Failed to load exit tree.'
    : null

  function clearReview() {
    setReview(null)
  }

  function toggleVtxo(vtxoId: string) {
    setWholeWallet(false)
    setSelectedIds((current) =>
      current.includes(vtxoId) ? current.filter((id) => id !== vtxoId) : [...current, vtxoId],
    )
    clearReview()
  }

  function selectWholeWallet(checked: boolean) {
    setWholeWallet(checked)
    if (checked) setSelectedIds([])
    clearReview()
  }

  async function reloadLists() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['bark', 'emergency-exits', activeWalletId],
      }),
      queryClient.invalidateQueries({
        queryKey: barkVtxoListQueryKey(
          activeWalletId,
          networkMode,
          syncSnapshot.lastSuccessfulSyncAt,
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: barkPendingEmergencyClaimQueryKey(activeWalletId, networkMode),
      }),
      queryClient.invalidateQueries({
        queryKey: barkExitTopologyQueryKey(
          activeWalletId,
          networkMode,
          topologyVtxoIds,
          syncSnapshot.lastSuccessfulSyncAt,
        ),
      }),
    ])
  }

  function feeCapBlocksBroadcast(): boolean {
    if (!proceedAutomatically) return false
    if (pausedReason === 'feeCapExceeded' || automatedFeeResolution.capExceeded) {
      if (pausedReason !== 'feeCapExceeded') {
        pauseBarkEmergencyExitAutomation('feeCapExceeded')
      }
      return true
    }
    return false
  }

  async function onReview() {
    const vtxoIds = wholeWallet ? [] : selectedIds
    if (!wholeWallet && vtxoIds.length === 0) {
      toast.error('Select spendable VTXOs or the whole wallet.')
      return
    }
    if (feeCapBlocksBroadcast()) {
      toast.error(BARK_EMERGENCY_EXIT_AUTOMATION_PAUSE_LABELS.feeCapExceeded)
      return
    }
    setBusyAction('review')
    try {
      const estimate = await barkEmergencyExitReviewDeps().estimate(vtxoIds, feeRateForActions)
      setReview({ vtxoIds, estimate })
    } catch (err) {
      setReview(null)
      toast.error(errorMessage(err) || 'Could not estimate the emergency exit')
    } finally {
      setBusyAction(null)
    }
  }

  async function onStart() {
    if (review == null || startBlocked) return
    setBusyAction('start')
    try {
      await startBarkEmergencyExit(barkEmergencyExitStartDeps(), review.vtxoIds)
      toast.success('Emergency exit started.')
      setSelectedIds([])
      setWholeWallet(false)
      setReview(null)
      await reloadLists()
    } catch (err) {
      toast.error(errorMessage(err) || 'Emergency exit failed to start')
    } finally {
      setBusyAction(null)
    }
  }

  async function onProgress() {
    if (proceedAutomatically) return
    setBusyAction('progress')
    try {
      await catchUpOnchainWalletForBarkExit(networkMode)
      const outcome = await runBarkEmergencyExitProgress(exitScope, manualFeeRateSatPerVb)
      if (!barkEmergencyExitChildrenWaitForFunds(outcome)) {
        toast.success('Emergency exit progressed.')
      }
      await reloadLists()
    } catch (err) {
      toast.error(errorMessage(err) || 'Emergency exit failed to progress')
    } finally {
      setBusyAction(null)
    }
  }

  async function onCancel(vtxoId: string) {
    setBusyAction(`cancel:${vtxoId}`)
    try {
      await getBarkWorker().cancelEmergencyExit(vtxoId)
      toast.success('Emergency exit canceled.')
      await reloadLists()
    } catch (err) {
      toast.error(errorMessage(err) || 'Could not cancel the emergency exit')
    } finally {
      setBusyAction(null)
    }
  }

  async function onProceedAutomaticallyChange(enabled: boolean) {
    if (activeWalletId == null || !isBarkNetworkMode(networkMode)) return
    const queryKey = barkProceedAutomaticallyQueryKey(activeWalletId, networkMode)
    const feePrefsKey = barkEmergencyExitFeePrefsQueryKey(activeWalletId, networkMode)
    queryClient.setQueryData(queryKey, enabled)
    try {
      await getBarkWorker().writeProceedAutomatically(enabled)
      if (enabled) {
        const maxFeeRate = defaultMaxFeeRateSatPerVb(feeSelection.presetSatPerVbByLabel.High)
        await getBarkWorker().writeEmergencyExitMaxFeeRate(maxFeeRate)
        queryClient.setQueryData(feePrefsKey, (current: BarkEmergencyExitFeePrefs | undefined) => ({
          feePresetLabel: current?.feePresetLabel ?? automatedFeePresetLabel,
          maxFeeRateSatPerVb: maxFeeRate,
        }))
        void syncBarkEmergencyExitAutomation({ walletId: activeWalletId, networkMode })
      } else {
        stopBarkEmergencyExitAutomation()
      }
    } catch (err) {
      queryClient.setQueryData(queryKey, !enabled)
      if (enabled) {
        await getBarkWorker().writeProceedAutomatically(false).catch(() => undefined)
      }
      toast.error(errorMessage(err) || 'Could not save automatic proceeding')
    }
  }

  async function onAutomaticFeePresetChange(feePresetLabel: BarkEmergencyExitFeePrefs['feePresetLabel']) {
    if (activeWalletId == null) return
    const feePrefsKey = barkEmergencyExitFeePrefsQueryKey(activeWalletId, networkMode)
    try {
      await getBarkWorker().writeEmergencyExitFeePreset(feePresetLabel)
      queryClient.setQueryData(feePrefsKey, (current: BarkEmergencyExitFeePrefs | undefined) => ({
        feePresetLabel,
        maxFeeRateSatPerVb: current?.maxFeeRateSatPerVb ?? null,
      }))
      clearBarkEmergencyExitAutomationPause()
    } catch (err) {
      toast.error(errorMessage(err) || 'Could not save the fee rate')
    }
  }

  async function onMaxFeeRateChange(nextMaxFeeRateSatPerVb: number) {
    if (activeWalletId == null) return
    const feePrefsKey = barkEmergencyExitFeePrefsQueryKey(activeWalletId, networkMode)
    try {
      await getBarkWorker().writeEmergencyExitMaxFeeRate(nextMaxFeeRateSatPerVb)
      queryClient.setQueryData(feePrefsKey, (current: BarkEmergencyExitFeePrefs | undefined) => ({
        feePresetLabel: current?.feePresetLabel ?? automatedFeePresetLabel,
        maxFeeRateSatPerVb: nextMaxFeeRateSatPerVb,
      }))
      clearBarkEmergencyExitAutomationPause()
    } catch (err) {
      toast.error(errorMessage(err) || 'Could not save the maximum fee rate')
    }
  }

  async function onClaim() {
    if (destinationAddress.length === 0) {
      toast.error('No on-chain receive address is available.')
      return
    }
    if (feeCapBlocksBroadcast()) {
      toast.error(BARK_EMERGENCY_EXIT_AUTOMATION_PAUSE_LABELS.feeCapExceeded)
      return
    }
    setBusyAction('claim')
    try {
      const claimed = await claimBarkEmergencyExits(
        barkEmergencyExitClaimDeps(),
        destinationAddress,
        feeRateForActions,
      )
      if (claimed.observed) {
        toast.success(`Claim broadcast ${claimed.txid}. ${BARK_EMERGENCY_EXIT_CLAIM_NOTE}`)
      }
      await reloadLists()
    } catch (err) {
      toast.error(errorMessage(err) || 'Claim failed')
    } finally {
      setBusyAction(null)
    }
  }

  return {
    unavailable,
    sessionReady,
    loadPhase: loadSnapshot.loadPhase,
    errorMessage: loadSnapshot.errorMessage,
    vtxoRows,
    spendableVtxos,
    liveExits,
    liveExitsLoading,
    liveExitsError,
    claimEnabled,
    topologyVtxoIds,
    topologyNodes: topologyVtxoIds.length === 0 ? [] : topologyQuery.data?.nodes,
    exitTreeError,
    fundingStatus,
    unfundedParentTxids,
    wholeWallet,
    selectedIds,
    review,
    busyAction,
    startBlocked,
    destinationAddress,
    selectWholeWallet,
    toggleVtxo,
    onReview: () => void onReview(),
    onStart: () => void onStart(),
    onProgress: () => void onProgress(),
    onProceedAutomaticallyChange: (enabled: boolean) => void onProceedAutomaticallyChange(enabled),
    onAutomaticFeePresetChange: (
      preset: BarkEmergencyExitFeePrefs['feePresetLabel'],
      _rateSatPerVb: number,
    ) => void onAutomaticFeePresetChange(preset),
    onMaxFeeRateChange: (nextMaxFeeRateSatPerVb: number) =>
      void onMaxFeeRateChange(nextMaxFeeRateSatPerVb),
    proceedAutomatically,
    proceedAutomaticallyPending: proceedAutomaticallyQuery.isPending,
    automaticProgressInFlight,
    automaticProgressError,
    displayedPauseReason,
    manualFeePresetSelection: feeSelection.feePresetSelection,
    automatedFeePresetLabel,
    presetSatPerVbByLabel: feeSelection.presetSatPerVbByLabel,
    feeEstimatesRefreshing: feeSelection.feeEstimatesRefreshing,
    customFeeRate: feeSelection.customFeeRate,
    useCustomFee: feeSelection.useCustomFee,
    maxFeeRateSatPerVb,
    onSelectManualPreset: feeSelection.handleSelectFeePreset,
    setCustomFeeRate: feeSelection.setCustomFeeRate,
    onSelectCustomMode: feeSelection.handleSelectCustomMode,
    onCancel: (vtxoId: string) => void onCancel(vtxoId),
    onClaim: () => void onClaim(),
  }
}

export function barkEmergencyExitAmountLabel(allRows: BarkVtxoRow[], vtxoId: string): string {
  const match = allRows.find((row) => row.id === vtxoId)
  return match == null ? 'amount unknown' : formatSats(match.amountSats)
}
