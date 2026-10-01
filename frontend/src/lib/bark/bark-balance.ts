/** Accepts the `u64` wasm-bindgen returns as a bigint, or a safe integer number. */
export function readBarkSpendableSats(value: unknown): number {
  const spendableSats =
    typeof value === 'bigint' || typeof value === 'number' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(spendableSats) || spendableSats < 0) {
    throw new Error('Bark balance is not a spendable satoshi count')
  }
  return spendableSats
}
