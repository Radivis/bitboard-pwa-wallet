import type { ReactNode } from 'react'
import { Gauge } from 'lucide-react'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { DesignInput } from '@/components/design/DesignInput'
import { DesignSwitch, type DesignSwitchOption } from '@/components/design/DesignSwitch'
import { Label } from '@/components/ui/label'
import {
  SEND_FEE_PRESETS,
  SEND_FEE_PRESET_INFOMODE,
} from '@/components/wallet/send/send-fee-presets'
import {
  formatSatPerVbTwoDecimals,
  type SendFeePresetLabel,
} from '@/lib/esplora/esplora-fee-estimates'

const CUSTOM_FEE_VALUE = 'custom'
const CUSTOM_FEE_INFO_TEXT =
  'Switch here when you already know the exact sat/vB you want—for example from a mempool dashboard, a node, or advice that matches current network conditions. After selecting Custom, type that number in the field below; use it if presets feel too coarse or you are following a specific recommendation.'

type FeeRateValue = SendFeePresetLabel | typeof CUSTOM_FEE_VALUE

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
  hideCustom?: boolean
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
    hideCustom = false,
  } = props
  const selectedFeeRate: FeeRateValue = useCustomFee ? CUSTOM_FEE_VALUE : feePresetSelection
  const feeRateOptions = buildFeeRateOptions(presetSatPerVbByLabel, hideCustom)

  function selectFeeRate(next: FeeRateValue) {
    if (next === CUSTOM_FEE_VALUE) {
      onSelectCustomMode()
      return
    }
    onSelectPreset(next, presetSatPerVbByLabel[next])
  }

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
        <p className="design-type-regular text-muted-foreground">Refreshing fee estimates…</p>
      ) : null}
      <DesignSwitch
        aria-label="Fee rate"
        wrap
        disabled={isPending}
        value={selectedFeeRate}
        onValueChange={selectFeeRate}
        options={feeRateOptions}
        frameOption={frameFeeRateOption}
      />
      {!hideCustom && useCustomFee && (
        <DesignInput
          type="number"
          leadingIcon={Gauge}
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

function buildFeeRateOptions(
  presetSatPerVbByLabel: Record<SendFeePresetLabel, number>,
  hideCustom: boolean,
): DesignSwitchOption<FeeRateValue>[] {
  const presetOptions = SEND_FEE_PRESETS.map((preset) => ({
    value: preset.label,
    label: `${preset.label} (${formatSatPerVbTwoDecimals(presetSatPerVbByLabel[preset.label])})`,
  }))
  if (hideCustom) {
    return presetOptions
  }
  return [...presetOptions, { value: CUSTOM_FEE_VALUE, label: 'Custom' }]
}

function frameFeeRateOption(
  option: DesignSwitchOption<FeeRateValue>,
  optionButton: ReactNode,
) {
  if (option.value === CUSTOM_FEE_VALUE) {
    return (
      <InfomodeWrapper
        infoId="send-fee-custom-button"
        infoTitle="Custom fee"
        infoText={CUSTOM_FEE_INFO_TEXT}
        className="w-full"
      >
        {optionButton}
      </InfomodeWrapper>
    )
  }
  const { infoTitle, infoText } = SEND_FEE_PRESET_INFOMODE[option.value]
  return (
    <InfomodeWrapper
      infoId={`send-fee-preset-${option.value.toLowerCase()}`}
      infoTitle={infoTitle}
      infoText={infoText}
      className="w-full"
    >
      {optionButton}
    </InfomodeWrapper>
  )
}
