import { getArkadeWorker } from '@/workers/arkade-factory'
import type { EncryptedBlobForDb } from '@/workers/crypto-api'
import type { ArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import type { ArkadeAccountSummary } from '@/lib/arkade/arkade-payload-merge'
import {
  ensureArkadeEncryptedSecretsHost,
} from '@/workers/arkade-persistence-channel'
import { ensureArkadeWorkerSecretsChannel, ensureSecretsChannel } from '@/workers/secrets-channel'

async function ensureArkadeEncryptedPersistenceReady(): Promise<void> {
  await ensureSecretsChannel()
  await ensureArkadeEncryptedSecretsHost()
  await ensureArkadeWorkerSecretsChannel()
}

export async function findActiveArkadeAccountSummary(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  encryptedPayload: EncryptedBlobForDb
}): Promise<ArkadeAccountSummary | undefined> {
  await ensureArkadeEncryptedPersistenceReady()
  return getArkadeWorker().findActiveAccountSummary(params)
}

export async function listArkadeAccountSummaries(params: {
  walletId: number
}): Promise<ArkadeAccountSummary[]> {
  await ensureArkadeEncryptedPersistenceReady()
  return getArkadeWorker().listAccountSummaries(params)
}

export async function ensureArkadeAccountEncrypted(params: {
  walletId: number
  networkMode: ArkadeSupportedNetworkMode
  arkadeAccountId: string
  operatorSignerPkHex: string
  operatorUrl: string
  delegatorUrl: string
  persistInitialSdkFromWasm?: boolean
}): Promise<ArkadeAccountSummary> {
  await ensureArkadeEncryptedPersistenceReady()
  return getArkadeWorker().ensureArkadeAccountEncrypted(params)
}

export async function saveLastSuccessfulOperatorSyncAtEncrypted(params: {
  walletId: number
  arkadeAccountId: string
  lastSuccessfulOperatorSyncAt: string
}): Promise<void> {
  await ensureArkadeEncryptedPersistenceReady()
  await getArkadeWorker().updateOperatorSyncAtEncrypted(params)
}
