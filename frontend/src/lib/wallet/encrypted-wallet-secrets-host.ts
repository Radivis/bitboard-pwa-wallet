import { getDatabase } from '@/db/database'
import {
  getWalletSecretsEncrypted,
  updateWalletSecretsEncryptedPayloadWithRetry,
  type EncryptedWalletSecretsBlob,
} from '@/db/wallet-persistence'

/** Main-thread DB bridge: ciphertext only — no decrypt on this path. */
export interface EncryptedWalletSecretsHost {
  readEncryptedPayload(walletId: number): Promise<EncryptedWalletSecretsBlob>
  writeEncryptedPayloadCAS(
    walletId: number,
    blob: EncryptedWalletSecretsBlob,
  ): Promise<void>
}

export function createEncryptedWalletSecretsHost(): EncryptedWalletSecretsHost {
  return {
    async readEncryptedPayload(walletId) {
      const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
      return encrypted.payload
    },
    async writeEncryptedPayloadCAS(walletId, blob) {
      await updateWalletSecretsEncryptedPayloadWithRetry({
        walletDb: getDatabase(),
        walletId,
        transform: async () => blob,
      })
    },
  }
}
