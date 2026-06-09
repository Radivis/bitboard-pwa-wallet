import type { EncryptedBlobMessage } from '@/workers/secrets-channel-types'
import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'
import {
  beginSecretsSession,
  endSecretsSession,
  encryptedBlobMessageToStoreFields,
  isSecretsSessionActive,
  withSessionPassword,
} from '@/workers/encryption-secrets-session'

export type SessionEncryptFn = (password: string, plaintext: string) => Promise<EncryptedBlob>
export type SessionDecryptFn = (
  password: string,
  encrypted: EncryptedBlob,
) => Promise<string>

export function createSecretsSessionChannelApi(
  doEncrypt: SessionEncryptFn,
  doDecrypt: SessionDecryptFn,
) {
  return {
    async beginSession(password: string): Promise<void> {
      beginSecretsSession(password)
    },

    async endSession(): Promise<void> {
      endSecretsSession()
    },

    async isSessionActive(): Promise<boolean> {
      return isSecretsSessionActive()
    },

    async decrypt(encryptedBlob: EncryptedBlobMessage): Promise<string> {
      return withSessionPassword((password) =>
        doDecrypt(password, encryptedBlobMessageToStoreFields(encryptedBlob)),
      )
    },

    async encrypt(plaintext: string): Promise<EncryptedBlobMessage> {
      const blob = await withSessionPassword((password) => doEncrypt(password, plaintext))
      return {
        ciphertext: blob.ciphertext,
        iv: blob.iv,
        salt: blob.salt,
        kdfPhc: blob.kdfPhc,
      }
    },
  }
}

export function createEncryptionServiceSessionApi(
  doEncrypt: SessionEncryptFn,
  doDecrypt: SessionDecryptFn,
) {
  return {
    async beginSecretsSession(password: string): Promise<void> {
      beginSecretsSession(password)
    },

    async endSecretsSession(): Promise<void> {
      endSecretsSession()
    },

    async isSecretsSessionActive(): Promise<boolean> {
      return isSecretsSessionActive()
    },

    async encryptData(plaintext: string): Promise<EncryptedBlob> {
      return withSessionPassword((password) => doEncrypt(password, plaintext))
    },

    async decryptData(encrypted: EncryptedBlob): Promise<string> {
      return withSessionPassword((password) => doDecrypt(password, encrypted))
    },

    async encryptDataWithPassword(password: string, plaintext: string): Promise<EncryptedBlob> {
      return doEncrypt(password, plaintext)
    },

    async decryptDataWithPassword(password: string, encrypted: EncryptedBlob): Promise<string> {
      return doDecrypt(password, encrypted)
    },
  }
}
