import { proxy } from 'comlink'
import { createEncryptedWalletSecretsHost } from '@/lib/wallet/encrypted-wallet-secrets-host'

let encryptedSecretsHostReady = false
let encryptedSecretsHostPromise: Promise<void> | null = null

export function resetBarkPersistenceChannel(): void {
  encryptedSecretsHostReady = false
  encryptedSecretsHostPromise = null
}

/**
 * Registers the main-thread encrypted DB host on the Bark worker.
 * Ciphertext only — no wallet payload decrypt on the main thread.
 */
export async function ensureBarkEncryptedSecretsHost(): Promise<void> {
  if (encryptedSecretsHostReady) return
  if (encryptedSecretsHostPromise) {
    await encryptedSecretsHostPromise
    return
  }

  encryptedSecretsHostPromise = (async () => {
    const { getBarkWorker } = await import('@/workers/bark-factory')
    const worker = getBarkWorker()
    await worker.setEncryptedWalletSecretsHost(proxy(createEncryptedWalletSecretsHost()))
    encryptedSecretsHostReady = true
  })().finally(() => {
    encryptedSecretsHostPromise = null
  })

  await encryptedSecretsHostPromise
}
