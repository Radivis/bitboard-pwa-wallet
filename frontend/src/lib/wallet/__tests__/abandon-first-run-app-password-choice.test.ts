import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'
import { useNearZeroSecurityStore } from '@/stores/nearZeroSecurityStore'
import {
  beginWalletSecretsSession,
  endWalletSecretsSession,
  isWalletSecretsSessionActive,
} from '@/lib/wallet/wallet-secrets-session'
import {
  generateAndPersistNearZeroSession,
  isNearZeroSecurityConfiguredInDb,
} from '@/db/near-zero-security'

vi.mock('@/workers/encryption-factory', async () => {
  const { getMockEncryptionWorker } = await import('@/db/__tests__/mock-encryption-worker')
  return {
    getEncryptionWorker: () => getMockEncryptionWorker(),
  }
})

import { abandonFirstRunAppPasswordChoiceIfNoWallets } from '@/lib/wallet/abandon-first-run-app-password-choice'

describe('abandonFirstRunAppPasswordChoiceIfNoWallets', () => {
  let walletDb: Kysely<Database>

  beforeEach(async () => {
    walletDb = await createTestDatabase()
    await endWalletSecretsSession()
    useNearZeroSecurityStore.setState({ active: false })
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('clears near-zero settings and ends the session when no wallet exists', async () => {
    await generateAndPersistNearZeroSession(walletDb)
    expect(await isWalletSecretsSessionActive()).toBe(true)
    expect(await isNearZeroSecurityConfiguredInDb(walletDb)).toBe(true)

    await abandonFirstRunAppPasswordChoiceIfNoWallets(walletDb)

    expect(await isWalletSecretsSessionActive()).toBe(false)
    expect(await isNearZeroSecurityConfiguredInDb(walletDb)).toBe(false)
    expect(useNearZeroSecurityStore.getState().active).toBe(false)
  })

  it('ends a password session when no wallet and near-zero is not configured', async () => {
    await beginWalletSecretsSession('validpassword123')
    expect(await isWalletSecretsSessionActive()).toBe(true)

    await abandonFirstRunAppPasswordChoiceIfNoWallets(walletDb)

    expect(await isWalletSecretsSessionActive()).toBe(false)
  })

  it('leaves session and near-zero settings in place when a wallet exists', async () => {
    await generateAndPersistNearZeroSession(walletDb)
    await walletDb
      .insertInto('wallets')
      .values({ name: 'Kept', created_at: new Date().toISOString() })
      .execute()

    await abandonFirstRunAppPasswordChoiceIfNoWallets(walletDb)

    expect(await isWalletSecretsSessionActive()).toBe(true)
    expect(await isNearZeroSecurityConfiguredInDb(walletDb)).toBe(true)
    expect(useNearZeroSecurityStore.getState().active).toBe(true)
  })
})
