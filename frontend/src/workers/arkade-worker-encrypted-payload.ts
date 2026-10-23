import type { ArkadeSignerMigrationHint } from '@/workers/arkade-api'
import {
  ensureArkadeAccountInPayload,
  findActiveArkadeAccount,
  findArkadeAccount,
  mergeSdkPersistenceIntoPayload,
  toArkadeAccountSummary,
  updateOperatorSyncAtInPayload,
  type ArkadeAccountSummary,
} from '@/lib/arkade/arkade-payload-merge'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import {
  parseWalletPayloadJson,
  type StoredArkadeAccount,
} from '@/lib/wallet/wallet-domain-types'
import type { EncryptedBlobMessage } from '@/workers/secrets-channel-types'
import {
  updateDecryptedWalletPayload,
  type WorkerWalletPayloadDeps,
} from '@/workers/worker-wallet-payload-update'

export type ArkadeEncryptedPayloadDeps = WorkerWalletPayloadDeps

async function decryptPayload(
  deps: ArkadeEncryptedPayloadDeps,
  encryptedPayload: EncryptedBlobMessage,
) {
  const plaintext = await deps.secretsProxy.decrypt(encryptedPayload)
  return parseWalletPayloadJson(plaintext)
}

async function readEncryptedPayload(
  deps: ArkadeEncryptedPayloadDeps,
  walletId: number,
): Promise<EncryptedBlobMessage> {
  const blob = await deps.encryptedHost.readEncryptedPayload(walletId)
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfPhc: blob.kdfPhc,
  }
}

export async function loadArkadeAccountSdkPersistence(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    encryptedPayload: EncryptedBlobMessage
    arkadeAccountId: string
  },
): Promise<{ accountFound: boolean; sdkPersistenceJson: string | undefined }> {
  const payload = await decryptPayload(deps, params.encryptedPayload)
  const account = findArkadeAccount(payload, params.arkadeAccountId)
  return {
    accountFound: account != null,
    sdkPersistenceJson: account?.sdkPersistenceJson,
  }
}

export async function extractSdkPersistenceJsonForAccount(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    encryptedPayload: EncryptedBlobMessage
    arkadeAccountId: string
  },
): Promise<string | undefined> {
  const loaded = await loadArkadeAccountSdkPersistence(deps, params)
  return loaded.sdkPersistenceJson
}

export async function findActiveAccountSummary(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    encryptedPayload: EncryptedBlobMessage
  },
): Promise<ArkadeAccountSummary | undefined> {
  const payload = await decryptPayload(deps, params.encryptedPayload)
  const account = findActiveArkadeAccount(payload, params.networkMode)
  return account == null ? undefined : toArkadeAccountSummary(account)
}

export async function listAccountSummaries(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    walletId: number
  },
): Promise<ArkadeAccountSummary[]> {
  const encryptedPayload = await readEncryptedPayload(deps, params.walletId)
  const payload = await decryptPayload(deps, encryptedPayload)
  return payload.arkadeAccounts.map(toArkadeAccountSummary)
}

export async function persistSdkJsonToEncryptedPayload(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    walletId: number
    arkadeAccountId: string
    sdkPersistenceJson: string
    lastSuccessfulOperatorSyncAt?: string
  },
): Promise<void> {
  await updateDecryptedWalletPayload(deps, params.walletId, (payload) =>
    mergeSdkPersistenceIntoPayload(
      payload,
      params.arkadeAccountId,
      params.sdkPersistenceJson,
      params.lastSuccessfulOperatorSyncAt,
    ),
  )
}

export async function updateOperatorSyncAtEncrypted(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    walletId: number
    arkadeAccountId: string
    lastSuccessfulOperatorSyncAt: string
  },
): Promise<void> {
  await updateDecryptedWalletPayload(deps, params.walletId, (payload) =>
    updateOperatorSyncAtInPayload(
      payload,
      params.arkadeAccountId,
      params.lastSuccessfulOperatorSyncAt,
    ),
  )
}

export async function ensureArkadeAccountEncrypted(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    arkadeAccountId: string
    operatorSignerPkHex: string
    operatorUrl: string
    delegatorUrl: string
    sdkPersistenceJson?: string
    signerMigrationHint?: ArkadeSignerMigrationHint
  },
  options?: {
    exportInitialSdkFromWasm?: () => Promise<string>
  },
): Promise<ArkadeAccountSummary> {
  let sdkPersistenceJson = params.sdkPersistenceJson
  if (sdkPersistenceJson == null && options?.exportInitialSdkFromWasm != null) {
    sdkPersistenceJson = await options.exportInitialSdkFromWasm()
  }

  let ensuredAccount: StoredArkadeAccount | null = null
  await updateDecryptedWalletPayload(deps, params.walletId, (payload) => {
    const { payload: mergedPayload, account } = ensureArkadeAccountInPayload(payload, {
      networkMode: params.networkMode,
      operatorSignerPkHex: params.operatorSignerPkHex,
      operatorUrl: params.operatorUrl,
      delegatorUrl: params.delegatorUrl,
      sdkPersistenceJson,
      arkadeAccountId: params.arkadeAccountId,
      signerMigrationHint: params.signerMigrationHint,
    })
    ensuredAccount = account
    return mergedPayload
  })
  if (ensuredAccount == null) {
    throw new Error('Arkade account was not written')
  }
  return toArkadeAccountSummary(ensuredAccount)
}
