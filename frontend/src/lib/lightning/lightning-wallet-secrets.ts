import { getDatabase } from '@/db/database'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import type {
  StoredNwcLightningConnection,
  WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import type { ConnectedLightningWallet } from '@/lib/lightning/lightning-backend-service'

function storedToConnected(
  walletId: number,
  storedConnection: StoredNwcLightningConnection,
): ConnectedLightningWallet {
  return {
    id: storedConnection.id,
    walletId,
    label: storedConnection.label,
    networkMode: storedConnection.networkMode,
    config: { type: 'nwc', connectionString: storedConnection.connectionString },
    createdAt: storedConnection.createdAt,
  }
}

export function connectedWalletToStored(
  connectedWallet: ConnectedLightningWallet,
): StoredNwcLightningConnection {
  if (connectedWallet.config.type !== 'nwc') {
    throw new Error('Only NWC connections are stored in wallet secrets')
  }
  return {
    id: connectedWallet.id,
    label: connectedWallet.label,
    networkMode: connectedWallet.networkMode,
    connectionString: connectedWallet.config.connectionString,
    createdAt: connectedWallet.createdAt,
  }
}

export async function loadLightningConnectionsForWallet(params: {
  walletId: number
}): Promise<ConnectedLightningWallet[]> {
  const { walletId } = params
  const payload = await loadWalletSecretsPayload(getDatabase(), walletId)
  return payload.lightningNwcConnections.map((storedConnection) =>
    storedToConnected(walletId, storedConnection),
  )
}

export async function saveLightningConnectionsForWallet(params: {
  walletId: number
  connections: ConnectedLightningWallet[]
}): Promise<void> {
  const { walletId, connections } = params
  const nwcOnly = connections.filter((connection) => connection.walletId === walletId)
  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    transform: async (payload): Promise<WalletSecretsPayload> => {
      const previousById = new Map(
        payload.lightningNwcConnections.map(
          (storedConnection) => [storedConnection.id, storedConnection] as const,
        ),
      )
      return {
        ...payload,
        lightningNwcConnections: nwcOnly.map((connection) => {
          const base = connectedWalletToStored(connection)
          const prev = previousById.get(connection.id)
          if (prev?.nwcSnapshot != null) {
            return { ...base, nwcSnapshot: prev.nwcSnapshot }
          }
          return base
        }),
      }
    },
  })
}
