import {
  applyBarkRecordDump,
  applyOpenedBarkRail,
  signetRecordDumpForOpen,
} from '@/lib/bark/bark-rail-metadata'
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

/** Stored receive cursor, if the encrypted Signet rail has one. Does not reveal. */
export async function readStoredBarkReceiveKeyIndex(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
): Promise<number | undefined> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return payload.barkRails?.signet?.receiveKeyIndex
}

/** Signet dump to pass into `bark_open_session`. Empty when this rail has no dump yet. */
export async function readSignetRecordDumpForOpen(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
): Promise<string> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  return signetRecordDumpForOpen(payload)
}

/**
 * Writes `barkRails.signet` after open. Replaces that network's dump only.
 * Does not rewrite Mainnet or `sdkPersistenceJson`.
 */
export async function persistOpenedBarkRail(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  fingerprint: string,
  receiveKeyIndex: number,
  recordDump: string,
): Promise<StoredBarkRail> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  const nextPayload = applyOpenedBarkRail({
    payload,
    fingerprint,
    receiveKeyIndex,
    recordDump,
  })
  await writeDecryptedWalletPayload(deps, walletId, nextPayload)
  const signet = nextPayload.barkRails?.signet
  if (signet == null) {
    throw new Error('Bark rail is missing')
  }
  return signet
}

/** Replaces the Signet dump, and optional cursor or sync time, after a protocol write. */
export async function persistBarkProtocolState(
  deps: BarkEncryptedPayloadDeps,
  walletId: number,
  update: {
    recordDump: string
    receiveKeyIndex?: number
    lastSuccessfulSyncAt?: string
  },
): Promise<void> {
  const payload = await readDecryptedWalletPayload(deps, walletId)
  const nextPayload = applyBarkRecordDump({
    payload,
    recordDump: update.recordDump,
    receiveKeyIndex: update.receiveKeyIndex,
    lastSuccessfulSyncAt: update.lastSuccessfulSyncAt,
  })
  await writeDecryptedWalletPayload(deps, walletId, nextPayload)
}
