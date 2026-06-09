import { MSG_SECRETS_SESSION_IN_FLIGHT } from '@/workers/encryption-secrets-session'
import { getEncryptionWorker } from '@/workers/encryption-factory'

const END_SECRETS_SESSION_MAX_ATTEMPTS = 20
const END_SECRETS_SESSION_RETRY_DELAY_MS = 50

export async function beginWalletSecretsSession(password: string): Promise<void> {
  await getEncryptionWorker().beginSecretsSession(password)
}

export async function endWalletSecretsSession(): Promise<void> {
  await getEncryptionWorker().endSecretsSession()
}

/** Retries while encrypt/decrypt is in flight — used on lock when flush may still be finishing. */
export async function endWalletSecretsSessionReliably(): Promise<void> {
  for (let attempt = 0; attempt < END_SECRETS_SESSION_MAX_ATTEMPTS; attempt++) {
    try {
      await endWalletSecretsSession()
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const inFlight = message.includes(MSG_SECRETS_SESSION_IN_FLIGHT)
      if (!inFlight || attempt === END_SECRETS_SESSION_MAX_ATTEMPTS - 1) {
        throw err
      }
      await new Promise((resolve) => setTimeout(resolve, END_SECRETS_SESSION_RETRY_DELAY_MS))
    }
  }
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
