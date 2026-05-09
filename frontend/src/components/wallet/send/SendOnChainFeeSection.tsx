import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SEND_FEE_PRESETS,
  SEND_FEE_PRESET_INFOMODE,
} from '@/components/wallet/send/send-fee-presets'
import {
  formatSatPerVbTwoDecimals,
  type SendFeePresetLabel,
} from '@/lib/esplora-fee-estimates'

export function SendOnChainFeeSection(props: {
  feePresetSelection: SendFeePresetLabel
  presetSatPerVbByLabel: Record<SendFeePresetLabel, number>
  feeEstimatesRefreshing: boolean
  customFeeRate: string
  useCustomFee: boolean
  isPending: boolean
  onSelectPreset: (preset: SendFeePresetLabel, rateSatPerVb: number) => void
  setCustomFeeRate: (value: string) => void
  onSelectCustomMode: () => void
}) {
  const {
    feePresetSelection,
    presetSatPerVbByLabel,
    feeEstimatesRefreshing,
    customFeeRate,
    useCustomFee,
    isPending,
    onSelectPreset,
    setCustomFeeRate,
    onSelectCustomMode,
  } = props

  return (
    <div className="space-y-2">
      <Label>
        <InfomodeWrapper
          as="span"
          infoId="send-fee-rate-label"
          infoTitle="Fee rate (sat/vB)"
          infoText={
            'Miners prioritize transactions that pay more per virtual byte (sat/vB). Preset buttons use estimates from your configured Esplora server’s fee-estimates API (confirmation targets roughly 144 / 6 / 1 block for Low / Medium / High). Targets are not guarantees. If fetching fails—or in the Lab—we show fixed fallback presets. Pick Custom only when you already have a precise rate.'
          }
        >
          Fee Rate (sat/vB)
        </InfomodeWrapper>
      </Label>
      {feeEstimatesRefreshing ? (
        <p className="text-xs text-muted-foreground">Refreshing fee estimates…</p>
      ) : null}
      <div className="flex gap-2">
        {SEND_FEE_PRESETS.map((preset) => {
          const { infoTitle, infoText } = SEND_FEE_PRESET_INFOMODE[preset.label]
          const presetRate = presetSatPerVbByLabel[preset.label]
          const rateShown = formatSatPerVbTwoDecimals(presetRate)
          return (
            <InfomodeWrapper
              key={preset.label}
              infoId={`send-fee-preset-${preset.label.toLowerCase()}`}
              infoTitle={infoTitle}
              infoText={infoText}
              className="min-w-0 flex-1"
            >
              <Button
                type="button"
                variant={
                  !useCustomFee && feePresetSelection === preset.label
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                className="w-full"
                disabled={isPending}
                onClick={() => onSelectPreset(preset.label, presetRate)}
              >
                {preset.label} ({rateShown})
              </Button>
            </InfomodeWrapper>
          )
        })}
        <InfomodeWrapper
          infoId="send-fee-custom-button"
          infoTitle="Custom fee"
          infoText="Switch here when you already know the exact sat/vB you want—for example from a mempool dashboard, a node, or advice that matches current network conditions. After selecting Custom, type that number in the field below; use it if presets feel too coarse or you are following a specific recommendation."
          className="min-w-0 flex-1"
        >
          <Button
            type="button"
            variant={useCustomFee ? 'default' : 'outline'}
            size="sm"
            className="w-full"
            disabled={isPending}
            onClick={() => onSelectCustomMode()}
          >
            Custom
          </Button>
        </InfomodeWrapper>
      </div>
      {useCustomFee && (
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          aria-label="Custom fee rate (sat/vB)"
          value={customFeeRate}
          onChange={(e) => setCustomFeeRate(e.target.value)}
          placeholder="sat/vB"
          disabled={isPending}
        />
      )}
    </div>
  )
}
