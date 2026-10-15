import {
  applyBarkRecordEnvelope,
  applyClearedExitSeizureNotice,
  applyEmergencyExitFeePreset,
  applyEmergencyExitMaxFeeRate,
  applyMergedExitSeizureVtxoIds,
  applyOpenedBarkAccount,
  applyPendingEmergencyClaim,
  applyProceedAutomatically,
  findBarkAccount,
  recordEnvelopeForOpen,
} from '@/lib/bark/bark-rail-metadata'
import {
  DEFAULT_BARK_EMERGENCY_EXIT_FEE_PRESET,
  emergencyExitFeePresetFromUnknown,
  emergencyExitMaxFeeRateFromUnknown,
  parseWalletPayloadJson,
  type BarkEmergencyExitFeePreset,
  type BarkRailNetwork,
  type PendingEmergencyClaim,
  type StoredBarkAccount,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import {
  updateDecryptedWalletPayload,
  type WorkerWalletPayloadDeps,
} from '@/workers/worker-wallet-payload-update'
import type { BarkEmergencyExitFeePrefs } from '@/workers/bark-api'

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

/** Envelope to pass into `bark_open_session`. Empty when this account has no envelope yet. */
export async function readRecordEnvelopeForOpen(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
): Promise<string> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return recordEnvelopeForOpen(payload, network)
}

/**
 * Writes or updates `barkAccounts` after open. Replaces that network's envelope only.
 * Does not rewrite the other network or `sdkPersistenceJson`.
 */
export async function persistOpenedBarkAccount(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  fingerprint: string,
  receiveKeyIndex: number,
  recordEnvelope: string,
): Promise<StoredBarkAccount> {
  const nextPayload = await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyOpenedBarkAccount({
      payload,
      network,
      fingerprint,
      receiveKeyIndex,
      recordEnvelope,
    }),
  )
  const account = findBarkAccount(nextPayload, network)
  if (account == null) {
    throw new Error('Bark account is missing')
  }
  return account
}

/**
 * Replaces one network's envelope, and optional cursor or sync time, after a protocol write.
 * On a revision conflict, re-reads and applies the same envelope onto the newer payload.
 */
export async function persistBarkProtocolState(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  update: {
    recordEnvelope: string
    receiveKeyIndex?: number
    lastSuccessfulSyncAt?: string
  },
): Promise<void> {
  await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyBarkRecordEnvelope({
      payload,
      network,
      recordEnvelope: update.recordEnvelope,
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

/** VTXO ids still waiting for the user to dismiss the seizure banner. */
export async function readExitSeizureVtxoIds(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
): Promise<string[]> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return findBarkAccount(payload, network)?.exitSeizureVtxoIds ?? []
}

/** Adds ids from a seizure scan. An empty scan does not remove a stored notice. */
export async function mergeExitSeizureVtxoIds(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  vtxoIds: readonly string[],
): Promise<void> {
  if (vtxoIds.length === 0) return
  await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyMergedExitSeizureVtxoIds({ payload, network, vtxoIds }),
  )
}

/** Drops the seizure notice after the user dismisses the banner. */
export async function clearExitSeizureNotice(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
): Promise<void> {
  await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyClearedExitSeizureNotice({ payload, network }),
  )
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

/** Saved automatic fee degree and max. Missing degree is Medium. Missing max is null. */
export async function readEmergencyExitFeePrefs(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
): Promise<BarkEmergencyExitFeePrefs> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  const account = findBarkAccount(payload, network)
  return {
    feePresetLabel:
      emergencyExitFeePresetFromUnknown(account?.emergencyExitFeePreset) ??
      DEFAULT_BARK_EMERGENCY_EXIT_FEE_PRESET,
    maxFeeRateSatPerVb:
      emergencyExitMaxFeeRateFromUnknown(account?.emergencyExitMaxFeeRateSatPerVb) ?? null,
  }
}

/** Stores the low, medium, or high degree for automatic emergency-exit proceeding. */
export async function writeEmergencyExitFeePreset(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  feePreset: BarkEmergencyExitFeePreset,
): Promise<void> {
  await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyEmergencyExitFeePreset({ payload, network, feePreset }),
  )
}

/** Stores the maximum sat/vB for automatic emergency-exit proceeding. */
export async function writeEmergencyExitMaxFeeRate(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  network: BarkRailNetwork,
  maxFeeRateSatPerVb: number,
): Promise<void> {
  await updateDecryptedWalletPayload(deps, walletId, (payload) =>
    applyEmergencyExitMaxFeeRate({ payload, network, maxFeeRateSatPerVb }),
  )
}
