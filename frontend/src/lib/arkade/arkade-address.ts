const ARKADE_ADDRESS_PREFIX = /^(ark1|tark1)[a-z0-9]+$/i

/** Returns whether `address` is a valid Arkade receive address (ark1 / tark1). */
export function isValidArkadeAddress(address: string): boolean {
  const trimmed = address.trim()
  if (trimmed.length === 0) return false
  return ARKADE_ADDRESS_PREFIX.test(trimmed)
}
