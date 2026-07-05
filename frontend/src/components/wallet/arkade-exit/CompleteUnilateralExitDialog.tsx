import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ArkadeUnilateralExitInfomodeContent } from '@/components/arkade/infomode/ArkadeUnilateralExitInfomodeContent'
import { AppModal } from '@/components/AppModal'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { unilateralExitCompleteTimelockMessage } from '@/lib/arkade/arkade-exit-utils'
import type { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'

type ExitFlow = ReturnType<typeof useArkadeExitFlow>

interface CompleteUnilateralExitDialogProps {
  exitFlow: ExitFlow
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
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

export function CompleteUnilateralExitDialog({ exitFlow }: CompleteUnilateralExitDialogProps) {
  const {
    completeUnilateralOpen,
    setCompleteUnilateralOpen,
    inProgressQuery,
    bumperInfoQuery,
    completionFeeQuery,
    completeExitMutation,
    selectedInProgressTxids,
    selectedInProgressRows,
    selectedInProgressTotalSats,
    allSelectedCanComplete,
    completeDestination,
    setCompleteDestination,
    toggleInProgressSelection,
    selectAllReadyInProgress,
    handleCompleteExit,
  } = exitFlow

  const readyCount = (inProgressQuery.data ?? []).filter((row) => row.canComplete).length
  const waitingRows = selectedInProgressRows.filter((row) => !row.canComplete)
  const completionFeeEstimate = completionFeeQuery.data

  const footer = () => (
    <>
      <Button type="button" variant="outline" onClick={() => setCompleteUnilateralOpen(false)}>
        Cancel
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
    </>
  )

  return (
    <AppModal
      isOpen={completeUnilateralOpen}
      onOpenChange={setCompleteUnilateralOpen}
      onCancel={() => setCompleteUnilateralOpen(false)}
      title={
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.unilateralExit}
          infoComponent={ArkadeUnilateralExitInfomodeContent}
          as="span"
        >
          Complete unilateral exit
        </InfomodeWrapper>
      }
      contentClassName="sm:max-w-lg max-h-[90vh] overflow-y-auto"
      footer={footer}
      footerClassName="justify-end gap-2"
    >
      <div className="space-y-3">
        <DialogDescription>
          Select unrolled VTXOs to sweep on-chain in one transaction after the CSV timelock. Miner
          fees are deducted from the selected VTXO proceeds.
        </DialogDescription>

        {inProgressQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading exits in progress…
          </div>
        ) : inProgressQuery.data?.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="arkade-unilateral-complete-empty"
          >
            No unilateral exits in progress. Start an exit first, then return here after unroll.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {selectedInProgressTxids.length} selected ·{' '}
                <BitcoinAmountDisplay amountSats={selectedInProgressTotalSats} size="sm" />
              </p>
              {readyCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="arkade-unilateral-select-all-ready"
                  onClick={selectAllReadyInProgress}
                >
                  Select all ready ({readyCount})
                </Button>
              )}
            </div>
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
              {inProgressQuery.data?.map((row) => (
                <li key={row.id}>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedInProgressTxids.includes(row.txid)}
                      onChange={() => toggleInProgressSelection(row)}
                    />
                    <span className="flex-1 break-all">
                      <BitcoinAmountDisplay amountSats={row.amountSats} size="sm" />
                      <span className="block font-mono text-xs text-muted-foreground">
                        {row.txid}:{row.vout}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.virtualStatusState}
                        {row.canComplete ? ' · ready to complete' : ' · waiting for timelock'}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {waitingRows.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-300" data-testid="arkade-unilateral-complete-waiting">
            {unilateralExitCompleteTimelockMessage(
              {
                timelockBlocks: bumperInfoQuery.data?.unilateralExitTimelockBlocks,
                timelockSeconds: bumperInfoQuery.data?.unilateralExitTimelockSeconds,
              },
              false,
            )}{' '}
            Waiting: {waitingRows.map((row) => `${row.txid.slice(0, 8)}…`).join(', ')}
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

        {selectedInProgressTxids.length > 0 && completionFeeQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Estimating completion fee…
          </div>
        )}
        {completionFeeEstimate && selectedInProgressTxids.length > 0 && (
          <div
            className="rounded-md border bg-muted/40 p-2 text-xs space-y-1"
            data-testid="arkade-unilateral-completion-fee"
          >
            <p>
              Selected total:{' '}
              <BitcoinAmountDisplay amountSats={completionFeeEstimate.selectedTotalSats} size="sm" />
            </p>
            <p>
              Estimated miner fee ({completionFeeEstimate.feeRateSatPerVb} sat/vB):{' '}
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

        {completeExitMutation.isError && (
          <p className="text-sm text-destructive" data-testid="arkade-complete-error">
            Complete exit failed: {errorMessage(completeExitMutation.error)}
          </p>
        )}
      </div>
    </AppModal>
  )
}
