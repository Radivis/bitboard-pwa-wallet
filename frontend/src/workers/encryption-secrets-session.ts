import type { EncryptedBlob } from '@/lib/shared/encrypted-blob-types'

export const MSG_SECRETS_SESSION_NOT_ACTIVE =
  'Wallet secrets session is not active — unlock the wallet first'

export const MSG_SECRETS_SESSION_ALREADY_ACTIVE =
  'Wallet secrets session is already active'

export const MSG_SECRETS_SESSION_IN_FLIGHT =
  'Cannot end wallet secrets session while encrypt/decrypt is in progress'

let sessionPassword: string | null = null
let inFlightSessionOps = 0

export function isSecretsSessionActive(): boolean {
  return sessionPassword != null
}

export function beginSecretsSession(password: string): void {
  if (sessionPassword != null) {
    throw new Error(MSG_SECRETS_SESSION_ALREADY_ACTIVE)
  }
  sessionPassword = password
}

export function endSecretsSession(): void {
  if (sessionPassword == null) {
    return
  }
  if (inFlightSessionOps > 0) {
    throw new Error(MSG_SECRETS_SESSION_IN_FLIGHT)
  }
  sessionPassword = null
}

export function requireSessionPassword(): string {
  if (sessionPassword == null) {
    throw new Error(MSG_SECRETS_SESSION_NOT_ACTIVE)
  }
  return sessionPassword
}

export async function withSessionPassword<T>(
  run: (password: string) => Promise<T>,
): Promise<T> {
  const password = requireSessionPassword()
  inFlightSessionOps += 1
  try {
    return await run(password)
  } finally {
    inFlightSessionOps -= 1
  }
}

export function encryptedBlobMessageToStoreFields(blob: {
  ciphertext: Uint8Array
  iv: Uint8Array
  salt: Uint8Array
  kdfPhc: EncryptedBlob['kdfPhc']
}): EncryptedBlob {
  return {
    ciphertext: blob.ciphertext,
    iv: blob.iv,
    salt: blob.salt,
    kdfPhc: blob.kdfPhc,
  }
}
