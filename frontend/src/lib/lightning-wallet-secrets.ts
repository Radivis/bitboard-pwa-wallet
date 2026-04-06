import { getDatabase } from '@/db/database'
import {
  loadWalletSecrets,
  saveWalletSecrets,
  type WalletSecrets,
} from '@/db/wallet-persistence'
import type { StoredNwcLightningConnection } from '@/lib/wallet-domain-types'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'

function storedToConnected(
  walletId: number,
  s: StoredNwcLightningConnection,
): ConnectedLightningWallet {
  return {
    id: s.id,
    walletId,
    label: s.label,
    networkMode: s.networkMode,
    config: { type: 'nwc', connectionString: s.connectionString },
    createdAt: s.createdAt,
  }
}

export function connectedWalletToStored(
  w: ConnectedLightningWallet,
): StoredNwcLightningConnection {
  if (w.config.type !== 'nwc') {
    throw new Error('Only NWC connections are stored in wallet secrets')
  }
  return {
    id: w.id,
    label: w.label,
    networkMode: w.networkMode,
    connectionString: w.config.connectionString,
    createdAt: w.createdAt,
  }
}

export async function loadLightningConnectionsForWallet(params: {
  password: string
  walletId: number
}): Promise<ConnectedLightningWallet[]> {
  const { password, walletId } = params
  const secrets = await loadWalletSecrets(getDatabase(), password, walletId)
  return secrets.lightningNwcConnections.map((s) =>
    storedToConnected(walletId, s),
  )
}

export async function saveLightningConnectionsForWallet(params: {
  password: string
  walletId: number
  connections: ConnectedLightningWallet[]
}): Promise<void> {
  const { password, walletId, connections } = params
  const secrets = await loadWalletSecrets(getDatabase(), password, walletId)
  const nwcOnly = connections.filter((c) => c.walletId === walletId)
  const merged: WalletSecrets = {
    ...secrets,
    lightningNwcConnections: nwcOnly.map(connectedWalletToStored),
  }
  await saveWalletSecrets({
    walletDb: getDatabase(),
    password,
    walletId,
    secrets: merged,
  })
}
