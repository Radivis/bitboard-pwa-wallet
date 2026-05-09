/**
 * Fee preset UX metadata (confirmation targets tie into Esplora `fee-estimates` in the Send flow).
 * Block counts and fallback rates are defined in `@/lib/send-fee-preset-definitions`.
 */
import {
  SEND_FEE_PRESET_ENTRIES,
  type SendFeePresetLabel,
} from '@/lib/send-fee-preset-definitions'

export type { SendFeePresetLabel }

export const SEND_FEE_PRESETS = SEND_FEE_PRESET_ENTRIES

const FEE_PRESET_LEVEL_TITLE: Record<SendFeePresetLabel, string> = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
}

const FEE_PRESET_INFO_TEXT: Record<
  SendFeePresetLabel,
  (confirmationTargetBlocks: number) => string
> = {
  Low: (blocks) =>
    `Targets confirming in roughly ${blocks} blocks on average—not a guarantee when the mempool is volatile. Lowest preset; good when you want to minimise fees and can wait.`,
  Medium: (blocks) =>
    `Targets confirming in roughly ${blocks} blocks—still not guaranteed during congestion. Sensible everyday default between cost and urgency.`,
  High: () =>
    'Targets confirming in roughly the next block when conditions allow—never guaranteed during congestion or relay policy quirks. Highest preset for time-sensitive transfers.',
}

export const SEND_FEE_PRESET_INFOMODE: Record<
  SendFeePresetLabel,
  { infoTitle: string; infoText: string }
> = SEND_FEE_PRESET_ENTRIES.reduce(
  (acc, { label, confirmationTargetBlocks }) => {
    const blockWord = confirmationTargetBlocks === 1 ? 'block' : 'blocks'
    acc[label] = {
      infoTitle: `${FEE_PRESET_LEVEL_TITLE[label]} fee (~${confirmationTargetBlocks} ${blockWord})`,
      infoText: FEE_PRESET_INFO_TEXT[label](confirmationTargetBlocks),
    }
    return acc
  },
  {} as Record<SendFeePresetLabel, { infoTitle: string; infoText: string }>,
)
