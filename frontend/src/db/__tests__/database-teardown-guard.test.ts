import { afterEach, describe, it, expect } from 'vitest'
import {
  destroyDatabase,
  ensureMigrated,
  getDatabase,
  isWalletDatabaseTeardownBlockedError,
  WalletDatabaseTeardownBlockedError,
} from '@/db/database'
import {
  getLabDatabase,
  LabDatabaseTeardownBlockedError,
} from '@/db/lab-database'
import {
  blockSqliteStorageForTeardown,
  blockSqliteStoragePersistForTeardown,
  blockWalletAndLabDatabaseAccessForTeardown,
  resetSqliteStorageTeardownGuard,
  sqliteStorage,
} from '@/db/storage-adapter'

const storageAdapterSourceByPath = import.meta.glob('../storage-adapter.ts', {
  query: '?raw',
  eager: true,
  import: 'default',
}) as Record<string, string>

describe('wallet database teardown guard', () => {
  afterEach(async () => {
    resetSqliteStorageTeardownGuard()
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

  it('resetSqliteStorageTeardownGuard unblocks getDatabase after hard-block', () => {
    blockWalletAndLabDatabaseAccessForTeardown()
    expect(() => getDatabase()).toThrow(/blocked during teardown/i)
    resetSqliteStorageTeardownGuard()
    expect(() => getDatabase()).not.toThrow()
  })

  it('production teardown reset uses un-suffixed wallet and lab guard helpers', () => {
    const storageAdapterSource = Object.values(storageAdapterSourceByPath)[0]
    expect(storageAdapterSource).toContain('resetWalletDatabaseAccessTeardownGuard()')
    expect(storageAdapterSource).toContain('resetLabDatabaseAccessTeardownGuard()')
    expect(storageAdapterSource).not.toMatch(
      /resetWalletDatabaseAccessTeardownGuardForTests\s*\(/,
    )
    expect(storageAdapterSource).not.toMatch(
      /resetLabDatabaseAccessTeardownGuardForTests\s*\(/,
    )
    expect(storageAdapterSource).not.toMatch(
      /resetSqliteStorageTeardownGuardForTests/,
    )
  })

  it('isWalletDatabaseTeardownBlockedError is instanceof, not message match', () => {
    expect(isWalletDatabaseTeardownBlockedError(new WalletDatabaseTeardownBlockedError())).toBe(
      true,
    )
    expect(
      isWalletDatabaseTeardownBlockedError(
        new Error('Wallet database access blocked during teardown'),
      ),
    ).toBe(false)
    expect(isWalletDatabaseTeardownBlockedError(new Error('other'))).toBe(false)
  })

  it('hard-block throws WalletDatabaseTeardownBlockedError from getDatabase', () => {
    blockWalletAndLabDatabaseAccessForTeardown()
    expect(() => getDatabase()).toThrow(WalletDatabaseTeardownBlockedError)
  })

  it('hard-block throws LabDatabaseTeardownBlockedError from getLabDatabase', () => {
    blockWalletAndLabDatabaseAccessForTeardown()
    expect(() => getLabDatabase()).toThrow(LabDatabaseTeardownBlockedError)
  })
})
