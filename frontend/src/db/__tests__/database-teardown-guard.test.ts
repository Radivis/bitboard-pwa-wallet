import { describe, it, expect } from 'vitest'
import { ensureMigrated, getDatabase } from '@/db/database'
import { blockSqliteStorageForTeardown } from '@/db/storage-adapter'

describe('wallet database teardown guard', () => {
  it('blocks getDatabase and ensureMigrated after blockSqliteStorageForTeardown', async () => {
    blockSqliteStorageForTeardown()
    expect(() => getDatabase()).toThrow(/blocked during teardown/i)
    await expect(ensureMigrated()).rejects.toThrow(/blocked during teardown/i)
  })
})
