import { Link } from '@tanstack/react-router'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { ArkadeSessionGate } from '@/components/arkade/ArkadeSessionGate'
import { ArkadeUnilateralExitInfomodeContent } from '@/components/arkade/infomode/ArkadeUnilateralExitInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import { formatSatPerVbTwoDecimals } from '@/lib/esplora/esplora-fee-estimates'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import {
  formatArkadeTxidToastSnippet,
  formatMissingBlocktimeCompletionWarning,
  formatMissingBlocktimeCompletionWarningLine,
  formatUnilateralExitCompleteWaitingBanner,
} from '@/lib/arkade/arkade-exit-utils'
import { userFacingErrorMessage } from '@/lib/shared/utils'
import {
  includesArkadeVtxoOutpoint,
  type ArkadeUnilateralExitInProgressDto,
  type ArkadeVtxoExitPhase,
  type ArkadeVtxoOutpoint,
} from '@/workers/arkade-api'
import { useArkadeLoadLifecycleSnapshot } from '@/hooks/useArkadeLifecycleSnapshots'
import { useCompleteUnilateralExitFlow } from '@/hooks/useCompleteUnilateralExitFlow'
import { useVtxoExitSnapshots } from '@/hooks/useUnilateralExitLifecycleSnapshot'
import {
  formatVtxoExitPhaseCopy,
  lookupVtxoExitChildPhase,
  resolveVtxoExitPhaseForCopy,
  vtxoExitPhaseCopyFromPhase,
  type VtxoExitPhaseCopyKind,
} from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-selectors'
import type { VtxoExitChildSnapshotMap } from '@/lib/wallet/lifecycle/unilateral-exit/vtxo-exit-machine-types'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

type CompleteUnilateralExitFlow = ReturnType<typeof useCompleteUnilateralExitFlow>

interface CompleteUnilateralExitContentProps {
  exitFlow: CompleteUnilateralExitFlow
}

function completeRowPhase(
  row: { txid: string; vout: number; phase?: ArkadeVtxoExitPhase },
  snapshots: VtxoExitChildSnapshotMap,
): ArkadeVtxoExitPhase | undefined {
  return resolveVtxoExitPhaseForCopy({
    childPhase: lookupVtxoExitChildPhase(snapshots, row.txid, row.vout),
    recordPhase: row.phase,
  })
}

function completeRowPhaseSuffix(
  row: { txid: string; vout: number; phase?: ArkadeVtxoExitPhase },
  snapshots: VtxoExitChildSnapshotMap,
): string {
  const copy = formatVtxoExitPhaseCopy(vtxoExitPhaseCopyFromPhase(completeRowPhase(row, snapshots)))
  return copy !== '' ? ` · ${copy}` : ''
}

async function copyClipboardText(
  text: string,
  successMessage: string,
  failureMessage: string,
): Promise<void> {
  if (text.trim().length === 0) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error(failureMessage)
  }
}

function selectedRowsWaitingBanner(params: {
  selectedRows: ArkadeUnilateralExitInProgressDto[]
  snapshots: VtxoExitChildSnapshotMap
  timelockBlocks: number | undefined
  timelockSeconds: number | undefined
}): string | null {
  const waitingRows = params.selectedRows.filter((row) => !row.canComplete)
  if (waitingRows.length === 0) {
    return null
  }
  const waitingCopyKinds = new Set<VtxoExitPhaseCopyKind>()
  for (const row of waitingRows) {
    const copyKind = vtxoExitPhaseCopyFromPhase(completeRowPhase(row, params.snapshots))
    if (copyKind != null) {
      waitingCopyKinds.add(copyKind)
    }
  }
  return formatUnilateralExitCompleteWaitingBanner({
    waitingCopyKinds,
    timelock: {
      timelockBlocks: params.timelockBlocks,
      timelockSeconds: params.timelockSeconds,
    },
    waitingTxidSnippets: waitingRows.map((row) => formatArkadeTxidToastSnippet(row.txid)),
  })
}

