export const SEND_FEE_PRESETS = [
  { label: 'Low', rate: 1 },
  { label: 'Medium', rate: 3 },
  { label: 'High', rate: 5 },
] as const

export type SendFeePresetLabel = (typeof SEND_FEE_PRESETS)[number]['label']

export const SEND_FEE_PRESET_INFOMODE: Record<
  SendFeePresetLabel,
  { infoTitle: string; infoText: string }
> = {
  Low: {
    infoTitle: 'Low fee',
    infoText:
      'Best when the mempool is calm or you do not care if confirmation takes longer. You pay less total fee, but in a busy period your transaction might sit unconfirmed longer than with Medium or High.',
  },
  Medium: {
    infoTitle: 'Medium fee',
    infoText:
      'A reasonable default when you want a normal confirmation time without overpaying. Pick this for typical transfers if you are unsure—then switch to High if blocks are full or you are in a hurry, or Low if you are happy to wait.',
  },
  High: {
    infoTitle: 'High fee',
    infoText:
      'Use when you want priority during congestion—paying more per vB makes it more attractive for miners to include your transaction in the next blocks. Good for time-sensitive payments; you spend more in fees than with Low or Medium.',
  },
}
