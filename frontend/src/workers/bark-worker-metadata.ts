import { applyOpenedBarkRail, applySuccessfulBarkSync } from '@/lib/bark/bark-rail-metadata'
import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import {
  parseWalletPayloadJson,
  type StoredBarkRail,
  type WalletSecretsPayload,
} from '@/lib/wallet/wallet-domain-types'
import type { Remote } from 'comlink'
import type { SecretsChannelService } from '@/workers/secrets-channel-types'

export type BarkEncryptedPayloadDeps = {
  secretsProxy: Remote<SecretsChannelService> | SecretsChannelService
  encryptedHost: Remote<EncryptedWalletSecretsHost> | EncryptedWalletSecretsHost
}

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

async function writeDecryptedWalletPayload(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  payload: WalletSecretsPayload,
): Promise<void> {
  const encryptedNext = await deps.secretsProxy.encrypt(JSON.stringify(payload))
  await deps.encryptedHost.writeEncryptedPayloadCAS(walletId, {
    ciphertext: encryptedNext.ciphertext,
    iv: encryptedNext.iv,
    salt: encryptedNext.salt,
    kdfPhc: encryptedNext.kdfPhc,
  })
}

/** Stored receive cursor, if the encrypted rail has one. Does not reveal. */
export async function readStoredBarkReceiveKeyIndex(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
): Promise<number | undefined> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return payload.barkRail?.receiveKeyIndex
}

/**
 * Writes barkRail into the encrypted payload. Does not read or write IndexedDB.
 * `receiveKeyIndex` is the cursor for this open (kept, recovered, or just revealed).
 */
export async function persistOpenedBarkRail(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  fingerprint: string,
  receiveKeyIndex: number,
): Promise<StoredBarkRail> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  const nextPayload = applyOpenedBarkRail({ payload, fingerprint, receiveKeyIndex })
  await writeDecryptedWalletPayload(deps, walletId, nextPayload)
  if (nextPayload.barkRail == null) {
    throw new Error('Bark rail is missing')
  }
  return nextPayload.barkRail
}

/** Updates the receive cursor after Generate new address. Requires an existing rail. */
export async function persistBarkReceiveKeyIndex(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  receiveKeyIndex: number,
): Promise<void> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  const fingerprint = payload.barkRail?.fingerprint
  if (fingerprint == null) {
    throw new Error('Bark rail is missing')
  }
  const nextPayload = applyOpenedBarkRail({ payload, fingerprint, receiveKeyIndex })
  await writeDecryptedWalletPayload(deps, walletId, nextPayload)
}

/** Stamps lastSuccessfulSyncAt. Does not read or write Bark IndexedDB. */
export async function persistBarkSuccessfulSync(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  syncedAt: string,
): Promise<void> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  const nextPayload = applySuccessfulBarkSync({ payload, syncedAt })
  await writeDecryptedWalletPayload(deps, walletId, nextPayload)
}
