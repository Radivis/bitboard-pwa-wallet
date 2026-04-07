import { getDatabase } from '@/db/database'
import {
  loadWalletSecretsPayload,
  updateWalletSecretsPayloadWithRetry,
} from '@/db/wallet-persistence'
import type { LightningPayment } from '@/lib/lightning-backend-service'
import { capLightningPaymentsForSnapshot } from '@/lib/lightning-snapshot-payload'
import type { NwcConnectionSnapshot, WalletSecretsPayload } from '@/lib/wallet-domain-types'

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

/** Stable fingerprint for comparing which NWC rows exist (detect concurrent payload updates). */
export function lightningNwcConnectionIdsFingerprint(
  connections: { id: string }[],
): string {
  return [...connections.map((c) => c.id)].sort().join('\0')
}

/**
 * Merges snapshot patches into a payload copy (does not read from DB).
 */
export function applyNwcSnapshotPatchesToPayload(
  payload: WalletSecretsPayload,
  patches: NwcSnapshotPatch[],
): WalletSecretsPayload {
  const byId = new Map(
    payload.lightningNwcConnections.map((c) => [c.id, { ...c }] as const),
  )

  for (const p of patches) {
    const row = byId.get(p.connectionId)
    if (row == null) continue
    const nextSnapshot = mergeNwcConnectionSnapshot(row.nwcSnapshot, {
      balance: p.balance,
      payments: p.payments,
    })
    byId.set(p.connectionId, { ...row, nwcSnapshot: nextSnapshot })
  }

  const nextList = payload.lightningNwcConnections.map(
    (c) => byId.get(c.id) ?? c,
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
  password: string
  walletId: number
  patches: NwcSnapshotPatch[]
}): Promise<void> {
  const { password, walletId, patches } = params
  if (patches.length === 0) return

  await updateWalletSecretsPayloadWithRetry({
    walletDb: getDatabase(),
    walletId,
    password,
    transform: async (payload) =>
      applyNwcSnapshotPatchesToPayload(payload, patches),
  })
}

export async function loadNwcSnapshotForConnection(params: {
  password: string
  walletId: number
  connectionId: string
}): Promise<NwcConnectionSnapshot | undefined> {
  const { password, walletId, connectionId } = params
  const payload = await loadWalletSecretsPayload(
    getDatabase(),
    password,
    walletId,
  )
  const row = payload.lightningNwcConnections.find((c) => c.id === connectionId)
  return row?.nwcSnapshot
}

export function snapshotMapFromPayload(
  payload: WalletSecretsPayload,
): Map<string, NwcConnectionSnapshot | undefined> {
  return new Map(
    payload.lightningNwcConnections.map((c) => [c.id, c.nwcSnapshot]),
  )
}
