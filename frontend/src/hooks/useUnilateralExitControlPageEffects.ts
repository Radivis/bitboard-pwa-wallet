import { useEffect } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { arkadeUnilateralExitTopologyQueryKey } from '@/lib/arkade/arkade-query-keys'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { shouldHydratePersistedUnilateralExitJob } from '@/lib/arkade/unilateral-exit-job-reconcile'
import { hydrateUnilateralExitFromPersistence } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import { UnilateralExitLifecyclePhase } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import { UNILATERAL_EXIT_MACHINE_STATE } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import { unilateralExitSnapshotIsInState } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'
import type { UnilateralExitActorSnapshot } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'
import type { NetworkMode } from '@/stores/walletStore'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { includesArkadeVtxoOutpoint } from '@/workers/arkade-api'

export function useUnilateralExitControlHydrationEffects(params: {
  isOnControlPage: boolean
  bumpGraphRenderEpoch: () => void
  activeWalletId: number | null
  activeArkadeAccountId: string | null
  networkMode: NetworkMode
  inProgressQueryIsLoading: boolean
  balanceQueryIsLoading: boolean
  inProgressOutpoints: ArkadeVtxoOutpoint[]
  unilateralExitInProgressSats: number
  queryClient: QueryClient
  topologyRequestOutpoints: ArkadeVtxoOutpoint[]
}): void {
  const {
    isOnControlPage,
    bumpGraphRenderEpoch,
    activeWalletId,
    activeArkadeAccountId,
    networkMode,
    inProgressQueryIsLoading,
    balanceQueryIsLoading,
    inProgressOutpoints,
    unilateralExitInProgressSats,
    queryClient,
    topologyRequestOutpoints,
  } = params

  useEffect(() => {
    if (!isOnControlPage) return
    bumpGraphRenderEpoch()
  }, [isOnControlPage, bumpGraphRenderEpoch])

  useEffect(() => {
    if (
      activeWalletId == null ||
      activeArkadeAccountId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return
    }
    if (inProgressQueryIsLoading || balanceQueryIsLoading) return

    void hydrateUnilateralExitFromPersistence({
      walletScope: {
        walletId: activeWalletId,
        networkMode,
        arkadeAccountId: activeArkadeAccountId,
      },
      inProgressOutpoints,
      unilateralExitInProgressSats,
    })
  }, [
    activeArkadeAccountId,
    activeWalletId,
    balanceQueryIsLoading,
    inProgressOutpoints,
    inProgressQueryIsLoading,
    networkMode,
    unilateralExitInProgressSats,
  ])

  useEffect(() => {
    if (!isOnControlPage) return
    if (
      activeWalletId == null ||
      activeArkadeAccountId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return
    }
    void queryClient.refetchQueries({
      queryKey: arkadeUnilateralExitTopologyQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeAccountId,
        topologyRequestOutpoints,
      ),
    })
  }, [
    isOnControlPage,
    queryClient,
    activeWalletId,
    activeArkadeAccountId,
    networkMode,
    topologyRequestOutpoints,
  ])
}

export function useUnilateralExitControlSelectionEffects(params: {
  lifecycleSelectedLeafOutpoints: ArkadeVtxoOutpoint[]
  selectedLeafOutpoints: ArkadeVtxoOutpoint[]
  setSelectedLeafOutpoints: (outpoints: ArkadeVtxoOutpoint[]) => void
  persistedJobOutpoints: ArkadeVtxoOutpoint[]
  persistedFailure: unknown | null
  lifecycleJobActive: boolean
  lifecyclePhase: UnilateralExitLifecyclePhase
  persistedJobExists: boolean
  actorSnapshot: UnilateralExitActorSnapshot
  exitCandidateOutpoints: ArkadeVtxoOutpoint[]
  resetControlStore: () => void
  setFocusedNodeId: (id: string | null) => void
}): void {
  const {
    lifecycleSelectedLeafOutpoints,
    selectedLeafOutpoints,
    setSelectedLeafOutpoints,
    persistedJobOutpoints,
    persistedFailure,
    lifecycleJobActive,
    lifecyclePhase,
    persistedJobExists,
    actorSnapshot,
    exitCandidateOutpoints,
    resetControlStore,
    setFocusedNodeId,
  } = params

  useEffect(() => {
    if (lifecycleSelectedLeafOutpoints.length === 0) return
    if (selectedLeafOutpoints.length > 0) return
    setSelectedLeafOutpoints(lifecycleSelectedLeafOutpoints)
  }, [
    lifecycleSelectedLeafOutpoints,
    selectedLeafOutpoints.length,
    setSelectedLeafOutpoints,
  ])

  useEffect(() => {
    if (
      !shouldHydratePersistedUnilateralExitJob({
        selectedLeafOutpoints: persistedJobOutpoints,
        controlStoreSelectionEmpty: selectedLeafOutpoints.length === 0,
      })
    ) {
      return
    }
    setSelectedLeafOutpoints(persistedJobOutpoints)
  }, [persistedJobOutpoints, selectedLeafOutpoints.length, setSelectedLeafOutpoints])

  useEffect(() => {
    if (persistedFailure == null || lifecycleJobActive) {
      return
    }
    resetControlStore()
    setFocusedNodeId(null)
  }, [lifecycleJobActive, persistedFailure, resetControlStore, setFocusedNodeId])

  useEffect(() => {
    if (lifecyclePhase !== UnilateralExitLifecyclePhase.Terminated) {
      return
    }
    resetControlStore()
    setFocusedNodeId(null)
  }, [lifecyclePhase, resetControlStore, setFocusedNodeId])

  useEffect(() => {
    if (lifecycleJobActive || persistedJobExists) return
    if (selectedLeafOutpoints.length === 0) return
    if (!unilateralExitSnapshotIsInState(actorSnapshot, UNILATERAL_EXIT_MACHINE_STATE.idle)) {
      return
    }

    const selectionStillStartable = selectedLeafOutpoints.some((outpoint) =>
      includesArkadeVtxoOutpoint(exitCandidateOutpoints, outpoint),
    )
    if (selectionStillStartable) return

    resetControlStore()
    setFocusedNodeId(null)
  }, [
    actorSnapshot,
    exitCandidateOutpoints,
    lifecycleJobActive,
    persistedJobExists,
    resetControlStore,
    selectedLeafOutpoints,
    setFocusedNodeId,
  ])
}
