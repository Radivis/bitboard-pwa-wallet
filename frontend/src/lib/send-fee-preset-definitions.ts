/**
 * Single source of truth for Send fee presets: fallback rates (sat/vB) and Esplora
 * `/fee-estimates` confirmation-target block counts used by preset buttons.
 */

/** Lab or failed-fetch fallback (sat/vB), aligned with mempool-style scale. */
export const NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB = {
  Low: 0.5,
  Medium: 2,
  High: 10,
} as const

export type SendFeePresetLabel =
  keyof typeof NON_ESPLORA_FEE_PRESET_RATES_SAT_PER_VB

/**
 * Confirmation targets consumed by Esplora mapping and UX copy — keep aligned with backend / wallet UX.
 */
export const SEND_FEE_PRESET_ENTRIES = [
  { label: 'Low' as const, confirmationTargetBlocks: 144 },
  { label: 'Medium' as const, confirmationTargetBlocks: 6 },
  { label: 'High' as const, confirmationTargetBlocks: 1 },
] as const satisfies ReadonlyArray<{
  label: SendFeePresetLabel
  confirmationTargetBlocks: number
}>
