import { getDatabase } from '@/db/database'
import {
  getWalletSecretsEncrypted,
  getWalletSecretsEncryptedWithRevision,
  updateWalletSecretsEncryptedPayloadWithRetry,
  writeSplitWalletSecretsPayloadIfRevisionMatches,
  type EncryptedWalletSecretsBlob,
} from '@/db/wallet-persistence'

/** Ciphertext plus the revision it was read at. */
export type EncryptedWalletSecretsRevision = {
  payload: EncryptedWalletSecretsBlob
  revision: number
}

/** Main-thread DB bridge: ciphertext only — no decrypt on this path. */
export interface EncryptedWalletSecretsHost {
  readEncryptedPayload(walletId: number): Promise<EncryptedWalletSecretsBlob>
  readEncryptedPayloadWithRevision(walletId: number): Promise<EncryptedWalletSecretsRevision>
  writeEncryptedPayloadCAS(
    walletId: number,
    blob: EncryptedWalletSecretsBlob,
  ): Promise<void>
  /** One CAS attempt. False means the revision changed and the blob was not written. */
  writeEncryptedPayloadIfRevisionMatches(
    walletId: number,
    blob: EncryptedWalletSecretsBlob,
    expectedRevision: number,
  ): Promise<boolean>
}

export function createEncryptedWalletSecretsHost(): EncryptedWalletSecretsHost {
  return {
    async readEncryptedPayload(walletId) {
      const encrypted = await getWalletSecretsEncrypted(getDatabase(), walletId)
      return encrypted.payload
    },
    async readEncryptedPayloadWithRevision(walletId) {
      const encrypted = await getWalletSecretsEncryptedWithRevision(getDatabase(), walletId)
      return { payload: encrypted.payload, revision: encrypted.revision }
    },
    async writeEncryptedPayloadCAS(walletId, blob) {
      await updateWalletSecretsEncryptedPayloadWithRetry({
        walletDb: getDatabase(),
        walletId,
        transform: async () => blob,
      })
    },
    writeEncryptedPayloadIfRevisionMatches(walletId, blob, expectedRevision) {
      return writeSplitWalletSecretsPayloadIfRevisionMatches(
        getDatabase(),
        walletId,
        blob,
        expectedRevision,
      )
    },
  }
}
