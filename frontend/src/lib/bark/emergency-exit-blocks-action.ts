export const BARK_EMERGENCY_EXIT_BLOCKS_ACTION =
  'This cannot succeed until you cancel the emergency exit.'

/** The amount does not fit in spendable coins, and an emergency exit is holding some. */
export function barkEmergencyExitBlocksAmount({
  amountSats,
  spendableSats,
  exitingSats,
}: {
  amountSats: number
  spendableSats: number | null
  exitingSats: number | null
}): boolean {
  if (spendableSats == null || exitingSats == null) return false
  return exitingSats > 0 && amountSats > spendableSats
}
