import { DesignInput } from '@/components/design/DesignInput'
import { Label } from '@/components/ui/label'
import { SendOnChainFeeSection } from '@/components/wallet/send/SendOnChainFeeSection'
import type { SendFeePresetLabel } from '@/lib/esplora/esplora-fee-estimates'

const FEE_CAP_WARNING =
  'Fee rates may increase suddenly due to congestion. So, please set a reasonable maximum for the fee rate.'

type AutomatedFeeCapControlsProps = {
  warningTestId: string
  maxFeeInputId: string
  maxFeeTestId: string
  maxFeeRateSatPerVb: number
  onMaxFeeRateChange: (maxFeeRateSatPerVb: number) => void
  feePresetSelection: SendFeePresetLabel
  presetSatPerVbByLabel: Record<SendFeePresetLabel, number>
  feeEstimatesRefreshing: boolean
  isPending: boolean
  onSelectPreset: (preset: SendFeePresetLabel, rateSatPerVb: number) => void
}

/** Warning, max sat/vB, and low/medium/high presets. Custom is manual-only. */
export function AutomatedFeeCapControls({
  warningTestId,
  maxFeeInputId,
  maxFeeTestId,
  maxFeeRateSatPerVb,
  onMaxFeeRateChange,
  feePresetSelection,
  presetSatPerVbByLabel,
  feeEstimatesRefreshing,
  isPending,
  onSelectPreset,
}: AutomatedFeeCapControlsProps) {
  const handleMaxFeeInputChange = (rawValue: string) => {
    const parsed = Number.parseFloat(rawValue.trim())
    if (!Number.isFinite(parsed) || parsed <= 0) return
    onMaxFeeRateChange(parsed)
  }

  return (
    <>
      <p
        className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
        role="alert"
        data-testid={warningTestId}
      >
        {FEE_CAP_WARNING}
      </p>
      <div className="space-y-2">
        <Label htmlFor={maxFeeInputId}>Max fee rate (sat/vB)</Label>
        <DesignInput
          id={maxFeeInputId}
          type="number"
          inputMode="decimal"
          step="any"
          min="0.01"
          value={maxFeeRateSatPerVb}
          onChange={(event) => handleMaxFeeInputChange(event.target.value)}
          disabled={isPending}
          data-testid={maxFeeTestId}
        />
      </div>
      <SendOnChainFeeSection
        feePresetSelection={feePresetSelection}
        presetSatPerVbByLabel={presetSatPerVbByLabel}
        feeEstimatesRefreshing={feeEstimatesRefreshing}
        customFeeRate=""
        useCustomFee={false}
        isPending={isPending}
        onSelectPreset={onSelectPreset}
        setCustomFeeRate={() => {}}
        onSelectCustomMode={() => {}}
        hideCustom
      />
    </>
  )
}
