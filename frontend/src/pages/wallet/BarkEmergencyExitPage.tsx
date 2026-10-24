import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { DesignButton } from '@/components/design/DesignButton'
import { PageHeader } from '@/components/PageHeader'
import { barkSessionBlockingScreen } from '@/components/bark/bark-session-blocking-screen'
import { BarkRailUnavailable } from '@/components/bark/BarkRailUnavailable'
import { StartBarkEmergencyExitConfirmModal } from '@/components/bark/StartBarkEmergencyExitConfirmModal'
import {
  BarkEmergencyExitClaimCard,
  BarkEmergencyExitFeeCard,
  BarkEmergencyExitLiveCard,
  BarkEmergencyExitStartCard,
  BarkEmergencyExitTreeCard,
} from '@/components/bark/BarkEmergencyExitSections'
import {
  BARK_EMERGENCY_EXIT_CANCEL_NOTE,
  useBarkEmergencyExitPage,
} from '@/hooks/useBarkEmergencyExitPage'

export function BarkEmergencyExitPage() {
  const page = useBarkEmergencyExitPage()
  const [startConfirmOpen, setStartConfirmOpen] = useState(false)

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
      <StartBarkEmergencyExitConfirmModal
        open={startConfirmOpen}
        onOpenChange={setStartConfirmOpen}
        onConfirm={() => {
          void page.onStart()
        }}
      />
      <PageHeader title="Bark emergency exit" />
      <p className="text-sm text-muted-foreground">{BARK_EMERGENCY_EXIT_CANCEL_NOTE}</p>
      <p className="text-sm text-muted-foreground">
        Proceed automatically advances an exit when a new block arrives. A successful Bark sync
        also progresses an exit that is already started.
      </p>

      <BarkEmergencyExitTreeCard
        nodes={page.topologyNodes}
        exitRows={page.liveExits}
        emptySelection={page.topologyVtxoIds.length === 0}
        errorMessage={page.exitTreeError}
        vtxoRows={page.vtxoRows}
        fundingStatus={page.fundingStatus}
        unfundedParentTxids={page.unfundedParentTxids}
      />
      <BarkEmergencyExitFeeCard
        busyAction={page.busyAction}
        proceedAutomatically={page.proceedAutomatically}
        proceedAutomaticallyPending={page.proceedAutomaticallyPending}
        pausedReason={page.displayedPauseReason}
        manualFeePresetSelection={page.manualFeePresetSelection}
        automatedFeePresetLabel={page.automatedFeePresetLabel}
        presetSatPerVbByLabel={page.presetSatPerVbByLabel}
        feeEstimatesRefreshing={page.feeEstimatesRefreshing}
        customFeeRate={page.customFeeRate}
        useCustomFee={page.useCustomFee}
        maxFeeRateSatPerVb={page.maxFeeRateSatPerVb}
        onSelectManualPreset={page.onSelectManualPreset}
        onSelectAutomaticPreset={page.onAutomaticFeePresetChange}
        setCustomFeeRate={page.setCustomFeeRate}
        onSelectCustomMode={page.onSelectCustomMode}
        onMaxFeeRateChange={page.onMaxFeeRateChange}
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
        onStart={() => setStartConfirmOpen(true)}
      />
      <BarkEmergencyExitLiveCard
        rows={page.liveExits}
        liveExitsLoading={page.liveExitsLoading}
        liveExitsError={page.liveExitsError}
        vtxoRows={page.vtxoRows}
        busyAction={page.busyAction}
        proceedAutomatically={page.proceedAutomatically}
        proceedAutomaticallyPending={page.proceedAutomaticallyPending}
        automaticProgressInFlight={page.automaticProgressInFlight}
        automaticProgressError={page.automaticProgressError}
        automationPaused={page.displayedPauseReason != null}
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

      <DesignButton type="button" appearance="secondary" asChild>
        <Link to="/wallet/management">Back to management</Link>
      </DesignButton>
    </div>
  )
}
