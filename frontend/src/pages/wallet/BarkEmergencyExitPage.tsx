import { Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/PageHeader'
import { barkSessionBlockingScreen } from '@/components/bark/bark-session-blocking-screen'
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

  const sessionBlockingScreen = barkSessionBlockingScreen(page.loadPhase, page.errorMessage)
  if (sessionBlockingScreen) {
    return sessionBlockingScreen
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Bark emergency exit" />
      <p className="text-sm text-muted-foreground">{BARK_EMERGENCY_EXIT_CANCEL_NOTE}</p>
      <p className="text-sm text-muted-foreground">
        Proceed automatically advances an exit when a new block arrives. A successful Bark sync
        also progresses an exit that is already started.
      </p>

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
        proceedAutomatically={page.proceedAutomatically}
        proceedAutomaticallyPending={page.proceedAutomaticallyPending}
        onProceedAutomaticallyChange={page.onProceedAutomaticallyChange}
        onProgress={page.onProgress}
        onCancel={page.onCancel}
      />
      <BarkEmergencyExitClaimCard
        destinationAddress={page.destinationAddress}
        busyAction={page.busyAction}
        claimEnabled={page.claimEnabled}
        onClaim={page.onClaim}
      />

      <Button type="button" variant="outline" asChild>
        <Link to="/wallet/management">Back to management</Link>
      </Button>
    </div>
  )
}
