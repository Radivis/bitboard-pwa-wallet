import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'
import type { UnilateralExitAutomationPausedReason } from '@/lib/wallet/lifecycle/unilateral-exit-automation-types'

const PAUSED_REASON_LABELS: Record<UnilateralExitAutomationPausedReason, string> = {
  feeCapExceeded: 'Automatic proceeding paused: live fee rate exceeds your maximum.',
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

  const handleProceedAutomaticallyChange = (enabled: boolean) => {
    if (enabled) {
      onProceedAutomaticallyChange(true)
      return
    }
    onProceedAutomaticallyChange(false)
  }

  const handleMaxFeeInputChange = (rawValue: string) => {
    const parsed = Number.parseFloat(rawValue.trim())
    if (!Number.isFinite(parsed) || parsed <= 0) return
    onMaxFeeRateChange(parsed)
  }

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
          onCheckedChange={handleProceedAutomaticallyChange}
          aria-label="Proceed automatically"
          data-testid="unilateral-exit-proceed-automatically"
        />
      </div>

      {proceedAutomatically ? (
        <>
          <p
            className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
            role="alert"
            data-testid="unilateral-exit-max-fee-warning"
          >
            Fee rates may increase suddenly due to congestion. So, please set a reasonable maximum
            for the fee rate.
          </p>

          <div className="space-y-2">
            <Label htmlFor="unilateral-exit-max-fee-rate">Max fee rate (sat/vB)</Label>
            <Input
              id="unilateral-exit-max-fee-rate"
              type="number"
              inputMode="decimal"
              step="any"
              min="0.01"
              value={maxFeeRateSatPerVb}
              onChange={(event) => handleMaxFeeInputChange(event.target.value)}
              disabled={isPending}
              data-testid="unilateral-exit-max-fee-rate"
            />
          </div>

          <SendOnChainFeeSection
            feePresetSelection={feePresetLabel}
            presetSatPerVbByLabel={presetSatPerVbByLabel}
            feeEstimatesRefreshing={feeEstimatesRefreshing}
            customFeeRate=""
            useCustomFee={false}
            isPending={isPending}
            onSelectPreset={onFeePresetChange}
            setCustomFeeRate={() => {}}
            onSelectCustomMode={() => {}}
            hideCustom
          />
        </>
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
