export const WALLET_OWNER_PREFIX = 'wallet:'

export function getOwnerDisplayName(
  ownerKey: string,
  wallets: { wallet_id: number; name: string }[],
): string {
  if (ownerKey.startsWith(WALLET_OWNER_PREFIX)) {
    const id = parseInt(ownerKey.slice(WALLET_OWNER_PREFIX.length), 10)
    return wallets.find((w) => w.wallet_id === id)?.name ?? 'Unknown wallet'
  }
  return ownerKey
}

export function getOwnerIcon(ownerKey: string): 'wallet' | 'flask' {
  return ownerKey.startsWith(WALLET_OWNER_PREFIX) ? 'wallet' : 'flask'
}
