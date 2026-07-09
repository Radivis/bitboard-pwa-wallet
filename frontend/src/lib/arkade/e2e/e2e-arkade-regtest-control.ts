import { getDatabase, getWalletSecretsEncrypted } from '@/db'
import { findActiveArkadeConnectionSummary } from '@/lib/arkade/arkade-encrypted-persistence-manager'
import { isArkadeSupportedNetworkMode } from '@/lib/arkade/arkade-endpoints'
import { getArkadeWorker } from '@/workers/arkade-factory'
import { ensureArkadeEncryptedSecretsHost } from '@/workers/arkade-persistence-channel'
import { ensureArkadeWorkerSecretsChannel, ensureSecretsChannel } from '@/workers/secrets-channel'
import { useWalletStore } from '@/stores/walletStore'

export function isE2eArkadeRegtestControlEnabled(): boolean {
  return import.meta.env.VITE_E2E_ARKADE_REGTEST === 'true' && import.meta.env.DEV
}

/**
 * Full SDK persistence JSON for Rust `ARKADE_REGTEST_BOARDED_FIXTURE` export.
 * Reads from encrypted wallet secrets (after flush), not via a second worker import in Playwright.
 */
export async function exportBoardedWalletSdkPersistenceJsonForE2e(): Promise<string> {
  const walletId = useWalletStore.getState().activeWalletId
  const networkMode = useWalletStore.getState().networkMode
  if (walletId == null || !isArkadeSupportedNetworkMode(networkMode)) {
    throw new Error('Wallet must be unlocked on an Arkade network to export boarded fixture')
  }

  await ensureSecretsChannel()
  await ensureArkadeEncryptedSecretsHost()
  await ensureArkadeWorkerSecretsChannel()

  const worker = getArkadeWorker()
  await worker.flushSdkPersistence()

  const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
  const connection = await findActiveArkadeConnectionSummary({
    walletId,
    networkMode,
    encryptedPayload: encrypted.payload,
  })
  if (connection == null) {
    throw new Error('No active Arkade operator connection in wallet secrets')
  }

  const sdkPersistenceJson = await worker.readPersistedSdkPersistenceJsonForE2e({
    walletId,
    connectionId: connection.id,
  })
  if (sdkPersistenceJson == null || sdkPersistenceJson.trim() === '') {
    throw new Error('Persisted Arkade SDK JSON missing after boarding — sync or flush failed')
  }

  return sdkPersistenceJson
}

export function ensureE2eArkadeRegtestControl(): void {
  if (!isE2eArkadeRegtestControlEnabled() || typeof window === 'undefined') {
    return
  }
  if (window.__e2eExportBoardedWalletSdkPersistenceJson != null) {
    return
  }

  window.__e2eExportBoardedWalletSdkPersistenceJson = exportBoardedWalletSdkPersistenceJsonForE2e
}
