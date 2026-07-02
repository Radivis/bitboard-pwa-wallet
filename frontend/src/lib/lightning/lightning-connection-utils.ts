import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'
import { useFeatureStore } from '@/stores/featureStore'
import { useLightningStore } from '@/stores/lightningStore'
import { useWalletStore } from '@/stores/walletStore'
import type { NetworkMode } from '@/stores/walletStore'
import {
  isLightningSupported,
  LIGHTNING_NETWORK_MODES,
  type LightningNetworkMode,
} from '@/lib/lightning/lightning-utils'

export type ActiveLightningConnectionsByNetwork = Partial<
  Record<LightningNetworkMode, string>
>

export type GetLightningConnectionsForActiveWalletParams = {
  connectedLightningWallets: ConnectedLightningWallet[]
  activeWalletId: number | null
  networkMode: NetworkMode
  isLightningEnabled: boolean
}

/**
 * Lightning connections for the active Bitcoin wallet that match the app’s
 * network mode (e.g. Signet NWC when the app is on Signet). Returns an empty
 * array when Lightning is disabled, there is no active wallet, or the network
 * does not support Lightning.
 */
export function getLightningConnectionsForActiveWallet(
  params: GetLightningConnectionsForActiveWalletParams,
): ConnectedLightningWallet[] {
  const { connectedLightningWallets, activeWalletId, networkMode, isLightningEnabled } =
    params
  if (
    !isLightningEnabled ||
    activeWalletId == null ||
    !isLightningSupported(networkMode)
  ) {
    return []
  }
  const lnMode = networkMode as LightningNetworkMode
  return connectedLightningWallets.filter(
    (w) => w.walletId === activeWalletId && w.networkMode === lnMode,
  )
}

function connectionsForWalletAndNetwork(
  connections: ConnectedLightningWallet[],
  walletId: number,
  networkMode: LightningNetworkMode,
): ConnectedLightningWallet[] {
  return connections.filter(
    (connection) =>
      connection.walletId === walletId && connection.networkMode === networkMode,
  )
}

/**
 * Keeps persisted active-connection picks in sync after hydration or when stored
 * IDs no longer match loaded wallet secrets (e.g. after restore or migration).
 */
export function reconcileActiveLightningConnectionIds(params: {
  walletId: number
  connections: ConnectedLightningWallet[]
  activeConnectionIds: Record<number, ActiveLightningConnectionsByNetwork>
}): Record<number, ActiveLightningConnectionsByNetwork> {
  const { walletId, connections, activeConnectionIds } = params
  const walletConnections = connections.filter(
    (connection) => connection.walletId === walletId,
  )
  const perNetwork: ActiveLightningConnectionsByNetwork = {
    ...(activeConnectionIds[walletId] ?? {}),
  }

  for (const networkMode of LIGHTNING_NETWORK_MODES) {
    const forNetwork = connectionsForWalletAndNetwork(
      walletConnections,
      walletId,
      networkMode,
    )
    if (forNetwork.length === 0) {
      delete perNetwork[networkMode]
      continue
    }
    const activeId = perNetwork[networkMode]
    const activeStillValid =
      activeId != null && forNetwork.some((connection) => connection.id === activeId)
    if (!activeStillValid) {
      perNetwork[networkMode] = forNetwork[0].id
    }
  }

  const nextActiveConnectionIds = { ...activeConnectionIds }
  if (Object.keys(perNetwork).length === 0) {
    delete nextActiveConnectionIds[walletId]
  } else {
    nextActiveConnectionIds[walletId] = perNetwork
  }
  return nextActiveConnectionIds
}

/**
 * Resolves the active NWC connection for invoice creation and receive UI.
 * Falls back to the sole matching connection when no valid active id is stored.
 */
export function resolveActiveLightningConnection(params: {
  connectedWallets: ConnectedLightningWallet[]
  activeConnectionIds: Record<number, ActiveLightningConnectionsByNetwork>
  walletId: number
  networkMode: NetworkMode
}): ConnectedLightningWallet | null {
  const { connectedWallets, activeConnectionIds, walletId, networkMode } = params
  if (!isLightningSupported(networkMode)) {
    return null
  }
  const lnMode = networkMode as LightningNetworkMode
  const matchingConnections = connectionsForWalletAndNetwork(
    connectedWallets,
    walletId,
    lnMode,
  )
  if (matchingConnections.length === 0) {
    return null
  }

  const activeId = activeConnectionIds[walletId]?.[lnMode]
  if (activeId != null) {
    const activeConnection = matchingConnections.find(
      (connection) => connection.id === activeId,
    )
    if (activeConnection != null) {
      return activeConnection
    }
  }

  return matchingConnections[0]
}

/** Dashboard-scoped NWC connections for the active wallet and current network. */
export function getMatchingLightningConnectionsForDashboard(): ConnectedLightningWallet[] {
  const { activeWalletId, networkMode } = useWalletStore.getState()
  const { isLightningEnabled } = useFeatureStore.getState()
  const { connectedWallets } = useLightningStore.getState()

  return getLightningConnectionsForActiveWallet({
    connectedLightningWallets: connectedWallets,
    activeWalletId,
    networkMode,
    isLightningEnabled,
  })
}
