import type { EncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'
import {
  ensureArkadeOperatorConnectionInPayload,
  findActiveArkadeOperatorConnection,
  findArkadeOperatorConnection,
  mergeSdkPersistenceIntoPayload,
  toArkadeOperatorConnectionSummary,
  updateOperatorSyncAtInPayload,
  type ArkadeOperatorConnectionSummary,
} from '@/lib/arkade/arkade-payload-merge'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { parseWalletPayloadJson } from '@/lib/wallet/wallet-domain-types'
import type { Remote } from 'comlink'
import type { EncryptedBlobMessage, SecretsChannelService } from '@/workers/secrets-channel-types'

type EncryptedBlobStoreFields = {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  kdfPhc: EncryptedBlobMessage['kdfPhc']
}

export type ArkadeEncryptedPayloadDeps = {
  secretsProxy: Remote<SecretsChannelService> | SecretsChannelService
  encryptedHost: Remote<EncryptedWalletSecretsHost> | EncryptedWalletSecretsHost
}

function encryptedBlobMessageToStoreFields(
  blob: EncryptedBlobMessage,
): EncryptedBlobStoreFields {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfPhc: blob.kdfPhc,
  }
}

async function decryptPayload(
  deps: ArkadeEncryptedPayloadDeps,
  password: string,
  encryptedPayload: EncryptedBlobMessage,
) {
  const plaintext = await deps.secretsProxy.decrypt(password, encryptedPayload)
  return parseWalletPayloadJson(plaintext)
}

async function encryptPayload(
  deps: ArkadeEncryptedPayloadDeps,
  password: string,
  payload: ReturnType<typeof parseWalletPayloadJson>,
): Promise<EncryptedBlobStoreFields> {
  const encryptedBlob = await deps.secretsProxy.encrypt(password, JSON.stringify(payload))
  return encryptedBlobMessageToStoreFields(encryptedBlob)
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

async function writeEncryptedPayload(
  deps: ArkadeEncryptedPayloadDeps,
  walletId: number,
  encryptedPayload: EncryptedBlobStoreFields,
): Promise<void> {
  await deps.encryptedHost.writeEncryptedPayloadCAS(walletId, encryptedPayload)
}

export async function extractSdkPersistenceJsonForConnection(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    password: string
    encryptedPayload: EncryptedBlobMessage
    connectionId: string
  },
): Promise<string | undefined> {
  const payload = await decryptPayload(deps, params.password, params.encryptedPayload)
  return findArkadeOperatorConnection(payload, params.connectionId)?.sdkPersistenceJson
}

export async function findActiveConnectionSummary(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    password: string
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    encryptedPayload: EncryptedBlobMessage
  },
): Promise<ArkadeOperatorConnectionSummary | undefined> {
  const payload = await decryptPayload(deps, params.password, params.encryptedPayload)
  const connection = findActiveArkadeOperatorConnection(payload, params.networkMode)
  return connection == null ? undefined : toArkadeOperatorConnectionSummary(connection)
}

export async function listConnectionSummaries(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    password: string
    walletId: number
  },
): Promise<ArkadeOperatorConnectionSummary[]> {
  const encryptedPayload = await readEncryptedPayload(deps, params.walletId)
  const payload = await decryptPayload(deps, params.password, encryptedPayload)
  return payload.arkadeOperatorConnections.map(toArkadeOperatorConnectionSummary)
}

export async function persistSdkJsonToEncryptedPayload(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    password: string
    walletId: number
    connectionId: string
    sdkPersistenceJson: string
    lastSuccessfulOperatorSyncAt?: string
  },
): Promise<void> {
  const encryptedPayload = await readEncryptedPayload(deps, params.walletId)
  const payload = await decryptPayload(deps, params.password, encryptedPayload)
  const merged = mergeSdkPersistenceIntoPayload(
    payload,
    params.connectionId,
    params.sdkPersistenceJson,
    params.lastSuccessfulOperatorSyncAt,
  )
  const newEncrypted = await encryptPayload(deps, params.password, merged)
  await writeEncryptedPayload(deps, params.walletId, newEncrypted)
}

export async function updateOperatorSyncAtEncrypted(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    password: string
    walletId: number
    connectionId: string
    lastSuccessfulOperatorSyncAt: string
  },
): Promise<void> {
  const encryptedPayload = await readEncryptedPayload(deps, params.walletId)
  const payload = await decryptPayload(deps, params.password, encryptedPayload)
  const merged = updateOperatorSyncAtInPayload(
    payload,
    params.connectionId,
    params.lastSuccessfulOperatorSyncAt,
  )
  const newEncrypted = await encryptPayload(deps, params.password, merged)
  await writeEncryptedPayload(deps, params.walletId, newEncrypted)
}

export async function ensureOperatorConnectionEncrypted(
  deps: ArkadeEncryptedPayloadDeps,
  params: {
    password: string
    walletId: number
    networkMode: ArkadeSupportedNetworkMode
    connectionId: string
    operatorSignerPkHex: string
    operatorUrl: string
    delegatorUrl: string
    sdkPersistenceJson?: string
  },
  options?: {
    exportInitialSdkFromWasm?: () => Promise<string>
  },
): Promise<ArkadeOperatorConnectionSummary> {
  let sdkPersistenceJson = params.sdkPersistenceJson
  if (sdkPersistenceJson == null && options?.exportInitialSdkFromWasm != null) {
    sdkPersistenceJson = await options.exportInitialSdkFromWasm()
  }

  const encryptedPayload = await readEncryptedPayload(deps, params.walletId)
  const payload = await decryptPayload(deps, params.password, encryptedPayload)
  const { payload: mergedPayload, connection } = ensureArkadeOperatorConnectionInPayload(
    payload,
    {
      networkMode: params.networkMode,
      operatorSignerPkHex: params.operatorSignerPkHex,
      operatorUrl: params.operatorUrl,
      delegatorUrl: params.delegatorUrl,
      sdkPersistenceJson,
      connectionId: params.connectionId,
    },
  )
  const newEncrypted = await encryptPayload(deps, params.password, mergedPayload)
  await writeEncryptedPayload(deps, params.walletId, newEncrypted)
  return toArkadeOperatorConnectionSummary(connection)
}
