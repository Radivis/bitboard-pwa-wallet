import { sqliteStorage } from '@/db/storage-adapter'
import { getDatabase, ensureMigrated } from '@/db/database'
import {
  loadWalletSecrets,
  saveWalletSecrets,
  type WalletSecrets,
} from '@/db/wallet-persistence'
import type { StoredNwcLightningConnection } from '@/lib/wallet-domain-types'
import {
  MAX_LIGHTNING_WALLET_LABEL_LENGTH,
  MAX_NWC_CONNECTION_STRING_LENGTH,
} from '@/lib/lightning-input-limits'
import type { ConnectedLightningWallet } from '@/lib/lightning-backend-service'
import { isValidNwcConnectionString } from '@/lib/lightning-backend-service'

const LIGHTNING_STORAGE_KEY = 'lightning-storage'

/** Zustand persist envelope written to `settings`. */
interface LightningPersistEnvelope {
  state?: {
    connectedWallets?: LegacyConnectedWalletRow[]
    activeConnectionIds?: Record<number, Record<string, string>>
    invoices?: unknown[]
  }
  version?: number
}

interface LegacyConnectedWalletRow {
  id: string
  walletId: number
  label: string
  networkMode: StoredNwcLightningConnection['networkMode']
  config: { type: 'nwc'; connectionString: string }
  createdAt: string
}

function clampStoredRow(
  row: LegacyConnectedWalletRow,
): StoredNwcLightningConnection | null {
  const cs = row.config.connectionString.trim()
  if (!isValidNwcConnectionString(cs)) return null
  return {
    id: row.id,
    label: row.label.slice(0, MAX_LIGHTNING_WALLET_LABEL_LENGTH),
    networkMode: row.networkMode,
    connectionString: cs.slice(0, MAX_NWC_CONNECTION_STRING_LENGTH),
    createdAt: row.createdAt,
  }
}

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

/**
 * One-time migration: plain `lightning-storage` had `connectedWallets` with NWC URIs.
 * Moves those into each wallet's encrypted `wallet_secrets` row and rewrites settings
 * without `connectedWallets`.
 */
export async function migrateLegacyLightningStorageIfNeeded(
  password: string,
): Promise<void> {
  await ensureMigrated()
  const raw = await sqliteStorage.getItem(LIGHTNING_STORAGE_KEY)
  if (!raw) return

  let envelope: LightningPersistEnvelope
  try {
    envelope = JSON.parse(raw) as LightningPersistEnvelope
  } catch {
    return
  }

  const legacy = envelope.state?.connectedWallets
  if (!Array.isArray(legacy) || legacy.length === 0) return

  const byWallet = new Map<number, LegacyConnectedWalletRow[]>()
  for (const row of legacy) {
    if (
      row &&
      typeof row === 'object' &&
      typeof row.walletId === 'number' &&
      row.config?.type === 'nwc' &&
      typeof row.config.connectionString === 'string'
    ) {
      const list = byWallet.get(row.walletId) ?? []
      list.push(row as LegacyConnectedWalletRow)
      byWallet.set(row.walletId, list)
    }
  }

  for (const [walletId, rows] of byWallet) {
    try {
      const secrets = await loadWalletSecrets(getDatabase(), password, walletId)
      const existing = secrets.lightningNwcConnections ?? []
      const byId = new Map(existing.map((s) => [s.id, s]))
      for (const row of rows) {
        const clamped = clampStoredRow(row)
        if (clamped) byId.set(clamped.id, clamped)
      }
      const merged: WalletSecrets = {
        ...secrets,
        lightningNwcConnections: [...byId.values()],
      }
      await saveWalletSecrets({
        walletDb: getDatabase(),
        password,
        walletId,
        secrets: merged,
      })
    } catch (err) {
      console.warn(
        `[lightning] Legacy migration skipped for wallet ${walletId}:`,
        err,
      )
    }
  }

  const newState = { ...envelope.state, connectedWallets: undefined }
  const newEnvelope: LightningPersistEnvelope = {
    ...envelope,
    state: newState,
  }
  await sqliteStorage.setItem(
    LIGHTNING_STORAGE_KEY,
    JSON.stringify(newEnvelope),
  )
}

export async function loadLightningConnectionsForWallet(params: {
  password: string
  walletId: number
}): Promise<ConnectedLightningWallet[]> {
  const { password, walletId } = params
  const secrets = await loadWalletSecrets(getDatabase(), password, walletId)
  const rows = secrets.lightningNwcConnections ?? []
  return rows.map((s) => storedToConnected(walletId, s))
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
