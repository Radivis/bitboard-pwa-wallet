import { Loader2 } from 'lucide-react'
import { ArkadeCollaborativeExitInfomodeContent } from '@/components/arkade/infomode/ArkadeCollaborativeExitInfomodeContent'
import { ArkadeExitOperatorFeesInfomodeContent } from '@/components/arkade/infomode/ArkadeExitOperatorFeesInfomodeContent'
import { AppModal } from '@/components/AppModal'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { formatIntentFeePrograms } from '@/lib/arkade/arkade-exit-utils'
import {
  arkadeCooperativeExitSpendableSats,
  arkadeHasPendingRecoveryDueToExpiredSignerBalance,
  formatCollaborativeExitEstimateError,
} from '@/lib/arkade/arkade-cooperative-exit'
import type { useArkadeExitFlow } from '@/hooks/useArkadeExitFlow'

type ExitFlow = ReturnType<typeof useArkadeExitFlow>

interface CollaborativeExitDialogProps {
  exitFlow: ExitFlow
}

export function CollaborativeExitDialog({ exitFlow }: CollaborativeExitDialogProps) {
  const {
    networkMode,
    currentAddress,
    balanceQuery,
    collaborativeOpen,
    setCollaborativeOpen,
    collabDestination,
    setCollabDestination,
    collabAmountSats,
    setCollabAmountSats,
    collabAmountError,
    collaborativeFeeQuery,
    collaborativeExitMutation,
    canCollaborativeExit,
    collaborativeExitBlockedByRotation,
    handleCollaborativeExit,
  } = exitFlow

  return (
    <AppModal
      isOpen={collaborativeOpen}
      onOpenChange={setCollaborativeOpen}
      onCancel={() => setCollaborativeOpen(false)}
      title={
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.collaborativeExit}
          infoComponent={ArkadeCollaborativeExitInfomodeContent}
          as="span"
        >
          Collaborative exit
        </InfomodeWrapper>
      }
      contentClassName="sm:max-w-md"
      footer={(requestClose) => (
        <>
          <Button type="button" variant="outline" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canCollaborativeExit}
            onClick={handleCollaborativeExit}
          >
            {collaborativeExitMutation.isPending ? 'Exiting…' : 'Confirm exit'}
          </Button>
        </>
      )}
      footerClassName="justify-end gap-2"
    >
      <div className="space-y-3">
        <DialogDescription>
          Withdraw VTXOs to an on-chain address with the Arkade operator. Requires operator
          connectivity; faster and cheaper than unilateral exit.
        </DialogDescription>
        {collaborativeExitBlockedByRotation && (
          <p
            className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-100"
            data-testid="arkade-collab-exit-rotation-blocked"
          >
            Operator signer rotation cutoff has passed. Cooperative exit is no longer available for
            affected VTXOs — use unilateral exit instead.
          </p>
        )}
        {networkMode === 'mainnet' && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-100">
            You are on mainnet. Confirm the destination address before exiting.
          </p>
        )}
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
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>
                Cooperatively exit spendable:{' '}
                <BitcoinAmountDisplay
                  amountSats={arkadeCooperativeExitSpendableSats(
                    balanceQuery.data,
                    collaborativeFeeQuery.data,
                  )}
                  size="sm"
                />
              </p>
              {arkadeHasPendingRecoveryDueToExpiredSignerBalance(balanceQuery.data) && (
                <p data-testid="arkade-collab-exit-pending-recovery-due-to-expired-signer">
                  Pending recovery (unilateral exit only):{' '}
                  <BitcoinAmountDisplay
                    amountSats={balanceQuery.data.pendingRecoveryDueToExpiredSignerSats ?? 0}
                    size="sm"
                  />
                </p>
              )}
            </div>
          )}
          {collabAmountError && (
            <p className="text-xs text-destructive">{collabAmountError}</p>
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
            <p className="font-medium">
              <InfomodeWrapper
                infoId={ARKADE_INFOMODE_IDS.exitOperatorFees}
                infoComponent={ArkadeExitOperatorFeesInfomodeContent}
                as="span"
              >
                Operator fees (estimate)
              </InfomodeWrapper>
            </p>
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
                {formatCollaborativeExitEstimateError(collaborativeFeeQuery.data)}
              </p>
            )}
            <p className="text-muted-foreground">
              Approximate only; actual settlement fees may differ slightly.
            </p>
          </div>
        )}
      </div>
    </AppModal>
  )
}
