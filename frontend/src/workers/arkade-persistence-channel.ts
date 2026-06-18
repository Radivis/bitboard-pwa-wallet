import { proxy } from 'comlink'
import { createEncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'

let encryptedSecretsHostReady = false
let encryptedSecretsHostPromise: Promise<void> | null = null

export function resetArkadePersistenceChannel(): void {
  encryptedSecretsHostReady = false
  encryptedSecretsHostPromise = null
}

/**
 * Registers the main-thread encrypted DB host on the Arkade worker (Comlink).
 * Ciphertext only — no wallet payload decrypt on the main thread.
 */
export async function ensureArkadeEncryptedSecretsHost(): Promise<void> {
  if (encryptedSecretsHostReady) return
  if (encryptedSecretsHostPromise) {
    await encryptedSecretsHostPromise
    return
  }

  encryptedSecretsHostPromise = (async () => {
    const { getArkadeWorker } = await import('@/workers/arkade-factory')
    const worker = getArkadeWorker()
    await worker.setEncryptedWalletSecretsHost(proxy(createEncryptedWalletSecretsHost()))
    encryptedSecretsHostReady = true
  })().finally(() => {
    encryptedSecretsHostPromise = null
  })

  await encryptedSecretsHostPromise
}

/** @deprecated Use ensureArkadeEncryptedSecretsHost */
export const ensureArkadePersistenceChannel = ensureArkadeEncryptedSecretsHost
