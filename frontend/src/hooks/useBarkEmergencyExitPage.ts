import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useBarkEmergencyExitQuery } from '@/hooks/useBarkEmergencyExitQuery'
import {
  barkPendingEmergencyClaimQueryKey,
  useBarkEmergencyExitPersistedState,
} from '@/hooks/useBarkEmergencyExitPersistedState'
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
import { BARK_EMERGENCY_EXIT_AUTOMATION_PAUSE_LABELS } from '@/lib/bark/bark-emergency-exit-automated-fee'
import { errorMessage } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useBarkEmergencyExitAutomationStore } from '@/stores/barkEmergencyExitAutomationStore'
import { useBarkEmergencyExitFundingStore } from '@/stores/barkEmergencyExitFundingStore'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { BarkEmergencyExitEstimate, BarkVtxoRow } from '@/workers/bark-api'
import { getBarkWorker } from '@/workers/bark-factory'

export const BARK_EMERGENCY_EXIT_CANCEL_NOTE =
  'Cancel is only possible before the final exit transaction is broadcast. Ancestor transactions may already be on-chain.'

export const BARK_EMERGENCY_EXIT_CLAIM_NOTE = 'The on-chain balance updates after the claim confirms.'

export {
  barkEmergencyExitFeePrefsQueryKey,
  barkPendingEmergencyClaimQueryKey,
  barkProceedAutomaticallyQueryKey,
} from '@/hooks/useBarkEmergencyExitPersistedState'

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
  const persisted = useBarkEmergencyExitPersistedState()
  const {
    pendingEmergencyClaim,
    proceedAutomatically,
    feeRateForActions,
    feeCapBlocksBroadcast,
  } = persisted
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const vtxoListQuery = useBarkVtxoListQuery()
  const exitQuery = useBarkEmergencyExitQuery()
  const queryClient = useQueryClient()
  const automaticProgressInFlight = useBarkEmergencyExitAutomationStore(
    (automationState) => automationState.inFlight,
  )
  const automaticProgressError = useBarkEmergencyExitAutomationStore(
    (automationState) => automationState.errorMessage,
  )
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
    () => overlayPendingEmergencyClaim(exitQuery.data ?? [], pendingEmergencyClaim),
    [exitQuery.data, pendingEmergencyClaim],
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
      const outcome = await runBarkEmergencyExitProgress(exitScope, feeRateForActions)
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
    onProceedAutomaticallyChange: persisted.onProceedAutomaticallyChange,
    onAutomaticFeePresetChange: persisted.onAutomaticFeePresetChange,
    onMaxFeeRateChange: persisted.onMaxFeeRateChange,
    proceedAutomatically,
    proceedAutomaticallyPending: persisted.proceedAutomaticallyPending,
    automaticProgressInFlight,
    automaticProgressError,
    displayedPauseReason: persisted.displayedPauseReason,
    manualFeePresetSelection: persisted.manualFeePresetSelection,
    automatedFeePresetLabel: persisted.automatedFeePresetLabel,
    presetSatPerVbByLabel: persisted.presetSatPerVbByLabel,
    feeEstimatesRefreshing: persisted.feeEstimatesRefreshing,
    customFeeRate: persisted.customFeeRate,
    useCustomFee: persisted.useCustomFee,
    maxFeeRateSatPerVb: persisted.maxFeeRateSatPerVb,
    onSelectManualPreset: persisted.onSelectManualPreset,
    setCustomFeeRate: persisted.setCustomFeeRate,
    onSelectCustomMode: persisted.onSelectCustomMode,
    onCancel: (vtxoId: string) => void onCancel(vtxoId),
    onClaim: () => void onClaim(),
  }
}

export function barkEmergencyExitAmountLabel(allRows: BarkVtxoRow[], vtxoId: string): string {
  const match = allRows.find((row) => row.id === vtxoId)
  return match == null ? 'amount unknown' : formatSats(match.amountSats)
}
