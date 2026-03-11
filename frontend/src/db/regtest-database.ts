import { Kysely, sql } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import type { RegtestDatabase } from './regtest-schema'

const REGTEST_DATABASE_FILE_NAME = 'bitboard-regtest'

/** Migrates regtest_transactions from old schema (largest_input_*) to new (sender, receiver) if needed. */
async function migrateRegtestTransactionsIfNeeded(
  db: Kysely<RegtestDatabase>,
): Promise<void> {
  const tableInfo = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info('regtest_transactions')
  `.execute(db)
  const columns = tableInfo.rows.map((r) => r.name)
  if (columns.includes('sender')) return

  await sql`
    CREATE TABLE regtest_transactions_new (
      regtest_transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
      txid TEXT NOT NULL,
      sender TEXT,
      receiver TEXT
    )
  `.execute(db)
  await sql`
    INSERT INTO regtest_transactions_new (regtest_transaction_id, txid, sender, receiver)
    SELECT regtest_transaction_id, txid, NULL, NULL FROM regtest_transactions
  `.execute(db)
  await sql`DROP TABLE regtest_transactions`.execute(db)
  await sql`ALTER TABLE regtest_transactions_new RENAME TO regtest_transactions`.execute(db)
}

let regtestInstance: Kysely<RegtestDatabase> | null = null
let regtestMigrated = false
let regtestMigrationPromise: Promise<void> | null = null

export function getRegtestDatabase(): Kysely<RegtestDatabase> {
  if (!regtestInstance) {
    regtestInstance = new Kysely<RegtestDatabase>({
      dialect: new WaSqliteWorkerDialect({
        fileName: REGTEST_DATABASE_FILE_NAME,
        preferOPFS: true,
      }),
    })
  }
  return regtestInstance
}

async function migrateRegtestToLatest(db: Kysely<RegtestDatabase>): Promise<void> {
  await db.schema
    .createTable('blocks')
    .ifNotExists()
    .addColumn('block_hash', 'text', (col) => col.primaryKey())
    .addColumn('height', 'integer', (col) => col.notNull())
    .addColumn('block_data', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('utxos')
    .ifNotExists()
    .addColumn('utxo_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('vout', 'integer', (col) => col.notNull())
    .addColumn('address', 'text', (col) => col.notNull())
    .addColumn('amount_sats', 'integer', (col) => col.notNull())
    .addColumn('script_pubkey_hex', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('regtest_addresses')
    .ifNotExists()
    .addColumn('regtest_address_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('address', 'text', (col) => col.notNull().unique())
    .addColumn('wif', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('regtest_transactions')
    .ifNotExists()
    .addColumn('regtest_transaction_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('sender', 'text', (col) => col)
    .addColumn('receiver', 'text', (col) => col)
    .execute()

  await db.schema
    .createTable('regtest_address_owners')
    .ifNotExists()
    .addColumn('address', 'text', (col) => col.primaryKey())
    .addColumn('owner', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('regtest_mempool')
    .ifNotExists()
    .addColumn('mempool_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('signed_tx_hex', 'text', (col) => col.notNull())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('sender', 'text', (col) => col)
    .addColumn('receiver', 'text', (col) => col)
    .addColumn('fee_sats', 'integer', (col) => col.notNull())
    .addColumn('inputs_json', 'text', (col) => col.notNull())
    .addColumn('inputs_detail_json', 'text', (col) => col.notNull())
    .addColumn('outputs_detail_json', 'text', (col) => col.notNull())
    .execute()

  await migrateRegtestTransactionsIfNeeded(db)

  await db.schema
    .createTable('regtest_tx_details')
    .ifNotExists()
    .addColumn('txid', 'text', (col) => col.primaryKey())
    .addColumn('block_height', 'integer', (col) => col.notNull())
    .addColumn('block_time', 'integer', (col) => col.notNull())
    .addColumn('inputs_json', 'text', (col) => col.notNull())
    .addColumn('outputs_json', 'text', (col) => col.notNull())
    .execute()
}

export async function ensureRegtestMigrated(): Promise<void> {
  if (regtestMigrated) return
  if (regtestMigrationPromise) {
    await regtestMigrationPromise
    return
  }
  regtestMigrationPromise = migrateRegtestToLatest(getRegtestDatabase())
  await regtestMigrationPromise
  regtestMigrationPromise = null
  regtestMigrated = true
}

export async function destroyRegtestDatabase(): Promise<void> {
  if (regtestInstance) {
    await regtestInstance.destroy()
    regtestInstance = null
    regtestMigrated = false
    regtestMigrationPromise = null
  }
}
