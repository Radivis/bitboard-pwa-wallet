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
import { StartUnilateralExitConfirmModal } from '@/components/wallet/unilateral-exit/StartUnilateralExitConfirmModal'
import { UnilateralExitTreeGraph } from '@/components/wallet/unilateral-exit/UnilateralExitTreeGraph'
import { UnilateralExitNodeDetailCard } from '@/components/wallet/unilateral-exit/UnilateralExitNodeDetailCard'
import {
  useArkadeBalanceQuery,
  useArkadeBumperInfoQuery,
  useArkadeExitCandidatesQuery,
  useArkadeUnilateralExitBatchEstimateQuery,
  useArkadeUnilateralExitProgressQuery,
  useArkadeUnilateralExitTopologyQuery,
  useArkadeUnilateralExitsInProgressQuery,
} from '@/hooks/useArkadeQueries'
import { useEsploraFeePresets } from '@/hooks/useEsploraFeePresets'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import { usePersistedStoreHydrated } from '@/hooks/usePersistedStoreHydrated'
import {
  useIsUnilateralExitJobActive,
  useUnilateralExitLifecycleSnapshot,
} from '@/hooks/useUnilateralExitLifecycleSnapshot'
import { useUnilateralExitAutomationSnapshot } from '@/hooks/useUnilateralExitAutomationSnapshot'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { arkadeUnilateralExitInProgressSats } from '@/lib/arkade/arkade-balance-display'
import { defaultMaxFeeRateSatPerVb } from '@/lib/arkade/unilateral-exit-automation-fees'
import { resolveUnilateralExitTopologyOutpoints } from '@/lib/arkade/unilateral-exit-topology'
import { wasmArkErrorMessage } from '@/lib/shared/wasm-ark-error'
import { formatSatPerVbTwoDecimals } from '@/lib/esplora/esplora-fee-estimates'
import {
  disableAutomaticUnilateralExit,
  enableAutomaticUnilateralExit,
  kickAutomaticUnilateralExitAdvance,
  pauseAutomaticUnilateralExitOnError,
  scheduleAutomaticAdvance,
  setAutomaticUnilateralExitFeePreset,
  setAutomaticUnilateralExitMaxFeeRate,
} from '@/lib/wallet/lifecycle/unilateral-exit-automation-controller'
import { useUnilateralExitAutomationPrefsStore } from '@/lib/wallet/lifecycle/unilateral-exit-automation-prefs-persistence'
import {
  hydrateUnilateralExitJobFromPersistence,
  orchestrateUnilateralExitClearJob,
  orchestrateUnilateralExitPrepareStart,
  orchestrateUnilateralExitProceedStep,
  orchestrateUnilateralExitStart,
} from '@/lib/wallet/lifecycle/unilateral-exit-lifecycle-orchestrator'
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

