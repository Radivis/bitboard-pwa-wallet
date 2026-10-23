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

/** Maps the stored connection list to the next one. May run again after a CAS conflict. */
export type LightningConnectionsUpdate = (
  storedConnections: ConnectedLightningWallet[],
) => ConnectedLightningWallet[]

/** Keeps each connection's stored NWC snapshot, which the connected-wallet shape does not carry. */
function storedConnectionsWithSnapshots(
  previousConnections: StoredNwcLightningConnection[],
  nextConnections: ConnectedLightningWallet[],
): StoredNwcLightningConnection[] {
  const previousById = new Map(
    previousConnections.map((storedConnection) => [storedConnection.id, storedConnection] as const),
  )
  return nextConnections.map((connection) => {
    const base = connectedWalletToStored(connection)
    const previous = previousById.get(connection.id)
    return previous?.nwcSnapshot != null ? { ...base, nwcSnapshot: previous.nwcSnapshot } : base
  })
}

/**
 * Runs `updateConnections` on the stored list inside the wallet-secrets CAS, so a change
 * another writer committed after the caller's read is kept. Returns the list that was written.
 */
export async function updateLightningConnectionsForWallet(params: {
  walletId: number
  updateConnections: LightningConnectionsUpdate
}): Promise<ConnectedLightningWallet[]> {
  const { walletId, updateConnections } = params
  let writtenConnections: ConnectedLightningWallet[] | null = null
  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    transform: async (payload): Promise<WalletSecretsPayload> => {
      const storedConnections = payload.lightningNwcConnections.map((storedConnection) =>
        storedToConnected(walletId, storedConnection),
      )
      const nextConnections = updateConnections(storedConnections).filter(
        (connection) => connection.walletId === walletId,
      )
      writtenConnections = nextConnections
      return {
        ...payload,
        lightningNwcConnections: storedConnectionsWithSnapshots(
          payload.lightningNwcConnections,
          nextConnections,
        ),
      }
    },
  })
  if (writtenConnections == null) {
    throw new Error('Lightning connections update finished without writing')
  }
  return writtenConnections
}
