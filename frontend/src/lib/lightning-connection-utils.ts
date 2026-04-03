import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'
import type { NetworkMode } from '@/stores/walletStore'
import {
  isLightningSupported,
  type LightningNetworkMode,
} from '@/lib/lightning-utils'

/**
 * Lightning connections for the active Bitcoin wallet that match the app’s
 * network mode (e.g. Signet NWC when the app is on Signet). Returns an empty
 * array when Lightning is disabled, there is no active wallet, or the network
 * does not support Lightning.
 */
export function getLightningConnectionsForActiveWallet(
  connectedWallets: ConnectedLightningWallet[],
  activeWalletId: number | null,
  networkMode: NetworkMode,
  lightningEnabled: boolean,
): ConnectedLightningWallet[] {
  if (
    !lightningEnabled ||
    activeWalletId == null ||
    !isLightningSupported(networkMode)
  ) {
    return []
  }
  const lnMode = networkMode as LightningNetworkMode
  return connectedWallets.filter(
    (w) => w.walletId === activeWalletId && w.networkMode === lnMode,
  )
}