function formatStepWaitingDuration(elapsedSeconds: number): string {
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }
  if (elapsedSeconds < 3_600) {
    const minutes = Math.floor(elapsedSeconds / 60)
    const seconds = elapsedSeconds % 60
    return `${minutes}m ${seconds}s`
  }
  const hours = Math.floor(elapsedSeconds / 3_600)
  const minutes = Math.floor((elapsedSeconds % 3_600) / 60)
  const seconds = elapsedSeconds % 60
  return `${hours}h ${minutes}m ${seconds}s`
}

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
  const bumperInfoQuery = useArkadeBumperInfoQuery(true)
  const feePresetsQuery = useEsploraFeePresets(networkMode)
  const lifecycleSnapshot = useUnilateralExitLifecycleSnapshot()
  const automationSnapshot = useUnilateralExitAutomationSnapshot()
  const lifecycleJobActive = useIsUnilateralExitJobActive()
  const automationPrefsHydrated = usePersistedStoreHydrated(useUnilateralExitAutomationPrefsStore)

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
  const [proceedPending, setProceedPending] = useState(false)

  const proceedAutomatically = automationSnapshot.prefs.enabled
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
  const feeRateSatPerVb = proceedAutomatically
    ? automatedFeeRateSatPerVb
    : manualFeeRateSatPerVb

  const unilateralExitInProgressSats = arkadeUnilateralExitInProgressSats(
    balanceQuery.data ?? { confirmedSats: 0, totalSats: 0 },
  )
  const hasInProgressExits =
    unilateralExitInProgressSats > 0 || (inProgressQuery.data?.length ?? 0) > 0

  const jobOutpoints =
    lifecycleSnapshot.selectedLeafOutpoints.length > 0
      ? lifecycleSnapshot.selectedLeafOutpoints
      : selectedLeafOutpoints

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

  const persistedJobActiveForTopology =
    lifecycleJobActive && lifecycleSnapshot.selectedLeafOutpoints.length > 0

  const topologyOutpoints = useMemo(
    () =>
      resolveUnilateralExitTopologyOutpoints({
        selectedLeafOutpoints: jobOutpoints,
        inProgressOutpoints,
        persistedJobOutpoints: lifecycleSnapshot.selectedLeafOutpoints,
        persistedJobStarted: persistedJobActiveForTopology,
      }),
    [
      inProgressOutpoints,
      jobOutpoints,
      lifecycleSnapshot.selectedLeafOutpoints,
      persistedJobActiveForTopology,
    ],
  )

  const topologyRequestOutpoints =
    topologyOutpoints.length > 0 ? topologyOutpoints : []

  const topologyQuery = useArkadeUnilateralExitTopologyQuery({
    enabled: topologyOutpoints.length > 0 || hasBrowsableExitTrees,
    vtxoOutpoints: topologyRequestOutpoints,
  })

  const batchEstimateQuery = useArkadeUnilateralExitBatchEstimateQuery({
    enabled: jobOutpoints.length > 0,
    vtxoOutpoints: jobOutpoints,
    feeRateSatPerVb,
  })

  const trackingExitProgress =
    (lifecycleJobActive ||
      hasInProgressExits ||
      proceedPending ||
      lifecycleSnapshot.phase === 'advancing' ||
      lifecycleSnapshot.phase === 'waiting-confirm') &&
    jobOutpoints.length > 0

  const progressQuery = useArkadeUnilateralExitProgressQuery({
    enabled: trackingExitProgress && isOnControlPage,
    vtxoOutpoints: jobOutpoints,
    unilateralExitJobActive: lifecycleJobActive,
  })

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

    void hydrateUnilateralExitJobFromPersistence({
      walletScope: {
        walletId: activeWalletId,
        networkMode,
        connectionId: activeArkadeConnectionId,
      },
      inProgressOutpoints,
      unilateralExitInProgressSats,
    }).then(() => {
      if (automationSnapshot.prefs.enabled) {
        scheduleAutomaticAdvance()
      }
    })
  }, [
    activeArkadeConnectionId,
    activeWalletId,
    automationSnapshot.prefs.enabled,
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
    selectedLeafOutpoints.length,
    seedSelectionFromInProgress,
    topologyQuery.data?.leafOutpoints,
  ])

  useEffect(() => {
    if (hasInProgressExits || lifecycleJobActive) return
    if (selectedLeafOutpoints.length === 0) return

    const selectionStillActive = selectedLeafOutpoints.some(
      (outpoint) =>
        includesArkadeVtxoOutpoint(exitCandidateOutpoints, outpoint) ||
        includesArkadeVtxoOutpoint(inProgressOutpoints, outpoint),
    )

    if (!selectionStillActive) {
      orchestrateUnilateralExitClearJob()
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
  ])

  const progress =
    progressQuery.data ??
    (lifecycleJobActive || hasInProgressExits || proceedPending
      ? lifecycleSnapshot.progress
      : null)
  const nodeStatuses = progress?.nodeStatuses ?? []
  const stepIndex = progress?.stepIndex ?? 0
  const wasmTotalSteps = progress?.totalSteps ?? 0
  const estimatedTotalSteps = batchEstimateQuery.data?.projectedUnrollSteps ?? 0
  const totalSteps = wasmTotalSteps > 0 ? wasmTotalSteps : estimatedTotalSteps
  const wasmPhase = progress?.phase ?? 'idle'
  const lifecyclePhase = lifecycleJobActive ? lifecycleSnapshot.phase : 'idle'
  const phaseFromProgress =
    wasmPhase === 'complete' || lifecyclePhase === 'complete' ? 'complete' : wasmPhase
  const exitJobInFlight =
    lifecycleJobActive ||
    hasInProgressExits ||
    proceedPending ||
    lifecycleSnapshot.phase === 'advancing' ||
    lifecycleSnapshot.phase === 'waiting-confirm'
  const phase =
    !hasInProgressExits && !exitJobInFlight
      ? 'idle'
      : lifecycleSnapshot.phase === 'advancing' && progress == null
        ? 'advancing'
        : phaseFromProgress
  const currentStepWaitingSince = progress?.currentStepWaitingSince
  const jobActive = lifecycleJobActive || hasInProgressExits || proceedPending
  const showStepProgress = exitJobInFlight && totalSteps > 0
  const automationRunning =
    proceedAutomatically &&
    (proceedPending ||
      lifecycleSnapshot.phase === 'advancing' ||
      lifecycleSnapshot.phase === 'waiting-confirm')

  const proceedBlocksUi =
    proceedPending && phase !== 'waiting' && currentStepWaitingSince == null

  const canProceedStep = jobActive && phase !== 'complete'
  const [nowUnixSeconds, setNowUnixSeconds] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (currentStepWaitingSince == null) {
      return
    }
    setNowUnixSeconds(Math.floor(Date.now() / 1000))
    const timerId = window.setInterval(() => {
      setNowUnixSeconds(Math.floor(Date.now() / 1000))
    }, 1_000)
    return () => window.clearInterval(timerId)
  }, [currentStepWaitingSince])

  const stepWaitingDurationLabel = useMemo(() => {
    if (currentStepWaitingSince == null) {
      return null
    }
    const elapsedSeconds = Math.max(0, nowUnixSeconds - currentStepWaitingSince)
    return formatStepWaitingDuration(elapsedSeconds)
  }, [currentStepWaitingSince, nowUnixSeconds])

  const candidates = exitCandidatesQuery.data ?? []
  const batchEstimate = batchEstimateQuery.data
  const bumperLow = batchEstimate != null && !batchEstimate.bumperSufficient
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

  const walletScope =
    activeWalletId != null &&
    activeArkadeConnectionId != null &&
    isArkadeSupportedNetworkMode(networkMode)
      ? {
          walletId: activeWalletId,
          networkMode,
          connectionId: activeArkadeConnectionId,
        }
      : null

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
    if (proceedAutomatically) {
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
    if (canProceedStep) {
      void handleProceed()
      return
    }
    setStartConfirmOpen(true)
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

    setProceedPending(true)
    try {
      if (!lifecycleJobActive) {
        if (proceedAutomatically) {
          enableAutomaticUnilateralExit(
            walletScope,
            defaultMaxFeeRateSatPerVb(presetSatPerVbByLabel.High),
          )
          orchestrateUnilateralExitPrepareStart({
            walletScope,
            outpoints: jobOutpoints,
          })
          scheduleAutomaticAdvance()
          kickAutomaticUnilateralExitAdvance()
          toast.success('Automatic unilateral exit started.')
          return
        }
        await orchestrateUnilateralExitStart({
          walletScope,
          outpoints: jobOutpoints,
          feeRateSatPerVb,
        })
        toast.success('Unroll step submitted.')
        return
      }

      await orchestrateUnilateralExitProceedStep({ feeRateSatPerVb })
      if (!proceedAutomatically) {
        toast.success('Unroll step submitted.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unroll step failed.'
      if (proceedAutomatically && walletScope != null) {
        pauseAutomaticUnilateralExitOnError(message)
      }
      toast.error(message)
    } finally {
      setProceedPending(false)
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
              focusedNodeId={focusedNodeId}
              onNodeFocus={setFocusedNodeId}
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
          >
            Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
            {phase === 'complete' ? ' — branch complete' : ''}
            {(phase === 'waiting' || stepWaitingDurationLabel != null) &&
            phase !== 'complete'
              ? ` — waiting for confirmation${
                  stepWaitingDurationLabel != null ? ` (${stepWaitingDurationLabel})` : ''
                }`
              : ''}
            {proceedAutomatically &&
            automationPausedReason == null &&
            phase !== 'complete' &&
            (lifecycleJobActive || proceedPending || lifecycleSnapshot.phase === 'advancing')
              ? ' — proceeding automatically'
              : ''}
          </p>
        )}
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
          proceedAutomatically={proceedAutomatically}
          feePresetLabel={automationSnapshot.prefs.feePresetLabel}
          maxFeeRateSatPerVb={automationSnapshot.prefs.maxFeeRateSatPerVb}
          presetSatPerVbByLabel={presetSatPerVbByLabel}
          feeEstimatesRefreshing={feePresetsQuery.isFetching || feeRateUi.feeEstimatesRefreshing}
          isPending={proceedPending || !automationPrefsHydrated}
          pausedReason={automationPausedReason ?? undefined}
          lastErrorMessage={automationLastError ?? undefined}
          onProceedAutomaticallyChange={handleProceedAutomaticallyChange}
          onFeePresetChange={handleFeePresetChange}
          onMaxFeeRateChange={handleMaxFeeRateChange}
        />

        {!proceedAutomatically ? (
          <SendOnChainFeeSection
            feePresetSelection={feeRateUi.feePresetSelection}
            presetSatPerVbByLabel={feeRateUi.presetSatPerVbByLabel}
            feeEstimatesRefreshing={feeRateUi.feeEstimatesRefreshing}
            customFeeRate={feeRateUi.customFeeRate}
            useCustomFee={feeRateUi.useCustomFee}
            isPending={proceedPending}
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

        {(jobActive || jobOutpoints.length > 0) &&
          (!proceedAutomatically || !lifecycleJobActive || automationRunning) && (
          <Button
            type="button"
            className="w-full"
            data-testid="unilateral-exit-proceed"
            disabled={
              !automationPrefsHydrated ||
              jobOutpoints.length === 0 ||
              bumperLow ||
              proceedBlocksUi ||
              (canProceedStep && batchEstimateQuery.isLoading) ||
              phase === 'complete' ||
              automationRunning
            }
            onClick={handleProceedClick}
          >
            {proceedBlocksUi && <Loader2 className="mr-2 size-4 animate-spin" />}
            {automationRunning
              ? 'Running automatically…'
              : proceedAutomatically && lifecycleJobActive && automationPausedReason == null
                ? 'Running automatically…'
                : canProceedStep
                  ? 'Proceed'
                  : 'Start unroll'}
          </Button>
        )}

        <Button type="button" variant="outline" className="w-full md:col-span-2 xl:col-span-3" asChild>
          <Link to="/wallet/management">Back to Management</Link>
        </Button>
      </section>
    </div>
  )
}
