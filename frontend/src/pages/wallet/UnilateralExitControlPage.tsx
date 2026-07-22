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
import { UnilateralExitTreeGraph } from '@/components/wallet/unilateral-exit/UnilateralExitTreeGraph'
import { UnilateralExitNodeDetailCard } from '@/components/wallet/unilateral-exit/UnilateralExitNodeDetailCard'
import {
  useArkadeBalanceQuery,
  useArkadeBumperInfoQuery,
  useArkadeExitCandidatesQuery,
  useArkadeProceedUnilateralExitStepMutation,
  useArkadeUnilateralExitBatchEstimateQuery,
  useArkadeUnilateralExitProgressQuery,
  useArkadeUnilateralExitTopologyQuery,
  useArkadeUnilateralExitsInProgressQuery,
} from '@/hooks/useArkadeQueries'
import { useOnchainFeeRateSelection } from '@/hooks/useOnchainFeeRateSelection'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { arkadeUnilateralExitInProgressSats } from '@/lib/arkade/arkade-balance-display'
import { formatSatPerVbTwoDecimals } from '@/lib/esplora/esplora-fee-estimates'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'
import { useUnilateralExitControlStore } from '@/stores/unilateralExitControlStore'
import {
  arkadeUnilateralExitProgressQueryKey,
  arkadeUnilateralExitTopologyQueryKey,
} from '@/lib/arkade/arkade-query-keys'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeVtxoOutpoint } from '@/workers/arkade-api'
import { sortArkadeVtxoOutpoints } from '@/workers/arkade-api'

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

  const selectedLeafOutpoints = useUnilateralExitControlStore(
    (state) => state.selectedLeafOutpoints,
  )
  const jobStarted = useUnilateralExitControlStore((state) => state.jobStarted)
  const toggleLeafOutpoint = useUnilateralExitControlStore((state) => state.toggleLeafOutpoint)
  const setSelectedLeafOutpoints = useUnilateralExitControlStore(
    (state) => state.setSelectedLeafOutpoints,
  )
  const setJobStarted = useUnilateralExitControlStore((state) => state.setJobStarted)
  const bumpGraphRenderEpoch = useUnilateralExitControlStore(
    (state) => state.bumpGraphRenderEpoch,
  )
  const graphRenderEpoch = useUnilateralExitControlStore((state) => state.graphRenderEpoch)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  const isOnControlPage = useRouterState({
    select: (routerState) =>
      routerState.location.pathname === '/wallet/arkade/unilateral-exit',
  })

  const feeSelection = useOnchainFeeRateSelection(networkMode)
  const { effectiveFeeRate: feeRateSatPerVb, ...feeRateUi } = feeSelection

  const unilateralExitInProgressSats = arkadeUnilateralExitInProgressSats(
    balanceQuery.data ?? { confirmedSats: 0, totalSats: 0 },
  )
  const hasInProgressExits =
    unilateralExitInProgressSats > 0 || (inProgressQuery.data?.length ?? 0) > 0

  const topologyQuery = useArkadeUnilateralExitTopologyQuery({
    enabled: true,
    vtxoOutpoints: [],
  })

  const batchEstimateQuery = useArkadeUnilateralExitBatchEstimateQuery({
    enabled: selectedLeafOutpoints.length > 0,
    vtxoOutpoints: selectedLeafOutpoints,
    feeRateSatPerVb,
  })

  const progressQuery = useArkadeUnilateralExitProgressQuery({
    enabled:
      isOnControlPage &&
      (jobStarted || hasInProgressExits) &&
      selectedLeafOutpoints.length > 0,
    vtxoOutpoints: selectedLeafOutpoints,
  })

  useEffect(() => {
    if (!isOnControlPage) return
    bumpGraphRenderEpoch()
  }, [isOnControlPage, bumpGraphRenderEpoch])

  useEffect(() => {
    if (!isOnControlPage) return
    if (
      activeWalletId == null ||
      activeArkadeConnectionId == null ||
      !isArkadeSupportedNetworkMode(networkMode)
    ) {
      return
    }
    const sortedOutpoints = sortArkadeVtxoOutpoints(selectedLeafOutpoints)
    void queryClient.refetchQueries({
      queryKey: arkadeUnilateralExitTopologyQueryKey(
        activeWalletId,
        networkMode,
        activeArkadeConnectionId,
        [],
      ),
    })
    if (sortedOutpoints.length > 0) {
      void queryClient.refetchQueries({
        queryKey: arkadeUnilateralExitProgressQueryKey(
          activeWalletId,
          networkMode,
          activeArkadeConnectionId,
          sortedOutpoints,
        ),
      })
    }
  }, [
    isOnControlPage,
    queryClient,
    activeWalletId,
    activeArkadeConnectionId,
    networkMode,
    selectedLeafOutpoints,
  ])

  useEffect(() => {
    if (selectedLeafOutpoints.length > 0) return
    const inProgressRows = inProgressQuery.data ?? []
    if (inProgressRows.length === 0) return
    setSelectedLeafOutpoints(
      inProgressRows.map((row) => ({ txid: row.txid, vout: row.vout })),
    )
    setJobStarted(true)
  }, [
    inProgressQuery.data,
    selectedLeafOutpoints.length,
    setSelectedLeafOutpoints,
    setJobStarted,
  ])

  const proceedMutation = useArkadeProceedUnilateralExitStepMutation()

  const candidates = exitCandidatesQuery.data ?? []
  const batchEstimate = batchEstimateQuery.data
  const progress = progressQuery.data
  const nodeStatuses = progress?.nodeStatuses ?? proceedMutation.data?.nodeStatuses ?? []
  const stepIndex = progress?.stepIndex ?? proceedMutation.data?.stepIndex ?? 0
  const totalSteps = progress?.totalSteps ?? proceedMutation.data?.totalSteps ?? 0
  const phase = progress?.phase ?? proceedMutation.data?.phase ?? 'idle'
  const currentStepWaitingSince =
    progress?.currentStepWaitingSince ?? proceedMutation.data?.currentStepWaitingSince
  const jobActive = jobStarted || hasInProgressExits || phase !== 'idle'
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
  const bumperLow = batchEstimate != null && !batchEstimate.bumperSufficient

  const selectedTotalSats = useMemo(
    () => totalSelectedSats(selectedLeafOutpoints, candidates),
    [selectedLeafOutpoints, candidates],
  )

  const stepPackageFeeSats = useMemo(() => {
    if (batchEstimate == null || totalSteps === 0) return null
    return Math.ceil(
      (batchEstimate.estimatedPackageFeeSats / Math.max(batchEstimate.projectedUnrollSteps, 1)),
    )
  }, [batchEstimate, totalSteps])

  const handleProceed = async () => {
    if (selectedLeafOutpoints.length === 0) {
      toast.error('Select at least one exit-eligible VTXO leaf.')
      return
    }
    try {
      setJobStarted(true)
      await proceedMutation.mutateAsync({
        vtxoOutpoints: selectedLeafOutpoints,
        feeRateSatPerVb,
        amountSats: selectedTotalSats,
      })
      toast.success('Unroll step submitted.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unroll step failed.')
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
            Tap a node to inspect it. Select leaf VTXOs for exit in the detail panel below the tree.
          </InfomodeWrapper>
        </p>

        {topologyQuery.isError ? (
          <div
            className="flex h-[320px] min-h-[280px] w-full items-center justify-center rounded-md border bg-muted/20"
            data-testid="unilateral-exit-tree-error"
          >
            <p className="text-sm text-destructive">
              {topologyQuery.error instanceof Error
                ? topologyQuery.error.message
                : 'Failed to load exit tree.'}
            </p>
          </div>
        ) : (
          <UnilateralExitTreeGraph
            renderEpoch={graphRenderEpoch}
            topology={topologyQuery.data}
            selectedLeafOutpoints={selectedLeafOutpoints}
            nodeStatuses={nodeStatuses}
            focusedNodeId={focusedNodeId}
            onNodeFocus={setFocusedNodeId}
          />
        )}

        {topologyQuery.data != null && focusedNodeId != null && (
          <UnilateralExitNodeDetailCard
            topology={topologyQuery.data}
            focusedNodeId={focusedNodeId}
            nodeStatuses={nodeStatuses}
            exitCandidates={candidates}
            selectedLeafOutpoints={selectedLeafOutpoints}
            onToggleLeaf={toggleLeafOutpoint}
          />
        )}

        {jobActive && totalSteps > 0 && (
          <p className="text-sm text-muted-foreground" data-testid="unilateral-exit-step-progress">
            Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
            {phase === 'complete' ? ' — branch complete' : ''}
            {stepWaitingDurationLabel != null
              ? ` — waiting for confirmation (${stepWaitingDurationLabel})`
              : ''}
          </p>
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">Selected leaves</p>
          {selectedLeafOutpoints.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Open a leaf node in the tree and enable &quot;Select for exit&quot; in the detail panel.
            </p>
          ) : (
            <ul className="space-y-1 text-xs">
              {selectedLeafOutpoints.map((outpoint) => (
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

        <SendOnChainFeeSection
          feePresetSelection={feeRateUi.feePresetSelection}
          presetSatPerVbByLabel={feeRateUi.presetSatPerVbByLabel}
          feeEstimatesRefreshing={feeRateUi.feeEstimatesRefreshing}
          customFeeRate={feeRateUi.customFeeRate}
          useCustomFee={feeRateUi.useCustomFee}
          isPending={proceedMutation.isPending}
          onSelectPreset={feeRateUi.handleSelectFeePreset}
          setCustomFeeRate={feeRateUi.setCustomFeeRate}
          onSelectCustomMode={feeRateUi.handleSelectCustomMode}
        />

        {batchEstimateQuery.isLoading && selectedLeafOutpoints.length > 0 && (
          <p className="text-xs text-muted-foreground">Estimating package fees…</p>
        )}
        {batchEstimate && selectedLeafOutpoints.length > 0 && (
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

        <Button
          type="button"
          className="w-full"
          data-testid="unilateral-exit-proceed"
          disabled={
            selectedLeafOutpoints.length === 0 ||
            bumperLow ||
            proceedMutation.isPending ||
            batchEstimateQuery.isLoading ||
            phase === 'complete'
          }
          onClick={handleProceed}
        >
          {proceedMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {jobActive ? 'Proceed' : 'Start unroll'}
        </Button>

        <Button type="button" variant="outline" className="w-full md:col-span-2 xl:col-span-3" asChild>
          <Link to="/wallet/management">Back to Management</Link>
        </Button>
      </section>
    </div>
  )
}
