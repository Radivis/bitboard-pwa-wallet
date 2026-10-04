import { Link } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { BarkRailUnavailable } from '@/components/bark/BarkRailUnavailable'
import {
  BarkEmergencyExitClaimCard,
  BarkEmergencyExitLiveCard,
  BarkEmergencyExitStartCard,
  BarkEmergencyExitTreeCard,
} from '@/components/bark/BarkEmergencyExitSections'
import { Button } from '@/components/ui/button'
import {
  BARK_EMERGENCY_EXIT_CANCEL_NOTE,
  useBarkEmergencyExitPage,
} from '@/hooks/useBarkEmergencyExitPage'

export function BarkEmergencyExitPage() {
  const page = useBarkEmergencyExitPage()

  if (page.unavailable) {
    return (
      <BarkRailUnavailable
        title="Bark emergency exit"
        message="Bark emergency exit is available on Signet and Mainnet when Bark is enabled."
        backTo="/wallet/management"
        backLabel="Back to management"
        testId="bark-emergency-exit-unavailable"
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bark emergency exit" />
      <p className="text-sm text-muted-foreground">{BARK_EMERGENCY_EXIT_CANCEL_NOTE}</p>
      <p className="text-sm text-muted-foreground">
        Progress is a button. A successful Bark sync also broadcasts an exit that is already started.
      </p>

      {page.sessionReady ? (
        <>
          <BarkEmergencyExitTreeCard
            nodes={page.topologyNodes}
            emptySelection={page.topologyVtxoIds.length === 0}
            errorMessage={page.exitTreeError}
            vtxoRows={page.vtxoRows}
          />
          <BarkEmergencyExitStartCard
            wholeWallet={page.wholeWallet}
            spendableVtxos={page.spendableVtxos}
            selectedIds={page.selectedIds}
            review={page.review}
            busyAction={page.busyAction}
            startBlocked={page.startBlocked}
            onWholeWalletChange={page.selectWholeWallet}
            onToggleVtxo={page.toggleVtxo}
            onReview={page.onReview}
            onStart={page.onStart}
          />
          <BarkEmergencyExitLiveCard
            rows={page.liveExits}
            vtxoRows={page.vtxoRows}
            busyAction={page.busyAction}
            onProgress={page.onProgress}
            onCancel={page.onCancel}
          />
          <BarkEmergencyExitClaimCard
            destinationAddress={page.destinationAddress}
            busyAction={page.busyAction}
            claimEnabled={page.claimEnabled}
            onClaim={page.onClaim}
          />
        </>
      ) : page.loadPhase === 'load-error' ? null : (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="bark-emergency-exit-session-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Establishing Bark session…
        </div>
      )}

      <Button type="button" variant="outline" asChild>
        <Link to="/wallet/management">Back to management</Link>
      </Button>
    </div>
  )
}
