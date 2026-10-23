import { createEncryptedSecretsHostChannel } from '@/workers/encrypted-secrets-host-channel'

const arkadeSecretsHostChannel = createEncryptedSecretsHostChannel(async () => {
  const { getArkadeWorker } = await import('@/workers/arkade-factory')
  return getArkadeWorker()
})

export function resetArkadePersistenceChannel(): void {
  arkadeSecretsHostChannel.resetEncryptedSecretsHostChannel()
}

/**
 * Registers the main-thread encrypted DB host on the Arkade worker (Comlink).
 * Ciphertext only — no wallet payload decrypt on the main thread.
 */
export function ensureArkadeEncryptedSecretsHost(): Promise<void> {
  return arkadeSecretsHostChannel.ensureEncryptedSecretsHost()
}

/** @deprecated Use ensureArkadeEncryptedSecretsHost */
export const ensureArkadePersistenceChannel = ensureArkadeEncryptedSecretsHost
