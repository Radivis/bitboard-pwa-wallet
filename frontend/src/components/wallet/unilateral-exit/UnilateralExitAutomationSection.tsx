import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { AutomatedFeeCapControls } from '@/components/wallet/AutomatedFeeCapControls'
import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import { AUTOMATIC_PROCEEDING_FEE_CAP_EXCEEDED_LABEL } from '@/lib/onchain/automated-step-fee-rate'
import type { UnilateralExitAutomationPausedReason } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'

const PAUSED_REASON_LABELS: Record<UnilateralExitAutomationPausedReason, string> = {
  feeCapExceeded: AUTOMATIC_PROCEEDING_FEE_CAP_EXCEEDED_LABEL,
  bumperInsufficient: 'Automatic proceeding paused: insufficient bumper balance.',
  error: 'Automatic proceeding paused due to an error.',
  userDisabled: 'Automatic proceeding is off.',
}

export function UnilateralExitAutomationSection(props: {
  proceedAutomatically: boolean
  feePresetLabel: SendFeePresetLabel
  maxFeeRateSatPerVb: number
  presetSatPerVbByLabel: Record<SendFeePresetLabel, number>
  feeEstimatesRefreshing: boolean
  isPending: boolean
  pausedReason?: UnilateralExitAutomationPausedReason
  lastErrorMessage?: string
  onProceedAutomaticallyChange: (enabled: boolean) => void
  onFeePresetChange: (preset: SendFeePresetLabel, rateSatPerVb: number) => void
  onMaxFeeRateChange: (maxFeeRateSatPerVb: number) => void
}) {
  const {
    proceedAutomatically,
    feePresetLabel,
    maxFeeRateSatPerVb,
    presetSatPerVbByLabel,
    feeEstimatesRefreshing,
    isPending,
    pausedReason,
    lastErrorMessage,
    onProceedAutomaticallyChange,
    onFeePresetChange,
    onMaxFeeRateChange,
  } = props

  return (
    <div className="rounded-md border p-4 space-y-4 md:col-span-2 xl:col-span-3" data-testid="unilateral-exit-automation-section">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="unilateral-exit-proceed-automatically" className="text-sm font-medium">
            Proceed automatically
          </Label>
          <p className="text-xs text-muted-foreground">
            Uses the selected fee rate degree (low, medium, or high) for each step. Automatic
            proceeding requires the app to be unlocked and this wallet to be selected. This process
            cannot be delegated.
          </p>
        </div>
        <Switch
          id="unilateral-exit-proceed-automatically"
          checked={proceedAutomatically}
          disabled={isPending}
          onCheckedChange={onProceedAutomaticallyChange}
          aria-label="Proceed automatically"
          data-testid="unilateral-exit-proceed-automatically"
        />
      </div>

      {proceedAutomatically ? (
        <AutomatedFeeCapControls
          warningTestId="unilateral-exit-max-fee-warning"
          maxFeeInputId="unilateral-exit-max-fee-rate"
          maxFeeTestId="unilateral-exit-max-fee-rate"
          maxFeeRateSatPerVb={maxFeeRateSatPerVb}
          onMaxFeeRateChange={onMaxFeeRateChange}
          feePresetSelection={feePresetLabel}
          presetSatPerVbByLabel={presetSatPerVbByLabel}
          feeEstimatesRefreshing={feeEstimatesRefreshing}
          isPending={isPending}
          onSelectPreset={onFeePresetChange}
        />
      ) : null}

      {pausedReason != null && proceedAutomatically ? (
        <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="unilateral-exit-automation-paused">
          {PAUSED_REASON_LABELS[pausedReason]}
          {lastErrorMessage != null ? ` ${lastErrorMessage}` : ''}
        </p>
      ) : null}
    </div>
  )
}
