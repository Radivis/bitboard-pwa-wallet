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

/** Stable fingerprint for comparing which NWC rows exist (detect concurrent payload updates). */
export function lightningNwcConnectionIdsFingerprint(
  connections: { id: string }[],
): string {
  return [...connections.map((c) => c.id)].sort().join('\0')
}

function sameLightningConnectionSet(
  left: { id: string }[],
  right: { id: string }[],
): boolean {
  return (
    lightningNwcConnectionIdsFingerprint(left) ===
    lightningNwcConnectionIdsFingerprint(right)
  )
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

const BATCH_APPLY_NWC_SNAPSHOT_MAX_RETRIES = 8
let nwcSnapshotWriteQueue: Promise<void> = Promise.resolve()

async function runInNwcSnapshotWriteQueue<T>(
  work: () => Promise<T>,
): Promise<T> {
  const previous = nwcSnapshotWriteQueue
  let release: () => void = () => {}
  nwcSnapshotWriteQueue = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await work()
  } finally {
    release()
  }
}

/**
 * Applies snapshot patches in one decrypt + encrypt cycle.
 *
 * Uses a two-phase guard to avoid clobbering concurrent connection-row updates:
 * - A cheap pre-check skips encryption when the payload is already stale.
 * - A pre-write check catches races that occur during encryption.
 */
export async function batchApplyNwcSnapshotPatches(params: {
  password: string
  walletId: number
  patches: NwcSnapshotPatch[]
}): Promise<void> {
  const { password, walletId, patches } = params
  if (patches.length === 0) return

  await runInNwcSnapshotWriteQueue(async () => {
    const walletDb = getDatabase()

    for (let attempt = 0; attempt < BATCH_APPLY_NWC_SNAPSHOT_MAX_RETRIES; attempt += 1) {
      const payload = await loadWalletSecretsPayload(walletDb, password, walletId)
      const latestBeforeEncrypt = await loadWalletSecretsPayload(
        walletDb,
        password,
        walletId,
      )
      if (
        !sameLightningConnectionSet(
          latestBeforeEncrypt.lightningNwcConnections,
          payload.lightningNwcConnections,
        )
      ) {
        continue
      }

      const mergedPayload = applyNwcSnapshotPatchesToPayload(payload, patches)
      const payloadEnc = await encryptData(
        password,
        JSON.stringify(mergedPayload),
      )
      const latestBeforeWrite = await loadWalletSecretsPayload(
        walletDb,
        password,
        walletId,
      )
      if (
        !sameLightningConnectionSet(
          latestBeforeWrite.lightningNwcConnections,
          payload.lightningNwcConnections,
        )
      ) {
        continue
      }
      await putSplitWalletSecretsEncrypted(walletDb, walletId, {
        payload: {
          ciphertext: payloadEnc.ciphertext,
          iv: payloadEnc.iv,
          salt: payloadEnc.salt,
          kdfVersion: payloadEnc.kdfVersion,
        },
      })
      return
    }

    const payload = await loadWalletSecretsPayload(walletDb, password, walletId)
    const mergedPayload = applyNwcSnapshotPatchesToPayload(payload, patches)
    const payloadEnc = await encryptData(
      password,
      JSON.stringify(mergedPayload),
    )
    await putSplitWalletSecretsEncrypted(walletDb, walletId, {
      payload: {
        ciphertext: payloadEnc.ciphertext,
        iv: payloadEnc.iv,
        salt: payloadEnc.salt,
        kdfVersion: payloadEnc.kdfVersion,
      },
    })
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
