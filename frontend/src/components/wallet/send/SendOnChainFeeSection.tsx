import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SEND_FEE_PRESETS,
  SEND_FEE_PRESET_INFOMODE,
} from '@/components/wallet/send/send-fee-presets'

export function SendOnChainFeeSection(props: {
  feeRate: number
  customFeeRate: string
  useCustomFee: boolean
  isPending: boolean
  setFeeRate: (rate: number) => void
  setCustomFeeRate: (value: string) => void
  setUseCustomFee: (value: boolean) => void
}) {
  const {
    feeRate,
    customFeeRate,
    useCustomFee,
    isPending,
    setFeeRate,
    setCustomFeeRate,
    setUseCustomFee,
  } = props

  return (
    <div className="space-y-2">
      <Label>
        <InfomodeWrapper
          as="span"
          infoId="send-fee-rate-label"
          infoTitle="Fee rate (sat/vB)"
          infoText="Miners prioritize transactions that pay more per byte of block space. The number is satoshis per virtual byte (sat/vB). Bitboard currently offers simple fixed presets (not live mempool data—smarter estimation may come later). In general: use Low when you are not in a rush, Medium for everyday sends, High when the network is busy or you need faster confirmation, and Custom only when you already have a target rate from an explorer or another trusted source."
        >
          Fee Rate (sat/vB)
        </InfomodeWrapper>
      </Label>
      <p className="text-xs text-muted-foreground">
        Static presets for now. Dynamic fee estimation will be added later.
      </p>
      <div className="flex gap-2">
        {SEND_FEE_PRESETS.map((preset) => {
          const { infoTitle, infoText } = SEND_FEE_PRESET_INFOMODE[preset.label]
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
                  !useCustomFee && feeRate === preset.rate ? 'default' : 'outline'
                }
                size="sm"
                className="w-full"
                onClick={() => {
                  setFeeRate(preset.rate)
                  setUseCustomFee(false)
                }}
              >
                {preset.label} ({preset.rate})
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
            onClick={() => setUseCustomFee(true)}
          >
            Custom
          </Button>
        </InfomodeWrapper>
      </div>
      {useCustomFee && (
        <Input
          type="number"
          value={customFeeRate}
          onChange={(e) => setCustomFeeRate(e.target.value)}
          placeholder="Custom fee rate"
          min="1"
          disabled={isPending}
        />
      )}
    </div>
  )
}
