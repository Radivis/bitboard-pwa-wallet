import { getDatabase } from '@/db/database'
import { encryptData } from '@/db/encryption'
import {
  loadWalletSecretsPayload,
  putSplitWalletSecretsEncrypted,
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

  const payload = await loadWalletSecretsPayload(getDatabase(), password, walletId)
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
  const mergedPayload: WalletSecretsPayload = {
    ...payload,
    lightningNwcConnections: nextList,
  }
  const payloadEnc = await encryptData(
    password,
    JSON.stringify(mergedPayload),
  )
  await putSplitWalletSecretsEncrypted(getDatabase(), walletId, {
    payload: {
      ciphertext: payloadEnc.ciphertext,
      iv: payloadEnc.iv,
      salt: payloadEnc.salt,
      kdfVersion: payloadEnc.kdfVersion,
    },
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
