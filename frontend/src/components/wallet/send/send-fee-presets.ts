/**
 * Fee preset UX metadata (confirmation targets tie into Esplora `fee-estimates` in the Send flow).
 * Numeric rates come from `/fee-estimates` or {@link NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB}.
 */
import type { SendFeePresetLabel } from '@/lib/esplora-fee-estimates'

export type { SendFeePresetLabel }

export const SEND_FEE_PRESETS: readonly {
  label: SendFeePresetLabel
  confirmationTargetBlocks: number
}[] = [
  { label: 'Low', confirmationTargetBlocks: 144 },
  { label: 'Medium', confirmationTargetBlocks: 6 },
  { label: 'High', confirmationTargetBlocks: 1 },
] as const

export const SEND_FEE_PRESET_INFOMODE: Record<
  SendFeePresetLabel,
  { infoTitle: string; infoText: string }
> = {
  Low: {
    infoTitle: 'Low fee (~144 blocks)',
    infoText:
      'Targets confirming in roughly 144 blocks on average—not a guarantee when the mempool is volatile. Lowest preset; good when you want to minimise fees and can wait.',
  },
  Medium: {
    infoTitle: 'Medium fee (~6 blocks)',
    infoText:
      'Targets confirming in roughly 6 blocks—still not guaranteed during congestion. Sensible everyday default between cost and urgency.',
  },
  High: {
    infoTitle: 'High fee (~1 block)',
    infoText:
      'Targets confirming in roughly the next block when conditions allow—never guaranteed during congestion or relay policy quirks. Highest preset for time-sensitive transfers.',
  },
}
