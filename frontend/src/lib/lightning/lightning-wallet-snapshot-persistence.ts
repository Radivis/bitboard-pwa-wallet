import { getDatabase } from '@/db/database'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import type { LightningPayment } from '@/lib/lightning/lightning-backend-service'
import { capLightningPaymentsForSnapshot } from '@/lib/lightning/lightning-snapshot-payload'
import type { NwcConnectionSnapshot, WalletSecretsPayload } from '@/lib/wallet/wallet-domain-types'

export function mergeNwcConnectionSnapshot(
  prev: NwcConnectionSnapshot | undefined,
  patch: {
    balance?: { balanceSats: number; balanceUpdatedAt: string }
    payments?: { payments: LightningPayment[]; paymentsUpdatedAt: string }
  },
): NwcConnectionSnapshot {
  const balanceSats = patch.balance?.balanceSats ?? prev?.balanceSats ?? 0
  const balanceUpdatedAt =
    patch.balance?.balanceUpdatedAt ??
    prev?.balanceUpdatedAt ??
    patch.payments?.paymentsUpdatedAt ??
    ''
  const cappedPayments =
    patch.payments != null
      ? capLightningPaymentsForSnapshot(patch.payments.payments)
      : (prev?.payments ?? [])
  const paymentsUpdatedAt =
    patch.payments?.paymentsUpdatedAt ??
    prev?.paymentsUpdatedAt ??
    patch.balance?.balanceUpdatedAt ??
    balanceUpdatedAt

  return {
    balanceSats,
    balanceUpdatedAt,
    payments: cappedPayments,
    paymentsUpdatedAt,
  }
}

export type NwcSnapshotPatch = {
  connectionId: string
  balance?: { balanceSats: number; balanceUpdatedAt: string }
  payments?: { payments: LightningPayment[]; paymentsUpdatedAt: string }
}

/**
 * Merges snapshot patches into a payload copy (does not read from DB).
 */
export function applyNwcSnapshotPatchesToPayload(
  payload: WalletSecretsPayload,
  patches: NwcSnapshotPatch[],
): WalletSecretsPayload {
  const byId = new Map(
    payload.lightningNwcConnections.map(
      (storedConnection) => [storedConnection.id, { ...storedConnection }] as const,
    ),
  )

  for (const patch of patches) {
    const connectionEntry = byId.get(patch.connectionId)
    if (connectionEntry == null) continue
    const nextSnapshot = mergeNwcConnectionSnapshot(connectionEntry.nwcSnapshot, {
      balance: patch.balance,
      payments: patch.payments,
    })
    byId.set(patch.connectionId, {
      ...connectionEntry,
      nwcSnapshot: nextSnapshot,
    })
  }

  const nextList = payload.lightningNwcConnections.map(
    (storedConnection) => byId.get(storedConnection.id) ?? storedConnection,
  )
  return {
    ...payload,
    lightningNwcConnections: nextList,
  }
}

/**
 * Applies snapshot patches in one decrypt + encrypt cycle.
 */
export async function batchApplyNwcSnapshotPatches(params: {
  walletId: number
  patches: NwcSnapshotPatch[]
}): Promise<void> {
  const { walletId, patches } = params
  if (patches.length === 0) return

  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    transform: async (payload) =>
      applyNwcSnapshotPatchesToPayload(payload, patches),
  })
}

export async function loadNwcSnapshotForConnection(params: {
  walletId: number
  connectionId: string
}): Promise<NwcConnectionSnapshot | undefined> {
  const { walletId, connectionId } = params
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    walletId,
  )
  const nwcConnection = payload.lightningNwcConnections.find(
    (storedConnection) => storedConnection.id === connectionId,
  )
  return nwcConnection?.nwcSnapshot
}

export function snapshotMapFromPayload(
  payload: WalletSecretsPayload,
): Map<string, NwcConnectionSnapshot | undefined> {
  return new Map(
    payload.lightningNwcConnections.map((storedConnection) => [
      storedConnection.id,
      storedConnection.nwcSnapshot,
    ]),
  )
}
