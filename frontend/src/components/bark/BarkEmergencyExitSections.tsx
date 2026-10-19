import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AutomatedFeeCapControls } from '@/components/wallet/AutomatedFeeCapControls'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import { BarkEmergencyExitFundingBanner } from '@/components/bark/BarkEmergencyExitFundingBanner'
import { BarkExitTreeGraph } from '@/components/bark/BarkExitTreeGraph'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { barkEmergencyExitStateLabel } from '@/lib/bark/bark-emergency-exit'
import { BARK_EMERGENCY_EXIT_AUTOMATION_PAUSE_LABELS } from '@/lib/bark/bark-emergency-exit-automated-fee'
import { formatSatPerVbTwoDecimals, type SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import { formatSats } from '@/lib/wallet/bitcoin-utils'
import {
  barkEmergencyExitAmountLabel,
  BARK_EMERGENCY_EXIT_CLAIM_NOTE,
  type BarkEmergencyExitReview,
} from '@/hooks/useBarkEmergencyExitPage'
import type { BarkEmergencyExitFundingStatus } from '@/lib/bark/bark-emergency-exit-funding-status'
import type { BarkEmergencyExitAutomationPauseReason } from '@/stores/barkEmergencyExitAutomationStore'
import type { BarkEmergencyExitRow, BarkExitGraphNode, BarkVtxoRow } from '@/workers/bark-api'
import { Loader2 } from 'lucide-react'

export const BARK_EMERGENCY_EXIT_AUTOMATION_NOTE =
  'Automatic proceeding requires the app to stay unlocked and this wallet to stay on this network. This process cannot be delegated.'

export function BarkEmergencyExitTreeCard({
  nodes,
  exitRows,
  emptySelection,
  errorMessage,
  vtxoRows,
  fundingStatus,
  unfundedParentTxids,
}: {
  nodes: BarkExitGraphNode[] | undefined
  exitRows: BarkEmergencyExitRow[]
  emptySelection: boolean
  errorMessage: string | null
  vtxoRows: BarkVtxoRow[]
  fundingStatus: BarkEmergencyExitFundingStatus | null
  unfundedParentTxids: readonly string[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exit tree</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <BarkExitTreeGraph
          nodes={nodes}
          exitRows={exitRows}
          emptySelection={emptySelection}
          errorMessage={errorMessage}
          vtxoRows={vtxoRows}
          unfundedParentTxids={unfundedParentTxids}
        />
        <BarkEmergencyExitFundingBanner status={fundingStatus} />
      </CardContent>
    </Card>
  )
}

export function BarkEmergencyExitStartCard({
  wholeWallet,
  spendableVtxos,
  selectedIds,
  review,
  busyAction,
  startBlocked,
  onWholeWalletChange,
  onToggleVtxo,
  onReview,
  onStart,
}: {
  wholeWallet: boolean
  spendableVtxos: BarkVtxoRow[]
  selectedIds: string[]
  review: BarkEmergencyExitReview | null
  busyAction: string | null
  startBlocked: boolean
  onWholeWalletChange: (checked: boolean) => void
  onToggleVtxo: (vtxoId: string) => void
  onReview: () => void
  onStart: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start an exit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="bark-emergency-exit-whole-wallet"
            checked={wholeWallet}
            onChange={(event) => onWholeWalletChange(event.target.checked)}
          />
          Exit the whole wallet
        </label>
        <ul className="space-y-2">
          {spendableVtxos.map((row) => (
            <SpendableVtxoRow
              key={row.id}
              row={row}
              checked={!wholeWallet && selectedIds.includes(row.id)}
              disabled={wholeWallet}
              onToggle={() => onToggleVtxo(row.id)}
            />
          ))}
        </ul>
        <Button
          type="button"
          data-testid="bark-emergency-exit-review"
          disabled={busyAction != null}
          onClick={onReview}
        >
          Review emergency exit
        </Button>
        {review != null ? (
          <div className="space-y-1 text-sm" data-testid="bark-emergency-exit-fee-review">
            <p data-testid="bark-emergency-exit-fee-rate">
              Fee rate {formatSatPerVbTwoDecimals(review.estimate.feeRateSatPerVb)} sat/vB
            </p>
            <p data-testid="bark-emergency-exit-broadcast-fee">
              Broadcast fee {formatSats(review.estimate.exitBroadcastFeeSats)}
            </p>
            <p data-testid="bark-emergency-exit-claim-fee">
              Claim fee {formatSats(review.estimate.claimFeeSats)}
            </p>
            <p data-testid="bark-emergency-exit-tx-count">
              Transactions to broadcast {review.estimate.txsToBroadcast}
            </p>
            {startBlocked ? (
              <p data-testid="bark-emergency-exit-start-blocked">
                Confirmed on-chain balance is below the broadcast fee.
              </p>
            ) : null}
          </div>
        ) : null}
        {review != null ? (
          <Button
            type="button"
            data-testid="bark-emergency-exit-start"
            disabled={startBlocked || busyAction != null}
            onClick={onStart}
          >
            Start emergency exit
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function BarkEmergencyExitFeeCard({
  busyAction,
  proceedAutomatically,
  proceedAutomaticallyPending,
  pausedReason,
  manualFeePresetSelection,
  automatedFeePresetLabel,
  presetSatPerVbByLabel,
  feeEstimatesRefreshing,
  customFeeRate,
  useCustomFee,
  maxFeeRateSatPerVb,
  onSelectManualPreset,
  onSelectAutomaticPreset,
  setCustomFeeRate,
  onSelectCustomMode,
  onMaxFeeRateChange,
}: {
  busyAction: string | null
  proceedAutomatically: boolean
  proceedAutomaticallyPending: boolean
  pausedReason: BarkEmergencyExitAutomationPauseReason | null
  manualFeePresetSelection: SendFeePresetLabel
  automatedFeePresetLabel: SendFeePresetLabel
  presetSatPerVbByLabel: Record<SendFeePresetLabel, number>
  feeEstimatesRefreshing: boolean
  customFeeRate: string
  useCustomFee: boolean
  maxFeeRateSatPerVb: number
  onSelectManualPreset: (preset: SendFeePresetLabel, rateSatPerVb: number) => void
  onSelectAutomaticPreset: (preset: SendFeePresetLabel, rateSatPerVb: number) => void
  setCustomFeeRate: (value: string) => void
  onSelectCustomMode: () => void
  onMaxFeeRateChange: (maxFeeRateSatPerVb: number) => void
}) {
  const controlsPending = busyAction != null || proceedAutomaticallyPending

  return (
    <Card data-testid="bark-emergency-exit-fee-card">
      <CardHeader>
        <CardTitle>Fee rate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {proceedAutomatically ? (
          <AutomatedFeeCapControls
            warningTestId="bark-emergency-exit-max-fee-warning"
            maxFeeInputId="bark-emergency-exit-max-fee-rate"
            maxFeeTestId="bark-emergency-exit-max-fee-rate"
            maxFeeRateSatPerVb={maxFeeRateSatPerVb}
            onMaxFeeRateChange={onMaxFeeRateChange}
            feePresetSelection={automatedFeePresetLabel}
            presetSatPerVbByLabel={presetSatPerVbByLabel}
            feeEstimatesRefreshing={feeEstimatesRefreshing}
            isPending={controlsPending}
            onSelectPreset={onSelectAutomaticPreset}
          />
        ) : (
          <SendOnChainFeeSection
            feePresetSelection={manualFeePresetSelection}
            presetSatPerVbByLabel={presetSatPerVbByLabel}
            feeEstimatesRefreshing={feeEstimatesRefreshing}
            customFeeRate={customFeeRate}
            useCustomFee={useCustomFee}
            isPending={controlsPending}
            onSelectPreset={onSelectManualPreset}
            setCustomFeeRate={setCustomFeeRate}
            onSelectCustomMode={onSelectCustomMode}
          />
        )}
        {proceedAutomatically && pausedReason != null ? (
          <p
            className="text-xs text-amber-700 dark:text-amber-400"
            data-testid="bark-emergency-exit-automation-paused"
          >
            {BARK_EMERGENCY_EXIT_AUTOMATION_PAUSE_LABELS[pausedReason]}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function BarkEmergencyExitLiveCard({
  rows,
  liveExitsLoading,
  liveExitsError,
  vtxoRows,
  busyAction,
  proceedAutomatically,
  proceedAutomaticallyPending,
  automaticProgressInFlight,
  automaticProgressError,
  automationPaused,
  onProceedAutomaticallyChange,
  onProgress,
  onCancel,
}: {
  rows: BarkEmergencyExitRow[]
  liveExitsLoading: boolean
  liveExitsError: string | null
  vtxoRows: BarkVtxoRow[]
  busyAction: string | null
  proceedAutomatically: boolean
  proceedAutomaticallyPending: boolean
  automaticProgressInFlight: boolean
  automaticProgressError: string | null
  automationPaused: boolean
  onProceedAutomaticallyChange: (enabled: boolean) => void
  onProgress: () => void
  onCancel: (vtxoId: string) => void
}) {
  const progressDisabled = busyAction != null || proceedAutomatically
  const showAutomaticStatus =
    proceedAutomatically &&
    !automationPaused &&
    (automaticProgressInFlight || automaticProgressError == null)
  return (
    <Card data-testid="bark-emergency-exit-live-card">
      <CardHeader>
        <CardTitle>Live exits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ProceedAutomaticallySwitch
          proceedAutomatically={proceedAutomatically}
          disabled={busyAction != null || proceedAutomaticallyPending}
          onProceedAutomaticallyChange={onProceedAutomaticallyChange}
        />
        <Button
          type="button"
          data-testid="bark-emergency-exit-progress"
          disabled={progressDisabled}
          onClick={onProgress}
        >
          {automaticProgressInFlight ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : null}
          Progress
        </Button>
        {showAutomaticStatus ? (
          <p className="text-xs text-muted-foreground" data-testid="bark-emergency-exit-automatic-status">
            {automaticProgressInFlight ? 'Proceeding…' : 'Waiting for the next block.'}
          </p>
        ) : null}
        {proceedAutomatically && automaticProgressError != null ? (
          <p
            className="min-w-0 break-all text-xs text-destructive"
            role="alert"
            data-testid="bark-emergency-exit-automatic-progress-error"
          >
            {automaticProgressError}
          </p>
        ) : null}
        {liveExitsError != null ? (
          <p className="text-xs text-destructive" role="alert" data-testid="bark-emergency-exit-list-error">
            {liveExitsError}
          </p>
        ) : null}
        {liveExitsLoading ? (
          <p className="text-xs text-muted-foreground" data-testid="bark-emergency-exit-list-loading">
            Loading live exits…
          </p>
        ) : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.vtxoId}
              className="flex items-center justify-between gap-3 text-sm"
              data-testid={`bark-emergency-exit-row-${row.vtxoId}`}
            >
              <span>
                <span className="font-mono">{row.vtxoId}</span>
                {' · '}
                {barkEmergencyExitAmountLabel(vtxoRows, row.vtxoId)}
                {' · '}
                {barkEmergencyExitStateLabel(row.state)}
              </span>
              {row.cancelable ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid={`bark-emergency-exit-cancel-${row.vtxoId}`}
                  disabled={busyAction != null}
                  onClick={() => onCancel(row.vtxoId)}
                >
                  Cancel
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function BarkEmergencyExitClaimCard({
  destinationAddress,
  busyAction,
  claimEnabled,
  onClaim,
}: {
  destinationAddress: string
  busyAction: string | null
  claimEnabled: boolean
  onClaim: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Claim</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm" data-testid="bark-emergency-exit-destination">
          {destinationAddress || 'No receive address'}
        </p>
        <p className="text-sm text-muted-foreground">{BARK_EMERGENCY_EXIT_CLAIM_NOTE}</p>
        <Button
          type="button"
          data-testid="bark-emergency-exit-claim"
          disabled={!claimEnabled || destinationAddress.length === 0 || busyAction != null}
          onClick={onClaim}
        >
          Claim to this address
        </Button>
      </CardContent>
    </Card>
  )
}

function ProceedAutomaticallySwitch({
  proceedAutomatically,
  disabled,
  onProceedAutomaticallyChange,
}: {
  proceedAutomatically: boolean
  disabled: boolean
  onProceedAutomaticallyChange: (enabled: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <Label htmlFor="bark-emergency-exit-proceed-automatically" className="text-sm font-medium">
          Proceed automatically
        </Label>
        <p className="text-xs text-muted-foreground">{BARK_EMERGENCY_EXIT_AUTOMATION_NOTE}</p>
      </div>
      <Switch
        id="bark-emergency-exit-proceed-automatically"
        checked={proceedAutomatically}
        disabled={disabled}
        onCheckedChange={onProceedAutomaticallyChange}
        aria-label="Proceed automatically"
        data-testid="bark-emergency-exit-proceed-automatically"
      />
    </div>
  )
}

function SpendableVtxoRow({
  row,
  checked,
  disabled,
  onToggle,
}: {
  row: BarkVtxoRow
  checked: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid={`bark-emergency-exit-vtxo-${row.id}`}
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="font-mono">{row.id}</span>
        <span>{formatSats(row.amountSats)}</span>
      </label>
    </li>
  )
}
