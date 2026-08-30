import { useEffect, useMemo, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { ArkadeBumperWalletInfomodeContent } from '@/components/arkade/infomode/ArkadeBumperWalletInfomodeContent'
import { ArkadeUnilateralExitInfomodeContent } from '@/components/arkade/infomode/ArkadeUnilateralExitInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import { UnilateralExitAutomationSection } from '@/components/wallet/unilateral-exit/UnilateralExitAutomationSection'
import { UnilateralExitFailureBanner } from '@/components/wallet/unilateral-exit/UnilateralExitFailureBanner'
import { StartUnilateralExitConfirmModal } from '@/components/wallet/unilateral-exit/StartUnilateralExitConfirmModal'
import { AbortUnilateralExitInfoModal } from '@/components/wallet/unilateral-exit/AbortUnilateralExitInfoModal'
import { AbortUnilateralExitConfirmModal } from '@/components/wallet/unilateral-exit/AbortUnilateralExitConfirmModal'
import { UnilateralExitTreeGraph } from '@/components/wallet/unilateral-exit/UnilateralExitTreeGraph'
import { UnilateralExitNodeDetailCard } from '@/components/wallet/unilateral-exit/UnilateralExitNodeDetailCard'
import {
  useArkadeBalanceQuery,
  useArkadeBumperInfoQuery,
  useArkadeExitCandidatesQuery,
  useArkadeUnilateralExitBatchEstimateQuery,
  useArkadeUnilateralExitTopologyQuery,
  useArkadeUnilateralExitsInProgressQuery,
} from '@/hooks/useArkadeQueries'
import { useEsploraFeePresets } from '@/hooks/useEsploraFeePresets'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import {
  useIsUnilateralExitJobActive,
  useUnilateralExitActorSnapshot,
  useUnilateralExitLifecycleSnapshot,
} from '@/hooks/useUnilateralExitLifecycleSnapshot'
import { useUnilateralExitAutomationSnapshot } from '@/hooks/useUnilateralExitAutomationSnapshot'
import { useUnilateralExitStepWaitingClock } from '@/hooks/useUnilateralExitStepWaitingClock'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { arkadeUnilateralExitInProgressSats } from '@/lib/arkade/arkade-balance-display'
import { defaultMaxFeeRateSatPerVb } from '@/lib/arkade/unilateral-exit-automation-fees'
import { useUnilateralExitLifecyclePersistenceStore, emptyPersistedUnilateralExitJob } from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-persistence'
import { useUnilateralExitFailurePersistenceStore } from '@/lib/wallet/lifecycle/unilateral-exit-failure-persistence'
import {
  UnilateralExitLifecyclePhase,
  persistedUnilateralExitJobExists,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-types'
import {
  resolveActiveArkadeWalletScope,
  resolveUnilateralExitJobOutpoints,
} from '@/lib/wallet/lifecycle/unilateral-exit-job-scope'
import { isCurrentStepRelayed } from '@/lib/arkade/unilateral-exit-broadcast'
import { UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY } from '@/lib/arkade/unilateral-exit-control-phase'
import { resolveUnilateralExitTopologyOutpoints } from '@/lib/arkade/unilateral-exit-topology'
import {
  selectUnilateralExitControlJobState,
  selectCanAbortUnilateralExitOrchestration,
  selectUnilateralExitInProgressOverlay,
  selectUnilateralExitProceedButtonState,
  selectUnilateralExitProgressForDisplay,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-selectors'
import { UNILATERAL_EXIT_MACHINE_STATE } from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-machine-types'
import {
  unilateralExitSnapshotIsInAnyState,
  unilateralExitSnapshotIsInState,
  unilateralExitSnapshotIsProceeding,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-snapshot'
import { wasmArkErrorMessage } from '@/lib/shared/wasm-ark-error'
import { formatSatPerVbTwoDecimals } from '@/lib/esplora/esplora-fee-estimates'
import {
  clearUnilateralExitJob,
  abortUnilateralExitOrchestration,
  disableAutomaticUnilateralExit,
  enableAutomaticUnilateralExit,
  hydrateUnilateralExitFromPersistence,
  getUnilateralExitActorSnapshot,
  proceedManualUnilateralExitStep,
  setAutomaticUnilateralExitFeePreset,
  setAutomaticUnilateralExitMaxFeeRate,
  startAutomaticUnilateralExitAsync,
  startManualUnilateralExitAsync,
} from '@/lib/wallet/lifecycle/unilateral-exit/unilateral-exit-runtime'
import {
  arkadeUnilateralExitTopologyQueryKey,
  arkadeUnilateralExitTopologyScopeKey,
} from '@/lib/arkade/arkade-query-keys'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { includesArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { useUnilateralExitControlStore } from '@/stores/unilateralExitControlStore'

function toastUnilateralExitSettleResult(
  snapshot: ReturnType<typeof getUnilateralExitActorSnapshot>,
  successMessage: string,
): void {
  if (unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.error)) {
    const message =
      wasmArkErrorMessage(new Error(snapshot.context.lastErrorMessage ?? '')) ??
      snapshot.context.lastErrorMessage ??
      'Unroll step failed.'
    toast.error(message)
    return
  }
  if (unilateralExitSnapshotIsInState(snapshot, UNILATERAL_EXIT_MACHINE_STATE.terminated)) {
    toast.error(snapshot.context.lastErrorMessage ?? 'Unilateral exit was terminated.')
    return
  }
  if (
    unilateralExitSnapshotIsInAnyState(snapshot, [
      UNILATERAL_EXIT_MACHINE_STATE.waitingConfirm,
      UNILATERAL_EXIT_MACHINE_STATE.complete,
      UNILATERAL_EXIT_MACHINE_STATE.paused,
    ])
  ) {
    toast.success(successMessage)
  }
}

const EMPTY_TOPOLOGY_OUTPOINTS: ArkadeVtxoOutpoint[] = []

function totalSelectedSats(
  selected: ArkadeVtxoOutpoint[],
  candidates: { txid: string; vout: number; amountSats: number }[],
): number {
  return selected.reduce((total, outpoint) => {
    const row = candidates.find(
      (candidate) => candidate.txid === outpoint.txid && candidate.vout === outpoint.vout,
    )
    return total + (row?.amountSats ?? 0)
  }, 0)
}

export function UnilateralExitControlPage() {
  const queryClient = useQueryClient()
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const activeWalletId = useWalletStore((state) => state.activeWalletId)
  const activeArkadeConnectionId = useWalletStore((state) => state.activeArkadeConnectionId)
  const balanceQuery = useArkadeBalanceQuery()
  const exitCandidatesQuery = useArkadeExitCandidatesQuery(true)
  const inProgressQuery = useArkadeUnilateralExitsInProgressQuery(true)
  const feePresetsQuery = useEsploraFeePresets(networkMode)
  const lifecycleSnapshot = useUnilateralExitLifecycleSnapshot()
  const actorSnapshot = useUnilateralExitActorSnapshot()
  const automationSnapshot = useUnilateralExitAutomationSnapshot()
  const lifecycleJobActive = useIsUnilateralExitJobActive()
  const automationPrefsHydrated = useUnilateralExitLifecyclePersistenceStore((state) => {
    if (
      activeWalletId == null ||
      activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return false
    }
    return state.isHydrated({
      walletId: activeWalletId,
      networkMode,
      connectionId: activeArkadeConnectionId,
    })
  })

  const selectedLeafOutpoints = useUnilateralExitControlStore(
    (state) => state.selectedLeafOutpoints,
  )
  const setSelectedLeafOutpoints = useUnilateralExitControlStore(
    (state) => state.setSelectedLeafOutpoints,
  )
  const toggleLeafTxGroup = useUnilateralExitControlStore((state) => state.toggleLeafTxGroup)
  const seedSelectionFromInProgress = useUnilateralExitControlStore(
    (state) => state.seedSelectionFromInProgress,
  )
  const bumpGraphRenderEpoch = useUnilateralExitControlStore(
    (state) => state.bumpGraphRenderEpoch,
  )
  const resetControlStore = useUnilateralExitControlStore((state) => state.reset)
  const graphRenderEpoch = useUnilateralExitControlStore((state) => state.graphRenderEpoch)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [startConfirmOpen, setStartConfirmOpen] = useState(false)
  const [abortInfoOpen, setAbortInfoOpen] = useState(false)
  const [abortConfirmOpen, setAbortConfirmOpen] = useState(false)

  const automationEnabled = actorSnapshot.context.automationEnabled
  const automationPausedReason = automationSnapshot.pausedReason
  const automationLastError = automationSnapshot.lastErrorMessage

  const isOnControlPage = useRouterState({
    select: (routerState) =>
      routerState.location.pathname === '/wallet/arkade/unilateral-exit',
  })

  const feeSelection = useOnchainFeeRateSelection(networkMode)
  const { effectiveFeeRate: manualFeeRateSatPerVb, ...feeRateUi } = feeSelection
  const presetSatPerVbByLabel =
    feePresetsQuery.data ?? feeRateUi.presetSatPerVbByLabel
  const automatedFeeRateSatPerVb =
    presetSatPerVbByLabel[automationSnapshot.prefs.feePresetLabel]
  const feeRateSatPerVb = automationEnabled
    ? automatedFeeRateSatPerVb
    : manualFeeRateSatPerVb

  const unilateralExitInProgressSats = arkadeUnilateralExitInProgressSats(
    balanceQuery.data ?? { confirmedSats: 0, totalSats: 0 },
  )
  const hasInProgressExits =
    unilateralExitInProgressSats > 0 || (inProgressQuery.data?.length ?? 0) > 0

  const persistedJob = useUnilateralExitLifecyclePersistenceStore((state) => {
    if (
      activeWalletId == null ||
      activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return emptyPersistedUnilateralExitJob
    }
    return state.getJob(activeWalletId, networkMode, activeArkadeConnectionId)
  })
  const persistedJobExists = persistedUnilateralExitJobExists(persistedJob)

  const persistedFailure = useUnilateralExitFailurePersistenceStore((state) => {
    if (
      activeWalletId == null ||
      activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return null
    }
    return state.getFailure(activeWalletId, networkMode, activeArkadeConnectionId)
  })

  const jobOutpoints = useMemo(
    () =>
      resolveUnilateralExitJobOutpoints({
        lifecycleOutpoints: lifecycleSnapshot.selectedLeafOutpoints,
        persistedJob,
        fallbackOutpoints:
          persistedJobExists || lifecycleJobActive ? [] : selectedLeafOutpoints,
      }),
    [
      lifecycleJobActive,
      lifecycleSnapshot.selectedLeafOutpoints,
      persistedJob,
      persistedJobExists,
      selectedLeafOutpoints,
    ],
  )

  const exitCandidateOutpoints = useMemo(
    () =>
      (exitCandidatesQuery.data ?? []).map((row) => ({
        txid: row.txid,
        vout: row.vout,
      })),
    [exitCandidatesQuery.data],
  )

  const hasBrowsableExitTrees =
    exitCandidateOutpoints.length > 0 || hasInProgressExits

  const inProgressOutpoints = useMemo(
    () =>
      (inProgressQuery.data ?? []).map((row) => ({
        txid: row.txid,
        vout: row.vout,
      })),
    [inProgressQuery.data],
  )

  const topologyOutpoints = useMemo(
    () =>
      resolveUnilateralExitTopologyOutpoints({
        authoritativeJobOutpoints: jobOutpoints,
        selectedLeafOutpoints: jobOutpoints,
        inProgressOutpoints,
        persistedJobOutpoints: persistedJob.selectedLeafOutpoints,
      }),
    [
      inProgressOutpoints,
      jobOutpoints,
      persistedJob.selectedLeafOutpoints,
    ],
  )

  const topologyRequestOutpoints =
    topologyOutpoints.length > 0 ? topologyOutpoints : EMPTY_TOPOLOGY_OUTPOINTS

  const topologyQuery = useArkadeUnilateralExitTopologyQuery({
    enabled: topologyOutpoints.length > 0 || hasBrowsableExitTrees,
    vtxoOutpoints: topologyRequestOutpoints,
  })

  const batchEstimateQuery = useArkadeUnilateralExitBatchEstimateQuery({
    enabled: jobOutpoints.length > 0,
    vtxoOutpoints: jobOutpoints,
    feeRateSatPerVb,
  })

  const pollBumperBalanceWhileUnderfunded =
    jobOutpoints.length > 0 &&
    batchEstimateQuery.data != null &&
    !batchEstimateQuery.data.bumperSufficient
  const bumperInfoQuery = useArkadeBumperInfoQuery(true, pollBumperBalanceWhileUnderfunded)

  const machineProceeding = unilateralExitSnapshotIsProceeding(actorSnapshot)

  useEffect(() => {
    if (!isOnControlPage) return
    bumpGraphRenderEpoch()
  }, [isOnControlPage, bumpGraphRenderEpoch])

  useEffect(() => {
    if (
      activeWalletId == null ||
      activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return
    }
    if (inProgressQuery.isLoading || balanceQuery.isLoading) return

    void hydrateUnilateralExitFromPersistence({
      walletScope: {
        walletId: activeWalletId,
        networkMode,
        connectionId: activeArkadeConnectionId,
      },
      inProgressOutpoints,
      unilateralExitInProgressSats,
    })
  }, [
    activeArkadeConnectionId,
    activeWalletId,
    balanceQuery.isLoading,
    inProgressOutpoints,
    inProgressQuery.isLoading,
    networkMode,
    unilateralExitInProgressSats,
  ])

  useEffect(() => {
    if (lifecycleSnapshot.selectedLeafOutpoints.length === 0) return
    if (selectedLeafOutpoints.length > 0) return
    setSelectedLeafOutpoints(lifecycleSnapshot.selectedLeafOutpoints)
  }, [
    lifecycleSnapshot.selectedLeafOutpoints,
    selectedLeafOutpoints.length,
    setSelectedLeafOutpoints,
  ])

  useEffect(() => {
    if (!isOnControlPage) return
    if (
      activeWalletId == null ||
      activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return
    }
    void queryClient.refetchQueries({
      queryKey: arkadeUnilateralExitTopologyQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
        topologyRequestOutpoints,
      ),
    })
  }, [
    isOnControlPage,
    queryClient,
    activeWalletId,
    activeArkadeConnectionId,
    networkMode,
    topologyRequestOutpoints,
  ])

  useEffect(() => {
    if (persistedJobExists || lifecycleJobActive) return
    if (selectedLeafOutpoints.length > 0) return
    const inProgressRows = inProgressQuery.data ?? []
    if (inProgressRows.length === 0) return
    const topologyLeafOutpoints = topologyQuery.data?.leafOutpoints ?? []
    seedSelectionFromInProgress(
      inProgressRows.map((row) => ({ txid: row.txid, vout: row.vout })),
      topologyLeafOutpoints,
    )
  }, [
    inProgressQuery.data,
    persistedJobExists,
    lifecycleJobActive,
    selectedLeafOutpoints.length,
    seedSelectionFromInProgress,
    topologyQuery.data?.leafOutpoints,
  ])

  useEffect(() => {
    if (persistedFailure == null || lifecycleJobActive) {
      return
    }
    resetControlStore()
    setFocusedNodeId(null)
  }, [lifecycleJobActive, persistedFailure, resetControlStore])

  useEffect(() => {
    if (lifecycleSnapshot.phase !== UnilateralExitLifecyclePhase.Terminated) {
      return
    }
    resetControlStore()
    setFocusedNodeId(null)
  }, [lifecycleSnapshot.phase, resetControlStore])

  useEffect(() => {
    if (hasInProgressExits || lifecycleJobActive) return
    if (selectedLeafOutpoints.length === 0) return
    if (
      !unilateralExitSnapshotIsInState(actorSnapshot, UNILATERAL_EXIT_MACHINE_STATE.idle) &&
      !unilateralExitSnapshotIsInState(actorSnapshot, UNILATERAL_EXIT_MACHINE_STATE.complete)
    ) {
      return
    }

    const selectionStillActive = selectedLeafOutpoints.some(
      (outpoint) =>
        includesArkadeVtxoOutpoint(exitCandidateOutpoints, outpoint) ||
        includesArkadeVtxoOutpoint(inProgressOutpoints, outpoint),
    )

    if (!selectionStillActive) {
      clearUnilateralExitJob()
      resetControlStore()
      setFocusedNodeId(null)
      if (
        activeWalletId != null &&
        activeArkadeConnectionId != null &&
        isArkadeSupportedNetworkMode(networkMode)
      ) {
        queryClient.removeQueries({
          queryKey: arkadeUnilateralExitTopologyScopeKey(
            activeWalletId,
            networkMode,
            activeArkadeConnectionId,
          ),
        })
      }
    }
  }, [
    activeArkadeConnectionId,
    activeWalletId,
    exitCandidateOutpoints,
    hasInProgressExits,
    inProgressOutpoints,
    lifecycleJobActive,
    networkMode,
    queryClient,
    resetControlStore,
    selectedLeafOutpoints,
    actorSnapshot,
  ])

  const progress = selectUnilateralExitProgressForDisplay(actorSnapshot)
  const nodeStatuses = progress?.nodeStatuses ?? []
  const stepIndex = progress?.stepIndex ?? 0
  const wasmTotalSteps = progress?.totalSteps ?? 0
  const estimatedTotalSteps = batchEstimateQuery.data?.projectedUnrollSteps ?? 0
  const totalSteps = Math.max(wasmTotalSteps, estimatedTotalSteps)
  const batchEstimate = batchEstimateQuery.data
  const bumperLow = batchEstimate != null && !batchEstimate.bumperSufficient
  const { phase, jobActive, showStepProgress, isProceeding } = useMemo(
    () =>
      selectUnilateralExitControlJobState(actorSnapshot, {
        hasInProgressExits,
        totalSteps,
      }),
    [actorSnapshot, hasInProgressExits, totalSteps],
  )
  const proceedButton = useMemo(
    () =>
      selectUnilateralExitProceedButtonState(actorSnapshot, {
        jobOutpointsCount: jobOutpoints.length,
        automationEnabled,
        bumperLow: batchEstimate != null && !batchEstimate.bumperSufficient,
        batchEstimateLoading: batchEstimateQuery.isLoading,
        prefsHydrated: automationPrefsHydrated,
        lifecycleJobActive,
        hasInProgressExits,
        phase,
      }),
    [
      actorSnapshot,
      automationEnabled,
      automationPrefsHydrated,
      batchEstimate,
      batchEstimateQuery.isLoading,
      hasInProgressExits,
      jobOutpoints.length,
      lifecycleJobActive,
      phase,
    ],
  )
  const showAbortButton = useMemo(
    () =>
      selectCanAbortUnilateralExitOrchestration(actorSnapshot, {
        resolvedJobOutpointsCount: jobOutpoints.length,
        lifecycleJobActive,
        persistedJobExists,
        hasInProgressExits,
      }),
    [
      actorSnapshot,
      hasInProgressExits,
      jobOutpoints.length,
      lifecycleJobActive,
      persistedJobExists,
    ],
  )
  const inProgressOverlay = useMemo(
    () => selectUnilateralExitInProgressOverlay(actorSnapshot),
    [actorSnapshot],
  )
  const currentStepRelayedSinceUnix = persistedJob.currentStepRelayedSinceUnix
  const stepWaitingDurationLabel = useUnilateralExitStepWaitingClock(
    currentStepRelayedSinceUnix,
  )

  const candidates = exitCandidatesQuery.data ?? []
  const selectedTotalSats = useMemo(
    () => totalSelectedSats(jobOutpoints, candidates),
    [jobOutpoints, candidates],
  )
  const stepPackageFeeSats = useMemo(() => {
    if (batchEstimate == null || totalSteps === 0) return null
    return Math.ceil(
      (batchEstimate.estimatedPackageFeeSats / Math.max(batchEstimate.projectedUnrollSteps, 1)),
    )
  }, [batchEstimate, totalSteps])

  const walletScope = resolveActiveArkadeWalletScope()

  const handleProceedAutomaticallyChange = (enabled: boolean) => {
    if (walletScope == null) return
    if (enabled) {
      enableAutomaticUnilateralExit(
        walletScope,
        defaultMaxFeeRateSatPerVb(presetSatPerVbByLabel.High),
      )
      return
    }
    disableAutomaticUnilateralExit(walletScope)
  }

  const handleFeePresetChange = (
    preset: Parameters<typeof feeRateUi.handleSelectFeePreset>[0],
    rateSatPerVb: number,
  ) => {
    if (walletScope == null) return
    if (automationEnabled) {
      setAutomaticUnilateralExitFeePreset(walletScope, preset)
      return
    }
    feeRateUi.handleSelectFeePreset(preset, rateSatPerVb)
  }

  const handleMaxFeeRateChange = (maxFeeRateSatPerVb: number) => {
    if (walletScope == null) return
    setAutomaticUnilateralExitMaxFeeRate(walletScope, maxFeeRateSatPerVb)
  }

  const handleProceedClick = () => {
    if (proceedButton.canProceedStep) {
      void handleProceed()
      return
    }
    setStartConfirmOpen(true)
  }

  const handleAbortConfirm = () => {
    if (walletScope == null) return
    void abortUnilateralExitOrchestration(walletScope, jobOutpoints)
  }

  const handleProceed = async () => {
    if (jobOutpoints.length === 0) {
      toast.error('Select at least one exit-eligible VTXO leaf.')
      return
    }
    if (walletScope == null) return
    if (!automationPrefsHydrated) {
      toast.error('Automation settings are still loading. Try again in a moment.')
      return
    }

    try {
      if (!lifecycleJobActive) {
        if (automationEnabled) {
          enableAutomaticUnilateralExit(
            walletScope,
            defaultMaxFeeRateSatPerVb(presetSatPerVbByLabel.High),
          )
          const settled = await startAutomaticUnilateralExitAsync({
            walletScope,
            outpoints: jobOutpoints,
          })
          toastUnilateralExitSettleResult(settled, 'Automatic unilateral exit started.')
          return
        }
        const settled = await startManualUnilateralExitAsync({
          walletScope,
          outpoints: jobOutpoints,
          feeRateSatPerVb,
        })
        toastUnilateralExitSettleResult(settled, 'Unroll step submitted.')
        return
      }

      if (automationEnabled) {
        enableAutomaticUnilateralExit(
          walletScope,
          defaultMaxFeeRateSatPerVb(presetSatPerVbByLabel.High),
        )
      }
      const settled = await proceedManualUnilateralExitStep({ feeRateSatPerVb })
      if (!automationEnabled) {
        toastUnilateralExitSettleResult(settled, 'Unroll step submitted.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unroll step failed.'
      toast.error(message)
    }
  }

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Unilateral exit control" icon={ArkadeIcon} />
        <p className="text-muted-foreground">Arkade is not enabled for this network.</p>
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet/management">Back to Management</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <StartUnilateralExitConfirmModal
        open={startConfirmOpen}
        onOpenChange={setStartConfirmOpen}
        onConfirm={() => {
          void handleProceed()
        }}
      />
      <AbortUnilateralExitInfoModal
        open={abortInfoOpen}
        onOpenChange={setAbortInfoOpen}
        onContinue={() => setAbortConfirmOpen(true)}
      />
      <AbortUnilateralExitConfirmModal
        open={abortConfirmOpen}
        onOpenChange={setAbortConfirmOpen}
        onConfirm={handleAbortConfirm}
      />
      <div className="flex flex-col gap-4">
        <PageHeader
          title={hasInProgressExits ? 'Control unilateral exit' : 'Unilateral exit control'}
          icon={ArkadeIcon}
        />
        <p className="text-sm text-muted-foreground">
          <InfomodeWrapper
            infoId={ARKADE_INFOMODE_IDS.unilateralExit}
            infoComponent={ArkadeUnilateralExitInfomodeContent}
            as="span"
          >
            Tap a node to inspect it. Select leaf VTXOs for exit in the detail panel (all outpoints on a leaf move together).
          </InfomodeWrapper>
        </p>

        <UnilateralExitFailureBanner />

        {!hasBrowsableExitTrees && topologyOutpoints.length === 0 ? (
          <div
            className="flex h-[min(480px,55vh)] min-h-[320px] w-full items-center justify-center rounded-md border bg-muted/20"
            data-testid="unilateral-exit-tree-idle"
          >
            <p className="text-sm text-muted-foreground">
              No exit-eligible VTXOs right now. Board Arkade funds or sync with the operator, then
              return here to select leaves in the tree.
            </p>
          </div>
        ) : topologyQuery.isError && topologyQuery.data == null ? (
          <div
            className="flex h-[320px] min-h-[280px] w-full items-center justify-center rounded-md border bg-muted/20"
            data-testid="unilateral-exit-tree-error"
          >
            <p className="text-sm text-destructive">
              {wasmArkErrorMessage(topologyQuery.error) ??
                (topologyQuery.error instanceof Error
                  ? topologyQuery.error.message
                  : 'Failed to load exit tree.')}
            </p>
          </div>
        ) : (
          <>
            {topologyQuery.isError ? (
              <p className="text-xs text-destructive" data-testid="unilateral-exit-tree-refresh-error">
                Could not refresh exit tree. Showing the last loaded view.
              </p>
            ) : null}
            <UnilateralExitTreeGraph
              renderEpoch={graphRenderEpoch}
              topology={topologyQuery.data}
              selectedLeafOutpoints={jobOutpoints}
              nodeStatuses={nodeStatuses}
              inProgressOverlay={inProgressOverlay}
              focusedNodeId={focusedNodeId}
              onNodeFocus={setFocusedNodeId}
              onReadyToProceed={handleProceedClick}
              readyToProceedDisabled={proceedButton.disabled}
            />
          </>
        )}

        {topologyQuery.data != null && focusedNodeId != null && (
          <UnilateralExitNodeDetailCard
            topology={topologyQuery.data}
            focusedNodeId={focusedNodeId}
            nodeStatuses={nodeStatuses}
            selectedLeafOutpoints={jobOutpoints}
            onToggleLeafTxGroup={toggleLeafTxGroup}
          />
        )}

        {showStepProgress && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="unilateral-exit-step-progress"
            data-step-index={stepIndex}
            data-total-steps={totalSteps}
            data-progress-phase={phase}
            data-step-relayed={String(isCurrentStepRelayed(progress))}
          >
            Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
            {phase === 'complete' && persistedFailure == null ? ' — branch complete' : ''}
            {phase === 'waitingForParentData' && persistedFailure == null
              ? ` — ${UNILATERAL_EXIT_WAITING_FOR_PARENT_DATA_COPY}`
              : ''}
            {phase === 'ensuringBroadcast' && persistedFailure == null
              ? ' — broadcasting'
              : ''}
            {(phase === 'waiting' || stepWaitingDurationLabel != null) &&
            phase !== 'complete' &&
            phase !== 'waitingForParentData' &&
            phase !== 'ensuringBroadcast' &&
            persistedFailure == null
              ? ` — waiting for confirmation${
                  stepWaitingDurationLabel != null ? ` (${stepWaitingDurationLabel})` : ''
                }`
              : ''}
            {automationEnabled &&
            automationPausedReason == null &&
            phase !== 'complete' &&
            phase !== 'waiting' &&
            phase !== 'waitingForParentData' &&
            phase !== 'ensuringBroadcast' &&
            persistedFailure == null &&
            (lifecycleJobActive || machineProceeding || isProceeding)
              ? ' — proceeding automatically'
              : ''}
          </p>
        )}
        {unilateralExitSnapshotIsInState(actorSnapshot, UNILATERAL_EXIT_MACHINE_STATE.error) &&
        actorSnapshot.context.lastErrorMessage != null ? (
          <p
            className="text-sm text-destructive"
            data-testid="unilateral-exit-step-error"
            role="alert"
          >
            {wasmArkErrorMessage(new Error(actorSnapshot.context.lastErrorMessage)) ??
              actorSnapshot.context.lastErrorMessage}{' '}
            Click Proceed to retry this step.
          </p>
        ) : null}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">Selected leaves</p>
          {jobOutpoints.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Open a leaf node in the tree and enable &quot;Select for exit&quot; in the detail panel.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {jobOutpoints.map((outpoint) => (
                <li key={`${outpoint.txid}:${outpoint.vout}`} className="font-mono break-all">
                  {outpoint.txid}:{outpoint.vout}
                </li>
              ))}
            </ul>
          )}
          {selectedTotalSats > 0 && (
            <p className="text-sm">
              Total: <BitcoinAmountDisplay amountSats={selectedTotalSats} />
            </p>
          )}
        </div>

        <div className="rounded-md border p-4 space-y-2">
          <p className="text-sm font-medium">
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.bumperWallet}
              infoComponent={ArkadeBumperWalletInfomodeContent}
              as="span"
            >
              Bumper wallet
            </InfomodeWrapper>
          </p>
          <p className="text-sm" data-testid="unilateral-exit-bumper-balance">
            <BitcoinAmountDisplay amountSats={bumperInfoQuery.data?.balanceSats ?? 0} />
          </p>
          {bumperInfoQuery.data?.address != null && (
            <p className="font-mono text-xs break-all text-muted-foreground" data-testid="arkade-bumper-address">
              {bumperInfoQuery.data.address}
            </p>
          )}
          {bumperLow && (
            <p className="text-xs text-destructive">
              Insufficient bumper balance.{' '}
              <Link to="/wallet/send" className="underline">
                Fund bumper wallet
              </Link>
            </p>
          )}
        </div>

        <UnilateralExitAutomationSection
          proceedAutomatically={automationEnabled}
          feePresetLabel={automationSnapshot.prefs.feePresetLabel}
          maxFeeRateSatPerVb={automationSnapshot.prefs.maxFeeRateSatPerVb}
          presetSatPerVbByLabel={presetSatPerVbByLabel}
          feeEstimatesRefreshing={feePresetsQuery.isFetching || feeRateUi.feeEstimatesRefreshing}
          isPending={machineProceeding || !automationPrefsHydrated}
          pausedReason={automationPausedReason ?? undefined}
          lastErrorMessage={automationLastError ?? undefined}
          onProceedAutomaticallyChange={handleProceedAutomaticallyChange}
          onFeePresetChange={handleFeePresetChange}
          onMaxFeeRateChange={handleMaxFeeRateChange}
        />

        {!automationEnabled ? (
          <SendOnChainFeeSection
            feePresetSelection={feeRateUi.feePresetSelection}
            presetSatPerVbByLabel={feeRateUi.presetSatPerVbByLabel}
            feeEstimatesRefreshing={feeRateUi.feeEstimatesRefreshing}
            customFeeRate={feeRateUi.customFeeRate}
            useCustomFee={feeRateUi.useCustomFee}
            isPending={machineProceeding}
            onSelectPreset={feeRateUi.handleSelectFeePreset}
            setCustomFeeRate={feeRateUi.setCustomFeeRate}
            onSelectCustomMode={feeRateUi.handleSelectCustomMode}
          />
        ) : null}

        {batchEstimateQuery.isLoading && jobOutpoints.length > 0 && (
          <p className="text-xs text-muted-foreground">Estimating package fees…</p>
        )}
        {batchEstimate && jobOutpoints.length > 0 && (
          <div className="rounded-md border p-4 text-sm space-y-1" data-testid="unilateral-exit-batch-fee">
            <p>
              Batch estimate ({batchEstimate.projectedUnrollSteps} steps):{' '}
              <BitcoinAmountDisplay amountSats={batchEstimate.estimatedPackageFeeSats} />
            </p>
            {jobActive && stepPackageFeeSats != null && (
              <p className="text-xs text-muted-foreground">
                This step at {formatSatPerVbTwoDecimals(feeRateSatPerVb)} sat/vB ≈{' '}
                <BitcoinAmountDisplay amountSats={stepPackageFeeSats} />
              </p>
            )}
          </div>
        )}

        {(proceedButton.visible || showAbortButton) && (
          <div className="flex w-full flex-col gap-2 md:col-span-2 xl:col-span-3">
            {proceedButton.visible && (
              <Button
                type="button"
                className="w-full"
                data-testid="unilateral-exit-proceed"
                disabled={proceedButton.disabled}
                onClick={handleProceedClick}
              >
                {proceedButton.showSpinner && <Loader2 className="mr-2 size-4 animate-spin" />}
                {proceedButton.label}
              </Button>
            )}

            {showAbortButton && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                data-testid="unilateral-exit-abort"
                onClick={() => setAbortInfoOpen(true)}
              >
                Abort unilateral exit
              </Button>
            )}
          </div>
        )}

        <Button type="button" variant="outline" className="w-full md:col-span-2 xl:col-span-3" asChild>
          <Link to="/wallet/management">Back to Management</Link>
        </Button>
      </section>
    </div>
  )
}
