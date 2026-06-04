import { isValidArkAddress } from '@arkade-os/sdk'

/** Returns whether `address` is a valid Arkade receive address (ark1 / tark1). */
export function isValidArkadeAddress(address: string): boolean {
  const trimmed = address.trim()
  if (trimmed.length === 0) return false
  return isValidArkAddress(trimmed)
}
