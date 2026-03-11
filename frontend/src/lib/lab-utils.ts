export const WALLET_OWNER_PREFIX = 'wallet:'

export function displayOwner(owner: string): string {
  return owner.startsWith(WALLET_OWNER_PREFIX) ? owner.slice(WALLET_OWNER_PREFIX.length) : owner
}
