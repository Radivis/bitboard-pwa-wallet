import { afterEach, describe, it, expect } from 'vitest'
import {
  destroyDatabase,
  ensureMigrated,
  getDatabase,
  isWalletDatabaseTeardownBlockedError,
} from '@/db/database'
import {
  blockSqliteStorageForTeardown,
  blockSqliteStoragePersistForTeardown,
  blockWalletAndLabDatabaseAccessForTeardown,
  resetSqliteStorageTeardownGuardForTests,
  sqliteStorage,
} from '@/db/storage-adapter'

describe('wallet database teardown guard', () => {
  afterEach(async () => {
    resetSqliteStorageTeardownGuardForTests()
    await destroyDatabase().catch(() => undefined)
  })

  it('blocks getDatabase and ensureMigrated after blockSqliteStorageForTeardown', async () => {
    blockSqliteStorageForTeardown()
    expect(() => getDatabase()).toThrow(/blocked during teardown/i)
    await expect(ensureMigrated()).rejects.toThrow(/blocked during teardown/i)
  })

  it('persist-only block does not throw from getDatabase', async () => {
    blockSqliteStoragePersistForTeardown()
    let teardownBlocked = false
    try {
      getDatabase()
    } catch (err) {
      teardownBlocked =
        err instanceof Error && /blocked during teardown/i.test(err.message)
    }
    expect(teardownBlocked).toBe(false)
    await expect(sqliteStorage.getItem('any-key')).resolves.toBeNull()
  })

  it('hard-block throws from getDatabase', async () => {
    blockWalletAndLabDatabaseAccessForTeardown()
    expect(() => getDatabase()).toThrow(/blocked during teardown/i)
    await expect(ensureMigrated()).rejects.toThrow(/blocked during teardown/i)
  })

  it('isWalletDatabaseTeardownBlockedError matches the teardown message', () => {
    expect(
      isWalletDatabaseTeardownBlockedError(
        new Error('Wallet database access blocked during teardown'),
      ),
    ).toBe(true)
    expect(isWalletDatabaseTeardownBlockedError(new Error('other'))).toBe(false)
  })
})
