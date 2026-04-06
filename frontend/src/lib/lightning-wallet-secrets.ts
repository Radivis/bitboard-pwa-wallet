import { getDatabase } from '@/db/database'
import { encryptData } from '@/db/encryption'
import {
  loadWalletSecretsPayload,
  putSplitWalletSecretsEncrypted,
} from '@/db/wallet-persistence'
import type {
  StoredNwcLightningConnection,
  WalletSecretsPayload,
} from '@/lib/wallet-domain-types'
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
  const payload = await loadWalletSecretsPayload(getDatabase(), password, walletId)
  return payload.lightningNwcConnections.map((s) =>
    storedToConnected(walletId, s),
  )
}

export async function saveLightningConnectionsForWallet(params: {
  password: string
  walletId: number
  connections: ConnectedLightningWallet[]
}): Promise<void> {
  const { password, walletId, connections } = params
  const payload = await loadWalletSecretsPayload(getDatabase(), password, walletId)
  const nwcOnly = connections.filter((c) => c.walletId === walletId)
  const merged: WalletSecretsPayload = {
    ...payload,
    lightningNwcConnections: nwcOnly.map(connectedWalletToStored),
  }
  const payloadEnc = await encryptData(password, JSON.stringify(merged))
  await putSplitWalletSecretsEncrypted(getDatabase(), walletId, {
    payload: {
      ciphertext: payloadEnc.ciphertext,
      iv: payloadEnc.iv,
      salt: payloadEnc.salt,
      kdfVersion: payloadEnc.kdfVersion,
    },
  })
}
