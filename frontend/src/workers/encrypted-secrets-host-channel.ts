import { proxy } from 'comlink'
import {
  createEncryptedWalletSecretsHost,
  type EncryptedWalletSecretsHost,
} from '@/lib/wallet/encrypted-wallet-secrets-host'

interface SecretsHostWorker {
  setEncryptedWalletSecretsHost(host: EncryptedWalletSecretsHost): Promise<void>
}

/**
 * Registers the main-thread encrypted DB host on a rail worker.
 * Ciphertext only — no wallet payload decrypt on the main thread.
 * `loadWorker` is called inside the registration so the worker factory can import `reset`.
 */
export function createEncryptedSecretsHostChannel(
  loadWorker: () => Promise<SecretsHostWorker>,
): {
  resetEncryptedSecretsHostChannel: () => void
  ensureEncryptedSecretsHost: () => Promise<void>
} {
  let encryptedSecretsHostReady = false
  let encryptedSecretsHostPromise: Promise<void> | null = null

  function resetEncryptedSecretsHostChannel(): void {
    encryptedSecretsHostReady = false
    encryptedSecretsHostPromise = null
  }

  async function ensureEncryptedSecretsHost(): Promise<void> {
    if (encryptedSecretsHostReady) return
    if (encryptedSecretsHostPromise) {
      await encryptedSecretsHostPromise
      return
    }

    encryptedSecretsHostPromise = (async () => {
      const worker = await loadWorker()
      await worker.setEncryptedWalletSecretsHost(proxy(createEncryptedWalletSecretsHost()))
      encryptedSecretsHostReady = true
    })().finally(() => {
      encryptedSecretsHostPromise = null
    })

    await encryptedSecretsHostPromise
  }

  return { resetEncryptedSecretsHostChannel, ensureEncryptedSecretsHost }
}
