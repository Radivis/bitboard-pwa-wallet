/**
 * Kysely row types for the Lab chain simulator SQLite database.
 *
 * Split roughly into: (1) chain state (`blocks`, `utxos`), (2) keys and identity
 * (`lab_addresses`, `lab_entities`, `lab_address_owners`), (3) transaction views
 * (`lab_mempool`, `lab_transactions`, `lab_tx_details`), and (4) explicit
 * operation metadata layered on WASM effects (`lab_mine_operations`,
 * `lab_tx_operations`) so UI attribution does not depend only on string inference.
 */
import type { Generated, Insertable, Selectable, Updateable } from 'kysely'

/** Maps a lab address string to who owns it: main wallet, a named entity, or a lab-only entity. Used for UTXO labels, tx summaries, and merge logic. */
interface LabAddressOwnersTable {
  address: string
  owner_type: 'wallet' | 'name' | 'lab_entity'
  wallet_id: number | null
  owner_name: string | null
  entity_name: string | null
}

/** A simulated “person” in the lab: mnemonic, descriptors, and BDK changeset. One row per named or anonymous lab entity. */
interface LabEntitiesTable {
  entity_name: string
  mnemonic: string
  changeset_json: string
  external_descriptor: string
  internal_descriptor: string
  network: string
  address_type: string
  account_id: number
  created_at: string
  updated_at: string
}

/** Unconfirmed transactions: raw hex, ids, fee, and JSON snapshots of inputs/outputs for mempool UI and worker reconciliation. */
interface LabMempoolTable {
  mempool_id: Generated<number>
  signed_tx_hex: string
  txid: string
  sender: string | null
  receiver: string | null
  fee_sats: number
  inputs_json: string
  inputs_detail_json: string
  outputs_detail_json: string
}

/**
 * Flat list of confirmed transactions for chain-wide summaries and tests.
 * `is_coinbase` (SQLite 0/1) marks block rewards; coinbase rows use the same table as spends.
 */
interface LabTransactionsTable {
  lab_transaction_id: Generated<number>
  txid: string
  sender: string | null
  receiver: string | null
  is_coinbase: number
}

/** Per-tx detail row: block placement, full inputs/outputs as JSON, and `is_coinbase` for tx detail / block list UIs. */
interface LabTxDetailsTable {
  txid: string
  block_height: number
  block_time: number
  inputs_json: string
  outputs_json: string
  is_coinbase: number
}

/**
 * One row per mined block: who mined it (`mined_by_key`: entity name, anonymous id, or wallet key) and optional
 * coinbase outpoint. Drives “Mined by” on block details without scanning inferred tx metadata.
 */
interface LabMineOperationsTable {
  mine_operation_id: Generated<number>
  height: number
  block_hash: string
  mined_by_key: string | null
  coinbase_txid: string | null
  coinbase_vout: number | null
  created_at: string
}

/**
 * One row per non-coinbase spend the app records at finalize/sign time: sender identity and change output hints.
 * Replaces ad-hoc maps for change attribution after reload; `payload_json` holds extensible discriminator data.
 */
interface LabTxOperationsTable {
  tx_operation_id: Generated<number>
  txid: string
  sender_key: string
  change_address: string | null
  change_vout: number | null
  payload_json: string
}

/** Table name → row shape for Kysely queries against the lab SQLite database. */
export interface LabDatabase {
  blocks: BlocksTable
  utxos: UtxosTable
  lab_addresses: LabAddressesTable
  lab_entities: LabEntitiesTable
  lab_address_owners: LabAddressOwnersTable
  lab_mempool: LabMempoolTable
  lab_transactions: LabTransactionsTable
  lab_tx_details: LabTxDetailsTable
  lab_mine_operations: LabMineOperationsTable
  lab_tx_operations: LabTxOperationsTable
}

export type LabEntityRow = Selectable<LabEntitiesTable>
export type NewLabEntityRow = Insertable<LabEntitiesTable>

/** Confirmed blocks in lab chain order: hash, height, and opaque `block_data` from the WASM simulator. */
interface BlocksTable {
  block_hash: string
  height: number
  block_data: string
  created_at: string
}

export type Block = Selectable<BlocksTable>
export type NewBlock = Insertable<BlocksTable>
export type BlockUpdate = Updateable<BlocksTable>

/** Current UTXO set for the lab chain (one row per outpoint). Synced from block effects; backs balances and spend selection. */
interface UtxosTable {
  utxo_id: Generated<number>
  txid: string
  vout: number // INDEX of the output vector in the transaction - confusing legacy naming, but we stick to it for consistency
  address: string
  amount_sats: number
  script_pubkey_hex: string
}

export type Utxo = Selectable<UtxosTable>
export type NewUtxo = Insertable<UtxosTable>
export type UtxoUpdate = Updateable<UtxosTable>

/** Lab-generated receive addresses with WIF for signing in the simulator (distinct from main app wallet rows if applicable). */
interface LabAddressesTable {
  lab_address_id: Generated<number>
  address: string
  wif: string
}

export type LabAddress = Selectable<LabAddressesTable>
export type NewLabAddress = Insertable<LabAddressesTable>
export type LabAddressUpdate = Updateable<LabAddressesTable>
