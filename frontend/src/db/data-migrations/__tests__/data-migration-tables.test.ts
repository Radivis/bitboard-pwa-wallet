import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '@/db/schema'
import { createTestDatabase } from '@/db/test-helpers'

describe('data migration tables', () => {
  let walletDb: Kysely<Database>

  beforeEach(async () => {
    walletDb = await createTestDatabase()
  })

  afterEach(async () => {
    await walletDb.destroy()
  })

  it('creates device_data_migrations and wallet_data_migrations tables', async () => {
    const tables = await walletDb.introspection.getTables()
    const tablesByName = new Map(tables.map((table) => [table.name, table]))

    const deviceColumns = tablesByName
      .get('device_data_migrations')
      ?.columns.map((column) => column.name)
    const walletColumns = tablesByName
      .get('wallet_data_migrations')
      ?.columns.map((column) => column.name)

    expect(deviceColumns).toEqual(['migration_name', 'applied_at', 'result'])
    expect(walletColumns).toEqual(['wallet_id', 'migration_name', 'applied_at'])
  })
})
