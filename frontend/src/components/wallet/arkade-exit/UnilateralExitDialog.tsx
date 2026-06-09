import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { ArkadeBumperWalletInfomodeContent } from '@/components/arkade/infomode/ArkadeBumperWalletInfomodeContent'
import { ArkadeUnilateralExitInfomodeContent } from '@/components/arkade/infomode/ArkadeUnilateralExitInfomodeContent'
import { ArkadeUnrollInfomodeContent } from '@/components/arkade/infomode/ArkadeUnrollInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'

type ExitFlow = ReturnType<typeof useArkadeExitFlow>

interface UnilateralExitDialogProps {
  exitFlow: ExitFlow
}

export function UnilateralExitDialog({ exitFlow }: UnilateralExitDialogProps) {
  const {
    unilateralOpen,
    setUnilateralOpen,
    unilateralStep,
    setUnilateralStep,
    selectedCandidate,
    unrollProgress,
    unrolledVtxoTxid,
    completeDestination,
    setCompleteDestination,
    exitCandidatesQuery,
    bumperInfoQuery,
    unilateralFeeQuery,
    unrollMutation,
    completeExitMutation,
    bumperBalance,
    unilateralFeeEstimate,
    bumperLow,
    handleStartUnroll,
    handleCompleteExit,
    skipToComplete,
    selectCandidate,
  } = exitFlow

  return (
    <Dialog open={unilateralOpen} onOpenChange={setUnilateralOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.unilateralExit}
              infoComponent={ArkadeUnilateralExitInfomodeContent}
              as="span"
            >
              Unilateral exit
            </InfomodeWrapper>
          </DialogTitle>
          <DialogDescription>
            Exit without the operator by unrolling the VTXO chain on-chain, then completing after
            the timelock. Requires on-chain fees on the bumper wallet below.
          </DialogDescription>
        </DialogHeader>

        {unilateralStep === 'select' && (
          <div className="space-y-3">
            {exitCandidatesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading VTXOs…
              </div>
            ) : exitCandidatesQuery.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recoverable VTXOs found for unilateral exit.
              </p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
                {exitCandidatesQuery.data?.map((row) => (
                  <li key={row.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="arkade-exit-vtxo"
                        className="mt-1"
                        checked={selectedCandidate?.id === row.id}
                        disabled={!row.canStartUnroll && !row.canComplete}
                        onChange={() => selectCandidate(row)}
                      />
                      <span className="flex-1 break-all">
                        <BitcoinAmountDisplay amountSats={row.amountSats} size="sm" />
                        <span className="block font-mono text-xs text-muted-foreground">
                          {row.txid}:{row.vout}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.virtualStatusState}
                          {row.isUnrolled ? ' · unrolled' : ''}
                          {row.canComplete ? ' · ready to complete' : ''}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {bumperInfoQuery.data && (
              <div className="rounded-md border bg-muted/40 p-2 text-xs space-y-1">
                <p className="font-medium">
                  <InfomodeWrapper
                    infoId={ARKADE_INFOMODE_IDS.bumperWallet}
                    infoComponent={ArkadeBumperWalletInfomodeContent}
                    as="span"
                  >
                    Bumper wallet (P2A fees)
                  </InfomodeWrapper>
                </p>
                <p className="break-all font-mono">{bumperInfoQuery.data.address}</p>
                <p>
                  Balance: <BitcoinAmountDisplay amountSats={bumperBalance} size="sm" />
                </p>
                {selectedCandidate != null && unilateralFeeQuery.isLoading && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    Estimating unroll fees…
                  </div>
                )}
                {selectedCandidate != null && unilateralFeeQuery.isError && (
                  <p className="text-destructive">
                    Could not estimate unroll fees. Check operator and esplora connectivity.
                  </p>
                )}
                {selectedCandidate != null && unilateralFeeEstimate && (
                  <div className="space-y-1 pt-1 border-t border-border/60">
                    <p>
                      ~{unilateralFeeEstimate.projectedUnrollSteps} on-chain package
                      {unilateralFeeEstimate.projectedUnrollSteps === 1 ? '' : 's'}
                      {unilateralFeeEstimate.projectedWaitSteps > 0
                        ? ` (+${unilateralFeeEstimate.projectedWaitSteps} confirmation wait${
                            unilateralFeeEstimate.projectedWaitSteps === 1 ? '' : 's'
                          })`
                        : ''}
                    </p>
                    <p>
                      At {unilateralFeeEstimate.feeRateSatPerVb} sat/vB, ensure bumper has ≥{' '}
                      <BitcoinAmountDisplay
                        amountSats={unilateralFeeEstimate.estimatedPackageFeeSats}
                        size="sm"
                      />{' '}
                      (lower-bound estimate).
                    </p>
                    {unilateralFeeEstimate.estimateError && (
                      <p className="text-amber-700 dark:text-amber-300">
                        {unilateralFeeEstimate.estimateError}
                      </p>
                    )}
                  </div>
                )}
                {bumperLow && (
                  <p className="mt-1 text-amber-700 dark:text-amber-300">
                    Insufficient bumper balance for estimated unroll fees. Send on-chain BTC to this
                    address before unrolling.{' '}
                    <Link to="/wallet/send" className="underline">
                      On-chain send
                    </Link>
                  </p>
                )}
              </div>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setUnilateralOpen(false)}>
                Cancel
              </Button>
              {selectedCandidate?.canComplete ? (
                <Button type="button" onClick={skipToComplete}>
                  Skip to complete
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={
                    selectedCandidate == null ||
                    !selectedCandidate.canStartUnroll ||
                    bumperLow
                  }
                  onClick={handleStartUnroll}
                >
                  Start unroll
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {unilateralStep === 'unroll' && (
          <div className="space-y-3">
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.unroll}
              infoComponent={ArkadeUnrollInfomodeContent}
              as="span"
            >
              <p className="text-sm text-muted-foreground">
                Unrolling {selectedCandidate?.txid}:{selectedCandidate?.vout}. Keep this dialog open
                until finished.
              </p>
            </InfomodeWrapper>
            {unrollMutation.isPending && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Working…
              </div>
            )}
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {unrollProgress.map((entry, index) => (
                <li key={`${entry.type}-${entry.txid ?? index}`} className="text-muted-foreground">
                  {entry.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {unilateralStep === 'complete' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              After the CSV timelock expires, complete the exit to receive funds on-chain. A
              separate on-chain transaction fee applies when completing.
            </p>
            <div className="space-y-2">
              <Label htmlFor="arkade-complete-destination">Destination address</Label>
              <Input
                id="arkade-complete-destination"
                value={completeDestination}
                onChange={(event) => setCompleteDestination(event.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUnilateralStep('select')}>
                Back
              </Button>
              <Button
                type="button"
                disabled={
                  completeExitMutation.isPending ||
                  completeDestination.trim().length === 0 ||
                  (unrolledVtxoTxid == null && selectedCandidate == null)
                }
                onClick={handleCompleteExit}
              >
                {completeExitMutation.isPending ? 'Completing…' : 'Complete exit'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
