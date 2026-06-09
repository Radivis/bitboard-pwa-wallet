import { getArkadeWorker } from '@/workers/arkade-factory'
import type { EncryptedBlobForDb } from '@/workers/crypto-api'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeOperatorConnectionSummary } from '@/lib/arkade/arkade-payload-merge'
import {
  ensureArkadeEncryptedSecretsHost,
} from '@/workers/arkade-persistence-channel'
import { ensureArkadeWorkerSecretsChannel, ensureSecretsChannel } from '@/workers/secrets-channel'

async function ensureArkadeEncryptedPersistenceReady(): Promise<void> {
  await ensureSecretsChannel()
  await ensureArkadeEncryptedSecretsHost()
  await ensureArkadeWorkerSecretsChannel()
}

export async function findActiveArkadeConnectionSummary(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  encryptedPayload: EncryptedBlobForDb
}): Promise<ArkadeOperatorConnectionSummary | undefined> {
  await ensureArkadeEncryptedPersistenceReady()
  return getArkadeWorker().findActiveConnectionSummary(params)
}

export async function listArkadeConnectionSummaries(params: {
  walletId: number
}): Promise<ArkadeOperatorConnectionSummary[]> {
  await ensureArkadeEncryptedPersistenceReady()
  return getArkadeWorker().listConnectionSummaries(params)
}

export async function ensureArkadeOperatorConnectionEncrypted(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  connectionId: string
  operatorSignerPkHex: string
  operatorUrl: string
  delegatorUrl: string
  persistInitialSdkFromWasm?: boolean
}): Promise<ArkadeOperatorConnectionSummary> {
  await ensureArkadeEncryptedPersistenceReady()
  return getArkadeWorker().ensureOperatorConnectionEncrypted(params)
}

export async function saveLastSuccessfulOperatorSyncAtEncrypted(params: {
  walletId: number
  connectionId: string
  lastSuccessfulOperatorSyncAt: string
}): Promise<void> {
  await ensureArkadeEncryptedPersistenceReady()
  await getArkadeWorker().updateOperatorSyncAtEncrypted(params)
}
