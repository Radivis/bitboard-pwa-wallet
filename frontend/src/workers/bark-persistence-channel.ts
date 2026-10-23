import { createEncryptedSecretsHostChannel } from '@/workers/encrypted-secrets-host-channel'

const barkSecretsHostChannel = createEncryptedSecretsHostChannel(async () => {
  const { getBarkWorker } = await import('@/workers/bark-factory')
  return getBarkWorker()
})

export function resetBarkPersistenceChannel(): void {
  barkSecretsHostChannel.resetEncryptedSecretsHostChannel()
}

/**
 * Registers the main-thread encrypted DB host on the Bark worker.
 * Ciphertext only — no wallet payload decrypt on the main thread.
 */
export function ensureBarkEncryptedSecretsHost(): Promise<void> {
  return barkSecretsHostChannel.ensureEncryptedSecretsHost()
}
