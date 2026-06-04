import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  useArkadeBalanceQuery,
  useArkadeBumperInfoQuery,
  useArkadeCollaborativeExitFeeQuery,
  useArkadeCollaborativeExitMutation,
  useArkadeCompleteUnilateralExitMutation,
  useArkadeExitCandidatesQuery,
  useArkadeUnilateralExitFeeQuery,
  useArkadeUnilateralUnrollMutation,
} from '@/hooks/useArkadeQueries'
import type { ArkadeExitCandidateRow, ArkadeUnrollProgressEvent } from '@/workers/arkade-api'
import { useWalletStore } from '@/stores/walletStore'

type UnilateralStep = 'select' | 'unroll' | 'complete'

function formatIntentFeePrograms(
  configured: {
    offchainInput: boolean
    onchainInput: boolean
    offchainOutput: boolean
    onchainOutput: boolean
  },
): string {
  const labels: string[] = []
  if (configured.offchainInput) labels.push('offchain inputs')
  if (configured.onchainInput) labels.push('onchain inputs')
  if (configured.offchainOutput) labels.push('offchain outputs')
  if (configured.onchainOutput) labels.push('onchain outputs')
  if (labels.length === 0) return 'none configured'
  return labels.join(', ')
}

export function ArkadeExitSection() {
  const networkMode = useWalletStore((s) => s.networkMode)
  const currentAddress = useWalletStore((s) => s.currentAddress)
  const balanceQuery = useArkadeBalanceQuery()

  const [collaborativeOpen, setCollaborativeOpen] = useState(false)
  const [unilateralOpen, setUnilateralOpen] = useState(false)

  const [collabDestination, setCollabDestination] = useState('')
  const [collabAmountSats, setCollabAmountSats] = useState('')

  const [unilateralStep, setUnilateralStep] = useState<UnilateralStep>('select')
  const [selectedCandidate, setSelectedCandidate] = useState<ArkadeExitCandidateRow | null>(
    null,
  )
  const [unrollProgress, setUnrollProgress] = useState<ArkadeUnrollProgressEvent[]>([])
  const [unrolledVtxoTxid, setUnrolledVtxoTxid] = useState<string | null>(null)
  const [completeDestination, setCompleteDestination] = useState('')

  const collabAmountParsed =
    collabAmountSats.trim() === '' ? undefined : Number.parseInt(collabAmountSats, 10)
  const collabAmountValid =
    collabAmountParsed === undefined ||
    (Number.isFinite(collabAmountParsed) && collabAmountParsed > 0)
  const collabAmount = collabAmountValid ? collabAmountParsed : undefined

  const exitCandidatesQuery = useArkadeExitCandidatesQuery(unilateralOpen)
  const bumperInfoQuery = useArkadeBumperInfoQuery(unilateralOpen)
  const collaborativeFeeQuery = useArkadeCollaborativeExitFeeQuery({
    enabled: collaborativeOpen,
    destinationAddress: collabDestination,
    amountSats: collabAmount,
  })
  const unilateralFeeQuery = useArkadeUnilateralExitFeeQuery({
    enabled: unilateralOpen && unilateralStep === 'select',
    txid: selectedCandidate?.txid,
    vout: selectedCandidate?.vout,
  })
  const collaborativeExitMutation = useArkadeCollaborativeExitMutation()
  const unrollMutation = useArkadeUnilateralUnrollMutation()
  const completeExitMutation = useArkadeCompleteUnilateralExitMutation()

  useEffect(() => {
    if (collaborativeOpen && currentAddress) {
      setCollabDestination(currentAddress)
    }
  }, [collaborativeOpen, currentAddress])

  useEffect(() => {
    if (!unilateralOpen) {
      setUnilateralStep('select')
      setSelectedCandidate(null)
      setUnrollProgress([])
      setUnrolledVtxoTxid(null)
      setCompleteDestination('')
      return
    }
    if (currentAddress) {
      setCompleteDestination(currentAddress)
    }
  }, [unilateralOpen, currentAddress])

  const canCollaborativeExit =
    collabDestination.trim().length > 0 &&
    collabAmountValid &&
    !collaborativeExitMutation.isPending

  const bumperBalance =
    unilateralFeeQuery.data?.bumperBalanceSats ?? bumperInfoQuery.data?.balanceSats ?? 0
  const unilateralFeeEstimate = unilateralFeeQuery.data
  const bumperLowFromEstimate =
    unilateralFeeEstimate != null && !unilateralFeeEstimate.bumperSufficient
  const bumperLow =
    bumperLowFromEstimate ||
    (unilateralFeeEstimate == null &&
      bumperInfoQuery.isSuccess &&
      bumperBalance < 1_000)

  const handleCollaborativeExit = () => {
    if (!canCollaborativeExit) return
    collaborativeExitMutation.mutate(
      {
        destinationAddress: collabDestination.trim(),
        amountSats: collabAmount,
      },
      {
        onSuccess: () => setCollaborativeOpen(false),
      },
    )
  }

  const handleStartUnroll = () => {
    if (selectedCandidate == null) return
    setUnilateralStep('unroll')
    setUnrollProgress([])
    unrollMutation.mutate(
      {
        txid: selectedCandidate.txid,
        vout: selectedCandidate.vout,
        onProgress: (event) => {
          setUnrollProgress((previous) => [...previous, event])
          if (event.type === 'done' && event.vtxoTxid) {
            setUnrolledVtxoTxid(event.vtxoTxid)
          }
        },
      },
      {
        onSuccess: (result) => {
          setUnrolledVtxoTxid(result.vtxoTxid)
          setUnilateralStep('complete')
        },
      },
    )
  }

  const handleCompleteExit = () => {
    const vtxoTxid = unrolledVtxoTxid ?? selectedCandidate?.txid
    if (vtxoTxid == null || completeDestination.trim().length === 0) return
    completeExitMutation.mutate(
      {
        vtxoTxids: [vtxoTxid],
        destinationAddress: completeDestination.trim(),
      },
      {
        onSuccess: () => setUnilateralOpen(false),
      },
    )
  }

  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">Exit to on-chain</p>
      <p className="text-xs text-muted-foreground">
        Move Arkade funds back to a normal Bitcoin address.{' '}
        <Link
          to="/library/articles/$slug"
          params={{ slug: 'arkade-vtxo-expiry' }}
          className="text-primary underline-offset-4 hover:underline"
        >
          Learn about exits
        </Link>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setCollaborativeOpen(true)}
        >
          Collaborative exit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setUnilateralOpen(true)}
        >
          Unilateral exit
        </Button>
      </div>

      <Dialog open={collaborativeOpen} onOpenChange={setCollaborativeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Collaborative exit</DialogTitle>
            <DialogDescription>
              Withdraw VTXOs to an on-chain address with the Arkade operator. Requires
              operator connectivity; faster and cheaper than unilateral exit.
            </DialogDescription>
          </DialogHeader>
          {networkMode === 'mainnet' && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-100">
              You are on mainnet. Confirm the destination address before exiting.
            </p>
          )}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="arkade-collab-destination">On-chain destination</Label>
              <Input
                id="arkade-collab-destination"
                value={collabDestination}
                onChange={(event) => setCollabDestination(event.target.value)}
                placeholder="bc1…"
                autoComplete="off"
              />
              {currentAddress && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => setCollabDestination(currentAddress)}
                >
                  Use current receive address
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="arkade-collab-amount">Amount (sats, optional)</Label>
              <Input
                id="arkade-collab-amount"
                type="number"
                value={collabAmountSats}
                onChange={(event) => setCollabAmountSats(event.target.value)}
                placeholder="Leave empty for full balance"
              />
              {balanceQuery.data && (
                <p className="text-xs text-muted-foreground">
                  Arkade balance:{' '}
                  <BitcoinAmountDisplay amountSats={balanceQuery.data.confirmedSats} size="sm" />
                </p>
              )}
            </div>
            {collaborativeFeeQuery.isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Loading fee estimate…
              </div>
            )}
            {collaborativeFeeQuery.isError && (
              <p className="text-xs text-destructive">
                Could not load operator fee policy. You can still exit; fees apply at settlement.
              </p>
            )}
            {collaborativeFeeQuery.data && (
              <div className="rounded-md border bg-muted/40 p-2 text-xs space-y-1">
                <p className="font-medium">Operator fees (estimate)</p>
                <p className="text-muted-foreground">
                  Settlement fee rate: {collaborativeFeeQuery.data.txFeeRate} · Intent fees:{' '}
                  {formatIntentFeePrograms(collaborativeFeeQuery.data.intentFeeConfigured)}
                </p>
                {collaborativeFeeQuery.data.estimatedTotalFeeSats != null && (
                  <p>
                    Estimated operator fee:{' '}
                    <BitcoinAmountDisplay
                      amountSats={collaborativeFeeQuery.data.estimatedTotalFeeSats}
                      size="sm"
                    />
                  </p>
                )}
                {collaborativeFeeQuery.data.estimatedReceiveSats != null && (
                  <p>
                    Estimated on-chain receive:{' '}
                    <BitcoinAmountDisplay
                      amountSats={collaborativeFeeQuery.data.estimatedReceiveSats}
                      size="sm"
                    />
                  </p>
                )}
                {collaborativeFeeQuery.data.estimateError && (
                  <p className="text-amber-700 dark:text-amber-300">
                    {collaborativeFeeQuery.data.estimateError}
                  </p>
                )}
                <p className="text-muted-foreground">
                  Approximate only; actual settlement fees may differ slightly.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCollaborativeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !canCollaborativeExit ||
                Boolean(collaborativeFeeQuery.data?.estimateError)
              }
              onClick={handleCollaborativeExit}
            >
              {collaborativeExitMutation.isPending ? 'Exiting…' : 'Confirm exit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={unilateralOpen} onOpenChange={setUnilateralOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Unilateral exit</DialogTitle>
            <DialogDescription>
              Exit without the operator by unrolling the VTXO chain on-chain, then completing
              after the timelock. Requires on-chain fees on the bumper wallet below.
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
                          onChange={() => {
                            setSelectedCandidate(row)
                            if (row.canComplete) {
                              setUnrolledVtxoTxid(row.txid)
                            }
                          }}
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
                  <p className="font-medium">Bumper wallet (P2A fees)</p>
                  <p className="break-all font-mono">{bumperInfoQuery.data.address}</p>
                  <p>
                    Balance:{' '}
                    <BitcoinAmountDisplay amountSats={bumperBalance} size="sm" />
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
                      Insufficient bumper balance for estimated unroll fees. Send on-chain BTC to
                      this address before unrolling.{' '}
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
                  <Button
                    type="button"
                    onClick={() => {
                      setUnrolledVtxoTxid(selectedCandidate.txid)
                      setUnilateralStep('complete')
                    }}
                  >
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
              <p className="text-sm text-muted-foreground">
                Unrolling {selectedCandidate?.txid}:{selectedCandidate?.vout}. Keep this dialog
                open until finished.
              </p>
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
    </div>
  )
}
