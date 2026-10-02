const ARKADE_ADDRESS_PREFIX = /^(ark1|tark1)[a-z0-9]+$/i
/** Bark policy addresses use version `p` (`tark1p` / `ark1p`) and are not Arkade destinations. */
const BARK_POLICY_ADDRESS_VERSION = /^(ark1|tark1)p/i

/** Returns whether `address` is an Arkade receive address (version `q`, not Bark `p`). */
export function isValidArkadeAddress(address: string): boolean {
  const trimmed = address.trim()
  if (trimmed.length === 0) return false
  if (BARK_POLICY_ADDRESS_VERSION.test(trimmed)) return false
  return ARKADE_ADDRESS_PREFIX.test(trimmed)
}