function CompleteUnilateralExitInProgressList({
  rows,
  isLoading,
  selectedOutpoints,
  selectedTotalSats,
  snapshots,
  onToggleRow,
  onSelectAllReady,
}: {
  rows: ArkadeUnilateralExitInProgressDto[] | undefined
  isLoading: boolean
  selectedOutpoints: ArkadeVtxoOutpoint[]
  selectedTotalSats: number
  snapshots: VtxoExitChildSnapshotMap
  onToggleRow: (row: ArkadeUnilateralExitInProgressDto) => void
  onSelectAllReady: () => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading exits in progress…
      </div>
    )
  }
  if (rows?.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="arkade-unilateral-complete-empty">
        No unilateral exits in progress. Start an exit first, then return here after unroll.
      </p>
    )
  }

  const readyCount = (rows ?? []).filter((row) => row.canComplete).length
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {selectedOutpoints.length} selected ·{' '}
          <BitcoinAmountDisplay amountSats={selectedTotalSats} size="sm" />
        </p>
        {readyCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="arkade-unilateral-select-all-ready"
            onClick={onSelectAllReady}
          >
            Select all ready ({readyCount})
          </Button>
        )}
      </div>
      <ul className="max-h-96 space-y-2 overflow-y-auto rounded-md border p-2">
        {rows?.map((row) => (
          <li key={row.id}>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={includesArkadeVtxoOutpoint(selectedOutpoints, {
                  txid: row.txid,
                  vout: row.vout,
                })}
                onChange={() => onToggleRow(row)}
              />
              <span className="flex-1 break-all">
                <BitcoinAmountDisplay amountSats={row.amountSats} size="sm" />
                <span className="block font-mono text-xs text-muted-foreground">
                  {row.txid}:{row.vout}
                </span>
                <span
                  className="text-xs text-muted-foreground"
                  data-testid="arkade-unilateral-complete-row-phase"
                >
                  {row.virtualStatusState}
                  {completeRowPhaseSuffix(row, snapshots)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </>
  )
}

function CompleteUnilateralExitFeeDetails({
  selectedOutpointCount,
  completionFeeRateUi,
  completionFeeQuery,
  isPending,
}: {
  selectedOutpointCount: number
  completionFeeRateUi: CompleteUnilateralExitFlow['completionFeeRateUi']
  completionFeeQuery: CompleteUnilateralExitFlow['completionFeeQuery']
  isPending: boolean
}) {
  if (selectedOutpointCount === 0) {
    return null
  }
  const completionFeeEstimate = completionFeeQuery.data
  const missingBlocktimeWarning =
    completionFeeEstimate?.missingBlocktimeInputs != null &&
    completionFeeEstimate.missingBlocktimeInputs.length > 0
      ? formatMissingBlocktimeCompletionWarning(completionFeeEstimate.missingBlocktimeInputs)
      : null

  return (
    <>
      <SendOnChainFeeSection
        feePresetSelection={completionFeeRateUi.feePresetSelection}
        presetSatPerVbByLabel={completionFeeRateUi.presetSatPerVbByLabel}
        feeEstimatesRefreshing={completionFeeRateUi.feeEstimatesRefreshing}
        customFeeRate={completionFeeRateUi.customFeeRate}
        useCustomFee={completionFeeRateUi.useCustomFee}
        isPending={isPending}
        onSelectPreset={completionFeeRateUi.handleSelectFeePreset}
        setCustomFeeRate={completionFeeRateUi.setCustomFeeRate}
        onSelectCustomMode={completionFeeRateUi.handleSelectCustomMode}
      />
      {completionFeeQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Estimating completion fee…
        </div>
      )}
      {completionFeeEstimate && (
        <div
          className="space-y-1 rounded-md border bg-muted/40 p-2 text-xs"
          data-testid="arkade-unilateral-completion-fee"
        >
          <p>
            Selected total:{' '}
            <BitcoinAmountDisplay amountSats={completionFeeEstimate.selectedTotalSats} size="sm" />
          </p>
          <p>
            Estimated miner fee ({formatSatPerVbTwoDecimals(completionFeeEstimate.feeRateSatPerVb)}{' '}
            sat/vB):{' '}
            <BitcoinAmountDisplay amountSats={completionFeeEstimate.estimatedFeeSats} size="sm" />
          </p>
          <p>
            Estimated receive at destination:{' '}
            <BitcoinAmountDisplay
              amountSats={completionFeeEstimate.estimatedReceiveSats}
              size="sm"
            />
          </p>
          {completionFeeEstimate.estimateError && (
            <p className="text-amber-700 dark:text-amber-300">
              {completionFeeEstimate.estimateError}
            </p>
          )}
        </div>
      )}
      {missingBlocktimeWarning != null && (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200"
          data-testid="arkade-complete-blocktime-warning"
        >
          <p>{missingBlocktimeWarning.summary}</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {missingBlocktimeWarning.lines.map((line) => (
              <li key={`${line.virtualTxid}:${line.onChainTxid}:${line.onChainVout}`}>
                {formatMissingBlocktimeCompletionWarningLine(line)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

export function CompleteUnilateralExitContent({ exitFlow }: CompleteUnilateralExitContentProps) {
  const {
    inProgressQuery,
    bumperInfoQuery,
    completionFeeQuery,
    completionFeeRateUi,
    completeExitMutation,
    selectedInProgressOutpoints,
    selectedInProgressRows,
    selectedInProgressTotalSats,
    allSelectedCanComplete,
    completeDestination,
    setCompleteDestination,
    toggleInProgressSelection,
    selectAllReadyInProgress,
    handleCompleteExit,
  } = exitFlow
  const vtxoExitSnapshots = useVtxoExitSnapshots()
  const waitingBanner = selectedRowsWaitingBanner({
    selectedRows: selectedInProgressRows,
    snapshots: vtxoExitSnapshots,
    timelockBlocks: bumperInfoQuery.data?.unilateralExitTimelockBlocks,
    timelockSeconds: bumperInfoQuery.data?.unilateralExitTimelockSeconds,
  })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.unilateralExit}
          infoComponent={ArkadeUnilateralExitInfomodeContent}
          as="span"
        >
          Select unrolled VTXOs to sweep on-chain in one transaction after the CSV timelock. Miner
          fees are deducted from the selected VTXO proceeds.
        </InfomodeWrapper>
      </p>

      <CompleteUnilateralExitInProgressList
        rows={inProgressQuery.data}
        isLoading={inProgressQuery.isLoading}
        selectedOutpoints={selectedInProgressOutpoints}
        selectedTotalSats={selectedInProgressTotalSats}
        snapshots={vtxoExitSnapshots}
        onToggleRow={toggleInProgressSelection}
        onSelectAllReady={selectAllReadyInProgress}
      />

      {waitingBanner != null && (
        <p
          className="text-sm text-amber-700 dark:text-amber-300"
          data-testid="arkade-unilateral-complete-waiting"
        >
          {waitingBanner}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="arkade-complete-batch-destination">Destination address</Label>
        <div className="flex items-center gap-2">
          <Input
            id="arkade-complete-batch-destination"
            className="font-mono"
            value={completeDestination}
            onChange={(event) => setCompleteDestination(event.target.value)}
            autoComplete="off"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            data-testid="arkade-complete-destination-copy"
            aria-label="Copy destination address"
            disabled={completeDestination.trim().length === 0}
            onClick={() =>
              void copyClipboardText(
                completeDestination,
                'Destination address copied',
                'Failed to copy destination address',
              )
            }
          >
            <Copy className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <CompleteUnilateralExitFeeDetails
        selectedOutpointCount={selectedInProgressOutpoints.length}
        completionFeeRateUi={completionFeeRateUi}
        completionFeeQuery={completionFeeQuery}
        isPending={completeExitMutation.isPending}
      />

      {completeExitMutation.isError && (
        <p className="text-sm text-destructive" data-testid="arkade-complete-error">
          Complete exit failed:{' '}
          {userFacingErrorMessage(completeExitMutation.error) || 'Unknown error'}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet/management">Back to Management</Link>
        </Button>
        <Button
          type="button"
          disabled={
            completeExitMutation.isPending ||
            !allSelectedCanComplete ||
            completeDestination.trim().length === 0
          }
          onClick={handleCompleteExit}
        >
          {completeExitMutation.isPending ? 'Completing…' : 'Complete exit'}
        </Button>
      </div>
    </div>
  )
}

function CompleteUnilateralExitReady() {
  const exitFlow = useCompleteUnilateralExitFlow()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Complete unilateral exit" icon={ArkadeIcon} />
      <CompleteUnilateralExitContent exitFlow={exitFlow} />
    </div>
  )
}

export function CompleteUnilateralExitPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const arkadeLoadSnapshot = useArkadeLoadLifecycleSnapshot()

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Complete unilateral exit" icon={ArkadeIcon} />
        <p className="text-muted-foreground">Arkade is not enabled for this network.</p>
        <Button type="button" variant="outline" asChild>
          <Link to="/wallet/management">Back to Management</Link>
        </Button>
      </div>
    )
  }

  return (
    <ArkadeSessionGate
      loadPhase={arkadeLoadSnapshot.loadPhase}
      errorMessage={arkadeLoadSnapshot.errorMessage}
    >
      <CompleteUnilateralExitReady />
    </ArkadeSessionGate>
  )
}
