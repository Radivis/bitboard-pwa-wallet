import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { barkEmergencyExitQueryKey, useBarkEmergencyExitQuery } from '@/hooks/useBarkEmergencyExitQuery'
import { barkExitTopologyQueryKey, useBarkExitTopologyQuery } from '@/hooks/useBarkExitTopologyQuery'
import { useBarkLoadLifecycleSnapshot } from '@/hooks/useBarkLoadLifecycleSnapshot'
import { useEsploraFeePresets } from '@/hooks/useEsploraFeePresets'
import { barkVtxoListQueryKey, useBarkVtxoListQuery } from '@/hooks/useBarkVtxoListQuery'
import { useBarkSyncLifecycleSnapshot } from '@/hooks/useBarkSyncLifecycleSnapshot'
import {
  barkExitTopologyVtxoIds,
  emergencyExitStartBlocked,
} from '@/lib/bark/bark-emergency-exit'
import {
  barkEmergencyExitClaimDeps,
  barkEmergencyExitProgressDeps,
  barkEmergencyExitReviewDeps,
  barkEmergencyExitStartDeps,
} from '@/lib/bark/bark-emergency-exit-live-deps'
import {
  claimBarkEmergencyExits,
  progressBarkEmergencyExits,
  startBarkEmergencyExit,
} from '@/lib/bark/perform-bark-emergency-exit'
import { NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB } from '@/lib/esplora/esplora-fee-estimates'
import { errorMessage } from '@/lib/shared/utils'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import { isBarkNetworkMode } from '@/lib/bark/bark-utils'
import { useFeatureStore } from '@/stores/featureStore'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import type { BarkEmergencyExitEstimate, BarkVtxoRow } from '@/workers/bark-api'
import { getBarkWorker } from '@/workers/bark-factory'

export const BARK_EMERGENCY_EXIT_CANCEL_NOTE =
  'Cancel is only possible before the final exit transaction is broadcast. Ancestor transactions may already be on-chain.'

export const BARK_EMERGENCY_EXIT_CLAIM_NOTE = 'The on-chain balance updates after the claim confirms.'

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
  const feePresetsQuery = useEsploraFeePresets(networkMode)
  const feeRateSatPerVb =
    feePresetsQuery.data?.High ?? NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB.High
  const loadSnapshot = useBarkLoadLifecycleSnapshot()
  const syncSnapshot = useBarkSyncLifecycleSnapshot()
  const vtxoListQuery = useBarkVtxoListQuery()
  const exitQuery = useBarkEmergencyExitQuery()
  const queryClient = useQueryClient()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [wholeWallet, setWholeWallet] = useState(false)
  const [review, setReview] = useState<BarkEmergencyExitReview | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const vtxoRows = vtxoListQuery.data ?? []
  const spendableVtxos = vtxoRows.filter((row) => row.state === 'spendable')
  const topologyVtxoIds = useMemo(
    () =>
      barkExitTopologyVtxoIds({
        wholeWallet,
        selectedIds,
        spendableIds: (vtxoListQuery.data ?? [])
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
        queryKey: barkEmergencyExitQueryKey(activeWalletId, networkMode),
      }),
      queryClient.invalidateQueries({
        queryKey: barkVtxoListQueryKey(
          activeWalletId,
          networkMode,
          syncSnapshot.lastSuccessfulSyncAt,
        ),
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
    setBusyAction('review')
    try {
      const estimate = await barkEmergencyExitReviewDeps().estimate(vtxoIds, feeRateSatPerVb)
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
    setBusyAction('progress')
    try {
      await progressBarkEmergencyExits(barkEmergencyExitProgressDeps(), feeRateSatPerVb)
      toast.success('Emergency exit progressed.')
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
    setBusyAction('claim')
    try {
      const claimed = await claimBarkEmergencyExits(
        barkEmergencyExitClaimDeps(),
        destinationAddress,
        feeRateSatPerVb,
      )
      const claimedMessage = `Claim broadcast ${claimed.txid}. ${BARK_EMERGENCY_EXIT_CLAIM_NOTE}`
      toast.success(
        claimed.syncWarning == null
          ? claimedMessage
          : `${claimedMessage} ${claimed.syncWarning}`,
      )
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
    vtxoRows,
    spendableVtxos,
    liveExits: exitQuery.data ?? [],
    topologyVtxoIds,
    topologyNodes: topologyVtxoIds.length === 0 ? [] : topologyQuery.data?.nodes,
    exitTreeError,
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
    onCancel: (vtxoId: string) => void onCancel(vtxoId),
    onClaim: () => void onClaim(),
  }
}

export function barkEmergencyExitAmountLabel(allRows: BarkVtxoRow[], vtxoId: string): string {
  const match = allRows.find((row) => row.id === vtxoId)
  return match == null ? 'amount unknown' : formatSats(match.amountSats)
}
