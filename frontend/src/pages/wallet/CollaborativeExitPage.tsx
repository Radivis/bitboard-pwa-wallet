import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { ArkadeIcon } from '@/components/icons/ArkadeIcon'
import { ArkadeSessionGate } from '@/components/arkade/ArkadeSessionGate'
import { ArkadeCollaborativeExitInfomodeContent } from '@/components/arkade/infomode/ArkadeCollaborativeExitInfomodeContent'
import { ArkadeExitOperatorFeesInfomodeContent } from '@/components/arkade/infomode/ArkadeExitOperatorFeesInfomodeContent'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { PageHeader } from '@/components/PageHeader'
import { DesignButton } from '@/components/design/DesignButton'
import { DesignInput } from '@/components/design/DesignInput'
import { Label } from '@/components/ui/label'
import { BitcoinAmountDisplay } from '@/components/BitcoinAmountDisplay'
import { ARKADE_INFOMODE_IDS } from '@/lib/arkade/arkade-infomode'
import { isArkadeActiveForNetworkMode } from '@/lib/arkade/arkade-utils'
import { formatIntentFeePrograms } from '@/lib/arkade/arkade-exit-utils'
import {
  arkadeCooperativeExitSpendableSats,
  arkadeHasPendingRecoveryDueToExpiredSignerBalance,
  formatCollaborativeExitEstimateError,
} from '@/lib/arkade/arkade-cooperative-exit'
import { useArkadeLoadLifecycleSnapshot } from '@/hooks/useArkadeLifecycleSnapshots'
import { useCollaborativeExitFlow } from '@/hooks/useCollaborativeExitFlow'
import { selectCommittedNetworkMode, useWalletStore } from '@/stores/walletStore'

type CollaborativeExitFlow = ReturnType<typeof useCollaborativeExitFlow>

interface CollaborativeExitContentProps {
  exitFlow: CollaborativeExitFlow
}

function CollaborativeExitFeeEstimate({
  collaborativeFeeQuery,
}: {
  collaborativeFeeQuery: CollaborativeExitFlow['collaborativeFeeQuery']
}) {
  return (
    <>
      {collaborativeFeeQuery.isLoading && (
        <div className="design-type-regular flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Loading fee estimate…
        </div>
      )}
      {collaborativeFeeQuery.isError && (
        <p className="design-type-regular text-destructive">
          Could not load operator fee policy. You can still exit; fees apply at settlement.
        </p>
      )}
      {collaborativeFeeQuery.data && (
        <div className="design-type-regular space-y-1 rounded-md border bg-muted/40 p-2">
          <p className="design-type-emphasis">
            <InfomodeWrapper
              infoId={ARKADE_INFOMODE_IDS.exitOperatorFees}
              infoComponent={ArkadeExitOperatorFeesInfomodeContent}
              as="span"
            >
              Operator fees (estimate)
            </InfomodeWrapper>
          </p>
          <p className="text-muted-foreground">
            {/* txFeeRate is operator metadata only; estimates below come from CEL intent fees. */}
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
    </>
  )
}

export function CollaborativeExitContent({ exitFlow }: CollaborativeExitContentProps) {
  const {
    networkMode,
    currentAddress,
    balanceQuery,
    collabDestination,
    setCollabDestination,
    collabAmountSats,
    setCollabAmountSats,
    collabAmountError,
    collaborativeFeeQuery,
    collaborativeExitMutation,
    collaborativeExitSubmitPhase,
    canCollaborativeExit,
    collaborativeExitBlockedByRotation,
    handleCollaborativeExit,
  } = exitFlow

  return (
    <div className="max-w-md space-y-4">
      <p className="design-type-regular text-muted-foreground">
        <InfomodeWrapper
          infoId={ARKADE_INFOMODE_IDS.collaborativeExit}
          infoComponent={ArkadeCollaborativeExitInfomodeContent}
          as="span"
        >
          Withdraw VTXOs to an on-chain address with the Arkade operator. Requires operator
          connectivity; faster and cheaper than unilateral exit.
        </InfomodeWrapper>
      </p>
      {collaborativeExitBlockedByRotation && (
        <p
          className="design-type-regular rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-900 dark:text-amber-100"
          data-testid="arkade-collab-exit-rotation-blocked"
        >
          Operator signer rotation cutoff has passed. Cooperative exit is no longer available for
          affected VTXOs — use unilateral exit instead.
        </p>
      )}
      {networkMode === 'mainnet' && (
        <p className="design-type-regular rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-900 dark:text-amber-100">
          You are on mainnet. Confirm the destination address before exiting.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="arkade-collab-destination">On-chain destination</Label>
        <DesignInput
          id="arkade-collab-destination"
          value={collabDestination}
          onChange={(event) => setCollabDestination(event.target.value)}
          placeholder="bc1…"
          autoComplete="off"
        />
        {currentAddress && (
          <DesignButton
            type="button"
            appearance="tertiary"
            onClick={() => setCollabDestination(currentAddress)}
          >
            Use current receive address
          </DesignButton>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="arkade-collab-amount">Amount (sats, optional)</Label>
        <DesignInput
          id="arkade-collab-amount"
          type="number"
          value={collabAmountSats}
          onChange={(event) => setCollabAmountSats(event.target.value)}
          placeholder="Leave empty for full balance"
        />
        {balanceQuery.data && (
          <div className="design-type-regular space-y-0.5 text-muted-foreground">
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
        {collabAmountError && <p className="design-type-regular text-destructive">{collabAmountError}</p>}
      </div>
      <CollaborativeExitFeeEstimate collaborativeFeeQuery={collaborativeFeeQuery} />
      <div className="flex flex-wrap gap-2">
        <DesignButton type="button" appearance="secondary" asChild>
          <Link to="/wallet/management">Back to Management</Link>
        </DesignButton>
        <DesignButton
          type="button"
          disabled={!canCollaborativeExit || collaborativeExitMutation.isPending}
          onClick={handleCollaborativeExit}
          icon={
            collaborativeExitSubmitPhase ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : undefined
          }
        >
          {collaborativeExitSubmitPhase ? 'Exiting…' : 'Confirm exit'}
        </DesignButton>
      </div>
    </div>
  )
}

function CollaborativeExitReady() {
  const exitFlow = useCollaborativeExitFlow()

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <PageHeader title="Collaborative exit" icon={ArkadeIcon} />
      <CollaborativeExitContent exitFlow={exitFlow} />
    </div>
  )
}

export function CollaborativeExitPage() {
  const networkMode = useWalletStore(selectCommittedNetworkMode)
  const arkadeLoadSnapshot = useArkadeLoadLifecycleSnapshot()

  if (!isArkadeActiveForNetworkMode(networkMode)) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4">
        <PageHeader title="Collaborative exit" icon={ArkadeIcon} />
        <p className="text-muted-foreground">Arkade is not enabled for this network.</p>
        <DesignButton type="button" appearance="secondary" asChild>
          <Link to="/wallet/management">Back to Management</Link>
        </DesignButton>
      </div>
    )
  }

  return (
    <ArkadeSessionGate
      loadPhase={arkadeLoadSnapshot.loadPhase}
      errorMessage={arkadeLoadSnapshot.errorMessage}
    >
      <CollaborativeExitReady />
    </ArkadeSessionGate>
  )
}
