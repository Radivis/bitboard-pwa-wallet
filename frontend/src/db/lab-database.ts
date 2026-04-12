import { Kysely, sql } from 'kysely'
import { WaSqliteWorkerDialect } from 'kysely-wasqlite-worker'
import {
  LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
  LAB_DEFAULT_MINER_SUBSIDY_SATS,
} from '@/workers/lab-api'
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

/**
 * Ensures all lab tables exist with the current column set. Lab uses a separate SQLite file
 * (`bitboard-lab`); there is no version table. Pre-production: if an older file is missing
 * columns, use “Reset lab” in the UI or clear site data rather than keeping ALTER migrations.
 */
async function migrateLabToLatest(labDb: Kysely<LabDatabase>): Promise<void> {
  await labDb.schema
    .createTable('blocks')
    .ifNotExists()
    .addColumn('block_hash', 'text', (col) => col.primaryKey())
    .addColumn('height', 'integer', (col) => col.notNull())
    .addColumn('block_data', 'text', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()

  await labDb.schema
    .createTable('utxos')
    .ifNotExists()
    .addColumn('utxo_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('vout', 'integer', (col) => col.notNull()) // INDEX of the output vector in the transaction
    .addColumn('address', 'text', (col) => col.notNull())
    .addColumn('amount_sats', 'integer', (col) => col.notNull())
    .addColumn('script_pubkey_hex', 'text', (col) => col.notNull())
    .execute()

  await labDb.schema
    .createTable('lab_addresses')
    .ifNotExists()
    .addColumn('lab_address_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('address', 'text', (col) => col.notNull().unique())
    .addColumn('wif', 'text', (col) => col.notNull())
    .execute()

  await labDb.schema
    .createTable('lab_transactions')
    .ifNotExists()
    .addColumn('lab_transaction_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('sender', 'text', (col) => col)
    .addColumn('receiver', 'text', (col) => col)
    .addColumn('sender_lab_entity_id', 'integer', (col) => col)
    .addColumn('sender_wallet_id', 'integer', (col) => col)
    .addColumn('receiver_lab_entity_id', 'integer', (col) => col)
    .addColumn('receiver_wallet_id', 'integer', (col) => col)
    .execute()

  await labDb.schema
    .createTable('lab_address_owners')
    .ifNotExists()
    .addColumn('address', 'text', (col) => col.primaryKey())
    .addColumn('owner_type', 'text', (col) => col.notNull())
    .addColumn('wallet_id', 'integer', (col) => col)
    .addColumn('entity_name', 'text', (col) => col)
    .addColumn('lab_entity_id', 'integer', (col) => col)
    .execute()

  await labDb.schema
    .createTable('lab_mempool')
    .ifNotExists()
    .addColumn('mempool_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('signed_tx_hex', 'text', (col) => col.notNull())
    .addColumn('txid', 'text', (col) => col.notNull())
    .addColumn('sender', 'text', (col) => col)
    .addColumn('receiver', 'text', (col) => col)
    .addColumn('sender_lab_entity_id', 'integer', (col) => col)
    .addColumn('sender_wallet_id', 'integer', (col) => col)
    .addColumn('receiver_lab_entity_id', 'integer', (col) => col)
    .addColumn('receiver_wallet_id', 'integer', (col) => col)
    .addColumn('fee_sats', 'integer', (col) => col.notNull())
    .addColumn('vsize', 'integer', (col) => col)
    .addColumn('weight', 'integer', (col) => col)
    .addColumn('inputs_json', 'text', (col) => col.notNull())
    .addColumn('inputs_detail_json', 'text', (col) => col.notNull())
    .addColumn('outputs_detail_json', 'text', (col) => col.notNull())
    .execute()

  await labDb.schema
    .createTable('lab_tx_details')
    .ifNotExists()
    .addColumn('txid', 'text', (col) => col.primaryKey())
    .addColumn('block_height', 'integer', (col) => col.notNull())
    .addColumn('block_time', 'integer', (col) => col.notNull())
    .addColumn('inputs_json', 'text', (col) => col.notNull())
    .addColumn('outputs_json', 'text', (col) => col.notNull())
    .execute()

  await labDb.schema
    .createTable('lab_entities')
    .ifNotExists()
    .addColumn('lab_entity_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('entity_name', 'text', (col) => col)
    .addColumn('mnemonic', 'text', (col) => col.notNull())
    .addColumn('changeset_json', 'text', (col) => col.notNull())
    .addColumn('external_descriptor', 'text', (col) => col.notNull())
    .addColumn('internal_descriptor', 'text', (col) => col.notNull())
    .addColumn('network', 'text', (col) => col.notNull().defaultTo('regtest'))
    .addColumn('address_type', 'text', (col) => col.notNull().defaultTo('segwit'))
    .addColumn('account_id', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addColumn('is_dead', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()

  await labDb.schema
    .createIndex('lab_entities_entity_name_unique')
    .ifNotExists()
    .on('lab_entities')
    .column('entity_name')
    .unique()
    .execute()

  await labDb.schema
    .createTable('lab_mine_operations')
    .ifNotExists()
    .addColumn('mine_operation_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('height', 'integer', (col) => col.notNull())
    .addColumn('block_hash', 'text', (col) => col.notNull())
    .addColumn('mined_by_key', 'text', (col) => col)
    .addColumn('mined_by_lab_entity_id', 'integer', (col) => col)
    .addColumn('mined_by_wallet_id', 'integer', (col) => col)
    .addColumn('coinbase_txid', 'text', (col) => col)
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()

  await labDb.schema
    .createTable('lab_tx_operations')
    .ifNotExists()
    .addColumn('tx_operation_id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('txid', 'text', (col) => col.notNull().unique())
    .addColumn('sender_key', 'text', (col) => col.notNull())
    .addColumn('sender_lab_entity_id', 'integer', (col) => col)
    .addColumn('sender_wallet_id', 'integer', (col) => col)
    .addColumn('change_address', 'text', (col) => col)
    .addColumn('change_vout', 'integer', (col) => col)
    .addColumn('payload_json', 'text', (col) => col.notNull())
    .execute()

  await labDb.schema
    .createTable('lab_parameter_presets')
    .ifNotExists()
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('block_size', 'integer', (col) => col.notNull())
    .addColumn('miner_subsidy_sats', 'integer', (col) => col.notNull())
    .execute()

  const existingPreset = await labDb
    .selectFrom('lab_parameter_presets')
    .select('id')
    .executeTakeFirst()
  if (!existingPreset) {
    await labDb
      .insertInto('lab_parameter_presets')
      .values({
        block_size: LAB_DEFAULT_BLOCK_WEIGHT_UNITS,
        miner_subsidy_sats: LAB_DEFAULT_MINER_SUBSIDY_SATS,
      })
      .execute()
  }

  await patchLabSchemaForExistingFiles(labDb)
}

/** Idempotent ALTERs for DBs created before new columns existed. */
async function patchLabSchemaForExistingFiles(labDb: Kysely<LabDatabase>): Promise<void> {
  const patches: [string, string][] = [
    ['lab_entities', 'is_dead INTEGER NOT NULL DEFAULT 0'],
    ['lab_address_owners', 'lab_entity_id INTEGER'],
    ['lab_transactions', 'sender_lab_entity_id INTEGER'],
    ['lab_transactions', 'sender_wallet_id INTEGER'],
    ['lab_transactions', 'receiver_lab_entity_id INTEGER'],
    ['lab_transactions', 'receiver_wallet_id INTEGER'],
    ['lab_mempool', 'sender_lab_entity_id INTEGER'],
    ['lab_mempool', 'sender_wallet_id INTEGER'],
    ['lab_mempool', 'receiver_lab_entity_id INTEGER'],
    ['lab_mempool', 'receiver_wallet_id INTEGER'],
    ['lab_mine_operations', 'mined_by_lab_entity_id INTEGER'],
    ['lab_mine_operations', 'mined_by_wallet_id INTEGER'],
    ['lab_tx_operations', 'sender_lab_entity_id INTEGER'],
    ['lab_tx_operations', 'sender_wallet_id INTEGER'],
    ['lab_mempool', 'vsize INTEGER'],
    ['lab_mempool', 'weight INTEGER'],
    ['lab_parameter_presets', 'miner_subsidy_sats INTEGER NOT NULL DEFAULT 5000000000'],
    ['lab_mine_operations', 'block_weight_limit_wu INTEGER'],
    ['lab_mine_operations', 'non_coinbase_weight_used_wu INTEGER'],
  ]
  for (const [table, colDef] of patches) {
    try {
      await sql.raw(`ALTER TABLE ${table} ADD COLUMN ${colDef}`).execute(labDb)
    } catch {
      /* duplicate column name */
    }
  }
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
