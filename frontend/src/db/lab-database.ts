import { Kysely } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import type { LabDatabase } from './lab-schema'

const LAB_DATABASE_FILE_NAME = 'bitboard-lab'

let labInstance: Kysely<LabDatabase> | null = null
let labMigrated = false
let labMigrationPromise: Promise<void> | null = null

export function getLabDatabase(): Kysely<LabDatabase> {
  if (!labInstance) {
    labInstance = new Kysely<LabDatabase>({
      dialect: new WaSqliteWorkerDialect({
        fileName: LAB_DATABASE_FILE_NAME,
        preferOPFS: true,
      }),
    })
  }
  return labInstance
}

async function migrateLabToLatest(db: Kysely<LabDatabase>): Promise<void> {
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
    .createTable('lab_addresses')
    .ifNotExists()
    .addColumn('lab_address_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('address', 'text', (col) => col.notNull().unique())
    .addColumn('wif', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('lab_transactions')
    .ifNotExists()
    .addColumn('lab_transaction_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('sender', 'text', (col) => col)
    .addColumn('receiver', 'text', (col) => col)
    .execute()

  await db.schema
    .createTable('lab_address_owners')
    .ifNotExists()
    .addColumn('address', 'text', (col) => col.primaryKey())
    .addColumn('owner_type', 'text', (col) => col.notNull())
    .addColumn('wallet_id', 'integer', (col) => col)
    .addColumn('owner_name', 'text', (col) => col)
    .execute()

  await db.schema
    .createTable('lab_mempool')
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

  await db.schema
    .createTable('lab_tx_details')
    .ifNotExists()
    .addColumn('txid', 'text', (col) => col.primaryKey())
    .addColumn('block_height', 'integer', (col) => col.notNull())
    .addColumn('block_time', 'integer', (col) => col.notNull())
    .addColumn('inputs_json', 'text', (col) => col.notNull())
    .addColumn('outputs_json', 'text', (col) => col.notNull())
    .execute()
}

export async function ensureLabMigrated(): Promise<void> {
  if (labMigrated) return
  if (labMigrationPromise) {
    await labMigrationPromise
    return
  }
  labMigrationPromise = migrateLabToLatest(getLabDatabase())
  await labMigrationPromise
  labMigrationPromise = null
  labMigrated = true
}

export async function destroyLabDatabase(): Promise<void> {
  if (labInstance) {
    await labInstance.destroy()
    labInstance = null
    labMigrated = false
    labMigrationPromise = null
  }
}
