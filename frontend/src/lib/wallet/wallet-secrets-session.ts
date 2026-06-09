import { getEncryptionWorker } from '@/workers/encryption-factory'

export async function beginWalletSecretsSession(password: string): Promise<void> {
  await getEncryptionWorker().beginSecretsSession(password)
}

export async function endWalletSecretsSession(): Promise<void> {
  await getEncryptionWorker().endSecretsSession()
}

export async function isWalletSecretsSessionActive(): Promise<boolean> {
  return getEncryptionWorker().isSecretsSessionActive()
}

export async function ensureWalletSecretsSession(password?: string): Promise<void> {
  if (await isWalletSecretsSessionActive()) {
    return
  }
  if (!password) {
    throw new Error('App password required')
  }
  await beginWalletSecretsSession(password)
}
