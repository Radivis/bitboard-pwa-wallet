import {
  applyBarkRecordDump,
  applyOpenedBarkAccount,
  applyPendingEmergencyClaim,
  applyProceedAutomatically,
  findBarkAccount,
  recordDumpForOpen,
} from '@/lib/bark/bark-rail-metadata'
import {
  parseWalletPayloadJson,
  type BarkRailNetwork,
  type PendingEmergencyClaim,
  type StoredBarkAccount,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import {
  updateDecryptedWalletPayload,
  type WorkerWalletPayloadDeps,
} from '@/workers/worker-wallet-payload-update'

export type BarkEncryptedPayloadDeps = WorkerWalletPayloadDeps

async function readDecryptedWalletPayload(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
): Promise<WalletSecretsPayload> {
  const encryptedPayload = await deps.encryptedHost.readEncryptedPayload(walletId)
  const plaintext = await deps.secretsProxy.decrypt({
    ciphertext: encryptedPayload.ciphertext,
    iv: encryptedPayload.iv,
    salt: encryptedPayload.salt,
    kdfPhc: encryptedPayload.kdfPhc,
  })
  return parseWalletPayloadJson(plaintext)
}

/** Stored receive cursor for one network, if that account has one. Does not reveal. */
export async function readStoredBarkReceiveKeyIndex(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
): Promise<number | undefined> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return findBarkAccount(payload, network)?.receiveKeyIndex
}

/** Dump to pass into `bark_open_session`. Empty when this account has no dump yet. */
export async function readRecordDumpForOpen(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
): Promise<string> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return recordDumpForOpen(payload, network)
}

/**
 * Writes or updates `barkAccounts` after open. Replaces that network's dump only.
 * Does not rewrite the other network or `sdkPersistenceJson`.
 */
export async function persistOpenedBarkAccount(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  fingerprint: string,
  receiveKeyIndex: number,
  recordDump: string,
): Promise<StoredBarkAccount> {
  const nextPayload = await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyOpenedBarkAccount({
      payload,
      network,
      fingerprint,
      receiveKeyIndex,
      recordDump,
    }),
  )
  const account = findBarkAccount(nextPayload, network)
  if (account == null) {
    throw new Error('Bark account is missing')
  }
  return account
}

/**
 * Replaces one network's dump, and optional cursor or sync time, after a protocol write.
 * On a revision conflict, re-reads and applies the same dump onto the newer payload.
 */
export async function persistBarkProtocolState(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  update: {
    recordDump: string
    receiveKeyIndex?: number
    lastSuccessfulSyncAt?: string
  },
): Promise<void> {
  await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyBarkRecordDump({
      payload,
      network,
      recordDump: update.recordDump,
      receiveKeyIndex: update.receiveKeyIndex,
      lastSuccessfulSyncAt: update.lastSuccessfulSyncAt,
    }),
  )
}

/** Broadcast claim that Bark has not observed, if this account has one. */
export async function readPendingEmergencyClaim(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
): Promise<PendingEmergencyClaim | null> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return findBarkAccount(payload, network)?.pendingEmergencyClaim ?? null
}

/** Writes or clears the pending claim before the claim call returns. */
export async function writePendingEmergencyClaim(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  pending: PendingEmergencyClaim | null,
): Promise<void> {
  await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyPendingEmergencyClaim({ payload, network, pending }),
  )
}

/** True only when this account stored automatic emergency-exit proceeding. */
export async function readProceedAutomatically(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
): Promise<boolean> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return findBarkAccount(payload, network)?.proceedAutomatically === true
}

/** Writes or clears automatic emergency-exit proceeding for the open rail. */
export async function writeProceedAutomatically(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  enabled: boolean,
): Promise<void> {
  await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyProceedAutomatically({ payload, network, enabled }),
  )
}
